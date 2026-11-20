// Suggest changes: the stored bill text an option on a menu quotes (owner, 20 Nov 2026; docs/SUGGEST_CHANGES.md).
// The pure splitting (lib/changes/sections.ts) on real texts saved from govinfo.gov and capitol.texas.gov, the store
// (lib/changes/text-store.ts) against a temporary database built from the real migrations with a stand-in for the
// network, and the page's source. No request leaves this machine.
//
// Real federal fixtures: H.R. 2102 (introduced and engrossed), H.R. 2483 engrossed (titles, three-digit sections, and
// sections of the Public Health Service Act quoted inside section 104), H.R. 22 engrossed (one section of 21,000
// characters of quoted law), S. 331 reported (the committee struck every section and printed new ones) and
// H.J.Res. 20 introduced (no numbered sections). Texts marked HAND-MADE below copy the shape of real ones too large to
// keep here (H.R. 4016 and H.R. 5371 of the 119th Congress, read on 20 Nov 2026).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { CLOSING_HEADING, FULL_HEADING, FULL_NUM, MIN_QUOTE_CHARS, normalise, quoteInSection, sectionAnchor, sectionTitle, splitFederal, splitFederalDetailed, splitTexas, START_NUM } from "../lib/changes/sections.ts";
import { DEFAULT_MAX_VERSIONS, ensureBillText, LONG_VERSION_CHARS, sectionOf, sectionsOf, versionsOf } from "../lib/changes/text-store.ts";
import { billStatusUrl } from "../lib/analysis/billtext.ts";
import { parseTloBillText, tloTextPageUrl } from "../lib/texas/analysis/sources.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(ROOT, p), "utf8");
const fixture = name => read(`tests/fixtures/${name}`);
const IH = fixture("bill-119hr2102ih.htm"), EH = fixture("bill-119hr2102eh.htm"), TITLES = fixture("bill-119hr2483eh.htm"), QUOTED = fixture("bill-119hr22eh.htm"),
  STRUCK = fixture("bill-119s331rs.htm"), RESOLUTION = fixture("bill-119hjres20ih.htm");
const TX_TEXT = fixture("texas-sources/billtext-89R-SB00004F.htm"), TX_PAGE = fixture("texas-sources/tlo-text-page-89R-SB4.htm");
const SENTENCE = "is not subject to reduction under sections 5304 and 5305 of title 38";

/** The published text with every white-space character taken out: what a stored body must be found in, letter for letter. */
const squeezed = html => html.match(/<pre>([\s\S]*?)<\/pre>/i)[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, "");
const page = text => `<html><body><pre>\n${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}\n</pre></body></html>`;

// ───────────── A. Splitting ─────────────

test("H.R. 2102 as introduced: two sections, their headings, and the text word for word", () => {
  const s = splitFederal(IH);
  assert.deepEqual(s.map(x => x.num), ["1", "2"]);
  assert.equal(s[0].heading, "SHORT TITLE");
  assert.equal(s[1].heading, "ELIGIBILITY OF DISABILITY RETIREES WITH COMBAT-RELATED DISABILITIES FOR CONCURRENT RECEIPT OF VETERANS' DISABILITY COMPENSATION AND RETIRED PAY");
  assert.equal(s[0].body, "This Act may be cited as the ``Major Richard Star Act''.");
  assert.ok(s[1].body.includes(SENTENCE));
  assert.ok(s[1].body.includes("``(i) the retired pay of the retiree is not subject to reduction under sections 5304 and 5305 of title 38; and"));
  // A line the printer broke at a hyphen ("combat-" / "related") reads as the bill does.
  assert.ok(s[1].body.includes("for a combat-related disability (as that term is defined in section 1413a(e) of this title)"));
  assert.ok(!s[1].body.includes("combat- related"));
  // The quoted heading of section 1414 of title 10 is part of section 2, not a section of this bill.
  assert.ok(s[1].body.includes("``Sec. 1414. Members eligible for retired pay who are also eligible for veterans' disability compensation: concurrent receipt.''."));
  assert.ok(s[1].body.endsWith("shall apply to payments for months beginning on or after that date."), "the printer's <all> mark is not part of the last section");
  assert.ok(!/SECTION 1\.|SEC\. 2\./.test(s[0].body + s[1].body), "a section's own heading is in `heading`, not in its body");
});

test("H.R. 2102 as passed by the House: the clerk's closing note and the repeated title block are left out of the last section", () => {
  const s = splitFederal(EH);
  assert.deepEqual(s.map(x => x.num), ["1", "2"]);
  assert.equal(s[1].heading, "EXPANSIONS OF ELIGIBILITY TO CERTAIN MILITARY RETIREES FOR CONCURRENT RECEIPT OF VETERANS' DISABILITY COMPENSATION AND RETIRED PAY OR COMBAT-RELATED SPECIAL COMPENSATION");
  assert.ok(s[1].body.includes(`${SENTENCE}.''.`));
  assert.ok(EH.includes("Passed the House of Representatives November 12, 2026.") && EH.includes("Attest:"), "the saved file does carry the closing note");
  assert.ok(s[1].body.endsWith("and shall apply to payments for months beginning on or after such date."));
  for (const x of s) for (const gone of ["Passed the House", "Attest", "Clerk.", "119th CONGRESS", "2d Session", "H. R. 2102", "AN ACT", "_____"]) assert.ok(!x.body.includes(gone), `"${gone}" is not in section ${x.num}`);
  // The same text with a Senate closing note, an enrolled bill's signature lines, and a reported bill's calendar line.
  const body = "SECTION 1. SHORT TITLE.\n\n    This Act may be cited as the ``Example Act''.\n";
  for (const tail of ["\n            Passed the Senate March 14, 2025.\n\n            Attest:\n\n                                                             Secretary.\n119th CONGRESS\n",
    "                               Speaker of the House of Representatives.\n\n                            Vice President of the United States and    \n                                               President of the Senate.\n",
    "                                                        Calendar No. 18\n119th CONGRESS\n  1st Session\n                                 S. 331\n"]) {
    assert.deepEqual(splitFederal(page(`                                 AN ACT\n\n    Be it enacted by the Senate and House of Representatives of the \nUnited States of America in Congress assembled,\n\n${body}${tail}`)),
      [{ num: "1", heading: "SHORT TITLE", body: "This Act may be cited as the ``Example Act''." }]);
  }
});

