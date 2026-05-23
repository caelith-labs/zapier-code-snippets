# Zapier Code Snippets for Serious RevOps

Production-grade `Code by Zapier` snippets for the problems every Series A–B B2B SaaS RevOps team hits the moment lead volume crosses ~50/week and the Zap count crosses ~20. Each file is a single-purpose, drop-in JavaScript module — copy it into a Code by Zapier (JavaScript) step, wire the named inputs, and ship.

Built and maintained by [Caelith Labs](https://caelithlabs.com), a small studio that delivers automation and AI-agent work for operationally-mature SMBs and mid-market teams.

---

## Who this is for

- **RevOps leads** running lead routing, CRM hygiene, and pipeline plumbing in Zapier and watching it quietly break as the team grows.
- **Founder / first-RevOps hires** at Seed–Series B B2B SaaS, where there's no engineer to wrap a real worker queue around the automation stack but the cost of duplicate records or lost leads is real.
- **Solution partners and consultants** who want patterns that survive client handover rather than tutorial code that breaks two weeks later.

If you've ever:

- Paid Clearbit twice for the same lead because the form re-fired
- Watched your round-robin silently route to an OOO rep for three days
- Discovered duplicate HubSpot contacts because someone typed `Jon` instead of `Jonathan`
- Tried to reconstruct what happened to a lead across six Zaps and given up after fifteen minutes in Task History

…these are for you.

---

## Snippets

| File | Pain point it solves |
|------|----------------------|
| [`dedupe-lead-events.js`](snippets/dedupe-lead-events.js) | Form provider re-fires the same submission → duplicate CRM records + duplicate enrichment charges. Storage-by-Zapier gate with TTL. |
| [`exponential-backoff-fetch.js`](snippets/exponential-backoff-fetch.js) | Enrichment / CRM API hiccups for 90 seconds → every lead in that window dies. Structured retry with jitter + intelligent error reasons for downstream Paths. |
| [`fuzzy-contact-match.js`](snippets/fuzzy-contact-match.js) | "We keep creating duplicate HubSpot contacts." Confidence-scored matching on normalized email + bigram name similarity, with a deliberate review bucket so humans resolve the ambiguous cases. |
| [`round-robin-assignment.js`](snippets/round-robin-assignment.js) | Round-robins quietly break: drift past array bounds, route to OOO reps, contaminate counters across pools. Multi-pool-safe Storage-backed assignment with explicit OOO handling. |
| [`structured-logger.js`](snippets/structured-logger.js) | "What actually happened to lead X last Tuesday?" Central JSON logger you can call from every Zap to reconstruct cross-Zap timelines by `trace_id`. |

See [`docs/patterns.md`](docs/patterns.md) for the full "which snippet, when" decision guide and reference architectures.

---

## Install

These are not an npm package. Each file is a Code by Zapier (JavaScript runtime) module designed to be pasted directly into a Zap step.

1. Open your Zap → add a **Code by Zapier** action → choose **Run JavaScript**.
2. In the **Input Data** section, add the keys listed in the snippet's header (`email`, `store_secret`, etc.) and wire each one to a value from a previous step.
3. Paste the file's contents into the **Code** field.
4. Test the step. Zapier will surface the keys defined in the snippet's `output = {...}` block — wire those into downstream steps.

All snippets target the **modern Code by Zapier runtime** (Node 18+, async-friendly, top-level `await`, global `fetch`, `StoreClient`). They are written to fail loudly on missing required inputs so misconfiguration shows up on the first test run rather than in production at 3am.

---

## Design principles

The reason most Code by Zapier steps you see in client accounts are five lines of `JSON.parse` and a one-letter variable name is that nobody plans to maintain them. These snippets assume the opposite.

- **Fail loud, fail early.** Required inputs throw on the first run, not silently produce wrong data.
- **Surface structured failure reasons.** Every snippet that can fail returns an `error_reason` (or equivalent) so a downstream Paths step can branch intelligently — retry, escalate, flag for review.
- **No silent data loss.** Round-robin pools with everyone OOO produce a sentinel value, not a null. Dedupe writes a key only after the check passes, not before. Logger captures the trace ID even when the network drops.
- **Operator-readable.** Header comment on every file states what it does, when to use it, what it costs. Comments inside explain *why*, not *what*.
- **Boring on purpose.** No clever one-liners. Standard library only. No npm. Anything you can read at 11pm during an incident.

---

## Need this wired into a real workflow?

These snippets are the load-bearing pieces of the kind of work [Caelith Labs](https://caelithlabs.com) delivers — Zapier engagements for B2B SaaS RevOps teams who've outgrown the duct-tape phase but aren't ready (or shouldn't be) hiring a full automation engineer.

If you want help wiring these patterns into a production lead-routing flow, CRM-hygiene pipeline, or post-sale handoff — or you want a 2-week Operations Sprint that maps the top 5–8 automation opportunities in your stack — get in touch: `hello@caelithlabs.com`.

---

## Contributing

PRs welcome. Bias:

- One file per snippet, single purpose, header comment explaining the painpoint.
- No `npm` dependencies. Code by Zapier doesn't support them and the runtime constraint is part of the value.
- Show the failure case in the docs, not just the happy path.
- "RevOps would actually use this" beats "this is technically interesting."

---

## License

[MIT](LICENSE). Use these in client accounts freely. Attribution appreciated but not required.
