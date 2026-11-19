"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buildContactMessage, contactSubject, defaultVote, mailtoHref, telHref, type ContactDim, type ContactEvent, type ContactStance, type ContactVote } from "@/lib/contact-message";
import { followAfterContact, stopFollowing } from "./actions";
import styles from "./contact.module.css";

/** One legislator as the tool needs them. `id` is used only for element ids on the page; it is never sent anywhere. */
export type ContactPerson = {
  id: string; name: string; title: string; seat: string; href: string;
  /** True only when this member represents the reader's saved state or district. */
  constituent: boolean;
  phone: string | null; districtPhone: string | null; officeAddress: string | null; districtAddress: string | null; email: string | null;
  /** The member's own contact form, or their official website with the honest fallback label. */
  web: { url: string; label: string; isForm: boolean } | null;
  /** "Washington office" or "Capitol office": what the main phone number rings. */
  officeLabel: string;
  /** Where the details came from and when: "Official: <congress-legislators file>, retrieved Nov 17, 2026". Null when nothing is on record. */
  source: { lead: string; linkText: string; url: string; tail?: string; retrieved: string } | null;
  /** This member's recorded votes on the bill, if any. */
  votes: Array<ContactVote & { rollId: string; at: number }>;
};

/** Aggregate tap counting: which button, on which kind of page. Never which member or bill, and never the message. */
function tap(event: ContactEvent, dim: ContactDim) {
  try { void fetch("/api/contact/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, dim }), keepalive: true }); } catch { /* counting never blocks the reader */ }
}

/**
 * "Contact your legislator": the official phone number, the member's own contact form and a short neutral message
 * the reader edits. Everything happens on the reader's device: the call opens their phone, the form opens in a
 * new tab, the email opens their mail app. The message is never sent to or stored by the site.
 */
export function ContactTool({ dim, people, bill, stance, voteChoices = [], billHref, follow }: { dim: ContactDim; people: ContactPerson[]; bill: { label: string; title: string | null } | null;
  stance: ContactStance; voteChoices?: Array<{ id: string; label: string }>; billHref?: string;
  /** On a bill page, for an invited reader: the bill's id and whether they follow it already. Absent on member pages. */
  follow?: { billId: string; following: boolean } }) {
  const [place, setPlace] = useState("");
  const [following, setFollowing] = useState(!!follow?.following);
  const [stopped, setStopped] = useState(false);
  // Using a contact button on a bill adds the bill to the reader's followed bills, once, so the site can tell them
  // what happens to it. Only the bill's id is sent: not the member, not the button, not the message. "Stop" undoes it,
  // and after Stop the buttons do not follow the bill again on this visit.
  const used = follow ? () => { if (!following && !stopped) void followAfterContact(follow.billId).then(r => setFollowing(r.following)).catch(() => undefined); } : undefined;
  const picked = useSearchParams().get("vote");
  const chosen = voteChoices.find(v => v.id === picked) ?? null;
  return <div className={styles.tool}>
    {chosen && <p className={styles.chosen} role="status">Your message will mention one vote: <b>{chosen.label}</b>.{billHref && <> <Link href={`${billHref}#contact`} scroll={false}>Write about the whole bill instead</Link></>}</p>}
    <div className="issue-groups">{people.map(p => <Person key={p.id} p={p} dim={dim} bill={bill} stance={stance} place={place} setPlace={setPlace} voteId={chosen?.id ?? null} used={used} />)}</div>
    {follow && following && <p className={styles.follow} role="status">We&rsquo;ll tell you what happens to this bill.{" "}
      <button type="button" className="link-button" onClick={() => { setStopped(true); setFollowing(false); void stopFollowing(follow.billId).catch(() => undefined); }}>Stop</button></p>}
    {follow && stopped && !following && <p className={styles.follow} role="status">You no longer follow this bill. We will not send you news about it.</p>}
  </div>;
}

function Person({ p, dim, bill, stance, place, setPlace, voteId, used }: { p: ContactPerson; dim: ContactDim; bill: { label: string; title: string | null } | null; stance: ContactStance;
  place: string; setPlace: (v: string) => void; voteId: string | null; used?: () => void }) {
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const vote = p.votes.find(v => v.rollId === voteId) ?? defaultVote(p.votes);
  const template = buildContactMessage({ member: { title: p.title, name: p.name }, bill, stance, constituent: p.constituent, place, vote });
  const message = edited ?? template;
  const dom = p.id.replace(/[^A-Za-z0-9_-]/g, "-");
  const tel = telHref(p.phone), districtTel = telHref(p.districtPhone);
  const nothing = !tel && !districtTel && !p.web?.isForm && !p.email;
  async function copy() {
    try { await navigator.clipboard.writeText(message); setNote("Message copied. Paste it into the official form, an email or a letter."); tap("contact_copy", dim); used?.(); }
    catch { setNote("Copying is blocked here. Press and hold the text to copy it."); }
  }
  return <details className={`issue-group ${styles.person}`} open={open} onToggle={e => { const now = e.currentTarget.open; setOpen(now); if (now && !counted) { setCounted(true); tap("contact_open", dim); } }}>
    <summary><span><b>{p.name}</b> <span className="meta">{p.seat}</span></span><span className={styles.cue}>{open ? "Close" : "Call or write"}</span></summary>
    <div className={styles.body}>
      {nothing && <p className={styles.none}>No official contact details on record yet.{p.web && <> <a href={p.web.url} target="_blank" rel="noopener noreferrer">Official website</a></>}</p>}
      {(tel || districtTel) && <div className={styles.calls}>
        {tel && <a className={styles.btn} href={tel} onClick={() => { tap("contact_call", dim); used?.(); }}>Call {p.phone}<small>{p.officeLabel}</small></a>}
        {districtTel && <a className={`${styles.btn} ${styles.second}`} href={districtTel} onClick={() => { tap("contact_call", dim); used?.(); }}>Call {p.districtPhone}<small>District office</small></a>}
      </div>}
      <label className="share-caption" htmlFor={`contact-message-${dom}`}>Your message to {p.title} {p.name} (change anything before you use it)
        <textarea id={`contact-message-${dom}`} className={styles.message} value={message} rows={14} maxLength={3000} onChange={e => { setEdited(e.target.value); setNote(""); }} /></label>
      {edited !== null && edited !== template && <button type="button" className={`link-button ${styles.reset}`} onClick={() => { setEdited(null); setNote("Back to the starting text."); }}>Start again from the starting text</button>}
      <label className={styles.place} htmlFor={`contact-place-${dom}`}>Your city or ZIP code (optional)
        <input id={`contact-place-${dom}`} value={place} maxLength={40} autoComplete="off" inputMode="text" onChange={e => setPlace(e.target.value)} />
        <span className="meta">{edited !== null && edited !== template ? "You have changed the message, so type your city or ZIP into it yourself." : "Added to the message if you type it. It stays on this device."}</span></label>
      {!p.constituent && <p className="meta">This message does not say you are a constituent, because we cannot tell from your saved place that {p.name} represents you. Offices mostly answer the people they represent. <Link href="/legislators">Find your own legislators</Link></p>}
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={() => void copy()}>Copy message</button>
        {p.web && !nothing && <a className={`${styles.btn} ${styles.second}`} href={p.web.url} target="_blank" rel="noopener noreferrer" onClick={() => { tap("contact_form", dim); used?.(); }}>{p.web.label}<span className="visually-hidden"> (opens in a new tab)</span></a>}
        {p.email && <a className={`${styles.btn} ${styles.second}`} href={mailtoHref(p.email, contactSubject({ bill, constituent: p.constituent }), message)} onClick={() => { tap("contact_email", dim); used?.(); }}>Email<small>{p.email}</small></a>}
      </div>
      {note && <p className="meta" role="status">{note}</p>}
      <p className="meta">{p.web && !nothing ? (p.web.isForm ? "Paste your message there. " : "Find the contact page there and paste your message. ") : ""}We never send anything for you, and your message never leaves this device unless you send it.</p>
      {(p.officeAddress || p.districtAddress) && <p className={styles.small}>{p.officeAddress && <>{p.officeLabel}: {p.officeAddress}</>}{p.officeAddress && p.districtAddress && <br />}{p.districtAddress && <>District office: {p.districtAddress}</>}</p>}
      {p.source && <p className={styles.small}>{p.source.lead} <a href={p.source.url} target="_blank" rel="noopener noreferrer">{p.source.linkText}</a>{p.source.tail ?? ""}, retrieved {p.source.retrieved}.</p>}
    </div>
  </details>;
}
