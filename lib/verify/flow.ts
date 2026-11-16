import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { verificationProfiles } from "@/db/schema";
import { verificationConfig } from "@/lib/verify/config";
import { decryptValue, encryptAddress, encryptValue, keyedHash } from "@/lib/verify/crypto";
import { checkSmsCode, geocodeDistrict, lookupLineType, sendSmsCode, verifyTurnstile } from "@/lib/verify/providers";
import { checkPosition } from "@/lib/verify/anomaly";
import { backfillCounted, bumpCount, ensureProfile, profileFor, recomputeBill, refreshTier, requestContext, spendAllowed, updateProfile, withinLimit, writeCounted,
  type Account } from "@/lib/verify/store";
import { cleanReason, countsFrom, lineTypeAccepted, looksLikePoBox, normalisePhone, normaliseReason, type Tier } from "@/lib/verify/rules";

/**
 * The verification steps a reader takes on the Account page, and the counted
 * write behind Support/Oppose. Each step returns a plain-language message.
 * With VERIFICATION_ENABLED off every step answers "not switched on" and
 * Support/Oppose stays private exactly as before.
 */
export const PENDING_PHONE_COOKIE = "or_pp";
const PENDING_MS = 10 * 60 * 1000;
type Result = { ok: boolean; message: string };
const off: Result = { ok: false, message: "Verification is not switched on yet." };

export async function startPhone(account: Account, raw: { phone: string; consent: boolean; turnstile: string | null }): Promise<Result> {
  const c = verificationConfig();
  if (!c.enabled) return off;
  if (!c.twilioReady) return { ok: false, message: "Text-message checks are not set up yet." };
  if (!raw.consent) return { ok: false, message: "Tick the box to agree to one text message first." };
  const ctx = await requestContext();
  const profile = await ensureProfile(account.id);
  if (!profile.signupChallengeAt) {
    const t = await verifyTurnstile(raw.turnstile, ctx.ip);
    if (!t.ok) { await bumpCount("account_blocked", "bot_challenge"); return { ok: false, message: "The automatic bot check did not pass. Reload the page and try again." }; }
    await updateProfile(account.id, { signupChallengeAt: Date.now() });
  }
  const phone = normalisePhone(raw.phone);
  if (!phone) return { ok: false, message: "Enter a US mobile number, like 512 555 0100." };
  if (!(await withinLimit("sms_account_day", account.id)) || !(await withinLimit("sms_ip_day", ctx.ipRange))) {
    await bumpCount("account_blocked", "rate_limited");
    return { ok: false, message: "Too many codes today. Try again tomorrow." };
  }
  const phoneHash = await keyedHash("phone", phone);
  const taken = await getDb().select({ id: verificationProfiles.accountId }).from(verificationProfiles)
    .where(and(eq(verificationProfiles.phoneHash, phoneHash), ne(verificationProfiles.accountId, account.id))).get();
  if (taken) { await bumpCount("account_blocked", "phone_reused"); return { ok: false, message: "That number already verified another account. One phone per account." }; }
  if (!(await spendAllowed("lookup")) || !(await spendAllowed("sms_send"))) return { ok: false, message: "Text-message checks are paused for the rest of the month. Your answers stay private until then." };
  const line = await lookupLineType(phone);
  await bumpCount("spend", "lookup");
  if (!line.ok) return { ok: false, message: "We could not check that number. Try again in a minute." };
  if (!line.valid || !lineTypeAccepted(line.type)) {
    await bumpCount("account_blocked", "voip_number");
    return { ok: false, message: "That number looks like an internet (VoIP), virtual or landline number. Use the mobile number on your phone plan." };
  }
  const sent = await sendSmsCode(phone);
  await bumpCount("spend", "sms_send");
  if (!sent.ok) return { ok: false, message: "The text could not be sent. Try again in a minute." };
  await updateProfile(account.id, { pendingPhoneHash: phoneHash, pendingPhoneAt: Date.now(), phoneLineType: line.type });
  (await cookies()).set(PENDING_PHONE_COOKIE, await encryptValue("pending-phone", phone), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/account", maxAge: PENDING_MS / 1000 });
  return { ok: true, message: `Code sent to the number ending ${phone.slice(-4)}. It works for 10 minutes.` };
}

export async function confirmPhone(account: Account, code: string): Promise<Result> {
  const c = verificationConfig();
  if (!c.enabled) return off;
  const jar = await cookies();
  const phone = await decryptValue("pending-phone", jar.get(PENDING_PHONE_COOKIE)?.value);
  const profile = await profileFor(account.id);
  if (!phone || !profile?.pendingPhoneHash || !profile.pendingPhoneAt || Date.now() - profile.pendingPhoneAt > PENDING_MS) return { ok: false, message: "That code has expired. Ask for a new one." };
  if ((await keyedHash("phone", phone)) !== profile.pendingPhoneHash) return { ok: false, message: "Ask for a new code." };
  if (!/^\d{4,10}$/.test(code.trim())) return { ok: false, message: "Enter the digits from the text." };
  const checked = await checkSmsCode(phone, code.trim());
  if (!checked.ok) return { ok: false, message: "That code did not match. Check the text and try again." };
  try { await updateProfile(account.id, { phoneHash: profile.pendingPhoneHash, phoneVerifiedAt: Date.now(), pendingPhoneHash: null, pendingPhoneAt: null }); }
  catch { await bumpCount("account_blocked", "phone_reused"); return { ok: false, message: "That number already verified another account. One phone per account." }; }
  jar.delete({ name: PENDING_PHONE_COOKIE, path: "/account" });
  const tier = await refreshTier(account);
  return { ok: true, message: tier >= 1 ? "Phone confirmed. You are verified as a real person." : "Phone confirmed." };
}

export async function setAddress(account: Account, raw: { street: string; city: string; state: string; zip: string }): Promise<Result> {
  const c = verificationConfig();
  if (!c.enabled) return off;
  const profile = await profileFor(account.id);
  if (!profile?.phoneVerifiedAt) return { ok: false, message: "Confirm your phone first." };
  const parts = [raw.street, raw.city, raw.state, raw.zip].map(x => String(x ?? "").replace(/\s+/g, " ").trim());
  if (parts.some(p => !p) || !/^\d{5}(-\d{4})?$/.test(parts[3]) || !/^[A-Za-z]{2}$/.test(parts[2])) return { ok: false, message: "Enter street, city, two-letter state and ZIP." };
  if (looksLikePoBox(parts[0])) return { ok: false, message: "Use the address where you live, not a PO box." };
  if (!(await withinLimit("address_account_day", account.id))) return { ok: false, message: "Too many tries today. Try again tomorrow." };
  const address = `${parts[0]}, ${parts[1]}, ${parts[2].toUpperCase()} ${parts[3]}`;
  const g = await geocodeDistrict(address);
  if (!g.ok) return { ok: false, message: g.reason === "unreachable" ? "The Census address service did not answer. Try again in a minute."
    : "The Census Bureau could not place that address. Check the street number and ZIP." };
  await updateProfile(account.id, { districtId: g.districtId, stateCode: g.state, addressMatchedAt: Date.now(), addressCipher: await encryptAddress(address) });
  const tier = await refreshTier(account);
  return { ok: true, message: tier === 2 ? `Matched to district ${g.districtId}. Your answers now count for ${g.districtId} as well.` : `Matched to district ${g.districtId}.` };
}

export type CountedOutcome = { counted: boolean; code: CountedCode | null };
/** Fixed notes shown after an answer; the page maps a code to text (nothing from the URL is shown as text). */
export type CountedCode = "rate" | "challenge" | "counted" | `from-${number}`;
export function countedNote(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "rate") return "Saved privately. You have answered a lot in a short time, so this one does not count; try again later.";
  if (code === "challenge") return "Saved privately. The automatic bot check did not finish, so it does not count yet; answer again to retry.";
  if (code === "counted") return "Counted toward the totals, without your name.";
  const m = code.match(/^from-(\d{13})$/);
  return m ? `Counted from ${new Date(Number(m[1])).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET (new accounts count after 24 hours).` : null;
}

