/**
 * Round J switch and readiness. Verification is off until VERIFICATION_ENABLED
 * is "1"; with it on but a key missing, the step that needs the key says it is
 * not ready and nothing counts. Provider base URLs can be pointed at local
 * stand-ins for testing (never set in production).
 */
export const VERIFICATION_FLAG = "VERIFICATION_ENABLED";
const env = (k: string) => process.env[k]?.trim() || "";

export function verificationConfig() {
  const enabled = env(VERIFICATION_FLAG) === "1";
  const turnstile = { siteKey: env("TURNSTILE_SITE_KEY"), secret: env("TURNSTILE_SECRET_KEY"),
    verifyUrl: env("TURNSTILE_VERIFY_URL") || "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    scriptUrl: env("TURNSTILE_SCRIPT_URL") || "https://challenges.cloudflare.com/turnstile/v0/api.js" };
  const twilioUser = env("TWILIO_API_KEY_SID") || env("TWILIO_ACCOUNT_SID"), twilioPass = env("TWILIO_API_KEY_SECRET") || env("TWILIO_AUTH_TOKEN");
  const twilio = { accountSid: env("TWILIO_ACCOUNT_SID"), user: twilioUser, pass: twilioPass, serviceSid: env("TWILIO_VERIFY_SERVICE_SID"),
    verifyBase: env("TWILIO_VERIFY_BASE") || "https://verify.twilio.com", lookupBase: env("TWILIO_LOOKUP_BASE") || "https://lookups.twilio.com" };
  const census = { base: env("CENSUS_GEOCODER_BASE") || "https://geocoding.geo.census.gov" };
  // The official address database (unit numbers). Off unless ADDRESS_AUTHORITY=usps and both keys are set: the Postal
  // Service's terms allow its address check only for mailing and shipping, so turning it on is the owner's decision (O-146).
  const usps = { on: env("ADDRESS_AUTHORITY").toLowerCase() === "usps", clientId: env("USPS_CLIENT_ID"), clientSecret: env("USPS_CLIENT_SECRET"), base: env("USPS_API_BASE") || "https://apis.usps.com" };
  const capRaw = Number(env("VERIFY_MONTHLY_CAP_USD") || "10");
  return { enabled, turnstile, twilio, census, usps, addressAuthorityReady: usps.on && !!usps.clientId && !!usps.clientSecret, monthlyCapUsd: Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 10,
    turnstileReady: !!(turnstile.siteKey && turnstile.secret), twilioReady: !!(twilio.user && twilio.pass && twilio.serviceSid) };
}
export type VerificationConfig = ReturnType<typeof verificationConfig>;
