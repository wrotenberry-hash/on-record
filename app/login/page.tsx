import Link from "next/link";
import { redirect } from "next/navigation";
import { getEditorUser, safeRelativeReturnPath } from "@/lib/auth";
import { sendMagicLink } from "./actions";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  sent: "Check your email for a sign-in link. It expires in an hour and works once.",
  invalid: "Enter a valid email address.",
  error: "The sign-in email could not be sent. Try again in a minute.",
  unconfigured: "Sign-in is not configured on this deployment.",
  denied: "That account is signed in but is not on the editor allowlist.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ status?: string; return_to?: string }> }) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to);
  if (await getEditorUser()) redirect(returnTo);
  const status = params.status && messages[params.status] ? params.status : null;
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link><nav><small>PRIVATE REVIEW BUILD</small></nav></header>
    <main><div className="intro"><div className="eyebrow">EDITOR SIGN-IN</div><h1>Sign in to the checking instrument.</h1>
      <p>Enter the editor email address. A one-time sign-in link is sent to it; nothing else is stored.</p></div>
      {status && <div role={status === "sent" ? "status" : "alert"} className={status === "sent" ? "form-success" : "form-error"}>{messages[status]}</div>}
      <form action={sendMagicLink} className="intake-panel" style={{ maxWidth: 480 }}>
        <input type="hidden" name="return_to" value={returnTo} />
        <label>Email address<input name="email" type="email" required autoComplete="email" inputMode="email" /></label>
        <button type="submit">Email me a sign-in link</button>
      </form></main>
  </>;
}
