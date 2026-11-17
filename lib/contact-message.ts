/**
 * The starting text a reader can edit before contacting a legislator
 * (test-ready build, 17 Nov 2026). Pure; tested in tests/contact.test.mjs.
 *
 * Rules, the same for every member, party and bill:
 *  - it names the bill by its number and official title, nothing else about it;
 *  - it says the reader is a constituent only when the member represents the
 *    reader's saved place, and names a city or ZIP only when the reader typed one;
 *  - it states the reader's own Support or Oppose when they gave one; otherwise
 *    it leaves a line for them to add their view;
 *  - it quotes the member's recorded vote when there is one, and asks why; if
 *    there is none it asks how the member plans to vote;
 *  - it gives no reasons, no adjectives and no talking points. The site never
 *    puts an argument in the reader's mouth;
 *  - it stays under 120 words.
 * The site sends nothing: the reader copies, calls, or opens the official form.
 */

export type ContactStance = "support" | "oppose" | "unsure" | null;
/** How the vote is described, so a procedural vote never reads as a vote on the bill itself. */
export type ContactVoteKind = "passage" | "procedural" | "amendment" | "nomination" | "other";
export type ContactVote = { answer: "yes" | "no" | "present" | "none"; kind: ContactVoteKind; date: string };
export type ContactMessageInput = {
  member: { title: string; name: string };
  /** `label` is the bill number as printed ("H.R. 2102", "HB 2"); `title` its official title. Null on a member page. */
  bill: { label: string; title: string | null } | null;
  stance: ContactStance;
  /** True only when the member represents the reader's saved state or district. */
  constituent: boolean;
  /** A city or ZIP the reader typed into the contact box. Never filled in by the site. */
  place?: string | null;
  vote?: ContactVote | null;
};

export const TITLE_MAX = 90;
export const MESSAGE_MAX_WORDS = 120;
export const VIEW_PROMPT = "[Add your view here.]";
export const NAME_PROMPT = "[Your name]";
export const TOPIC_PROMPT = "[name the bill or issue]";

export function wordCount(text: string): number { return text.trim().split(/\s+/).filter(Boolean).length; }

/** A long official title cut at a word, with an ellipsis. Trailing full stops are dropped so it sits inside a sentence. */
export function clipTitle(title: string | null | undefined, max = TITLE_MAX): string | null {
  const t = (title ?? "").replace(/\s+/g, " ").trim().replace(/[.;,:]+$/, "");
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1), at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:.(-]+$/, "")}…`;
}

/** What the reader typed for their city or ZIP: plain characters only, at most 40. Empty means not given. */
export function cleanPlace(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/[^\p{L}\p{N} .,'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  return s || null;
}

/**
 * "H.R. 2102 (Major Richard Star Act)". The title is left out when it is missing, when it only repeats the number,
 * or when it is not a title at all: a bill first seen through a roll call can carry the vote's description
 * ("Motion to Invoke Cloture: Motion to Proceed to S. 4668") until Congress.gov supplies its real title.
 */
export function billPhrase(bill: { label: string; title: string | null }): string {
  const title = clipTitle(bill.title), squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const notATitle = !title || squash(bill.title ?? "").includes(squash(bill.label)) || /^(on (the )?)?(cloture )?motion\b/i.test(title);
  return notATitle ? bill.label : `${bill.label} (${title})`;
}

function voteSentence(v: ContactVote): string {
  const on = v.kind === "passage" ? "on passing it" : v.kind === "procedural" ? "on a procedural step, not on the bill itself," : v.kind === "amendment" ? "on an amendment to it"
    : v.kind === "nomination" ? "on the nomination" : "in a recorded vote on it";
  if (v.answer === "none") return `The record shows you did not vote ${on} on ${v.date}.`;
  return `You voted ${v.answer === "yes" ? "Yes" : v.answer === "no" ? "No" : "Present"} ${on} on ${v.date}.`;
}

export function buildContactMessage(input: ContactMessageInput): string {
  const place = cleanPlace(input.place), zip = place && /^\d{5}(-\d{4})?$/.test(place);
  const where = place ? ` in ${zip ? "ZIP code " : ""}${place}` : "";
  const who = input.constituent ? `I am one of your constituents${where}.` : place ? `I live${where}.` : "";
  const about = input.bill ? billPhrase(input.bill) : TOPIC_PROMPT;
  const stated = input.bill && (input.stance === "support" || input.stance === "oppose");
  const view = stated ? `I ${input.stance} ${about}.` : `I am writing about ${about}.`;
  const vote = input.bill && input.vote ? input.vote : null;
  const ask = !input.bill ? "Please tell me where you stand on it."
    : vote ? `${voteSentence(vote)} ${vote.answer === "none" ? "Please tell me where you stand on it." : "Please tell me why you voted that way."}`
    : "Please tell me how you plan to vote on it.";
  return [
    `Dear ${input.member.title} ${input.member.name},`,
    [who, view].filter(Boolean).join(" "),
    ...(stated ? [] : [VIEW_PROMPT]),
    ask,
    "Thank you for your time.",
    NAME_PROMPT,
  ].join("\n\n");
}

/** Subject line for the reader's own mail app. */
export function contactSubject(input: Pick<ContactMessageInput, "bill" | "constituent">): string {
  const from = input.constituent ? "A constituent's message" : "A message";
  return input.bill ? `${from} about ${input.bill.label}` : from;
}

/** `tel:` link for a US number as printed in the official file ("202-224-2934", "(512) 463-0131"); null when it is not a full number. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  return ten.length === 10 ? `tel:+1${ten}` : null;
}

/** `mailto:` link that opens the reader's own mail app with the subject and the edited text filled in. Nothing is sent by the site. */
export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`;
}

