import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFederalContacts, parseDistrictOffices, withDistrictOffices, parseOpenStatesContacts, cleanUrl, cleanPhone, cleanEmail } from "../lib/contact-parse.ts";
import { parseLegislators } from "../lib/federal/parse.ts";
import { parseOpenStatesPeople } from "../lib/texas/parse.ts";
import { buildContactMessage, contactSubject, clipTitle, cleanPlace, billPhrase, telHref, mailtoHref, wordCount, defaultVote, federalAnswer, txAnswer, formLink,
  contactEventAllowed, CONTACT_EVENTS, CONTACT_DIMS, MESSAGE_MAX_WORDS, TITLE_MAX, VIEW_PROMPT, NAME_PROMPT } from "../lib/contact-message.ts";

// Six members cut from the live congress-legislators files on 2026-11-17 (terms trimmed to the last two, offices to the first two).
const fx = name => JSON.parse(readFileSync(new URL(`./fixtures/contact/${name}`, import.meta.url), "utf8"));
const CURRENT = fx("legislators-current.sample.json"), OFFICES = fx("legislators-district-offices.sample.json");

/* ------------------------------------------------------- federal parser --- */

test("federal contacts: one row per sitting member, from the latest term of the official file", () => {
  const rows = parseFederalContacts(CURRENT);
  assert.deepEqual(rows.map(r => r.memberId), parseLegislators(CURRENT).map(p => p.id), "the same members the member list keeps");
  const cornyn = rows.find(r => r.memberId === "C001056");
  assert.deepEqual(cornyn, { memberId: "C001056", phone: "202-224-2934", contactFormUrl: "https://www.cornyn.senate.gov/contact",
    officeAddress: "517 Hart Senate Office Building Washington DC 20510", districtPhone: null, districtAddress: null, email: null, websiteUrl: "https://www.cornyn.senate.gov/" });
});

test("federal contacts: a House member with no contact form keeps the website as the fallback; a malformed form link is dropped, not repaired", () => {
  const rows = parseFederalContacts(CURRENT);
  const roy = rows.find(r => r.memberId === "R000614");
  assert.equal(roy.contactFormUrl, null); assert.equal(roy.websiteUrl, "https://roy.house.gov/"); assert.equal(roy.phone, "202-225-4236");
  const fine = rows.find(r => r.memberId === "F000484");
  assert.equal(fine.contactFormUrl, null, 'the file has "hhttps://…" for this member');
  assert.equal(fine.websiteUrl, "https://fine.house.gov/");
  assert.equal(rows.find(r => r.memberId === "P000622").contactFormUrl, "https://patronis.house.gov/contact/email-me");
});

test("federal contacts: bad input gives no rows and never throws", () => {
  assert.deepEqual(parseFederalContacts(null), []);
  assert.deepEqual(parseFederalContacts({}), []);
  assert.deepEqual(parseFederalContacts([{}, { id: {} }, { id: { bioguide: "X1" }, terms: [] }, { id: { bioguide: "X2" }, terms: [{ type: "prez", state: "TX" }] }]), []);
  const odd = parseFederalContacts([{ id: { bioguide: "X3" }, terms: [{ type: "rep", state: "TX", phone: "555-1212", contact_form: "javascript:alert(1)", address: "  ", url: 42 }] }]);
  assert.deepEqual(odd, [{ memberId: "X3", phone: null, contactFormUrl: null, officeAddress: null, districtPhone: null, districtAddress: null, email: null, websiteUrl: null }]);
});

test("district offices: the first office with a phone, written on one line, joined to the member's row", () => {
  const offices = parseDistrictOffices(OFFICES);
  assert.deepEqual(offices.get("C001056"), { phone: "512-469-6034", address: "Chase Tower, 221 W. Sixth St., Suite 1350, Austin, TX 78701" });
  assert.deepEqual(offices.get("R000614"), { phone: "830-896-0154", address: "125 Lehmann Drive, Suite 201, Kerrville, TX 78028" });
  const rows = withDistrictOffices(parseFederalContacts(CURRENT), offices);
  assert.equal(rows.find(r => r.memberId === "C001098").districtPhone, "512-916-5834");
  const none = rows.find(r => !offices.has(r.memberId));
  assert.ok(none, "the fixture includes a member with no district office listed");
  assert.equal(none.districtPhone, null); assert.equal(none.districtAddress, null);
  assert.equal(parseDistrictOffices(null).size, 0);
  assert.equal(parseDistrictOffices([{ id: { bioguide: "A1" }, offices: [] }, { offices: [{ phone: "512-469-6034" }] }]).size, 0);
  assert.deepEqual(parseDistrictOffices([{ id: { bioguide: "A2" }, offices: [{ city: "Waco", state: "TX" }, { city: "Austin", state: "TX", zip: "78701", phone: "512-469-6034" }] }]).get("A2"),
    { phone: "512-469-6034", address: "Austin, TX 78701" }, "an office without a phone is passed over for one that has it");
});