test("a bill with titles and three-digit sections keeps every section, in order, and no title heading leaks into a body", () => {
  const s = splitFederal(TITLES), nums = s.map(x => x.num);
  assert.equal(s.length, 34);
  assert.deepEqual(nums, ["1", ...Array.from({ length: 13 }, (_, i) => String(101 + i)), ...Array.from({ length: 11 }, (_, i) => String(201 + i)), ...Array.from({ length: 7 }, (_, i) => String(301 + i)), "401", "402"]);
  assert.equal(new Set(nums).size, nums.length);
  assert.equal(s[1].heading, "PRENATAL AND POSTNATAL HEALTH");
  assert.equal(s.find(x => x.num === "102").heading, "MONITORING AND EDUCATION REGARDING INFECTIONS ASSOCIATED WITH ILLICIT DRUG USE AND OTHER RISK FACTORS");
  // The table of contents is part of section 1, its title lines included; the real "TITLE I" heading after it is not.
  assert.ok(s[0].body.includes("Sec. 101. Prenatal and postnatal health.") && s[0].body.includes("TITLE IV--MISCELLANEOUS MATTERS"));
  assert.ok(s[0].body.endsWith("Sec. 402. Required training for prescribers of controlled substances."));
  assert.ok(!s.find(x => x.num === "113").body.includes("TITLE II"));
  assert.ok(!s.find(x => x.num === "211").body.includes("TITLE III"));
});

test("sections of another law quoted inside a section stay in that section", () => {
  const s = splitFederal(TITLES), s104 = s.find(x => x.num === "104");
  for (const quoted of ["``SEC. 399H. FETAL ALCOHOL SPECTRUM DISORDERS PREVENTION, INTERVENTION, AND SERVICES DELIVERY PROGRAM.", "``SEC. 399I. STRENGTHENING CAPACITY AND EDUCATION FOR FETAL ALCOHOL SPECTRUM DISORDERS.", "``SEC. 399J. AUTHORIZATION OF APPROPRIATIONS."])
    assert.ok(s104.body.includes(quoted), quoted);
  assert.ok(!s.some(x => /^399/.test(x.num)), "399H, 399I and 399J are sections of the Public Health Service Act, not of this bill");
  assert.ok(s104.body.includes("``There are authorized to be appropriated to carry out this part $12,500,000 for each of fiscal years 2026 through 2030.''."));
  assert.ok(s104.body.includes("(b) Report.--Not later than 4 years after the date of enactment of this Act"), "the section goes on after the quoted matter closes");
  assert.equal(s[s.indexOf(s104) + 1].num, "105");
  // A section is never cut short: section 2 of H.R. 22 is over 20,000 characters, nearly all of it quoted law.
  const big = splitFederal(QUOTED);
  assert.deepEqual(big.map(x => x.num), ["1", "2", "3", "4", "5", "6", "7", "8"]);
  assert.ok(big[1].body.length > 20_000, `section 2 is ${big[1].body.length} characters`);
  assert.ok(big[1].body.includes("the term `documentary proof of United States citizenship' means"));
  assert.ok(big[1].body.endsWith("after the date of the enactment of the SAVE Act.''."));
});

test("a resolution with no numbered sections is one section called Full text", () => {
  const s = splitFederal(RESOLUTION);
  assert.equal(s.length, 1);
  assert.equal(s[0].num, FULL_NUM); assert.equal(s[0].num, "FULL");
  assert.equal(s[0].heading, FULL_HEADING); assert.equal(s[0].heading, "Full text");
  assert.equal(s[0].body, "Resolved by the Senate and House of Representatives of the United States of America in Congress assembled, That Congress disapproves the rule submitted by the Department of Energy relating to "
    + "``Energy Conservation Program: Energy Conservation Standards for Consumer Gas-fired Instantaneous Water Heaters'' (89 Fed. Reg. 105188 (December 26, 2024)), and such rule shall have no force or effect.");
  assert.deepEqual(splitFederal(page("")), []);
  assert.deepEqual(splitFederal(""), []);
});

test("a reported version: sections the committee struck out are counted and left out, the new ones are kept", () => {
  const r = splitFederalDetailed(STRUCK);
  assert.equal(r.struck, 7);
  assert.equal(r.repeated, 0);
  assert.deepEqual(r.sections.map(x => x.num), ["1", "2", "3", "4", "5", "6", "7"]);
  assert.ok(STRUCK.includes("&lt;DELETED&gt;SECTION 1. SHORT TITLE.&lt;/DELETED&gt;"));
  assert.ok(r.sections.every(x => !x.body.includes("DELETED")));
  assert.equal(r.sections[0].body, "This Act may be cited as the ``Halt All Lethal Trafficking of Fentanyl Act'' or the ``HALT Fentanyl Act''.");
  assert.ok(r.sections[6].body.endsWith("in United States v. McCray, 346 F. Supp. 3d 363 (W.D.N.Y. 2018)."), "the calendar line and the title block after the last section are left out");
  assert.deepEqual(splitFederal(STRUCK), r.sections);
  assert.ok(r.chars > 60_000);
});

