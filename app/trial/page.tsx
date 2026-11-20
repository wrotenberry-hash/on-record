import Link from "next/link";
import { brandTitle } from "@/lib/brand";
import { Wordmark } from "@/components/brand/wordmark";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Invite"), robots: { index: false, follow: false } };

const MESSAGES: Record<string, { title: string; body: string }> = {
  not_open: { title: "The trial opens soon.", body: "Your invite link is genuine. The trial has not opened yet; try the same link again later. Nothing else to do." },
  revoked: { title: "This invite has been withdrawn.", body: "If you think that is a mistake, ask the person who sent it for a new link." },
  editor: { title: "You are signed in as the editor.", body: "This invite link is genuine and has not been used up. While you are signed in as the editor, the site shows you the editor's view and not what a trial reader sees. To see what a reader sees, open the link in a private window where you have not signed in. On a phone, close any private tabs you signed in from first." },
  invalid: { title: "This invite link is not valid.", body: "Check that the whole link was copied, or ask the person who sent it for a new one." },
};

/** Where an invite link lands when it cannot open the site. Says nothing about the site's content. */
export default async function TrialPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const m = MESSAGES[state ?? ""] ?? MESSAGES.invalid;
  return <>
    <header className="topbar"><Link className="brand" href="/"><Wordmark /><i/></Link><nav><small>INVITE-ONLY TRIAL</small></nav></header>
    <main><div className="intro"><div className="eyebrow">INVITE</div><h1>{m.title}</h1><p>{m.body}</p></div></main>
  </>;
}