/* --------------------------------------------------------- Texas parser --- */

// Open States v3 /people?jurisdiction=tx&include=offices&include=links (docs.openstates.org/api-v3), trimmed. Not a live response: the key is not available locally.
const OS_PEOPLE = { results: [
  { id: "ocd-person/aaaa", name: "Sarah Eckhardt", party: "Democratic", email: "sarah.eckhardt@senate.texas.gov", current_role: { title: "Senator", org_classification: "upper", district: "14" },
    offices: [{ name: "Capitol Office", classification: "capitol", address: "P.O. Box 12068; Capitol Station; Austin, TX 78711", voice: "(512) 463-0114", fax: "(512) 463-5949" },
      { name: "District Office", classification: "district", address: "5000 Plaza on the Lake\nSuite 100\nAustin, TX 78746", voice: "512-463-0114 x2" }],
    links: [{ url: "https://example.org/campaign", note: "campaign" }, { url: "https://senate.texas.gov/member.php?d=14", note: "homepage" }] },
  { id: "ocd-person/bbbb", name: "Gina Hinojosa", party: "Democratic", email: "", current_role: { title: "Representative", org_classification: "lower", district: 49 },
    offices: [{ name: "Capitol Address", address: "Room E2.316, P.O. Box 2910, Austin, TX 78768", voice: "512-463-0668" }] },
  { id: "ocd-person/cccc", name: "No Offices", current_role: { org_classification: "lower", district: "50" }, offices: null, links: "nope", email: 7 },
  { id: "ocd-person/dddd", name: "The Governor", email: "gov@texas.gov", current_role: { org_classification: "executive" }, offices: [{ name: "Capitol Office", voice: "512-463-2000" }] },
  null,
], pagination: { max_page: 1 } };

test("Texas contacts: Capitol and district office phone and address, the email, and only the Legislature's own site as the website", () => {
  const rows = parseOpenStatesContacts(OS_PEOPLE);
  assert.deepEqual(rows.map(r => r.memberId), ["ocd-person/aaaa", "ocd-person/bbbb"], "members only; a person with nothing on record gets no row");
  assert.deepEqual(rows[0], { memberId: "ocd-person/aaaa", phone: "(512) 463-0114", contactFormUrl: null, officeAddress: "P.O. Box 12068, Capitol Station, Austin, TX 78711",
    districtPhone: "512-463-0114", districtAddress: "5000 Plaza on the Lake, Suite 100, Austin, TX 78746", email: "sarah.eckhardt@senate.texas.gov", websiteUrl: "https://senate.texas.gov/member.php?d=14" });
  assert.deepEqual(rows[1], { memberId: "ocd-person/bbbb", phone: "512-463-0668", contactFormUrl: null, officeAddress: "Room E2.316, P.O. Box 2910, Austin, TX 78768",
    districtPhone: null, districtAddress: null, email: null, websiteUrl: null });
});

test("Texas contacts: the response without offices (today's request) or a broken one gives no rows and never throws; ids line up with the people parser", () => {
  const plain = { results: [{ id: "ocd-person/a", name: "A", party: "Republican", current_role: { title: "Representative", org_classification: "lower", district: "54" } }] };
  assert.deepEqual(parseOpenStatesContacts(plain), []);
  for (const bad of [null, undefined, "x", {}, { results: "x" }, { results: [1, "a", {}] }]) assert.deepEqual(parseOpenStatesContacts(bad), []);
  const people = new Set(parseOpenStatesPeople(OS_PEOPLE).people.map(p => p.id));
  for (const r of parseOpenStatesContacts(OS_PEOPLE)) assert.ok(people.has(r.memberId));
});

