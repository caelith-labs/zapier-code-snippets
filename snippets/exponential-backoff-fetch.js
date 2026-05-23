/**
 * exponential-backoff-fetch.js
 *
 * Retry an HTTP call with exponential backoff + jitter. Built for the APIs
 * RevOps teams lean on constantly — enrichment (Clearbit, Apollo, FullContact),
 * CRM upserts (HubSpot, Salesforce, Pipedrive), and outbound webhooks to
 * internal systems — all of which 429 during traffic spikes and 5xx during
 * vendor deploys.
 *
 * Why this exists: the default Zapier behaviour on a failed Webhook step is to
 * fail the Zap. If you're routing inbound leads and the enrichment API hiccups
 * for ninety seconds, you lose every lead that arrived in that window. This
 * snippet absorbs transient failures and only surfaces real ones, with enough
 * structure for a Paths step to react intelligently.
 *
 * INPUTS (via inputData):
 *   url             — required, target URL
 *   method          — optional, default 'GET'
 *   headers_json    — optional, JSON string of headers
 *                     e.g. {"Authorization":"Bearer ...","Content-Type":"application/json"}
 *   body_json       — optional, JSON string for the request body (POST/PUT/PATCH)
 *   max_attempts    — optional, default 4
 *   base_delay_ms   — optional, default 500. Delay = base * 2^(attempt-1) + jitter
 *   timeout_ms      — optional, default 15000 (per attempt)
 *
 * OUTPUT:
 *   ok              — boolean
 *   status          — HTTP status of the final attempt (0 if network/timeout)
 *   attempts        — how many tries we made
 *   body            — response body (parsed JSON if possible, else raw string)
 *   error_reason    — one of: 'ok', 'timeout', 'network', 'http_4xx', 'http_5xx'
 *
 * USAGE:
 *   Route on error_reason in a Paths step. Common pattern:
 *     - 'ok'       → continue happy path
 *     - 'http_4xx' → "flag for human review" (bad input, won't fix itself)
 *     - 'http_5xx' → "queue for replay" via Storage + Schedule trigger
 *     - 'timeout'  → page on-call if it happens twice in a row
 */

const url = inputData.url;
if (!url) throw new Error('exponential-backoff-fetch: url is required');

const method = (inputData.method || 'GET').toUpperCase();
const headers = inputData.headers_json ? JSON.parse(inputData.headers_json) : {};
const body = inputData.body_json;
const maxAttempts = parseInt(inputData.max_attempts, 10) || 4;
const baseDelayMs = parseInt(inputData.base_delay_ms, 10) || 500;
const timeoutMs = parseInt(inputData.timeout_ms, 10) || 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastStatus = 0;
let lastBody = null;
let lastReason = 'network';

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body && method !== 'GET' ? body : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    lastStatus = resp.status;

    const text = await resp.text();
    try {
      lastBody = JSON.parse(text);
    } catch (_) {
      lastBody = text;
    }

    if (resp.ok) {
      output = { ok: true, status: resp.status, attempts: attempt, body: lastBody, error_reason: 'ok' };
      return;
    }

    // 4xx (other than 429) is the caller's fault — don't retry, fail fast.
    if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
      output = { ok: false, status: resp.status, attempts: attempt, body: lastBody, error_reason: 'http_4xx' };
      return;
    }
    lastReason = 'http_5xx';
  } catch (err) {
    clearTimeout(timer);
    lastReason = err && err.name === 'AbortError' ? 'timeout' : 'network';
    lastBody = String(err);
  }

  if (attempt < maxAttempts) {
    const jitter = Math.random() * baseDelayMs;
    const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
    await sleep(delay);
  }
}

output = { ok: false, status: lastStatus, attempts: maxAttempts, body: lastBody, error_reason: lastReason };
