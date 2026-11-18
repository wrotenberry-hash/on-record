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
import { addressAuthority } from "@/lib/verify/providers";
import { HOLD_LABEL, normaliseResidence, phoneAvailable, splitUnit, unitDecision, type HoldKind } from "@/lib/verify/residence";
import { billsOfAccounts, liveHolds, phoneHeldUntil, setResidence, stampPosition } from "@/lib/verify/residence-store";

/**
 * The verification steps a reader takes on the Account page, and the counted
 * write behind Support/Oppose. Each step returns a plain-language message.
 * With VERIFICATION_ENABLED off every step answers "not switched on" and
 * Support/Oppose stays private exactly as before.
 */
export const PENDING_PHONE_COOKIE = "or_pp";
const PENDING_MS = 10 * 60 * 1000;
type Result = { ok: boolean; message: string };
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const HELD_MESSAGE = "That number belonged to an account that was deleted. A number can verify a new account 90 days after its old account is deleted";
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
  const free = phoneAvailable({ takenByOtherAccount: !!taken, heldUntil: await phoneHeldUntil(getDb(), phoneHash, Date.now()), now: Date.now() });
  if (!free.ok && free.reason === "taken") { await bumpCount("account_blocked", "phone_reused"); return { ok: false, message: "That number already verified another account. One phone per account." }; }
  if (!free.ok) { await bumpCount("account_blocked", "phone_held"); return { ok: false, message: `${HELD_MESSAGE}: from ${day(free.until!)}.` }; }
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
  const heldUntil = await phoneHeldUntil(getDb(), profile.pendingPhoneHash, Date.now());
  if (heldUntil) return { ok: false, message: `${HELD_MESSAGE}: from ${day(heldUntil)}.` };
  const checked = await checkSmsCode(phone, code.trim());
  if (!checked.ok) return { ok: false, message: "That code did not match. Check the text and try again." };
  try { await updateProfile(account.id, { phoneHash: profile.pendingPhoneHash, phoneVerifiedAt: Date.now(), pendingPhoneHash: null, pendingPhoneAt: null }); }
  catch { await bumpCount("account_blocked", "phone_reused"); return { ok: false, message: "That number already verified another account. One phone per account." }; }
  jar.delete({ name: PENDING_PHONE_COOKIE, path: "/account" });
  const tier = await refreshTier(account);
  return { ok: true, message: tier >= 1 ? "Phone confirmed. You are verified as a real person." : "Phone confirmed." };
}

/** Is a vote expected within a week? Federal: a bill is on a floor schedule this week or next. State: the Texas Legislature is in session. */
async function voteSoon(state: string, now: number) {
  const { officialFloorSchedule } = await import("@/db/schema"), { gte } = await import("drizzle-orm");
  const from = new Date(now - 7 * 86400e3).toISOString().slice(0, 10);
  const federal = !!(await getDb().select({ w: officialFloorSchedule.weekOf }).from(officialFloorSchedule).where(gte(officialFloorSchedule.weekOf, from)).limit(1).get().catch(() => null));
  const inSession = state === "TX" ? await import("@/lib/texas/calendar").then(m => m.txSessionState(new Date(now).toISOString().slice(0, 10)).inSession).catch(() => false) : false;
  return { federal, state: inSession };
}

const heldLine = (kinds: readonly HoldKind[]) => kinds.includes("household_cap")
  ? " Six accounts already count at this address, so yours is waiting for a review. Until then you can read and follow, and your answers are saved but not counted."
  : kinds.length ? ` Your account is waiting for a review (${HOLD_LABEL[kinds[0]].toLowerCase()}). Until then you can read and follow, and your answers are saved but not counted.` : "";

/**
 * The account's one home address (owner, 18 Nov 2026). A new address replaces the old one, at most once every 90 days.
 * It gives the account exactly one congressional district, one state senate district and one state house district.
 */