test("field guards: links, phones and emails", () => {
  assert.equal(cleanUrl("https://www.cruz.senate.gov/?p=form&id=16"), "https://www.cruz.senate.gov/?p=form&id=16");
  for (const bad of ["hhttps://fine.house.gov/x", "ftp://x.gov", "//x.gov", "https://", "https://localhost/x", "", null, 5, {}]) assert.equal(cleanUrl(bad), null);
  assert.equal(cleanPhone(" 202-224-2934 "), "202-224-2934"); assert.equal(cleanPhone("(512) 463-0131"), "(512) 463-0131"); assert.equal(cleanPhone("1-512-463-0131"), "1-512-463-0131");
  assert.equal(cleanPhone("512-463-0131 ext. 22"), "512-463-0131", "an extension is dropped so the number can be dialled");
  for (const bad of ["463-0131", "n/a", "", null, "512-463-0131 or 512-463-0132"]) assert.equal(cleanPhone(bad), null);
  assert.equal(cleanEmail("District49.Hinojosa@house.texas.gov"), "District49.Hinojosa@house.texas.gov");
  for (const bad of ["not an email", "a@b", "a b@c.gov", "<x@y.gov>", null]) assert.equal(cleanEmail(bad), null);
});

/* ------------------------------------------------------ message builder --- */

const SENATOR = { title: "Senator", name: "John Cornyn" };
const STAR = { label: "H.R. 2102", title: "Major Richard Star Act" };

test("message: a reader who supports the bill, to a member who has not voted on it", () => {
  const m = buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: true });
  assert.equal(m, ["Dear Senator John Cornyn,", "I am one of your constituents. I support H.R. 2102 (Major Richard Star Act).",
    "Please tell me how you plan to vote on it.", "Thank you for your time.", NAME_PROMPT].join("\n\n"));
});

test("message: a reader who opposes the bill uses the same template with one word changed", () => {
  const support = buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: true });
  const oppose = buildContactMessage({ member: SENATOR, bill: STAR, stance: "oppose", constituent: true });
  assert.equal(oppose, support.replace("I support", "I oppose"));
});

test("message: with no answer or Unsure, it says what the message is about and leaves a line for the reader's view", () => {
  for (const stance of [null, "unsure"]) {
    const m = buildContactMessage({ member: SENATOR, bill: STAR, stance, constituent: true });
    assert.ok(m.includes("I am writing about H.R. 2102 (Major Richard Star Act)."));
    assert.ok(m.includes(`\n\n${VIEW_PROMPT}\n\n`));
    assert.ok(!/support|oppose/i.test(m), "no position is put in the reader's mouth");
  }
});

test("message: when the member already voted, it quotes the record and asks why", () => {
  const voted = buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: true, vote: { answer: "yes", kind: "passage", date: "Nov 12, 2026" } });
  assert.ok(voted.includes("You voted Yes on passing it on Nov 12, 2026. Please tell me why you voted that way."));
  assert.ok(!voted.includes("plan to vote"));
  const no = buildContactMessage({ member: SENATOR, bill: STAR, stance: "oppose", constituent: true, vote: { answer: "no", kind: "passage", date: "Nov 12, 2026" } });
  assert.ok(no.includes("You voted No on passing it on Nov 12, 2026."));
  const procedural = buildContactMessage({ member: SENATOR, bill: STAR, stance: null, constituent: true, vote: { answer: "yes", kind: "procedural", date: "Nov 10, 2026" } });
  assert.ok(procedural.includes("You voted Yes on a procedural step, not on the bill itself, on Nov 10, 2026."), "a procedural vote is never worded as a vote on the bill");
  const missed = buildContactMessage({ member: SENATOR, bill: STAR, stance: null, constituent: true, vote: { answer: "none", kind: "passage", date: "Nov 12, 2026" } });
  assert.ok(missed.includes("The record shows you did not vote on passing it on Nov 12, 2026. Please tell me where you stand on it."));
});