test("every stored body and heading is in the official file letter for letter (only white space differs)", () => {
  for (const [name, html] of Object.entries({ IH, EH, TITLES, QUOTED, STRUCK, RESOLUTION })) {
    const whole = squeezed(html), sections = splitFederal(html);
    assert.ok(sections.length > 0, name);
    for (const s of sections) {
      assert.ok(s.body.length > 0, `${name} section ${s.num} has text`);
      assert.ok(whole.includes(s.body.replace(/\s+/g, "")), `${name} section ${s.num}: the body is the published text`);
      if (s.num !== FULL_NUM) assert.ok(whole.includes(`${s.num}.${s.heading.replace(/\s+/g, "")}.`), `${name} section ${s.num}: the heading is the published heading`);
    }
  }
});

test("HAND-MADE, the shape of an appropriations bill: title text, run-in sections and the closing paragraph each stand alone", () => {
  const html = page(`                                 AN ACT

Making appropriations for the Department of Examples for the fiscal year
           ending September 30, 2026, and for other purposes.

    Be it enacted by the Senate and House of Representatives of the
United States of America in Congress assembled,
That the following sums are appropriated, out of any money in the
Treasury not otherwise appropriated, for the Department of Examples for
the fiscal year ending September 30, 2026, namely:

                                TITLE I

                           EXAMPLE PERSONNEL

                        Example Personnel, Army

    For pay, allowances, individual clothing, subsistence, interest on
deposits and gratuities for members of the Army on active duty,
$52,502,044,000.

                               TITLE VIII

                           GENERAL PROVISIONS

    Sec. 8001.  No part of any appropriation contained in this Act shall
be used for publicity or propaganda purposes not authorized by the
Congress.
    Sec. 8002. (a) None of the funds appropriated by this Act may be
used to carry out a reduction in force.
    (b) Subsection (a) does not apply to a civilian employee.
    This Act may be cited as the \`\`Department of Examples Appropriations
Act, 2026''.

            Passed the House of Representatives July 18, 2025.

            Attest:

                                                                 Clerk.
`);
  const s = splitFederal(html);
  assert.deepEqual(s.map(x => x.num), [START_NUM, "TITLE I", "8001", "8002", "SHORT TITLE"]);
  assert.ok(s[0].body.startsWith("Be it enacted by the Senate and House of Representatives") && s[0].body.endsWith("namely:"));
  assert.equal(s[1].heading, "TITLE I EXAMPLE PERSONNEL");
  assert.equal(s[1].body, "Example Personnel, Army\nFor pay, allowances, individual clothing, subsistence, interest on deposits and gratuities for members of the Army on active duty, $52,502,044,000.");
  assert.equal(s[2].heading, "");
  assert.equal(s[2].body, "Sec. 8001. No part of any appropriation contained in this Act shall be used for publicity or propaganda purposes not authorized by the Congress.");
  assert.equal(s[3].body, "Sec. 8002. (a) None of the funds appropriated by this Act may be used to carry out a reduction in force.\n(b) Subsection (a) does not apply to a civilian employee.");
  assert.equal(s[4].heading, CLOSING_HEADING);
  assert.equal(s[4].body, "This Act may be cited as the ``Department of Examples Appropriations Act, 2026''.");
  assert.equal(sectionTitle(s[1]), "TITLE I EXAMPLE PERSONNEL"); assert.equal(sectionTitle(s[2]), "Sec. 8001");
});

test("HAND-MADE, divisions that each start again at section 101, a number printed twice, a table caption and struck words", () => {
  const head = "                                 A BILL\n\n    Be it enacted by the Senate and House of Representatives of the \nUnited States of America in Congress assembled,\n\n";
  const divisions = splitFederalDetailed(page(`${head}SECTION 1. SHORT TITLE.

    This Act may be cited as the \`\`Two Divisions Act''.

SEC. 2. TABLE OF CONTENTS.

    The table of contents for this Act is as follows:

Sec. 1. Short title.
Sec. 2. Table of contents.

                        DIVISION A--FIRST THINGS

Sec. 101. Roads.

                        DIVISION B--SECOND THINGS

Sec. 101. Bridges.

                        DIVISION A--FIRST THINGS

SEC. 101. ROADS.

    The Secretary shall repair 40 miles of road.

                        DIVISION B--SECOND THINGS

SEC. 101. BRIDGES.

    The Secretary shall repair 12 bridges.
                                 <all>
`));
  assert.deepEqual(divisions.sections.map(x => x.num), ["1", "2", "A-101", "B-101"]);
  assert.equal(divisions.repeated, 0);
  assert.ok(divisions.sections[1].body.endsWith("DIVISION B--SECOND THINGS\nSec. 101. Bridges."), "the table of contents, division lines and all, stays in section 2");
  assert.equal(divisions.sections[2].body, "The Secretary shall repair 40 miles of road.");
  assert.equal(divisions.sections[3].body, "The Secretary shall repair 12 bridges.");

  const twice = splitFederalDetailed(page(`${head}SEC. 5. FIRST.\n\n    The first section numbered five says one thing.\n\nSEC. 5. SECOND.\n\n    The second section numbered five says another.\n`));
  assert.deepEqual(twice.sections.map(x => [x.num, x.heading]), [["5", "FIRST"], ["5/2", "SECOND"]]);
  assert.equal(twice.repeated, 1);

  const rule = "------------------------------------------------------------------------";
  const table = splitFederal(page(`${head}SEC. 4101. PROCUREMENT.\n\n${rule}\nSEC. 4101. PROCUREMENT (In Thousands of Dollars)\n${rule}\n      Line                 Item              Request        Authorized\n${rule}\n\nSEC. 4102. NEXT.\n\n    The next section follows the table.\n`));
  assert.deepEqual(table.map(x => x.num), ["4101", "4102"], "a table's caption is not a section; the section after a table is");
  assert.ok(table[0].body.includes("SEC. 4101. PROCUREMENT (In Thousands of Dollars)") && table[0].body.includes("      Line                 Item              Request        Authorized"), "a table row keeps its columns");

  const partly = splitFederalDetailed(page(`${head}SEC. 3. LIMIT.\n\n<DELETED>    (a) In General.--The limit is $500,000 for each fiscal year.</DELETED>\n\n    (a) In General.--The limit is $750,000 for each fiscal year.\n`));
  assert.equal(partly.struck, 0, "struck words inside a kept section are not a struck section");
  assert.equal(partly.sections[0].body, "<DELETED> (a) In General.--The limit is $500,000 for each fiscal year.</DELETED>\n(a) In General.--The limit is $750,000 for each fiscal year.");
  assert.equal(quoteInSection("The limit is $750,000 for each fiscal year.", partly.sections[0].body), true);
  assert.equal(quoteInSection("The limit is $500,000 for each fiscal year.", partly.sections[0].body), false, "struck words are no longer the bill");
  assert.equal(quoteInSection("</DELETED> (a) In General.--The limit is $750,000", partly.sections[0].body), false);
});

