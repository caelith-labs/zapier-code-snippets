/**
 * dedupe-lead-events.js
 *
 * Skip downstream processing when we've already seen this lead within a TTL
 * window. Built for the noisy reality of form providers (Typeform, Webflow,
 * HubSpot Forms, Default.com) that occasionally re-fire the same submission,
 * and for upstream tools that resend events on minor record edits.
 *
 * Why this exists: RevOps teams running enrichment + CRM upserts behind a form
 * pay real money per call (Clearbit, Apollo, ZoomInfo) and create duplicate
 * pipeline records when the same lead trips a Zap twice. A 30-line dedupe
 * gate in front of the expensive steps pays for itself in week one.
 *
 * INPUTS (via inputData):
 *   email           — required, lead email (case-insensitive, trimmed)
 *   utm_source      — optional, included in the dedupe key so the same person
 *                     coming back from two different campaigns is not collapsed
 *   ttl_seconds     — optional, default 86400 (24h). Set lower for high-velocity
 *                     funnels, higher for long sales cycles.
 *   store_secret    — required, Storage by Zapier secret string
 *
 * OUTPUT:
 *   is_duplicate    — boolean, route on this in a Paths step
 *   first_seen_at   — ISO timestamp of when we first recorded this key
 *   dedupe_key      — the key we stored, useful for debugging
 *
 * USAGE:
 *   Place immediately after the trigger and before any paid API call or CRM
 *   write. In the following Path, only continue if {{is_duplicate}} is "false".
 */

const store = StoreClient(inputData.store_secret);

const email = (inputData.email || '').trim().toLowerCase();
if (!email) {
  throw new Error('dedupe-lead-events: email is required');
}

const utm = (inputData.utm_source || '').trim().toLowerCase();
const ttlSeconds = parseInt(inputData.ttl_seconds, 10) || 86400;
const dedupeKey = `lead:${email}${utm ? `:${utm}` : ''}`;

const existing = await store.get(dedupeKey);
const now = new Date();

if (existing && existing.first_seen_at) {
  const firstSeen = new Date(existing.first_seen_at);
  const ageSeconds = (now - firstSeen) / 1000;
  if (ageSeconds < ttlSeconds) {
    output = {
      is_duplicate: true,
      first_seen_at: existing.first_seen_at,
      dedupe_key: dedupeKey,
    };
    return;
  }
}

await store.set(dedupeKey, { first_seen_at: now.toISOString() });

output = {
  is_duplicate: false,
  first_seen_at: now.toISOString(),
  dedupe_key: dedupeKey,
};
