/**
 * round-robin-assignment.js
 *
 * Round-robin lead assignment across a sales team, backed by Storage by Zapier.
 * Skips reps flagged as out-of-office. Survives pool changes between runs
 * (new hire, rep leaves, segmentation change) by re-anchoring on the current
 * available pool every invocation.
 *
 * Why this exists: every RevOps team builds a round-robin in Zapier at some
 * point, and most of them quietly break. Common failure modes this snippet
 * addresses:
 *   - "Last index" drifts out of bounds when the team shrinks
 *   - OOO reps still get assigned because nobody updates the rotation list
 *   - Multiple pools (EMEA / AMER / Enterprise) share a single counter and
 *     contaminate each other
 *   - Silent failure when everyone is unavailable (lead goes nowhere)
 *
 * INPUTS (via inputData):
 *   pool_key            — required, identifier for this assignment pool
 *                          e.g. 'inbound-enterprise', 'demo-requests-emea'
 *   reps_json           — required, JSON of [{id, name, available}, ...]
 *                          'available' defaults to true if omitted on a rep
 *   store_secret        — required, Storage by Zapier secret
 *
 * OUTPUT:
 *   assigned_id         — the rep ID we picked
 *   assigned_name       — the rep name we picked, OR the sentinel
 *                          '__ALL_UNAVAILABLE__' so a Path can escalate
 *   pool_size           — how many reps were available this run
 *   last_assigned_index — the index we wrote back to storage
 *
 * USAGE:
 *   Build reps_json from a Lookup Table, a Zapier Table, or a CRM "Find Users"
 *   step. Mark availability on a single source of truth (most teams use a
 *   Slack /ooo workflow that writes to a Zapier Table). Then route the output
 *   to the CRM owner field. If assigned_name == '__ALL_UNAVAILABLE__', branch
 *   into a Slack escalation Path — never let the lead silently land in a void.
 */

const store = StoreClient(inputData.store_secret);

const poolKey = inputData.pool_key;
if (!poolKey) throw new Error('round-robin-assignment: pool_key is required');

const reps = JSON.parse(inputData.reps_json || '[]');
if (reps.length === 0) throw new Error('round-robin-assignment: reps_json is empty');

const available = reps.filter((r) => r.available !== false);

if (available.length === 0) {
  output = {
    assigned_id: reps[0].id,
    assigned_name: '__ALL_UNAVAILABLE__',
    pool_size: 0,
    last_assigned_index: -1,
  };
  return;
}

const stateKey = `rr:${poolKey}`;
const state = (await store.get(stateKey)) || { last_index: -1 };
const nextIndex = (state.last_index + 1) % available.length;
const pick = available[nextIndex];

await store.set(stateKey, {
  last_index: nextIndex,
  updated_at: new Date().toISOString(),
});

output = {
  assigned_id: pick.id,
  assigned_name: pick.name,
  pool_size: available.length,
  last_assigned_index: nextIndex,
};