// ───────────── Matching a quote to a section ─────────────

test("normalise changes white space and nothing else", () => {
  assert.equal(normalise("  is not subject\n   to reduction\tunder sections 5304\r\nand 5305  "), "is not subject to reduction under sections 5304 and 5305");
  assert.equal(normalise("``Major Richard Star Act''."), "``Major Richard Star Act''.");
  assert.equal(normalise("Veterans’ “Disability” — $1,000.00; (A)(i)"), "Veterans’ “Disability” — $1,000.00; (A)(i)");
  assert.equal(normalise("SHALL Not"), "SHALL Not");
  assert.equal(normalise(" \n\t "), "");
});

test("quoteInSection: word for word in that one section, or not at all", () => {
  const [one, two] = splitFederal(IH);
  assert.equal(quoteInSection(SENTENCE, two.body), true);
  assert.equal(quoteInSection(SENTENCE, one.body), false, "the right words in the wrong section");
  // Line breaks, tabs and non-breaking spaces inside the quote do not matter.
  assert.equal(quoteInSection("is not subject to reduction\nunder sections 5304\n   and 5305 of title 38", two.body), true);
  assert.equal(quoteInSection("is not subject\tto reduction under sections 5304 and 5305 of title 38", two.body), true);
  assert.equal(quoteInSection(`  ${SENTENCE}  `, two.body), true);
  // The body may hold line breaks where the quote has spaces.
  assert.equal(quoteInSection("is amended-- (1) in subparagraph (A)-- (A) by striking ``of this title, the amount''", two.body), true);
  // One word changed, one number changed, one letter's case, one kind of quotation mark, one comma.
  assert.equal(quoteInSection("is not subject to reductions under sections 5304 and 5305 of title 38", two.body), false);
  assert.equal(quoteInSection("is now subject to reduction under sections 5304 and 5305 of title 38", two.body), false);
  assert.equal(quoteInSection("is not subject to reduction under sections 5304 and 5306 of title 38", two.body), false);
  assert.equal(quoteInSection("Is not subject to reduction under sections 5304 and 5305 of title 38", two.body), false);
  assert.equal(quoteInSection("by striking \"of this title, the amount\"", two.body), false);
  assert.equal(quoteInSection("by striking ``of this title, the amount''", two.body), true);
  assert.equal(quoteInSection("by striking ``of this title the amount''", two.body), false);
  assert.equal(quoteInSection("is not subject to reduction under sections 5304 … 5305 of title 38", two.body), false, "words left out of the middle");
  // A quote that runs from the end of one section into the next is in neither.
  const across = "This Act may be cited as the ``Major Richard Star Act''. (a) Concurrent Receipt in Connection With CRSC.";
  assert.equal(quoteInSection("This Act may be cited as the ``Major Richard Star Act''.", one.body), true);
  assert.equal(quoteInSection("(a) Concurrent Receipt in Connection With CRSC.", two.body), true);
  assert.equal(quoteInSection(across, one.body), false); assert.equal(quoteInSection(across, two.body), false);
  const withHeading = `Major Richard Star Act''. SEC. 2. ${two.heading}. (a) Concurrent Receipt`;
  assert.equal(quoteInSection(withHeading, one.body), false); assert.equal(quoteInSection(withHeading, two.body), false);
  // Too short to prove anything, even when it is there.
  assert.equal(MIN_QUOTE_CHARS, 12);
  assert.ok(two.body.includes("of title 38"));
  assert.equal(quoteInSection("of title 38", two.body), false, "11 characters");
  assert.equal(quoteInSection("of  title\n38", two.body), false, "white space does not make it longer");
  assert.equal("of title 38;".length, 12);
  assert.equal(quoteInSection("of title 38;", two.body), true, "12 characters");
  assert.equal(quoteInSection("", two.body), false); assert.equal(quoteInSection("            ", two.body), false);
  assert.equal(quoteInSection(SENTENCE, ""), false);
  // The same check on a Texas section, marks and all.
  const tx = splitTexas(TX_TEXT);
  assert.equal(quoteInSection("exemption from taxation by a school district of «$140,000»", tx[0].body), true);
  assert.equal(quoteInSection("exemption from taxation by a school district of $140,000", tx[0].body), false, "the marks are part of the published text");
});