test("message: a city or ZIP appears only when the reader typed one, and nothing is invented without it", () => {
  const none = buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: true, place: "   " });
  assert.ok(none.includes("I am one of your constituents. I support"));
  assert.ok(!/\d{5}| in /.test(none.split("\n\n")[1]), "no place without one typed");
  assert.ok(buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: true, place: "78701" }).includes("I am one of your constituents in ZIP code 78701."));
  assert.ok(buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: true, place: " Austin,  Texas " }).includes("I am one of your constituents in Austin, Texas."));
  assert.equal(cleanPlace("<b>Austin</b>\n"), "b Austin b");
  assert.equal(cleanPlace("San José"), "San José");
  assert.equal(cleanPlace("x".repeat(80)).length, 40);
  assert.equal(cleanPlace(""), null); assert.equal(cleanPlace(null), null);
});

test("message: it does not call the reader a constituent of a member who does not represent their saved place", () => {
  const m = buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: false });
  assert.ok(!/constituent/i.test(m));
  assert.ok(m.includes("\n\nI support H.R. 2102 (Major Richard Star Act).\n\n"));
  assert.ok(buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: false, place: "Tulsa" }).includes("I live in Tulsa. I support"));
});

test("message: long official titles are clipped at a word; a title that only repeats the number is left out", () => {
  const long = "To amend title 10, United States Code, to provide for concurrent receipt of veterans' disability compensation and retired pay for disability retirees with fewer than 20 years of service and a combat-related disability, and for other purposes.";
  const clipped = clipTitle(long);
  assert.ok(clipped.length <= TITLE_MAX + 1 && clipped.endsWith("…"));
  assert.ok(long.startsWith(clipped.slice(0, -1)), "a prefix of the official title, nothing added");
  assert.ok(!/\s…$/.test(clipped) && !/,…$/.test(clipped));
  assert.equal(clipTitle("Relating to public school finance."), "Relating to public school finance");
  assert.equal(clipTitle("   "), null); assert.equal(clipTitle(null), null);
  assert.equal(clipTitle("x".repeat(200)).length, TITLE_MAX + 1, "one very long word is cut hard");
  assert.equal(billPhrase({ label: "H.Con.Res. 89", title: "H. Con. Res. 89" }), "H.Con.Res. 89");
  assert.equal(billPhrase({ label: "HB 2", title: "Relating to public school finance." }), "HB 2 (Relating to public school finance)");
  assert.equal(billPhrase({ label: "S. 4668", title: "Motion to Invoke Cloture: Motion to Proceed to S. 4668" }), "S. 4668", "a vote's description standing in for the title is not quoted as the title");
  assert.equal(billPhrase({ label: "H.R. 7", title: "On the Motion to Proceed" }), "H.R. 7");
  assert.equal(billPhrase({ label: "S. 1", title: "A bill to amend the Motion Picture Act" }), "S. 1 (A bill to amend the Motion Picture Act)");
  assert.equal(billPhrase({ label: "S. 1", title: null }), "S. 1");
  assert.ok(buildContactMessage({ member: SENATOR, bill: { label: "H.R. 2102", title: long }, stance: "oppose", constituent: true }).includes(`I oppose H.R. 2102 (${clipped}).`));
});

test("message: always under 120 words, even with the longest inputs", () => {
  const long = "To amend title 10, United States Code, to provide for concurrent receipt of veterans' disability compensation and retired pay for disability retirees with fewer than 20 years of service";
  for (const stance of ["support", "oppose", "unsure", null]) for (const kind of ["passage", "procedural", "amendment", "other"]) for (const answer of ["yes", "no", "present", "none"]) {
    const m = buildContactMessage({ member: { title: "Representative", name: "Maria Elvira de la Cruz-Hernandez Jr." }, bill: { label: "H.J.Res. 104", title: long }, stance, constituent: true,
      place: "Truth or Consequences, New Mexico 87901", vote: { answer, kind, date: "Nov 12, 2026" } });
    assert.ok(wordCount(m) < MESSAGE_MAX_WORDS, `${wordCount(m)} words`);
  }
});

