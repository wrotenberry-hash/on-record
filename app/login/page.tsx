import Link from "next/link";
import { redirect } from "next/navigation";
import { getEditorUser, safeRelativeReturnPath } from "@/lib/auth";
import { signInWithKey } from "./actions";
import { BRAND } from "@/lib/brand";
import { Wordmark } from "@/components/brand/wordmark";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  denied: "That key was not accepted.",
  unconfigured: "Sign-in is not configured on this deployment: set EDITOR_ACCESS_KEY and EDITOR_EMAILS.",
  signedout: "You are signed out.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ status?: string; return_to?: string }> }) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to);
  if (await getEditorUser()) redirect(returnTo);
  const status = params.status && messages[params.status] ? params.status : null;
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link><nav><small>PRIVATE REVIEW BUILD</small></nav></header>
    <main><div className="intro"><div className="eyebrow">EDITOR SIGN-IN</div><h1>Sign in to the checking instrument.</h1>
      <p>Enter the editor access key. It is kept in the project&apos;s settings, not in any email. You stay signed in on this device for 30 days.</p>
      <p className="meta">Asked to sign in again? A private browser tab forgets the sign-in when it closes. Use a normal tab, and let your phone save the key so Face ID fills it next time.</p></div>
      {status && <div role={status === "signedout" ? "status" : "alert"} className={status === "signedout" ? "form-success" : "form-error"}>{messages[status]}</div>}
      <form action={signInWithKey} className="intake-panel" style={{ maxWidth: 480 }}>
        <input type="hidden" name="return_to" value={returnTo} />
        {/* Owner request, 17 Nov: a password manager only offers to save a key that has an account name beside it.
            This fixed name lets iPhone Passwords (or any manager) save the key once and fill it with Face ID after. It is not checked. */}
        <label>Account<input name="username" type="text" value={`${BRAND.name} editor`} readOnly autoComplete="username" /></label>
        <label>Editor access key<input id="access_key" name="access_key" type="password" required autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
        <button type="submit">Sign in</button>
      </form></main>
  </>;
}
