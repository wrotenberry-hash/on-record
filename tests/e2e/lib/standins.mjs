import { createServer } from "node:http";

/**
 * Local stand-ins for the outside services verification and sign-in use, so
 * task 15 can run without real keys: the email sender (Resend), the bot check
 * (Cloudflare Turnstile), text messages (Twilio Lookup and Verify) and the
 * Census geocoder. The app already lets each base URL be pointed elsewhere
 * (lib/verify/config.ts, lib/mailer.ts). Nothing here leaves this machine.
 */
export const STANDIN_SMS_CODE = "246810";
export const STANDIN_DISTRICT = { state: "TX", district: "37" };

export async function startStandins() {
  const emails = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString("utf8");
    const json = (code, data) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(data)); };
    const p = url.pathname;
    if (p === "/emails" && req.method === "POST") { let m = {}; try { m = JSON.parse(body); } catch { /* ignore */ } emails.push({ to: m.to, subject: m.subject, text: String(m.text ?? "") }); return json(200, { id: `standin-${emails.length}` }); }
    if (p === "/turnstile/api.js") { res.writeHead(200, { "content-type": "application/javascript" });
      return res.end("window.turnstile={render:function(el,o){setTimeout(function(){o.callback('standin-token')},20);return 'standin-widget'}};"); }
    if (p === "/turnstile/siteverify") return json(200, { success: new URLSearchParams(body).get("response") === "standin-token" });
    if (p.startsWith("/v2/PhoneNumbers/")) return json(200, { valid: true, line_type_intelligence: { type: "mobile" } });
    if (/^\/v2\/Services\/[^/]+\/Verifications$/.test(p)) return json(201, { status: "pending" });
    if (/^\/v2\/Services\/[^/]+\/VerificationCheck$/.test(p)) return json(200, { status: new URLSearchParams(body).get("Code") === STANDIN_SMS_CODE ? "approved" : "pending" });
    if (p === "/geocoder/geographies/onelineaddress" || p === "/geocoder/geographies/address") {
      const { state, district } = STANDIN_DISTRICT;
      // One known address (the Texas Capitol); anything else is "no match", like a mistyped street.
      if (!/congress ave/i.test(url.searchParams.get("address") ?? url.searchParams.get("street") ?? "")) return json(200, { result: { addressMatches: [] } });
      return json(200, { result: { addressMatches: [{ matchedAddress: "1100 CONGRESS AVE, AUSTIN, TX, 78701", coordinates: { x: -97.74, y: 30.27 },
        addressComponents: { state, zip: "78701" },
        geographies: { "119th Congressional Districts": [{ CD119: district, STATE: "48", GEOID: `48${district}`, BASENAME: district, NAME: `Congressional District ${district}` }],
          States: [{ STUSAB: state, STATE: "48", NAME: "Texas" }],
          "2024 State Legislative Districts - Upper": [{ SLDU: "014", BASENAME: "14", NAME: "State Senate District 14" }],
          "2024 State Legislative Districts - Lower": [{ SLDL: "049", BASENAME: "49", NAME: "State House District 49" }] } }] } });
    }
    json(404, { error: "no stand-in for this path" });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, emails,
    /** Extra environment for the app server so every outside call lands here. The key values are made up. */
    env: { VERIFICATION_ENABLED: "1", RESEND_API_URL: `${base}/emails`, RESEND_API_KEY: "standin-not-a-key",
      TURNSTILE_SITE_KEY: "standin-site", TURNSTILE_SECRET_KEY: "standin-not-a-secret", TURNSTILE_VERIFY_URL: `${base}/turnstile/siteverify`, TURNSTILE_SCRIPT_URL: `${base}/turnstile/api.js`,
      TWILIO_ACCOUNT_SID: "ACstandin", TWILIO_AUTH_TOKEN: "standin-not-a-token", TWILIO_VERIFY_SERVICE_SID: "VAstandin", TWILIO_VERIFY_BASE: base, TWILIO_LOOKUP_BASE: base,
      CENSUS_GEOCODER_BASE: base },
    stop: () => new Promise(r => server.close(r)) };
}
