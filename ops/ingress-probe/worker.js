/**
 * Throwaway ingress probe. Deploy it as a temporary Cloudflare Worker with one
 * plain variable, ON_RECORD_URL, open its URL in a browser, read the verdict,
 * then delete the Worker. It sends no secrets and reads no data: two GETs to
 * fixed paths on the Site and a report of the status codes it saw.
 *
 * What it proves, after the Site audience is widened:
 *   1. The edge lets an anonymous machine request through to the app.
 *   2. The edge strips visitor-supplied identity headers. If a forged
 *      `oai-authenticated-user-*` header is honoured, the editor allowlist can
 *      be impersonated and the Site must be returned to private immediately.
 */
const forgedEmail = "ingress-probe@example.invalid";

async function probe(base) {
  const results = [];
  const health = await fetch(new URL("/api/automation/health", base), { headers: { "Cache-Control": "no-store" } });
  const healthBody = await health.text();
  results.push({ check: "Anonymous request reaches the app", status: health.status, pass: health.status === 200,
    detail: health.status === 200 ? healthBody.slice(0, 200) : "Expected 200 from /api/automation/health. 401 means the edge still blocks machine callers." });
  const forged = await fetch(new URL("/api/editor/automation-status", base), { headers: { "Cache-Control": "no-store",
    "oai-authenticated-user-id": "probe", "oai-authenticated-user-email": forgedEmail } });
  results.push({ check: "Forged identity header is ignored", status: forged.status, pass: forged.status === 401,
    detail: forged.status === 401 ? "The app saw no identity: headers from outside are stripped."
      : forged.status === 403 ? "DANGER: the app trusted a forged identity header (it only rejected the email). Make the Site private now."
      : forged.status === 200 ? "DANGER: a forged header granted editor access. Make the Site private now."
      : "Unexpected status; treat as not verified." });
  return results;
}

const ingressProbe = {
  async fetch(_request, env) {
    if (!env.ON_RECORD_URL) return new Response("Set the ON_RECORD_URL variable on this Worker.", { status: 500 });
    let base;
    try { base = new URL(env.ON_RECORD_URL); if (base.protocol !== "https:") throw Error("https only"); }
    catch { return new Response("ON_RECORD_URL must be an https:// origin.", { status: 500 }); }
    let results;
    try { results = await probe(base); }
    catch (error) { return new Response(`Probe could not reach the Site: ${error instanceof Error ? error.message : "error"}`,
      { status: 502, headers: { "Cache-Control": "no-store" } }); }
    const allPass = results.every(r => r.pass);
    const rows = results.map(r => `<tr><td>${r.pass ? "PASS" : "FAIL"}</td><td>${r.check}</td><td>${r.status}</td><td>${escapeHtml(r.detail)}</td></tr>`).join("");
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>On Record ingress probe</title>
<style>body{font:17px/1.5 system-ui;margin:24px;max-width:720px}table{border-collapse:collapse;width:100%}td{border-top:1px solid #ccc;padding:8px;vertical-align:top}h1{font-size:22px}.v{font-size:28px;font-weight:700}</style>
<h1>On Record ingress probe</h1><p>Site: ${escapeHtml(base.origin)}</p>
<p class="v">${allPass ? "READY: the scheduler can be connected." : "NOT READY: do not connect the scheduler yet."}</p>
<table>${rows}</table><p>Checked ${new Date().toISOString()}. Delete this Worker when finished.</p>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  },
};
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
export default ingressProbe;