/**
 * The counted copy of a Support/Oppose answer. Private answers are always saved
 * first by the caller; this decides whether the answer also goes toward totals.
 */
export async function castCounted(input: { userId: string; account: Account | null; billId: string; stance: "support" | "oppose" | null; reason: unknown; turnstile: string | null }): Promise<CountedOutcome> {
  const c = verificationConfig();
  if (!c.enabled || !input.account) return { counted: false, code: null };
  const profile = await profileFor(input.account.id);
  const tier = (profile?.tier ?? 0) as Tier;
  if (tier < 1 || !profile) return { counted: false, code: null };
  const ctx = await requestContext();
  if (input.stance && (!(await withinLimit("vote_account_hour", input.account.id)) || !(await withinLimit("vote_account_day", input.account.id))
    || !(await withinLimit("vote_device_hour", ctx.device)) || !(await withinLimit("vote_ip_hour", ctx.ipRange)))) {
    return { counted: false, code: "rate" };
  }
  if (!profile.firstVoteChallengeAt) {
    const t = await verifyTurnstile(input.turnstile, ctx.ip);
    if (!t.ok) { await bumpCount("account_blocked", "bot_challenge"); return { counted: false, code: "challenge" }; }
    await updateProfile(input.account.id, { firstVoteChallengeAt: Date.now() });
    const earlier = await backfillCounted(input.userId, input.account, tier, ctx);
    for (const b of earlier) if (b !== input.billId) await recomputeBill(b);
  }
  const reason = cleanReason(input.reason), norm = normaliseReason(reason);
  const reasonHash = norm ? await keyedHash("reason", norm) : null;
  await writeCounted({ userId: input.userId, account: input.account, tier, billId: input.billId, stance: input.stance, reason, reasonHash, ctx });
  if (input.stance) await checkPosition({ billId: input.billId, districtId: tier >= 2 ? profile.districtId : null, reasonHash, profile });
  await recomputeBill(input.billId);
  const from = countsFrom(input.account.createdAt);
  return { counted: true, code: !input.stance ? null : from > Date.now() ? `from-${from}` : "counted" };
}
