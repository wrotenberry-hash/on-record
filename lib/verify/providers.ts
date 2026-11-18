import { verificationConfig } from "@/lib/verify/config";
import { districtFromCensus } from "@/lib/verify/rules";
import { districtsFromCensus } from "@/lib/federal/depth-parse";
import { authorityFromUsps } from "@/lib/verify/residence";
import { congressForYear } from "@/lib/federal/parse";
import { censusCongress } from "@/lib/flow/rules";

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

/**
 * Census geocoder: one-line address to congressional district. The address is not kept by this call.
 * The Bureau's "current" map can run ahead of the Congress that is sitting (on 17 Nov 2026 it already answered with the
 * 120th Congress map while the 119th was in office). A verified district must be the one whose member is in office, so
 * when the map is not the sitting Congress's the address is asked again from the vintage that holds the sitting map; if
 * none does, the answer is "no district" rather than a district from the wrong map.
 */
export async function geocodeDistrict(address: string, now = Date.now()) {
  const base = verificationConfig().census.base;
  const ask = async (vintage: string) => {
    const q = new URLSearchParams({ address, benchmark: "Public_AR_Current", vintage, layers: "all", format: "json" });
    const r = await call(`${base}/geocoder/geographies/onelineaddress?${q}`);
    return { status: r.status, matches: ((r.body?.result as { addressMatches?: unknown[] } | undefined)?.addressMatches ?? []) };
  };
  const first = await ask("Current_Current");
  if (first.status !== 200) return { ok: false as const, reason: "unreachable" as const };
  if (!first.matches.length) return { ok: false as const, reason: "no_match" as const };
  const year = new Date(now).getUTCFullYear(), sitting = congressForYear(year);
  let match: unknown = first.matches[0];
  const used = censusCongress(match);
  if (used !== null && used !== sitting) {
    match = null;
    for (const vintage of [`ACS${year - 1}_Current`, `ACS${year - 2}_Current`]) {
      const older = (await ask(vintage)).matches[0];
      if (older && censusCongress(older) === sitting) { match = older; break; }
    }
  }
  const d = districtFromCensus(match);
  // The same answer carries the state senate and state house districts ("TX-SD-14", "TX-HD-49"); null where a state has none.
  const all = d ? districtsFromCensus(match) : null;
  return d ? { ok: true as const, ...d, stateUpper: all?.stateUpper ?? null, stateLower: all?.stateLower ?? null, matchedAddress: String((match as { matchedAddress?: string }).matchedAddress ?? "") }
    : { ok: false as const, reason: "no_district" as const };
}

/**
 * The official address database: does this address have several units, and is the unit given a real one? The Postal
 * Service's Addresses API (version 3.3.1, read 18 Nov 2026): a token from POST /oauth2/v3/token (client credentials),
 * then GET /addresses/v3/address. Answers null when the check is not switched on, not keyed, or did not answer; the
 * caller then keeps the unit as typed and relies on the household cap.
 */
let uspsToken: { value: string; until: number } | null = null;
export async function addressAuthority(a: { street: string; unit: string | null; city: string; state: string; zip: string }) {
  const c = verificationConfig();
  if (!c.addressAuthorityReady) return null;
  if (!uspsToken || uspsToken.until < Date.now() + 60_000) {
    const t = await call(`${c.usps.base}/oauth2/v3/token`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: c.usps.clientId, client_secret: c.usps.clientSecret }) });
    const value = typeof t.body?.access_token === "string" ? t.body.access_token : null;
    if (!value) return null;
    uspsToken = { value, until: Date.now() + Math.max(60, Number(t.body?.expires_in ?? 600)) * 1000 };
  }
  const q = new URLSearchParams({ streetAddress: a.street, ...(a.unit ? { secondaryAddress: a.unit } : {}), city: a.city, state: a.state, ZIPCode: a.zip.slice(0, 5) });
  const r = await call(`${c.usps.base}/addresses/v3/address?${q}`, { headers: { authorization: `Bearer ${uspsToken.value}` } });
  if (r.status === 401) uspsToken = null;
  return r.status === 200 ? authorityFromUsps(r.body) : null;
}