test("anchors are stable and safe in an address", () => {
  assert.equal(sectionAnchor("2"), "sec-2"); assert.equal(sectionAnchor("101"), "sec-101"); assert.equal(sectionAnchor("1.01"), "sec-1-01");
  assert.equal(sectionAnchor("FULL"), "sec-full"); assert.equal(sectionAnchor("8001A"), "sec-8001a"); assert.equal(sectionAnchor("A-101"), "sec-a-101");
  assert.equal(sectionAnchor("5/2"), "sec-5-2"); assert.equal(sectionAnchor("DIV A TITLE I"), "sec-div-a-title-i"); assert.equal(sectionAnchor(START_NUM), "sec-start");
  assert.equal(sectionAnchor(""), "sec-full"); assert.equal(sectionAnchor(" § 3 "), "sec-3");
  for (const html of [IH, EH, TITLES, QUOTED, STRUCK, RESOLUTION]) {
    const ids = splitFederal(html).map(s => sectionAnchor(s.num));
    assert.ok(ids.every(id => /^sec-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
    assert.equal(new Set(ids).size, ids.length, "one id for one section");
  }
  assert.equal(sectionTitle({ num: "2", heading: "SHORT TITLE" }), "Sec. 2. SHORT TITLE");
  assert.equal(sectionTitle({ num: "FULL", heading: "Full text" }), "Full text");
  assert.equal(sectionTitle({ num: "A-101", heading: "ROADS" }), "Sec. A-101. ROADS");
  assert.equal(sectionTitle({ num: "1.01", heading: "Section 11.13(b), Tax Code, is amended to read as follows", system: "texas" }), "Section 1.01");
});

// ───────────── Texas ─────────────

test("a Texas bill: the same shape, the published marks kept, and no section cut short", () => {
  const s = splitTexas(TX_TEXT), own = parseTloBillText(TX_TEXT).sections;
  assert.equal(s.length, 21);
  assert.deepEqual(s.map(x => x.num), own.map(x => x.num));
  assert.deepEqual(s.map(x => x.heading), own.map(x => x.heading));
  for (const [i, x] of s.entries()) assert.equal(x.body, own[i].text, `section ${x.num} is the reader's own text (none here is over its 20,000-character cut)`);
  assert.equal(s[0].num, "1.01");
  assert.ok(s[0].body.startsWith("SECTION 1.01. Section 11.13(b), Tax Code, is amended to read as follows:\n(b) An adult is entitled to exemption from taxation by a school district of «$140,000»"));
  assert.ok(s.some(x => /\[[^\]]+\]/.test(x.body)) && s.some(x => x.body.includes("«")), "added words stay in « » and struck words in [ ]");
  assert.ok(s.at(-1).body.endsWith("If that amendment is not approved by the voters, Article 1 of this Act has no effect."), "the signature block is not part of the last section");
  assert.ok(!s.some(x => /^ARTICLE \d/m.test(x.body)));
  // HAND-MADE: one section longer than the reader's cut, and a resolution with no sections.
  const row = t => `<tr><td>1-1</td><td>${t}</td></tr>`, long = Array.from({ length: 500 }, (_, i) => row(`line ${i} of a very long section that the store must keep whole to its end, `)).join("");
  const html = `<table>${row("&nbsp;&nbsp;&nbsp;&nbsp;BE IT ENACTED BY THE LEGISLATURE OF THE STATE OF TEXAS:")}${row("&nbsp;&nbsp;&nbsp;&nbsp;SECTION 1.  This Act is long:")}${long}${row("&nbsp;&nbsp;&nbsp;&nbsp;SECTION 2.  This Act takes effect September 1, 2027.")}</table>`;
  const cut = parseTloBillText(html).sections, whole = splitTexas(html);
  assert.equal(cut[0].text.length, 20_000);
  assert.ok(whole[0].body.length > 30_000 && whole[0].body.includes("line 499 of a very long section"));
  assert.equal(whole[1].body, "SECTION 2. This Act takes effect September 1, 2027.");
  const res = splitTexas(`<table>${row("&nbsp;&nbsp;&nbsp;&nbsp;WHEREAS, The example is plain; now, therefore, be it")}${row("&nbsp;&nbsp;&nbsp;&nbsp;RESOLVED, That the House honors the example.")}</table>`);
  assert.deepEqual(res.map(x => [x.num, x.heading]), [["FULL", "Full text"]]);
  assert.ok(res[0].body.includes("RESOLVED, That the House honors the example."));
  assert.deepEqual(splitTexas(""), []);
});

// ───────────── B. The store ─────────────

const open = [];
after(() => { for (const o of open) { o.client.close(); rmSync(o.dir, { recursive: true, force: true }); } });
async function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "bill-text-")), client = createClient({ url: `file:${join(dir, "test.db")}` }), db = drizzle(client);
  await migrate(db, { migrationsFolder: join(ROOT, "drizzle") });
  open.push({ client, dir });
  return db;
}
const NOW = Date.parse("2026-11-20T15:00:00Z");
const htmlUrl = code => `https://www.govinfo.gov/content/pkg/BILLS-${code}/html/BILLS-${code}.htm`;
const statusXml = versions => `<?xml version="1.0"?><billStatus><bill><number>1</number><textVersions>${versions.map(v =>
  `<item><type>${v.type}</type><date>${v.date}T04:00:00Z</date><formats><item><url>https://www.govinfo.gov/content/pkg/BILLS-${v.pkg}/xml/BILLS-${v.pkg}.xml</url></item></formats></item>`).join("")}</textVersions></bill></billStatus>`;
/** A stand-in for the network: the pages it holds, and a list of every address asked for. */
function net(pages) {
  const asked = [];
  return { asked, pages, fetchText: async url => { asked.push(url); const p = pages[url]; return typeof p === "function" ? p() : p ?? null; } };
}
async function federalBill(db, id, number) {
  await db.insert(schema.officialBills).values({ id, congress: 119, billType: "hr", number, title: `Test bill ${id}`, congressUrl: `https://www.congress.gov/bill/119th-congress/house-bill/${number}`, sourceUrl: "https://www.congress.gov/", retrievedAt: NOW });
}
const rowsFor = (db, billKey) => db.select().from(schema.billTextSections).where(eq(schema.billTextSections.billKey, billKey));

