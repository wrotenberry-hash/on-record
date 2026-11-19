import { Suspense } from "react";
import Link from "next/link";
import { and, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { officialMemberVotes, txMemberVotes } from "@/db/schema";
import { billLabel, shortDate } from "@/components/federal/badges";
import { currentAppUserId } from "@/lib/viewer";
import { currentLocation, type Location } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { txLegislatorsFor } from "@/lib/texas/queries";
import { KIND_LABEL, voteKind } from "@/lib/federal/vote-kinds";
import { txVoteKind } from "@/lib/texas/parse";
import { LEGISLATORS_URL } from "@/lib/federal/parse";
import { answerFor } from "@/lib/opinions";
import { contactsFor, type ContactRow } from "@/lib/contacts";
import { isFollowingBill } from "@/lib/bill-follows";
import { federalAnswer, formLink, txAnswer, type ContactStance } from "@/lib/contact-message";
import { ContactTool, type ContactPerson } from "./contact-tool";

/**
 * "Contact your legislator" (test-ready build, 17 Nov 2026). Server halves of the tool: they find the reader's own
 * legislators from the saved place, read the official contact rows and the members' recorded votes, and hand them
 * to the one client component. Used on the bill page, the Texas bill page and both member pages. Each renders
 * nothing public: the pages that use them already stop at viewerAccess().
 */

type FederalVote = { id: string; chamber: string; question: string; title: string | null; votedAt: number };
type TxVoteRow = { id: string; motion: string; date: string; chamber: string | null };

const none = { phone: null, districtPhone: null, officeAddress: null, districtAddress: null, email: null, web: null, source: null };

function fromRow(row: ContactRow | undefined, kind: "federal" | "texas", fallbackWebsite: string | null) {
  if (!row) return { ...none, web: fallbackWebsite ? formLink({ contactFormUrl: null, websiteUrl: fallbackWebsite }) : null };
  return { phone: row.phone, districtPhone: row.districtPhone, officeAddress: row.officeAddress, districtAddress: row.districtAddress, email: row.email,
    web: formLink({ contactFormUrl: row.contactFormUrl, websiteUrl: row.websiteUrl ?? fallbackWebsite }),
    source: kind === "federal" ? { lead: "Official:", linkText: "congress-legislators file", url: LEGISLATORS_URL, retrieved: shortDate(row.retrievedAt) }
      : { lead: "Source:", linkText: "Open States", url: "https://openstates.org/tx/legislators/", tail: ", which copies the Texas Legislature's member pages", retrieved: shortDate(row.retrievedAt) } };
}

async function reader() {
  const userId = await currentAppUserId().catch(() => null);
  return { userId, loc: await currentLocation(userId).catch(() => null) };
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return <div className="fed-section" id="contact"><h2>{heading}</h2>{children}</div>;
}
const noPlace = <p className="meta"><Link href="/legislators">Find your legislators</Link> to see their phone numbers and contact forms here.</p>;
const how = <p className="meta">Pick a legislator to see the office phone number, the official contact form or website, and a short message you can change. You make the call or send the message yourself.</p>;

/* ------------------------------------------------------- federal bill --- */

/** On a bill page: the reader's two senators and representative, with each one's recorded votes on this bill. */
export async function ContactForBill({ bill, votes }: { bill: { id: string; billType: string; number: number; title: string }; votes: FederalVote[] }) {
  const heading = "Contact your legislators about this bill";
  const { userId, loc } = await reader();
  if (!loc) return <Section heading={heading}>{noPlace}</Section>;
  const fed = await federalLegislators(loc.state, loc.congressional).catch(() => null);
  const mine = fed ? [...fed.senators, ...(fed.representative ? [fed.representative] : [])] : [];
  if (!mine.length) return <Section heading={heading}><p className="meta">No sitting member of Congress is on file for your saved place. <Link href="/legislators">Check your legislators</Link></p></Section>;
  const ids = mine.map(m => m.id);
  const [contacts, cast, stance, following] = await Promise.all([
    contactsFor("federal", ids).catch(() => new Map<string, ContactRow>()),
    votes.length ? getDb().select({ rollId: officialMemberVotes.rollCallId, memberId: officialMemberVotes.politicianId, position: officialMemberVotes.position }).from(officialMemberVotes)
      .where(and(inArray(officialMemberVotes.rollCallId, votes.map(v => v.id)), inArray(officialMemberVotes.politicianId, ids))).catch(() => []) : [],
    answerFor(userId, bill.id).catch(() => null) as Promise<ContactStance>,
    isFollowingBill(userId, bill.id).catch(() => false),
  ]);
  const kindOf = (v: FederalVote) => voteKind(v.question, v.title ?? bill.title);
  const people: ContactPerson[] = mine.map(m => ({ id: m.id, name: m.fullName, title: m.chamber === "senate" ? "Senator" : "Representative", seat: m.role, href: `/politicians/${m.id}`, constituent: true,
    officeLabel: "Washington office", ...fromRow(contacts.get(m.id), "federal", null),
    votes: cast.filter(c => c.memberId === m.id).flatMap(c => { const v = votes.find(x => x.id === c.rollId); return v ? [{ rollId: v.id, answer: federalAnswer(c.position), kind: kindOf(v), date: shortDate(v.votedAt), at: v.votedAt }] : []; }) }));
  const voteChoices = votes.map(v => ({ id: v.id, label: `${v.chamber === "senate" ? "Senate" : "House"}, ${shortDate(v.votedAt)}, ${v.question} (${KIND_LABEL[kindOf(v)].toLowerCase()})` }));
  return <Section heading={heading}>
    {how}
    <Suspense fallback={null}><ContactTool dim="bill" people={people} bill={{ label: billLabel(bill.billType, bill.number), title: bill.title }} stance={stance} voteChoices={voteChoices} billHref={`/bills/${bill.id}`}
      follow={{ billId: bill.id, following }} /></Suspense>
    {!fed?.representative && <p className="meta">Your U.S. representative is not listed because a ZIP code can cross districts. <Link href="/legislators">Pick your House district</Link></p>}
  </Section>;
}

/* --------------------------------------------------------- Texas bill --- */

/** On a Texas bill page: the reader's state senator and state representative, when a street address has placed them. */
export async function ContactForTxBill({ bill, votes }: { bill: { id: string; identifier: string; title: string }; votes: TxVoteRow[] }) {
  const heading = "Contact your Texas legislators about this bill";
  const { userId, loc } = await reader();
  if (!loc) return <Section heading={heading}>{noPlace}</Section>;
  if (loc.state !== "TX") return <Section heading={heading}><p className="meta">Your saved place is outside Texas, so no Texas legislator represents you. <Link href="/legislators">Change your place</Link></p></Section>;
  const tx = await txLegislatorsFor(loc.stateUpper, loc.stateLower).catch(() => null);
  const mine = [tx?.senator, tx?.representative].filter((t): t is NonNullable<typeof t> => !!t);
  if (!mine.length) return <Section heading={heading}><p className="meta">{loc.stateUpper || loc.stateLower ? "Your Texas districts are saved, but their members are not on file yet." : "Add your street address to find your Texas state senator and state representative."} <Link href="/legislators">Your legislators</Link></p></Section>;
  const ids = mine.map(m => m.id);
  const [contacts, cast, following] = await Promise.all([
    contactsFor("texas", ids).catch(() => new Map<string, ContactRow>()),
    votes.length ? getDb().select({ voteId: txMemberVotes.voteId, personId: txMemberVotes.personId, option: txMemberVotes.option }).from(txMemberVotes)
      .where(and(inArray(txMemberVotes.voteId, votes.map(v => v.id)), inArray(txMemberVotes.personId, ids))).catch(() => []) : [],
    isFollowingBill(userId, bill.id).catch(() => false),
  ]);
  const people: ContactPerson[] = mine.map(m => ({ ...txPersonBase(m, contacts.get(m.id)), constituent: true,
    votes: cast.filter(c => c.personId === m.id).flatMap(c => { const v = votes.find(x => x.id === c.voteId); return v ? [{ rollId: v.id, answer: txAnswer(c.option), kind: txVoteKind(v.motion), date: shortDate(v.date), at: Date.parse(v.date) || 0 }] : []; }) }));
  return <Section heading={heading}>
    {how}
    <Suspense fallback={null}><ContactTool dim="tx_bill" people={people} bill={{ label: bill.identifier, title: bill.title }} stance={null}
      follow={{ billId: bill.id, following }} /></Suspense>
    {mine.length < 2 && <p className="meta">Only one of your two Texas legislators is on file so far.</p>}
  </Section>;
}

function txPersonBase(m: { id: string; name: string; chamber: string; district: string }, row: ContactRow | undefined) {
  return { id: m.id, name: m.name, title: m.chamber === "upper" ? "Senator" : "Representative", seat: `${m.chamber === "upper" ? "Texas State Senator" : "Texas State Representative"}, District ${m.district}`,
    href: `/texas/members/${encodeURIComponent(m.id)}`, officeLabel: "Capitol office", ...fromRow(row, "texas", null) };
}

/* ------------------------------------------------------- member pages --- */

const represents = async (loc: Location | null, memberId: string, kind: "federal" | "texas") => {
  if (!loc) return false;
  if (kind === "federal") { const f = await federalLegislators(loc.state, loc.congressional).catch(() => null); return !!f && (f.senators.some(s => s.id === memberId) || f.representative?.id === memberId); }
  if (loc.state !== "TX") return false;
  const t = await txLegislatorsFor(loc.stateUpper, loc.stateLower).catch(() => null);
  return t?.senator?.id === memberId || t?.representative?.id === memberId;
};

/** On a member of Congress's page: how to reach that member. No bill is attached, so the reader names the subject. */
export async function ContactForMember({ member }: { member: { id: string; fullName: string; chamber: string; state: string; district: number | null; isCurrent: number; officialUrl: string | null } }) {
  if (!member.isCurrent) return null; // someone no longer in office has no office to contact
  const { loc } = await reader();
  const [contacts, constituent] = await Promise.all([contactsFor("federal", [member.id]).catch(() => new Map<string, ContactRow>()), represents(loc, member.id, "federal")]);
  const seat = member.chamber === "senate" ? `U.S. Senator, ${member.state}` : `U.S. Representative, ${member.state}${member.district ? `-${member.district}` : " at large"}`;
  const person: ContactPerson = { id: member.id, name: member.fullName, title: member.chamber === "senate" ? "Senator" : "Representative", seat, href: `/politicians/${member.id}`, constituent,
    officeLabel: "Washington office", ...fromRow(contacts.get(member.id), "federal", member.officialUrl), votes: [] };
  return <Section heading="Contact"><Suspense fallback={null}><ContactTool dim="member" people={[person]} bill={null} stance={null} /></Suspense></Section>;
}

/** On a Texas legislator's page. */
export async function ContactForTxMember({ person: m }: { person: { id: string; name: string; chamber: string; district: string; isCurrent: number } }) {
  if (!m.isCurrent) return null;
  const { loc } = await reader();
  const [contacts, constituent] = await Promise.all([contactsFor("texas", [m.id]).catch(() => new Map<string, ContactRow>()), represents(loc, m.id, "texas")]);
  const person: ContactPerson = { ...txPersonBase(m, contacts.get(m.id)), constituent, votes: [] };
  return <Section heading="Contact"><Suspense fallback={null}><ContactTool dim="member" people={[person]} bill={null} stance={null} /></Suspense></Section>;
}
