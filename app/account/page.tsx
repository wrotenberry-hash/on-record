import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { accountForAppUser, currentAccount, maskEmail } from "@/lib/accounts";
import { requestLink, setAlerts, setDigest, signOut } from "./actions";
import { PushToggle } from "@/components/push/push-toggle";
import { getDb } from "@/db";
import { alertPrefs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkPhoneCode, deleteMyAccount, saveAddress, sendPhoneCode } from "./verify-actions";
import { cookies } from "next/headers";
import { verificationConfig } from "@/lib/verify/config";
import { profileFor } from "@/lib/verify/store";
import { PENDING_PHONE_COOKIE } from "@/lib/verify/flow";
import { countsFrom } from "@/lib/verify/rules";
import { Turnstile } from "@/components/verify/turnstile";
import { brandTitle } from "@/lib/brand";

const TIER_LABEL = ["Visitor: your answers are private and not counted", "Real person: your answers count toward national totals", "District-matched: your answers count nationally and for your district"];
const requestTime = () => Date.now();
const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Your account"), robots: { index: false, follow: false } };

const MESSAGES: Record<string, string> = { signedin: "You are signed in on this device.", signedout: "Signed out on this device.", saved: "Saved.",
  expired: "That sign-in link has expired or was already used. Ask for a new one below.", closed: "Sign-in is open to trial readers only for now.",
  deleted: "Your account, your answers and your follows are deleted.", confirmdelete: "Tick the box to confirm, then tap Delete." };