test("a federal bill's versions are stored once, newest first, and never fetched again", async () => {
  const db = await freshDb(), id = "119-hr-2102";
  await federalBill(db, id, 2102);
  const status = billStatusUrl(119, "hr", 2102);
  const n = net({ [status]: statusXml([{ type: "Introduced in House", date: "2025-03-14", pkg: "119hr2102ih" }, { type: "Engrossed in House", date: "2026-11-12", pkg: "119hr2102eh" }]),
    [htmlUrl("119hr2102ih")]: IH, [htmlUrl("119hr2102eh")]: EH });
  const first = await ensureBillText(id, { db, now: NOW, fetchText: n.fetchText });
  assert.equal(first.system, "federal");
  assert.deepEqual(first.notes, []);
  assert.deepEqual(n.asked, [status, htmlUrl("119hr2102eh"), htmlUrl("119hr2102ih")], "the list of versions, then each text once, newest first");
  assert.deepEqual(first.versions.map(v => [v.version, v.label, v.date, v.sourceUrl, v.sections]), [["eh", "Engrossed in House", "2026-11-12", htmlUrl("119hr2102eh"), 2], ["ih", "Introduced in House", "2025-03-14", htmlUrl("119hr2102ih"), 2]]);
  const eh = splitFederal(EH);
  assert.equal(first.versions[0].chars, eh[0].body.length + eh[1].body.length);
  assert.deepEqual(await versionsOf(id, db), first.versions);
  const rows = await rowsFor(db, id);
  assert.equal(rows.length, 4);
  assert.ok(rows.every(r => r.system === "federal" && r.retrievedAt === NOW && r.body.length > 0));

  // Again: only the list is asked for; no text is fetched and no row changes.
  const again = await ensureBillText(id, { db, now: NOW + 5000, fetchText: n.fetchText });
  assert.deepEqual(n.asked.slice(3), [status]);
  assert.deepEqual(again.versions, first.versions); assert.deepEqual(again.notes, []);
  assert.deepEqual(await rowsFor(db, id), rows);

  // In order, by number, and word for word.
  const sections = await sectionsOf(id, "eh", db);
  assert.deepEqual(sections.map(s => [s.seq, s.num]), [[0, "1"], [1, "2"]]);
  assert.deepEqual(sections.map(s => ({ num: s.num, heading: s.heading, body: s.body })), eh);
  assert.deepEqual(sections[1], { billKey: id, system: "federal", version: "eh", versionLabel: "Engrossed in House", versionDate: "2026-11-12", seq: 1, num: "2", heading: eh[1].heading, body: eh[1].body, sourceUrl: htmlUrl("119hr2102eh") });
  const two = await sectionOf(id, "ih", "2", db);
  assert.ok(two.body.includes(SENTENCE) && quoteInSection(SENTENCE, two.body));
  assert.equal(two.versionLabel, "Introduced in House");
  assert.equal(await sectionOf(id, "ih", "3", db), null); assert.equal(await sectionOf(id, "rh", "2", db), null);
  assert.deepEqual(await sectionsOf(id, "rh", db), []); assert.deepEqual(await versionsOf("119-hr-9", db), []);
});

test("a version that could not be read stores nothing, says so, and is tried again next time", async () => {
  const db = await freshDb(), id = "119-hr-2483";
  await federalBill(db, id, 2483);
  const status = billStatusUrl(119, "hr", 2483), list = [{ type: "Reported in House", date: "2025-05-29", pkg: "119hr2483rh" }, { type: "Introduced in House", date: "2025-03-31", pkg: "119hr2483ih" }];
  const n = net({ [status]: statusXml(list), [htmlUrl("119hr2483ih")]: TITLES });
  const first = await ensureBillText(id, { db, now: NOW, fetchText: n.fetchText });
  assert.deepEqual(first.notes, ["The reported in House version could not be read."]);
  assert.deepEqual(first.versions.map(v => [v.version, v.sections]), [["ih", 34]]);
  assert.equal((await rowsFor(db, id)).filter(r => r.version === "rh").length, 0);
  // An empty page, a page that is not a bill text, and a request that throws are all "could not be read".
  for (const bad of ["", "   \n ", "<html><body><h1>Page not found</h1></body></html>", () => { throw new Error("socket hang up"); }]) {
    n.pages[htmlUrl("119hr2483rh")] = bad;
    const r = await ensureBillText(id, { db, now: NOW, fetchText: n.fetchText });
    assert.deepEqual(r.notes, ["The reported in House version could not be read."]);
    assert.deepEqual(r.versions.map(v => v.version), ["ih"]);
  }
  n.pages[htmlUrl("119hr2483rh")] = "<html><body><pre>\n\n</pre></body></html>";
  assert.deepEqual((await ensureBillText(id, { db, now: NOW, fetchText: n.fetchText })).notes, ["The reported in House version was read, but no text was found in it."]);
  assert.equal((await rowsFor(db, id)).length, 34);
  // When it can be read it is stored; the version already held is not asked for again.
  n.pages[htmlUrl("119hr2483rh")] = STRUCK; n.asked.length = 0;
  const later = await ensureBillText(id, { db, now: NOW + 1, fetchText: n.fetchText });
  assert.deepEqual(n.asked, [status, htmlUrl("119hr2483rh")]);
  assert.deepEqual(later.versions.map(v => [v.version, v.sections]), [["rh", 7], ["ih", 34]]);
  assert.deepEqual(later.notes, ["The reported in House version prints 7 sections as struck out. Struck-out sections are not part of this version and are not stored with it."]);
  assert.deepEqual((await sectionsOf(id, "ih", db)).map(s => s.seq), Array.from({ length: 34 }, (_, i) => i));
  assert.equal((await sectionOf(id, "ih", "104", db)).body.includes("``SEC. 399H."), true);
});

