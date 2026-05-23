/**
 * fuzzy-contact-match.js
 *
 * Compare an inbound contact (from a form, enrichment payload, or webhook)
 * against a list of existing CRM contacts and return the best match plus a
 * confidence score. Designed for the "we keep creating duplicate HubSpot /
 * Salesforce records" problem that RevOps teams hit the moment lead volume
 * crosses ~50/week.
 *
 * Match logic (deliberately conservative — false-positive merges are worse
 * than false-negative creates):
 *   exact match on normalized email           → confidence 1.00 (update)
 *   same email local-part, different domain   → confidence 0.85 (update)
 *   high name similarity, no email match      → confidence 0.50–0.80 (review)
 *   otherwise                                 → no match (create)
 *
 * INPUTS (via inputData):
 *   candidate_email     — required, the inbound contact's email
 *   candidate_name      — required, the inbound contact's full name
 *   existing_contacts   — required, JSON string of [{id, email, name}, ...]
 *                          (typically the output of a CRM "Find Records" step,
 *                          ideally narrowed by company domain first)
 *
 * OUTPUT:
 *   match_id            — the CRM ID of the best match, or empty string
 *   confidence          — 0.00 to 1.00
 *   reason              — 'exact_email' | 'email_localpart' | 'name_similarity' | 'none'
 *   should_create       — boolean, true if confidence < 0.50
 *   should_update       — boolean, true if confidence >= 0.85
 *   should_review       — boolean, true if 0.50 <= confidence < 0.85
 *
 * USAGE:
 *   Branch with a Paths step on the three should_* booleans. The review bucket
 *   should NOT auto-write to the CRM — instead, post the candidate + suggested
 *   match into a Slack channel (or a Zapier Table) for a human to resolve.
 *   That single discipline cuts duplicate-record incidents to near zero.
 */

const normalizeEmail = (e) => (e || '').trim().toLowerCase();
const normalizeName = (n) =>
  (n || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Sørensen–Dice coefficient on bigrams — cheap and good enough for short
// strings like names. ~O(n) per comparison, no external deps.
const nameSimilarity = (a, b) => {
  const A = normalizeName(a);
  const B = normalizeName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.length < 2 || B.length < 2) return 0;

  const bigrams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      out.set(bg, (out.get(bg) || 0) + 1);
    }
    return out;
  };

  const a1 = bigrams(A);
  const b1 = bigrams(B);
  let overlap = 0;
  for (const [bg, count] of a1) {
    if (b1.has(bg)) overlap += Math.min(count, b1.get(bg));
  }
  return (2 * overlap) / (A.length - 1 + B.length - 1);
};

const candEmail = normalizeEmail(inputData.candidate_email);
const candName = inputData.candidate_name || '';
const existing = JSON.parse(inputData.existing_contacts || '[]');

if (!candEmail) throw new Error('fuzzy-contact-match: candidate_email is required');

const candLocal = candEmail.split('@')[0];
let best = { id: '', confidence: 0, reason: 'none' };

for (const c of existing) {
  const cEmail = normalizeEmail(c.email);
  if (cEmail && cEmail === candEmail) {
    best = { id: c.id, confidence: 1.0, reason: 'exact_email' };
    break;
  }
  if (cEmail && cEmail.split('@')[0] === candLocal) {
    if (best.confidence < 0.85) best = { id: c.id, confidence: 0.85, reason: 'email_localpart' };
    continue;
  }
  const sim = nameSimilarity(candName, c.name);
  if (sim >= 0.7) {
    const score = 0.5 + sim * 0.3;
    if (score > best.confidence) {
      best = { id: c.id, confidence: Number(score.toFixed(2)), reason: 'name_similarity' };
    }
  }
}

output = {
  match_id: best.id,
  confidence: best.confidence,
  reason: best.reason,
  should_create: best.confidence < 0.5,
  should_update: best.confidence >= 0.85,
  should_review: best.confidence >= 0.5 && best.confidence < 0.85,
};