/** Sign in by email, see what is kept, choose the weekly email. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ m?: string; t?: string; v?: string; ok?: string }> }) {
  const access = await viewerAccess();
  const { m, t, v, ok } = await searchParams;
  const vc = verificationConfig();
  if (!access.allowed) return <PublicShell current="/account" access={access} page="/account">{null}</PublicShell>;
  const appUserId = await currentAppUserId();
  const account = (await currentAccount()) ?? (appUserId ? await accountForAppUser(appUserId) : null);
  const note = m === "sent" || m === "fail" ? t : m ? MESSAGES[m] : null;
  const profile = vc.enabled && account ? await profileFor(account.id) : null;
  const tier = profile?.tier ?? 0;
  const pendingCode = !!(await cookies()).get(PENDING_PHONE_COOKIE)?.value && !!profile?.pendingPhoneHash;
  const needChallenge = vc.turnstileReady && !profile?.signupChallengeAt;
  const prefs = appUserId ? await getDb().select().from(alertPrefs).where(eq(alertPrefs.userId, appUserId)).get().catch(() => null) : null;
  const countsLater = !!account && countsFrom(account.createdAt) > requestTime();
  return <PublicShell current="/account" access={access} page="/account">
    <section className="fed-page">
      <div className="eyebrow">YOUR ACCOUNT</div>
      <h1>{account ? "Your account" : "Keep your follows on every device"}</h1>
      {note && <p className={m === "fail" || m === "expired" ? "gate gate-closed" : "gate gate-open"} role="status">{note}</p>}
      {account ? <>
        <p>Signed in as <b>{maskEmail(account.email)}</b>. Your follows and your own Support/Oppose answers are kept with this account and shown to no one else.</p>
        <form action={setDigest} className="review-actions"><input type="hidden" name="on" value={account.digestOptIn ? "0" : "1"} />
          <span>Weekly email of how the members you follow voted: <b>{account.digestOptIn ? "on" : "off"}</b></span>
          <button className="secondary">{account.digestOptIn ? "Turn off" : "Turn on"}</button></form>
        <form action={signOut}><button className="link-button">Sign out on this device</button></form>
        {vc.enabled && <div className="fed-section verify-steps" id="verify">
          <h2>Make your answers count</h2>
          <p>Support and Oppose answers from verified real people are added, <b>without your name</b>, to the totals on each bill. Answers from visitors stay private and are never counted.</p>
          <p className="gate gate-open" role="status"><b>Your level:</b> {TIER_LABEL[tier]}.{tier >= 1 && countsLater ? ` New accounts count after 24 hours: from ${when(countsFrom(account.createdAt))}.` : ""}{profile?.districtId ? ` District ${profile.districtId}.` : ""}</p>
          {v && t && <p className={ok === "1" ? "gate gate-open" : "gate gate-closed"} role="status">{t}</p>}
          {!profile?.phoneVerifiedAt && !pendingCode && <form action={sendPhoneCode} className="verify-form">
            <h3>1. Confirm you are a real person</h3>
            <label htmlFor="v-phone">Your US mobile number</label>
            <input id="v-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="512 555 0100" />
            <label className="consent"><input type="checkbox" name="consent" value="yes" required /> <span>Text me one 6-digit code. We send it through Twilio; message and data rates may apply. We use the number once, keep only a scrambled fingerprint (a hash) so it cannot verify a second account, and never text you anything else or share it. Internet (VoIP) and virtual numbers cannot be used.</span></label>
            {needChallenge && <Turnstile siteKey={vc.turnstile.siteKey} scriptUrl={vc.turnstile.scriptUrl} action="phone" />}
            <button>Text me a code</button></form>}
          {!profile?.phoneVerifiedAt && pendingCode && <form action={checkPhoneCode} className="verify-form">
            <h3>2. Enter the code</h3>
            <label htmlFor="v-code">Code from the text</label>
            <input id="v-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required />
            <button>Confirm</button></form>}
          {profile?.phoneVerifiedAt && <form action={saveAddress} className="verify-form">
            <h3>{profile.districtId ? "Your district" : "3. Match your district (optional)"}</h3>
            <p className="meta">{profile.districtId ? `Matched to ${profile.districtId}. Enter a new address to change it.` : "Your answers then also count for the district you live in. The Census Bureau's geocoder finds the district; we keep the address encrypted and count only the district."}</p>
            <label htmlFor="v-street">Street address</label><input id="v-street" name="street" autoComplete="address-line1" required />
            <div className="verify-row"><span><label htmlFor="v-city">City</label><input id="v-city" name="city" autoComplete="address-level2" required /></span>
              <span><label htmlFor="v-state">State</label><input id="v-state" name="state" autoComplete="address-level1" maxLength={2} required placeholder="TX" /></span>
              <span><label htmlFor="v-zip">ZIP</label><input id="v-zip" name="zip" autoComplete="postal-code" inputMode="numeric" maxLength={10} required /></span></div>
            <button>{profile.districtId ? "Update district" : "Match my district"}</button></form>}
        </div>}
        <div className="fed-section" id="delete"><h2>Delete your account</h2>
          <p className="meta">Deletes your account, every Support/Oppose answer (private and counted), your follows{vc.enabled ? ", and your verification record" : ""}. Totals are recalculated without you. This cannot be undone.</p>
          <form action={deleteMyAccount} className="review-actions"><label className="consent"><input type="checkbox" name="confirm" value="yes" /> <span>Yes, delete everything</span></label><button className="secondary">Delete my account</button></form></div>
      </> : <>
        <p>Enter your email and we will send a one-time link. No password. We keep your address only to send that link and, if you want it, a Monday email of how the members you follow voted.</p>
        <form action={requestLink} className="review-actions"><input type="email" name="email" id="account-email" required autoComplete="email" placeholder="you@example.com" aria-label="Email" />
          {vc.enabled && vc.turnstileReady && <Turnstile siteKey={vc.turnstile.siteKey} scriptUrl={vc.turnstile.scriptUrl} action="signup" />}
          <button>Email me a link</button></form>
      </>}
      {(access.invite || access.editor) && <div className="fed-section" id="alerts"><h2>Alerts</h2>
        <form action={setAlerts} className="verify-form">
          <label className="consent"><input type="checkbox" name="instantVotes" value="1" defaultChecked={!!prefs?.instantVotes} /> <span>When my legislators or members I follow vote on a bill in my issues</span></label>
          <label className="consent"><input type="checkbox" name="instantBills" value="1" defaultChecked={prefs ? !!prefs.instantBills : true} /> <span>When a bill I follow moves</span></label>
          <button>Save alert choices</button></form>
        <PushToggle />
        <p className="meta">Alerts arrive by email (with a signed-in account) and on devices where you turn them on. They are sent after each scheduled update, twice a day.</p></div>}
      <p className="meta"><Link href="/following">Following</Link> · <Link href="/politicians">Find a member</Link></p>
    </section>
  </PublicShell>;
}
