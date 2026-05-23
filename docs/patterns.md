# Patterns: which snippet, when

This is the "if you're building X, reach for Y" reference. It assumes you've already read each snippet's header comment.

---

## Inbound lead flow (the canonical RevOps pipeline)

A typical inbound-lead Zap, from form fill to CRM-assigned-to-rep:

```
[Form trigger]
      │
      ▼
[dedupe-lead-events]   ← skip if already seen in the last N hours
      │
      ▼ (is_duplicate = false)
[exponential-backoff-fetch]   ← Clearbit / Apollo enrichment with retries
      │
      ▼ (error_reason = 'ok')
[CRM "Find Contacts" by company domain]
      │
      ▼
[fuzzy-contact-match]
      │
      ├─ should_update → CRM update step
      ├─ should_create → CRM create step → [round-robin-assignment] → CRM update owner
      └─ should_review → Slack message to RevOps channel with candidate + suggested match
      │
      ▼
[structured-logger]   ← emit 'lead_routed' event with trace_id
```

The whole thing is five Code steps and four CRM steps. The point is that each Code step is doing exactly one thing well, and the failure modes are explicit at every junction.

---

## CRM hygiene sweep (scheduled)

Run nightly to catch records that slipped through the inbound flow:

- **Trigger:** Schedule by Zapier, every night at 2am
- **Pull:** CRM "Find Records" with last-modified in the past 24h
- **Loop** (via a sub-Zap, since Zapier doesn't natively loop):
  - For each record: pull candidate matches by company domain, run `fuzzy-contact-match`
  - On `should_review`, write to a Zapier Table called `merge_review_queue`
- **Daily digest:** another scheduled Zap reads the table and posts to Slack

This is the kind of unglamorous background hygiene that pays for itself in CRM data quality but rarely gets built because it's not a customer-visible feature.

---

## Replay queue for transient failures

When `exponential-backoff-fetch` returns `error_reason = 'http_5xx'` or `'timeout'`, you don't want to drop the event — you want to retry it later when the upstream API has recovered. Pattern:

- Failed events get written to a Storage-by-Zapier key like `replay:<entity_id>` with the original payload + timestamp.
- A separate Zap, triggered by Schedule (every 5 minutes), reads keys with the `replay:` prefix, re-runs the original fetch via `exponential-backoff-fetch`, and on success deletes the key.
- After N retries (track count in the stored payload), escalate to Slack instead of looping forever.

This is overkill for a 5-Zap RevOps stack. It's exactly right for a 40-Zap one where transient failures are inevitable and someone needs to be able to point at a Slack alert and explain why a deal didn't progress.

---

## Cross-Zap tracing

`structured-logger` returns a `trace_id`. Threading it through downstream Zaps gives you a single timeline per inbound event:

1. The first Zap in the chain (form → enrichment → CRM create) generates a `trace_id` and logs every step with it.
2. When that Zap kicks off a downstream Zap via Webhook, include the `trace_id` in the payload.
3. The downstream Zap passes the received `trace_id` into `structured-logger` as `inputData.trace_id` instead of generating a new one.
4. Query your central log destination by `trace_id` to reconstruct the full cross-Zap journey of a single lead.

When a CEO asks "what happened to that lead from the demo request last Wednesday," this is the difference between a 30-second query and 20 minutes of clicking through Task History across six Zaps.

---

## Anti-patterns (don't do these)

- **Auto-merging in the `should_review` band.** The 0.50–0.85 confidence range exists precisely because the machine doesn't know. Auto-merging there creates the silent-data-corruption incidents that make RevOps teams stop trusting automation entirely.
- **Logging at `info` from inside a tight loop.** The central logger is a Catch Hook — it counts against your Zapier task quota. Reserve it for state transitions and failures, not every iteration of a for-loop.
- **Sharing a `pool_key` across two regions.** AMER and EMEA round-robins should have separate keys. The snippet enforces it, but it's worth saying out loud.
- **Putting `store_secret` in plaintext in your Zap.** Use a Storage by Zapier connection step and reference the secret as a Zapier variable so it lives in the connection store, not in the visible Zap config.
