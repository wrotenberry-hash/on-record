import Link from "next/link";
import "@/app/office/office.css";
import { BRAND } from "@/lib/brand";
import { Wordmark } from "@/components/brand/wordmark";

type Access = { allowed: boolean; preview: boolean };

/**
 * Frame for the pages a legislator's office uses. It is not the reader's frame: no reader menu, no reader sign-in.
 * The same switch closes it: while public reading is off, only the editor and trial readers get past `access`
 * (lib/viewer.ts), and everyone else sees the private-review notice and nothing else.
 */
export function OfficeShell({ access, children, signedIn = false, print = false }: { access: Access; children: React.ReactNode; signedIn?: boolean; print?: boolean }) {
  return <div className={print ? "office office-print" : "office"}>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link>
      <nav>{access.allowed && signedIn && <Link href="/office/dashboard">Office dashboard</Link>}{access.allowed && <Link href="/office">Office sign-in</Link>}<small>FOR LEGISLATORS&apos; OFFICES</small></nav></header>
    <main>
      {access.allowed && access.preview && <div className="preview-banner" role="note"><b>Private preview.</b> {BRAND.name} is not public yet. You can see this page because you are signed in as the editor or hold a trial invite.</div>}
      {access.allowed ? children : <><div className="intro"><div className="eyebrow">PRIVATE REVIEW</div><h1>This page is not yet public.</h1>
        <p>{BRAND.name} is being evaluated privately. This page will appear once the editorial team enables public reading.</p></div></>}
    </main>
  </div>;
}
