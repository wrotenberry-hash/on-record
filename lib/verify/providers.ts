import { verificationConfig } from "@/lib/verify/config";
import { districtFromCensus } from "@/lib/verify/rules";

/**
 * Calls to Cloudflare Turnstile, Twilio Lookup and Verify, and the Census
 * geocoder. Each returns a small result object and never throws for a provider
 * refusal. Only what the call needs is sent: the challenge token, the phone
 * number (to Twilio), the address (to the Census Bureau).
 */
const TIMEOUT = 10_000;
async function call(url: string, init: RequestInit = {}) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try { const r = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" }); return { status: r.status, body: await r.json().catch(() => null) as Record<string, unknown> | null }; }
  catch { return { status: 0, body: null }; }
  finally { clearTimeout(t); }
}

export async function verifyTurnstile(token: string | null | undefined, ip?: string | null) {
  const c = verificationConfig().turnstile;
  if (!c.secret) return { ok: false, reason: "not_configured" as const };
  if (!token) return { ok: false, reason: "missing" as const };
  const form = new URLSearchParams({ secret: c.secret, response: token, ...(ip ? { remoteip: ip } : {}) });
  const r = await call(c.verifyUrl, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } });
  return r.body?.success === true ? { ok: true as const } : { ok: false, reason: r.status === 0 ? "unreachable" as const : "failed" as const };
}

const twilioAuth = () => { const t = verificationConfig().twilio; return { authorization: `Basic ${btoa(`${t.user}:${t.pass}`)}` }; };

/** Line type of a US number: "mobile", "nonFixedVoip", "landline", … or null when the lookup failed. */
export async function lookupLineType(e164: string) {
  const t = verificationConfig().twilio;
  const r = await call(`${t.lookupBase}/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`, { headers: twilioAuth() });
  const type = (r.body?.line_type_intelligence as { type?: string } | undefined)?.type;
  return { ok: r.status === 200 && typeof type === "string", type: typeof type === "string" ? type : null, valid: r.body?.valid !== false };
}

export async function sendSmsCode(e164: string) {
  const t = verificationConfig().twilio;
  const r = await call(`${t.verifyBase}/v2/Services/${t.serviceSid}/Verifications`, { method: "POST", headers: { ...twilioAuth(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Channel: "sms" }) });
  return { ok: r.status >= 200 && r.status < 300 && r.body?.status === "pending", status: r.status };
}

export async function checkSmsCode(e164: string, code: string) {
  const t = verificationConfig().twilio;
  const r = await call(`${t.verifyBase}/v2/Services/${t.serviceSid}/VerificationCheck`, { method: "POST", headers: { ...twilioAuth(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Code: code }) });
  return { ok: r.body?.status === "approved", status: r.status };
}

/** Census geocoder: one-line address to congressional district. The address is not kept by this call. */
export async function geocodeDistrict(address: string) {
  const base = verificationConfig().census.base;
  const q = new URLSearchParams({ address, benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "all", format: "json" });
  const r = await call(`${base}/geocoder/geographies/onelineaddress?${q}`);
  const matches = ((r.body?.result as { addressMatches?: unknown[] } | undefined)?.addressMatches ?? []);
  if (r.status !== 200) return { ok: false as const, reason: "unreachable" as const };
  if (!matches.length) return { ok: false as const, reason: "no_match" as const };
  const d = districtFromCensus(matches[0]);
  return d ? { ok: true as const, ...d, matchedAddress: String((matches[0] as { matchedAddress?: string }).matchedAddress ?? "") } : { ok: false as const, reason: "no_district" as const };
}