export async function setAddress(account: Account, raw: { street: string; unit?: string; city: string; state: string; zip: string }): Promise<Result> {
  const c = verificationConfig();
  if (!c.enabled) return off;
  const profile = await profileFor(account.id);
  if (!profile?.phoneVerifiedAt) return { ok: false, message: "Confirm your phone first." };
  const parts = [raw.street, raw.city, raw.state, raw.zip].map(x => String(x ?? "").replace(/\s+/g, " ").trim());
  if (parts.some(p => !p) || !/^\d{5}(-\d{4})?$/.test(parts[3]) || !/^[A-Za-z]{2}$/.test(parts[2])) return { ok: false, message: "Enter street, city, two-letter state and ZIP." };
  if (looksLikePoBox(parts[0])) return { ok: false, message: "Use the address where you live, not a PO box." };
  if (!(await withinLimit("address_account_day", account.id))) return { ok: false, message: "Too many tries today. Try again tomorrow." };
  const home = splitUnit(parts[0], String(raw.unit ?? "").replace(/\s+/g, " ").trim() || null);
  const street = `${home.street}, ${parts[1]}, ${parts[2].toUpperCase()} ${parts[3]}`;
  const g = await geocodeDistrict(street);
  if (!g.ok) return { ok: false, message: g.reason === "unreachable" ? "The Census address service did not answer. Try again in a minute."
    : "The Census Bureau could not place that address. Check the street number and ZIP." };
  // Where the official address database lists several homes at this address, the unit number is required.
  const authority = await addressAuthority({ street: home.street, unit: home.unit, city: parts[1], state: parts[2].toUpperCase(), zip: parts[3] });
  const unit = unitDecision(authority, !!home.unit);
  if (unit === "unit_required") return { ok: false, message: "The Postal Service lists more than one home at that address. Add your apartment or unit number." };
  if (unit === "unit_not_found") return { ok: false, message: "The Postal Service does not list that apartment or unit at that address. Check the number." };
  const n = normaliseResidence(authority?.standard || g.matchedAddress || street, home.unit);
  const ctx = await requestContext(), now = Date.now();
  const r = await setResidence(getDb(), { accountId: account.id, addressKey: await keyedHash("residence", n.address), buildingKey: await keyedHash("residence", n.building), hasUnit: !!n.unit,
    districts: { congressional: g.districtId, state: g.state, stateUpper: g.stateUpper, stateLower: g.stateLower }, device: ctx.device, ipRange: ctx.ipRange, voteSoon: await voteSoon(g.state, now), now });
  for (const k of r.held) await bumpCount("account_held", k);
  if (!r.ok) return { ok: false, message: `You can change your home address once every 90 days. Yours can change again on ${day(r.nextAllowedAt)}.${heldLine(r.held)}` };
  if (r.kind === "same") return { ok: true, message: `That is the address already on your account (district ${g.districtId}). Nothing changed.` };
  await updateProfile(account.id, { districtId: g.districtId, stateCode: g.state, addressMatchedAt: now, addressCipher: await encryptAddress(n.unit ? `${street} #${n.unit}` : street) });
  const tier = await refreshTier(account);
  // Totals for every bill touched: this account's (it may be newly held or newly district-matched) and any other account set aside by this step.
  for (const b of await billsOfAccounts(getDb(), [...new Set([account.id, ...r.heldAccounts])])) await recomputeBill(b);
  const held = (await liveHolds(getDb(), account.id)).map(h => h.kind as HoldKind);
  const where = [g.districtId, g.stateUpper, g.stateLower].filter(Boolean).join(", ");
  return { ok: true, message: (r.kind === "change" ? `Address changed. From now on your answers count in ${where}. Answers you already gave stay counted where you lived when you gave them. You can change your address again on ${day(now + 90 * 86400e3)}.`
    : tier === 2 ? `Matched to ${where}. Your answers now count there as well. You can change this address once every 90 days.` : `Matched to ${where}.`) + heldLine(held) };
}

export type CountedOutcome = { counted: boolean; code: CountedCode | null };
/** Fixed notes shown after an answer; the page maps a code to text (nothing from the URL is shown as text). */
export type CountedCode = "rate" | "challenge" | "counted" | "review" | `from-${number}`;
export function countedNote(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === "rate") return "Saved privately. You have answered a lot in a short time, so this one does not count; try again later.";
  if (code === "challenge") return "Saved privately. The automatic bot check did not finish, so it does not count yet; answer again to retry.";
  if (code === "counted") return "Counted toward the totals, without your name.";
  if (code === "review") return "Saved. Your account is waiting for a review, so this answer is not counted yet. It will be once the review clears.";
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
  // The answer takes the account's home now if it has none yet; one it already has is never changed (a move does not carry it).
  if (input.stance) await stampPosition(getDb(), { userId: input.userId, billId: input.billId, accountId: input.account.id }, Date.now());
  if (input.stance) await checkPosition({ billId: input.billId, districtId: tier >= 2 ? profile.districtId : null, reasonHash, profile });
  await recomputeBill(input.billId);
  const from = countsFrom(input.account.createdAt);
  if (input.stance && (await liveHolds(getDb(), input.account.id)).length) return { counted: false, code: "review" };
  return { counted: true, code: !input.stance ? null : from > Date.now() ? `from-${from}` : "counted" };
}