test("only the newest versions are kept, a very long one is noted, and the list on file is the fallback", async () => {
  const db = await freshDb();
  await federalBill(db, "119-hr-7", 7);
  const status = billStatusUrl(119, "hr", 7);
  const longText = page(`                                 A BILL\n\n    Be it enacted by the Senate and House of Representatives of the \nUnited States of America in Congress assembled,\n\nSECTION 1. LONG.\n\n${"    The Secretary shall count every sheep in the valley twice.\n".repeat(7000)}                                 <all>`);
  const n = net({ [status]: statusXml([{ type: "Introduced in House", date: "2025-01-03", pkg: "119hr7ih" }, { type: "Reported in House", date: "2025-02-03", pkg: "119hr7rh" }, { type: "Engrossed in House", date: "2025-03-03", pkg: "119hr7eh" }]),
    [htmlUrl("119hr7ih")]: IH, [htmlUrl("119hr7rh")]: longText, [htmlUrl("119hr7eh")]: EH });
  assert.equal(DEFAULT_MAX_VERSIONS, 4); assert.equal(LONG_VERSION_CHARS, 400_000);
  const r = await ensureBillText("119-hr-7", { db, now: NOW, maxVersions: 2, fetchText: n.fetchText });
  assert.deepEqual(n.asked, [status, htmlUrl("119hr7eh"), htmlUrl("119hr7rh")], "the oldest of three is not asked for");
  assert.deepEqual(r.versions.map(v => v.version), ["eh", "rh"]);
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0], /^The reported in House version is very long \(4\d\d,\d{3} characters\)\. It is stored in full\.$/);
  assert.equal(r.notes[1], "Only the newest 2 versions are kept; 1 earlier one was not read.");
  const long = await sectionOf("119-hr-7", "rh", "1", db);
  assert.ok(long.body.length > 400_000 && long.body.endsWith("twice."), "stored whole");
  assert.equal(r.versions[1].chars, long.body.length);

  // The status record cannot be read: the versions Congress.gov listed (official_bill_texts) are used, and that is said.
  await federalBill(db, "119-hr-8", 8);
  await db.insert(schema.officialBillTexts).values([
    { billId: "119-hr-8", type: "Introduced in House", date: "2025-03-14", htmlUrl: "https://www.congress.gov/119/bills/hr8/BILLS-119hr8ih.htm", xmlUrl: null, pdfUrl: null, retrievedAt: NOW },
    { billId: "119-hr-8", type: "Engrossed in House", date: "2026-11-12", htmlUrl: null, xmlUrl: "https://www.congress.gov/119/bills/hr8/BILLS-119hr8eh.xml", pdfUrl: null, retrievedAt: NOW }]);
  const m = net({ [htmlUrl("119hr8ih")]: IH, [htmlUrl("119hr8eh")]: EH });
  const f = await ensureBillText("119-hr-8", { db, now: NOW, fetchText: m.fetchText });
  assert.deepEqual(m.asked, [billStatusUrl(119, "hr", 8), htmlUrl("119hr8eh"), htmlUrl("119hr8ih")], "always the Government Publishing Office's own file");
  assert.deepEqual(f.notes, ["The official list of this bill's versions could not be read, so the list already on file was used."]);
  assert.deepEqual(f.versions.map(v => [v.version, v.label, v.sourceUrl]), [["eh", "Engrossed in House", htmlUrl("119hr8eh")], ["ih", "Introduced in House", htmlUrl("119hr8ih")]]);

  // Nothing listed anywhere, and a bill the site does not hold.
  await federalBill(db, "119-hr-9", 9);
  assert.deepEqual(await ensureBillText("119-hr-9", { db, fetchText: net({}).fetchText }), { system: "federal", versions: [], notes: ["No published text was found for this bill."] });
  assert.deepEqual(await ensureBillText("119-hr-404", { db, fetchText: net({}).fetchText }), { system: "federal", versions: [], notes: ["This bill is not on file, so its text was not read."] });
  assert.equal((await db.select().from(schema.billTextSections)).filter(x => x.billKey === "119-hr-9" || x.billKey === "119-hr-404").length, 0);
});