/** A Texas vote option as Open States records it ("yes", "no", "absent", "excused", "not voting", "other"). */
export function txAnswer(option: string): ContactVote["answer"] {
  const o = option.trim().toLowerCase();
  return o === "yes" ? "yes" : o === "no" ? "no" : o === "present" || o === "abstain" ? "present" : "none";
}
/** A federal position (Yea, Nay, Present, Not Voting). */
export function federalAnswer(position: string): ContactVote["answer"] {
  const p = position.trim().toLowerCase();
  return p === "yea" ? "yes" : p === "nay" ? "no" : p === "present" ? "present" : "none";
}

/** Which of a member's recorded votes on a bill the message quotes by default: the latest vote on passing it. Procedural votes are never used unless the reader picks one. */
export function defaultVote<T extends { kind: ContactVoteKind; at: number }>(votes: T[]): T | null {
  return votes.filter(v => v.kind === "passage").sort((a, b) => b.at - a.at)[0] ?? null;
}

export const CONTACT_EVENTS = ["contact_open", "contact_call", "contact_form", "contact_copy", "contact_email"] as const;
export const CONTACT_DIMS = ["bill", "tx_bill", "member"] as const;
export type ContactEvent = (typeof CONTACT_EVENTS)[number];
export type ContactDim = (typeof CONTACT_DIMS)[number];
/** Only the listed tap names and page kinds are counted; anything else is refused, so no id can ride along. */
export function contactEventAllowed(event: unknown, dim: unknown): event is ContactEvent {
  return typeof event === "string" && typeof dim === "string" && (CONTACT_EVENTS as readonly string[]).includes(event) && (CONTACT_DIMS as readonly string[]).includes(dim);
}

/** The honest label for the web link: the member's own form when the record has one, otherwise their official website. */
export function formLink(c: { contactFormUrl: string | null; websiteUrl: string | null }): { url: string; label: string; isForm: boolean } | null {
  if (c.contactFormUrl) return { url: c.contactFormUrl, label: "Open the official contact form", isForm: true };
  if (c.websiteUrl) return { url: c.websiteUrl, label: "Official website (contact page is linked there)", isForm: false };
  return null;
}