test("message: identical for every party and bill (the builder is given no party), with no reasons or praise", () => {
  const m = buildContactMessage({ member: SENATOR, bill: STAR, stance: "support", constituent: true, vote: { answer: "yes", kind: "passage", date: "Nov 12, 2026" } });
  const other = buildContactMessage({ member: { title: "Senator", name: "Jane Doe" }, bill: { label: "S. 1", title: "Another Act" }, stance: "support", constituent: true, vote: { answer: "yes", kind: "passage", date: "Nov 12, 2026" } });
  assert.equal(other, m.replace("John Cornyn", "Jane Doe").replace("H.R. 2102 (Major Richard Star Act)", "S. 1 (Another Act)"));
  assert.ok(!/because|important|urge|strongly|harm|help|good|bad|must|should/i.test(m));
});

test("message: on a member page with no bill, the reader names the subject themselves", () => {
  const m = buildContactMessage({ member: { title: "Representative", name: "Gina Hinojosa" }, bill: null, stance: "support", constituent: true, vote: { answer: "yes", kind: "passage", date: "x" } });
  assert.equal(m, ["Dear Representative Gina Hinojosa,", "I am one of your constituents. I am writing about [name the bill or issue].", VIEW_PROMPT,
    "Please tell me where you stand on it.", "Thank you for your time.", NAME_PROMPT].join("\n\n"));
});

test("subject, phone link and mail link", () => {
  assert.equal(contactSubject({ bill: STAR, constituent: true }), "A constituent's message about H.R. 2102");
  assert.equal(contactSubject({ bill: null, constituent: false }), "A message");
  assert.equal(telHref("202-224-2934"), "tel:+12022242934"); assert.equal(telHref("(512) 463-0131"), "tel:+15124630131"); assert.equal(telHref("1 512 463 0131"), "tel:+15124630131");
  assert.equal(telHref("463-0131"), null); assert.equal(telHref(null), null);
  const href = mailtoHref("sarah.eckhardt@senate.texas.gov", "A constituent's message about HB 2", "Dear Senator,\n\nI support HB 2 & more.");
  assert.equal(href, "mailto:sarah.eckhardt@senate.texas.gov?subject=A%20constituent's%20message%20about%20HB%202&body=Dear%20Senator%2C%0D%0A%0D%0AI%20support%20HB%202%20%26%20more.");
});

test("the form link is labelled honestly: the member's own form, else their official website, else nothing", () => {
  assert.deepEqual(formLink({ contactFormUrl: "https://www.cornyn.senate.gov/contact", websiteUrl: "https://www.cornyn.senate.gov/" }), { url: "https://www.cornyn.senate.gov/contact", label: "Open the official contact form", isForm: true });
  assert.deepEqual(formLink({ contactFormUrl: null, websiteUrl: "https://roy.house.gov/" }), { url: "https://roy.house.gov/", label: "Official website (contact page is linked there)", isForm: false });
  assert.equal(formLink({ contactFormUrl: null, websiteUrl: null }), null);
});

test("which vote the message quotes by default: the latest vote on passing the bill, never a procedural one", () => {
  const votes = [{ id: "a", kind: "procedural", at: 30 }, { id: "b", kind: "passage", at: 10 }, { id: "c", kind: "passage", at: 20 }, { id: "d", kind: "amendment", at: 40 }];
  assert.equal(defaultVote(votes).id, "c");
  assert.equal(defaultVote([votes[0], votes[3]]), null);
  assert.equal(defaultVote([]), null);
  assert.deepEqual(["Yea", "Nay", "Present", "Not Voting", "Guilty"].map(federalAnswer), ["yes", "no", "present", "none", "none"]);
  assert.deepEqual(["yes", "no", "absent", "excused", "not voting", "present"].map(txAnswer), ["yes", "no", "none", "none", "none", "present"]);
});

test("tap counting accepts only the five tap names and three page kinds, so no bill or member id can be recorded", () => {
  for (const e of CONTACT_EVENTS) for (const d of CONTACT_DIMS) assert.ok(contactEventAllowed(e, d));
  assert.deepEqual([...CONTACT_EVENTS], ["contact_open", "contact_call", "contact_form", "contact_copy", "contact_email"]);
  assert.deepEqual([...CONTACT_DIMS], ["bill", "tx_bill", "member"]);
  for (const [e, d] of [["contact_call", "119-hr-2102"], ["contact_call", "C001056"], ["share_copy", "bill"], ["contact_call", ""], [null, "bill"], ["contact_call", undefined], ["contact_call", 5]]) assert.equal(contactEventAllowed(e, d), false);
});