test("a Texas bill is read from the Legislature's Text page the way the summary gatherer reads it (saved pages only)", async () => {
  const db = await freshDb(), id = "tx-89-sb-4";
  await db.insert(schema.txBills).values({ id, session: "89", identifier: "SB 4", title: "Relating to an increase in the amount of the exemption of residence homesteads.", chamber: "upper", classification: ["bill"], subjects: [], stage: "law",
    tloUrl: "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB4", feed: "openstates", sourceUrl: "https://openstates.org/", retrievedAt: NOW });
  await db.insert(schema.txBillVersions).values({ billId: id, note: "Enrolled", date: "2025-05-28", url: "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm" });
  const text = code => `https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004${code}.htm`, listing = tloTextPageUrl("89R", "SB 4");
  const n = net({ [listing]: TX_PAGE, [text("F")]: TX_TEXT });
  const first = await ensureBillText(id, { db, now: NOW, fetchText: n.fetchText });
  assert.equal(first.system, "texas");
  assert.deepEqual(n.asked, [listing, text("F"), text("H")], "newest first; after one refusal the site is not asked again");
  assert.deepEqual(first.notes, ["The House committee report version could not be read. 2 more versions were not asked for after that.", "Only the newest 4 versions are kept; 1 earlier one was not read."]);
  assert.deepEqual(first.versions.map(v => [v.version, v.label, v.date, v.sourceUrl, v.sections]), [["Enrolled", "Enrolled", "2025-05-28", text("F"), 21]]);
  const stored = await sectionsOf(id, "Enrolled", db);
  assert.deepEqual(stored.map(s => ({ num: s.num, heading: s.heading, body: s.body })), splitTexas(TX_TEXT));
  assert.ok(stored.every(s => s.system === "texas"));
  assert.ok((await sectionOf(id, "Enrolled", "1.01", db)).body.includes("«$140,000»"));
  // The other versions arrive later: each is read once, the enrolled text not again, and they come back newest first.
  for (const code of ["H", "E", "S"]) n.pages[text(code)] = TX_TEXT;
  n.asked.length = 0;
  const later = await ensureBillText(id, { db, now: NOW + 1, fetchText: n.fetchText });
  assert.deepEqual(n.asked, [listing, text("H"), text("E"), text("S")]);
  assert.deepEqual(later.versions.map(v => v.version), ["Enrolled", "House Committee Report", "Engrossed", "Senate Committee Report"], "a Senate bill: its Senate committee report came first");
  assert.deepEqual(later.notes, ["Only the newest 4 versions are kept; 1 earlier one was not read."]);
  n.asked.length = 0;
  await ensureBillText(id, { db, now: NOW + 2, fetchText: n.fetchText });
  assert.deepEqual(n.asked, [listing]);
  // The Text page cannot be read: the feed's own list of versions is the fallback.
  const id2 = "tx-89-sb-5";
  await db.insert(schema.txBills).values({ id: id2, session: "89", identifier: "SB 5", title: "Relating to a test.", chamber: "upper", classification: ["bill"], subjects: [], stage: "filed",
    tloUrl: "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB5", feed: "openstates", sourceUrl: "https://openstates.org/", retrievedAt: NOW });
  await db.insert(schema.txBillVersions).values([{ billId: id2, note: "Introduced", date: "2025-01-20", url: "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00005I.htm" },
    { billId: id2, note: "Somewhere else", date: "2025-02-01", url: "https://example.com/tlodocs/89R/billtext/html/SB00005E.htm" }]);
  const m = net({ "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00005I.htm": TX_TEXT });
  const f = await ensureBillText(id2, { db, now: NOW, fetchText: m.fetchText });
  assert.deepEqual(m.asked, [tloTextPageUrl("89R", "SB 5"), "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00005I.htm"], "an address off the official sites is never asked for");
  assert.deepEqual(f.notes, ["The list of versions on Texas Legislature Online could not be read."]);
  assert.deepEqual(f.versions.map(v => [v.version, v.date, v.sections]), [["Introduced", "2025-01-20", 21]]);
});

// ───────────── C. The page ─────────────

test("the text pages open to the same readers as the bill page, only show what is stored, and link the official file", () => {
  const viewer = read("lib/viewer.ts"), store = read("lib/changes/text-store.ts"), view = read("components/changes/bill-text.tsx");
  // The bill page asks entryViewer, which is viewerAccess() plus a share link about that one bill. The text pages ask
  // viewerAccess() itself: the editor, an invited reader, or everyone when public reading is on. They are not among
  // the pages a share link opens (tests/share-entry.test.mjs keeps that list at four).
  assert.match(read("app/bills/[id]/page.tsx"), /const access = await entryViewer\(\{ kind: "bill", billKey: id,/);
  assert.match(viewer, /export async function entryViewer\(request: EntryRequest\): Promise<EntryAccess> \{\n  const base = await viewerAccess\(\)/);
  for (const [file, current, template] of [["app/bills/[id]/text/page.tsx", "/issues", "/bills/[id]/text"], ["app/texas/bills/[id]/text/page.tsx", "/texas", "/texas/bills/[id]/text"]]) {
    const t = read(file);
    assert.ok(t.includes("const access = await viewerAccess();"), `${file} asks the present rule`);
    assert.ok(t.includes(`if (!access.allowed) return <PublicShell current="${current}" access={access} page="${template}">{null}</PublicShell>;`), `${file} shows the private notice and nothing else when closed`);
    assert.ok(t.indexOf("if (!access.allowed) return") < t.indexOf("await db.select()") && t.indexOf("if (!access.allowed) return") < t.indexOf("await versionsOf("), `${file} reads nothing before the gate`);
    assert.ok(t.includes("if (!(await viewerAccess()).allowed) return { title: BRAND.name };"), `${file}: no bill title for a closed page`);
    assert.doesNotMatch(t, /entryViewer|sharedPages|ensureBillText|fetch\(/, `${file} neither widens the share-link rule nor fetches`);
    assert.match(t, /brandTitle\(/); assert.match(t, /export const dynamic = "force-dynamic";/);
    assert.match(t, /versions\.find\(v => v\.version === want\) \?\? versions\[0\] \?\? null/, `${file}: ?v= picks a version, the newest otherwise`);
    assert.match(t, /<BillText /);
  }
  assert.match(view, /<h2 id=\{r\.id\}>\{r\.name\}<\/h2>/); assert.match(view, /let id = sectionAnchor\(s\.num\);/);
  assert.match(view, /<div className="bill-text">\{r\.s\.body\}<\/div>/, "the body is printed as stored");
  assert.match(view, /<a href=\{current\.sourceUrl\} target="_blank" rel="noopener noreferrer">Read the official file<\/a>/);
  assert.match(view, /href=\{r\.s\.sourceUrl\} target="_blank" rel="noopener noreferrer">Read the official file<\/a>/);
  assert.match(view, /This is the <b>\{current\.label\}<\/b> version\{current\.date \? <>, dated \{shortDate\(current\.date\)\}<\/>/);
  assert.match(view, /The text of this bill has not been read yet\./);
  assert.equal(view.split("<h1>").length - 1, 1); assert.ok(!/<h[3-6]/.test(view), "one h1, then h2 only");
  assert.match(read("components/changes/bill-text.css"), /\.bill-text\{white-space:pre-wrap;overflow-wrap:anywhere;/);
  // The store works without the site: relative imports only, the site's database asked for only when none is passed in.
  assert.doesNotMatch(read("lib/changes/sections.ts"), /from "@\//); assert.doesNotMatch(store, /from "@\//);
  assert.match(store, /return db \?\? \(await import\("@\/db"\)\)\.getDb\(\);/);
  assert.match(store, /TESTED ON SAVED PAGES ONLY/);
});
