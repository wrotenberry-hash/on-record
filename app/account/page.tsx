import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { accountForAppUser, currentAccount, maskEmail } from "@/lib/accounts";
import { requestLink, setDigest, signOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account · On Record", robots: { index: false, follow: false } };

const MESSAGES: Record<string, string> = { signedin: "You are signed in on this device.", signedout: "Signed out on this device.", saved: "Saved.",
  expired: "That sign-in link has expired or was already used. Ask for a new one below.", closed: "Sign-in is open to trial readers only for now." };

/** Sign in by email, see what is kept, choose the weekly email. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ m?: string; t?: string }> }) {
  const access = await viewerAccess();
  const { m, t } = await searchParams;
  if (!access.allowed) return <PublicShell current="/account" access={access} page="/account">{null}</PublicShell>;
  const appUserId = await currentAppUserId();
  const account = (await currentAccount()) ?? (appUserId ? await accountForAppUser(appUserId) : null);
  const note = m === "sent" || m === "fail" ? t : m ? MESSAGES[m] : null;
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
      </> : <>
        <p>Enter your email and we will send a one-time link. No password. We keep your address only to send that link and, if you want it, a Monday email of how the members you follow voted.</p>
        <form action={requestLink} className="review-actions"><input type="email" name="email" id="account-email" required autoComplete="email" placeholder="you@example.com" aria-label="Email" />
          <button>Email me a link</button></form>
      </>}
      <p className="meta"><Link href="/following">Following</Link> · <Link href="/politicians">Find a member</Link></p>
    </section>
  </PublicShell>;
}
