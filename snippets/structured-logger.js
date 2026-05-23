/**
 * structured-logger.js
 *
 * Emit a structured JSON log line to a central logging Zap (via a Catch Hook
 * trigger). Run one logging Zap that fans out to your destination of choice —
 * BigQuery, Postgres, Datadog, a Zapier Table, or a #zap-events Slack channel.
 *
 * Why this exists: a RevOps team running 40+ Zaps has no answer to "what
 * actually happened to lead X last Tuesday?" The Zapier history view only goes
 * one Zap at a time, and Task History is paginated, slow, and ephemeral.
 * Adding structured logs lets you reconstruct a single inbound event's full
 * journey across many Zaps from one queryable source.
 *
 * INPUTS (via inputData):
 *   webhook_url     — required, the URL of your central logging Zap's Catch Hook
 *   level           — required, one of 'debug', 'info', 'warn', 'error'
 *   zap_name        — required, human name of the calling Zap
 *                     (use a consistent convention, e.g. 'lead.inbound.enrich')
 *   event           — required, short event name
 *                     e.g. 'lead_routed', 'enrichment_failed', 'invoice_synced'
 *   entity_type     — optional, e.g. 'lead', 'invoice', 'ticket'
 *   entity_id       — optional, upstream record ID (HubSpot ID, Stripe ID, ...)
 *   message         — optional, free-form human description
 *   context_json    — optional, JSON string of additional fields
 *
 * OUTPUT:
 *   logged          — boolean, whether the central logger accepted the event
 *   trace_id        — per-event ID. Thread this through downstream Zap calls
 *                     (as a webhook header or payload field) to correlate logs
 *                     across multiple Zaps.
 *
 * USAGE:
 *   Drop this as the last step of every important Zap. For multi-Zap flows,
 *   include the upstream trace_id in the inputs so the logger preserves the
 *   chain. Query the resulting table by trace_id to get a single inbound
 *   event's full timeline in seconds instead of fifteen minutes of clicking
 *   through Task History.
 */

const url = inputData.webhook_url;
if (!url) throw new Error('structured-logger: webhook_url is required');

const level = (inputData.level || 'info').toLowerCase();
const validLevels = ['debug', 'info', 'warn', 'error'];
if (!validLevels.includes(level)) {
  throw new Error(`structured-logger: level must be one of ${validLevels.join(', ')}`);
}

const traceId =
  inputData.trace_id ||
  'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);

const payload = {
  ts: new Date().toISOString(),
  level,
  zap_name: inputData.zap_name || '__unset__',
  event: inputData.event || '__unset__',
  entity_type: inputData.entity_type || null,
  entity_id: inputData.entity_id || null,
  message: inputData.message || null,
  context: inputData.context_json ? JSON.parse(inputData.context_json) : null,
  trace_id: traceId,
};

let logged = false;
try {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  logged = resp.ok;
} catch (_) {
  logged = false;
}

output = { logged, trace_id: traceId };
