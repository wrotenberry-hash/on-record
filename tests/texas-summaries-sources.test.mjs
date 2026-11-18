// Texas summaries: reading the official sources (lib/texas/analysis/sources.ts and gather.ts).
//
// REAL documents, fetched from Texas Legislature Online on 17 Nov 2026 for 89th Legislature S.B. 4 and saved unchanged
// in tests/fixtures/texas-sources: the enrolled bill text, the House committee bill analysis (windows-1252), the Senate
// Research Center bill analysis, the Legislative Budget Board fiscal note, the versions table of the Text page, and
// the action list. HAND-MADE samples (the hosts refused the build machine): hro-sample.txt, statutes-sample-TX.11.htm.
import test from "node:test";
import assert from "node:assert/strict";
import { billParts, fiscalNoteText, hroAnalysisUrl, isOfficialUrl, longDate, parseBillAnalysis, parseFiscalNote, parseHroAnalysis, parseStatuteSection, parseTloBillText, parseTloTextPage,
  pickDocs, reachedHouseFloor, statusText, statuteCites, statuteUrl, tloDocCode, tloDocUrl, tloTextPageUrl, txCitedSection, usDate, versionCodeOf } from "../lib/texas/analysis/sources.ts";
import { CREDIT, gatherTxSources, matchTxPrimers, txSourcePacketLines } from "../lib/texas/analysis/gather.ts";

import { ACTIONS, CAPTION, fx, SB4, standInFetch } from "./texas-summaries-helpers.mjs";

test("only official Texas hosts over https are ever fetched or linked", () => {
  for (const ok of ["https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm", "https://hro.house.texas.gov/pdf/ba89r/sb0004.pdf", "https://statutes.capitol.texas.gov/Docs/TX/htm/TX.11.htm#11.13"])
    assert.equal(isOfficialUrl(ok), true, ok);
  for (const bad of ["http://capitol.texas.gov/x", "https://capitol.texas.gov.evil.example/x", "https://www.texastribune.org/x", "https://www.lbb.texas.gov/x", "https://openstates.org/tx/bills/89/SB4", "https://legiscan.com/TX/bill/SB4", "not a url", "https://user@capitol.texas.gov/x"])
    assert.equal(isOfficialUrl(bad), false, bad);
});

test("addresses on Texas Legislature Online follow the pattern seen on the real pages", () => {
  assert.deepEqual(billParts("SB 4"), { prefix: "SB", number: 4 });
  assert.equal(billParts("Amendment 3"), null);
  assert.equal(tloDocCode("SB 4"), "SB00004");
  assert.equal(tloDocCode("HB 1234"), "HB01234");
  assert.equal(tloDocCode("SJR 2"), "SJ00002"); // seen on the real Text page for 89R SJR 2
  assert.equal(tloTextPageUrl("89R", "SB 4"), "https://capitol.texas.gov/BillLookup/Text.aspx?LegSess=89R&Bill=SB4");
  assert.equal(tloDocUrl("89R", "SB 4", "fiscalnotes", "F"), "https://capitol.texas.gov/tlodocs/89R/fiscalnotes/html/SB00004F.htm");
  assert.equal(versionCodeOf("https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm"), "F");
  assert.equal(versionCodeOf("https://example.org/x.htm"), null);
});

test("the real Text page lists six versions; the newest text is paired with its own analysis and fiscal note", () => {
  const rows = parseTloTextPage(fx("tlo-text-page-89R-SB4.htm"));
  assert.deepEqual(rows.map(r => `${r.version}|${r.code}|${r.textUrl ? "text" : "-"}|${r.fiscalNoteUrl ? "fiscal" : "-"}|${r.analysisUrl ? "analysis" : "-"}`), [
    "Introduced|I|text|fiscal|analysis", "Senate Committee Report|S|text|-|-", "Engrossed|E|text|fiscal|-", "House Committee Report|H|text|-|analysis", "Senate Amendments Printing|A|-|fiscal|-", "Enrolled|F|text|fiscal|analysis"]);
  const pick = pickDocs(rows);
  assert.equal(pick.text.textUrl, "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm");
  assert.equal(pick.analysis.analysisUrl, "https://capitol.texas.gov/tlodocs/89R/analysis/html/SB00004F.htm");
  assert.equal(pick.fiscal.fiscalNoteUrl, "https://capitol.texas.gov/tlodocs/89R/fiscalnotes/html/SB00004F.htm");
});

test("an earlier stage uses the nearest EARLIER analysis and fiscal note, never a later one", () => {
  const rows = parseTloTextPage(fx("tlo-text-page-89R-SB4.htm"));
  const atEngrossed = pickDocs(rows.slice(0, 3));
  assert.equal(atEngrossed.text.version, "Engrossed");
  assert.equal(atEngrossed.analysis.version, "Introduced", "the engrossed version has no analysis of its own");
  assert.equal(atEngrossed.fiscal.version, "Engrossed");
  const inHouse = pickDocs(rows.slice(0, 5)); // through the "Senate Amendments Printing", which has a fiscal note but no text
  assert.equal(inHouse.text.version, "House Committee Report");
  assert.equal(inHouse.analysis.version, "House Committee Report");
  assert.equal(inHouse.fiscal.version, "Engrossed", "the note for a later printing is not paired with an earlier text");
  assert.equal(pickDocs([]), null);
  assert.equal(pickDocs([{ version: "Introduced", code: null, textUrl: null, fiscalNoteUrl: null, analysisUrl: null }]), null);
});

test("the real enrolled text parses to its 21 sections, with added and removed words marked", () => {
  const t = parseTloBillText(fx("billtext-89R-SB00004F.htm"));
  assert.equal(t.caption, CAPTION.replace(/^Relating/, "relating"));
  assert.equal(t.sections.length, 21);
  assert.deepEqual(t.sections.slice(0, 5).map(s => s.num), ["1.01", "1.02", "1.03", "1.04", "2.01"]);
  assert.equal(t.sections.at(-1).num, "3.02");
  assert.equal(t.sections[0].heading, "Section 11.13(b), Tax Code, is amended to read as follows");
  assert.match(t.sections[0].text, /school district of «\$140,000» \[\$100,000\] of the appraised value/);
  assert.match(t.sections.at(-1).text, /If that amendment is not approved by the voters, Article 1 of this Act has no effect\.$/);
  assert.ok(!t.text.includes("<") && !t.text.includes("&#"), "no markup left");
  assert.ok(!/President of the Senate/.test(t.sections.at(-1).text), "the signature block is not part of a section");
  assert.match(t.certification, /passed the Senate on February 13, 2025, by the following vote: Yeas 30, Nays 0/);
  assert.match(t.certification, /passed the House, with amendment, on May 21, 2025, by the following vote: Yeas 143, Nays 0, one present not voting\./);
});

test("a citation is read as this bill's own section number, articles included", () => {
  assert.equal(txCitedSection("Sec. 3"), "3");
  assert.equal(txCitedSection("Sec. 1.01"), "1.01");
  assert.equal(txCitedSection("Section 1.02(a-3)"), "1.02");
  assert.equal(txCitedSection("SECTION 2.15"), "2.15");
  assert.equal(txCitedSection("§ 4"), "4");
  assert.equal(txCitedSection("FISCAL"), null);
  assert.equal(txCitedSection("Full text"), null);
});

test("the real House committee analysis (windows-1252) gives the background and purpose", () => {
  const a = parseBillAnalysis(fx("analysis-89R-SB00004H.htm"));
  assert.equal(a.writer, "House committee");
  assert.equal(a.committee, "Ways & Means");
  assert.equal(a.author, "Bettencourt");
  assert.equal(a.version, "Committee Report (Unamended)");
  assert.equal(a.intentHeading, "BACKGROUND AND PURPOSE");
  assert.match(a.intent, /^Over the past several legislative sessions/);
  assert.match(a.intent, /increasing the exemption amount from \$15,000 in 2015 to the current amount of \$100,000/);
  assert.match(a.intent, /against a corresponding loss in revenue\.$/, "the next heading is not part of it");
  assert.match(a.analysis, /S\.B\. 4 increases the amount of the general school district residence homestead property tax exemption from \$100,000 to \$140,000/);
  assert.ok(!a.analysis.includes("\uFFFD"), "the Word bullets are decoded, not lost");
});

test("the real Senate Research Center analysis gives the author's statement of intent without its footnotes", () => {
  const a = parseBillAnalysis(fx("analysis-89R-SB00004F.htm"));
  assert.equal(a.writer, "Senate Research Center");
  assert.equal(a.committee, "Local Government");
  assert.equal(a.author, "Bettencourt et al.");
  assert.equal(a.version, "Enrolled");
  assert.equal(a.date, "2025-08-25");
  assert.equal(a.intentHeading, "AUTHOR'S / SPONSOR'S STATEMENT OF INTENT");
  assert.match(a.intent, /will provide an estimated savings of \$363\.44 to a homeowner's school tax at the statewide ISD average tax rate of \$\.9086/);
  assert.ok(!/Footnotes|trerc\.tamu\.edu|comptroller\.texas\.gov/.test(a.intent), "footnotes and their links are left out");
  assert.ok(!/amends current law relating to/.test(a.intent));
  assert.match(a.analysis, /SECTION 1\.01\. Amends Section 11\.13\(b\), Tax Code/);
  assert.match(a.analysis, /2023-2024 and 2024-2025 school years/, "a dash the publisher lost between two years is restored");
  assert.equal(parseBillAnalysis("<html><body><p>Not found</p></body></html>"), null);
});

test("the real fiscal note gives its date, version, top line and year-by-year cost", () => {
  const n = parseFiscalNote(fx("fiscalnote-89R-SB00004F.htm"));
  assert.equal(n.date, "2025-05-21");
  assert.equal(n.version, "As Passed 2nd House");
  assert.equal(n.headline, "Estimated Two-year Net Impact to General Revenue Related Funds for SB4, As Passed 2nd House: a negative impact of ($2,743,461,146) through the biennium ending August 31, 2027.");
  assert.equal(n.noSignificantImpact, false);
  assert.deepEqual(n.fiveYear, [{ fiscalYear: "2026", amount: "($1,324,464,918)" }, { fiscalYear: "2027", amount: "($1,418,996,228)" }, { fiscalYear: "2028", amount: "($1,070,834,222)" },
    { fiscalYear: "2029", amount: "($1,010,481,222)" }, { fiscalYear: "2030", amount: "($1,020,163,222)" }]);
  assert.match(n.fiscalAnalysis, /^The bill would amend the Tax Code to increase the mandatory homestead exemption for school district property taxation from \$100,000 to \$140,000\./);
  assert.match(n.methodology, /would total \$1,324\.2 million in fiscal year 2026, \$1,418\.4 million in fiscal year 2027/);
  assert.equal(n.localGovernment, "The provisions of the bill would only apply to school districts.");
  assert.equal(n.sourceAgencies, "304 Comptroller of Public Accounts, 701 Texas Education Agency");
  const text = fiscalNoteText(n);
  assert.match(text, /an amount in parentheses is a cost/);
  assert.match(text, /2026: \(\$1,324,464,918\)/);
  assert.equal(parseFiscalNote("<html><body>Page not found</body></html>"), null);
});

test("a fiscal note that expects no significant cost says so (hand-made, in the note's own layout)", () => {
  const html = "<html><body><table><tr><td>LEGISLATIVE BUDGET BOARD</td></tr><tr><td>Austin, Texas</td></tr><tr><td>FISCAL NOTE, 90TH LEGISLATIVE REGULAR SESSION</td></tr><tr><td>March 3, 2027</td></tr>" +
    "<tr><td>IN RE:</td></tr><tr><td>HB12 by Sample (Relating to a sample subject.), As Introduced</td></tr><tr><td>No significant fiscal implication to the State is anticipated.</td></tr>" +
    "<tr><td>Local Government Impact</td></tr><tr><td>No significant fiscal implication to units of local government is anticipated.</td></tr><tr><td>Source Agencies: 212 Office of Court Administration</td></tr></table></body></html>";
  const n = parseFiscalNote(html);
  assert.equal(n.date, "2027-03-03");
  assert.equal(n.version, "As Introduced");
  assert.equal(n.noSignificantImpact, true);
  assert.deepEqual(n.fiveYear, []);
  assert.equal(n.sourceAgencies, "212 Office of Court Administration");
});

test("HAND-MADE sample: a House Research Organization analysis splits into its fixed parts", () => {
  const h = parseHroAnalysis(fx("hro-sample.txt"));
  assert.equal(h.date, "2025-05-20");
  assert.match(h.subject, /^Sample subject line/);
  assert.match(h.digest, /would raise the school district homestead exemption from \$100,000 to \$140,000/);
  assert.match(h.supportersSay, /^Sample supporters' reason\. SB 4 would lower school property taxes for homeowners at a time when rising home values/, "a heading split over two lines is joined");
  assert.match(h.criticsSay, /^Sample critics' reason/);
  assert.ok(!/Sample second reason/.test(h.criticsSay), "what other critics say is its own part");
  assert.match(h.otherCriticsSay, /^Sample second reason/);
  assert.ok(!/page 2/.test(h.digest + h.supportersSay), "the running page header is dropped");
  assert.match(h.notes, /Legislative Budget Board/);
  // Older sessions print OPPONENTS SAY; the headings may also come out on one line.
  const old = parseHroAnalysis("HOUSE RESEARCH ORGANIZATION bill analysis 4/2/2019 HB 9\nSUBJECT: Sample\nDIGEST: Sample digest.\nSUPPORTERS SAY: Sample reason for.\nOPPONENTS SAY: Sample reason against.\nNOTES: Sample.");
  assert.equal(old.supportersSay, "Sample reason for.");
  assert.equal(old.criticsSay, "Sample reason against.");
  assert.equal(parseHroAnalysis("An unrelated page"), null);
  assert.equal(hroAnalysisUrl("89R", "SB 4"), "https://hro.house.texas.gov/pdf/ba89r/sb0004.pdf"); // UNVERIFIED pattern
});

test("HRO is looked for only when the bill reached the House floor (real action wording)", () => {
  assert.equal(reachedHouseFloor(ACTIONS), true);
  const beforeFloor = ACTIONS.filter(a => a.date < "2025-05-10"); // through the House committee's report
  assert.equal(reachedHouseFloor(beforeFloor), false, "a Senate floor vote and a House committee report are not the House floor");
  assert.equal(reachedHouseFloor([{ chamber: "lower", description: "Placed on General State Calendar" }]), true);
});

test("current law: the sections a bill amends, their addresses, and one section from a chapter page (HAND-MADE sample)", () => {
  const t = parseTloBillText(fx("billtext-89R-SB00004F.htm"));
  assert.deepEqual(statuteCites(t.text), [{ code: "Tax Code", section: "11.13" }, { code: "Education Code", section: "46.071" }]);
  assert.equal(statuteCites(t.text, 50).length, 15, "each amended section once; whole sections the bill adds (49.0043, 49.0121) are not current law");
  assert.ok(!statuteCites(t.text, 50).some(c => c.section === "49.0043" || c.section === "49.0121"));
  assert.equal(statuteUrl({ code: "Tax Code", section: "11.13" }), "https://statutes.capitol.texas.gov/Docs/TX/htm/TX.11.htm#11.13"); // UNVERIFIED pattern
  assert.equal(statuteUrl({ code: "Imaginary Code", section: "1.01" }), null);
  const law = parseStatuteSection(fx("statutes-sample-TX.11.htm"), "11.13");
  assert.match(law, /^Sec\. 11\.13\. RESIDENCE HOMESTEAD\./);
  assert.match(law, /school district of \$100,000 of the appraised value of the adult's residence homestead/);
  assert.ok(!/SAMPLE NEXT SECTION|SAMPLE EARLIER SECTION/.test(law), "it stops at the next section");
  assert.equal(parseStatuteSection(fx("statutes-sample-TX.11.htm"), "11.99"), null);
});

test("the bill's record is written with full dates and never invents a member-by-member vote", () => {
  assert.equal(longDate("2025-06-16"), "June 16, 2025");
  assert.equal(usDate("8/25/2025"), "2025-08-25");
  assert.equal(usDate("May 21, 2025"), "2025-05-21");
  const s = statusText({ identifier: "SB 4", sessionName: SB4.sessionName, title: CAPTION }, ACTIONS, []);
  assert.match(s, /June 16, 2025, Governor: Signed by the Governor/);
  assert.match(s, /May 5, 2025, House: Considered in public hearing/);
  assert.match(s, /Recorded votes: none in the record\. A decision listed above without a recorded vote has no member-by-member record\./);
  const withVote = statusText({ identifier: "SB 4", sessionName: SB4.sessionName, title: CAPTION }, ACTIONS,
    [{ date: "2025-05-21", motion: "Passed", result: "pass", chamber: "lower", counts: { yes: 143, no: 0 }, tallyOk: 1 }, { date: "2025-05-20", motion: "Amendment 2", result: "fail", chamber: "lower", counts: { yes: 1 }, tallyOk: 0 }]);
  assert.match(withVote, /May 21, 2025, House: "Passed", result pass, yes 143, no 0/);
  assert.ok(!/Amendment 2/.test(withVote), "a vote whose tally is under review is not given to the model");
});

test("gathering: six paced requests to official hosts, each source with its title, address and date", async () => {
  const net = standInFetch(), sleeps = [];
  const out = await gatherTxSources(SB4, { fetch: net.fetch, paceMs: 1500, sleep: async ms => { sleeps.push(ms); } });
  assert.equal(out.ok, true);
  const g = out.gathered;
  assert.deepEqual(net.seen, ["https://capitol.texas.gov/BillLookup/Text.aspx?LegSess=89R&Bill=SB4", "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm",
    "https://capitol.texas.gov/tlodocs/89R/analysis/html/SB00004F.htm", "https://capitol.texas.gov/tlodocs/89R/fiscalnotes/html/SB00004F.htm", "https://hro.house.texas.gov/pdf/ba89r/sb0004.pdf",
    "https://statutes.capitol.texas.gov/Docs/TX/htm/TX.11.htm#11.13", "https://statutes.capitol.texas.gov/Docs/ED/htm/ED.46.htm#46.071"]);
  assert.ok(net.seen.every(isOfficialUrl));
  assert.equal(g.requests, 7);
  assert.deepEqual(sleeps, [1500, 1500, 1500, 1500, 1500, 1500], "a pause before every request after the first");
  assert.deepEqual(g.docs.map(d => d.id), ["ANALYSIS", "FISCAL", "HRO", "STATUS", "LAW"]);
  assert.equal(g.text.versionLabel, "Enrolled");
  assert.equal(g.text.versionCode, "F");
  assert.equal(g.text.date, "2025-05-30");
  assert.equal(g.fiscal.date, "2025-05-21");
  assert.match(g.fiscal.headline, /\(\$2,743,461,146\)/);
  for (const s of g.sourceList) { assert.ok(s.label.length > 8); assert.ok(isOfficialUrl(s.url), s.url); assert.ok("date" in s); }
  assert.deepEqual(g.sourceList.map(s => s.date), ["2025-06-16", "2025-05-30", "2025-08-25", "2025-05-21", "2025-05-20", null]);
  // Who may be credited: the document, never a person the site chose.
  assert.deepEqual(g.sides.map(s => [s.side, s.sourceId, s.attribution]), [["for", "ANALYSIS", CREDIT.intentSenate], ["for", "HRO", CREDIT.hroFor], ["against", "HRO", CREDIT.hroAgainst]]);
  assert.match(g.sides[2].text, /Sample critics' reason.*Sample second reason/, "what critics and other critics say");
  assert.deepEqual(g.notes, ["Section 46.071 of the Education Code was not found (404)."]);
  assert.deepEqual(g.primers, [], "no explainers unless they are passed in");
  assert.deepEqual(g.unread, [], "every analysis that prints arguments was read");
  const packet = txSourcePacketLines("TX SB 4 (89R)", g);
  assert.ok(packet.every(l => l.startsWith("TX_REVIEW_PACKET TX SB 4 (89R) | ") && l.length < 1800));
  assert.match(packet[0], /^TX_REVIEW_PACKET TX SB 4 \(89R\) \| SOURCE ANALYSIS \| part 1\/\d+ \| /);
  assert.match(packet.at(-1), /\| CONTEXT \| part 1\/1 \| \{/);
});

test("gathering: a host that refuses is asked once, never again, and the summary goes on without it", async () => {
  const net = standInFetch({ "hro.house.texas.gov": 0, "statutes.capitol.texas.gov/Docs/TX": 403 });
  const out = await gatherTxSources(SB4, { fetch: net.fetch });
  assert.equal(out.ok, true);
  assert.equal(net.seen.filter(u => u.includes("hro.house.texas.gov")).length, 1);
  assert.equal(net.seen.filter(u => u.includes("statutes.capitol.texas.gov")).length, 1, "the second section of current law is not requested after the refusal");
  assert.deepEqual(out.gathered.docs.map(d => d.id), ["ANALYSIS", "FISCAL", "STATUS"]);
  assert.deepEqual(out.gathered.sides.map(s => s.side), ["for"], "with no House Research Organization analysis there is no official case against");
  assert.match(out.gathered.notes[0], /House Research Organization analysis could not be read: hro\.house\.texas\.gov refused the request\. It was not tried again\./);
  assert.deepEqual(out.gathered.unread, ["the House Research Organization analysis, which prints what supporters and critics say"], "unread is not the same as absent: the summary will be held");
  // An analysis that is simply not published (the House Research Organization does not analyse every bill) is absent, not unread.
  const absent = await gatherTxSources(SB4, { fetch: standInFetch({ "hro.house.texas.gov": 404 }).fetch });
  assert.deepEqual([absent.gathered.unread, absent.gathered.sides.map(s => s.side)], [[], ["for"]]);
  assert.match(out.gathered.notes[1], /statutes\.capitol\.texas\.gov refused the request \(403\)/);
});

test("gathering: when Texas Legislature Online itself refuses, the bill is not written and the run is told to stop", async () => {
  const listing = await gatherTxSources(SB4, { fetch: standInFetch({ "Text.aspx": 429 }).fetch });
  assert.deepEqual([listing.ok, listing.reason, listing.requests], [false, "refused", 1]);
  assert.match(listing.detail, /capitol\.texas\.gov refused the request \(429\)/);
  const net = standInFetch({ "billtext/html/SB00004F": 0 });
  const text = await gatherTxSources(SB4, { fetch: net.fetch });
  assert.deepEqual([text.ok, text.reason], [false, "refused"]);
  assert.equal(net.seen.length, 2, "nothing more is requested");
});

test("gathering: no published text means no summary; the feed's version list is the fallback when the Text page is missing", async () => {
  const none = await gatherTxSources({ ...SB4, versions: [] }, { fetch: standInFetch({ "Text.aspx": 404 }).fetch });
  assert.deepEqual([none.ok, none.reason], [false, "no_text"]);
  const net = standInFetch({ "Text.aspx": 404 });
  const viaFeed = await gatherTxSources(SB4, { fetch: net.fetch });
  assert.equal(viaFeed.ok, true);
  assert.equal(viaFeed.gathered.text.url, "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm");
  assert.ok(viaFeed.gathered.docs.some(d => d.id === "FISCAL"), "the fiscal note is found at the same version's address");
  // A version address the feed gives on any other site is never fetched.
  const off = standInFetch({ "Text.aspx": 404 });
  const offSite = await gatherTxSources({ ...SB4, versions: [{ note: "Introduced", date: "2025-02-06", url: "https://example.org/tlodocs/89R/billtext/html/SB00004I.htm" }] }, { fetch: off.fetch });
  assert.deepEqual([offSite.ok, offSite.reason], [false, "no_text"]);
  assert.ok(off.seen.every(isOfficialUrl));
});

test("gathering: the House Research Organization analysis is skipped before the House floor, and a PDF needs a reader", async () => {
  const early = standInFetch();
  const out = await gatherTxSources({ ...SB4, actions: ACTIONS.filter(a => a.date < "2025-05-10") }, { fetch: early.fetch });
  assert.ok(!early.seen.some(u => u.includes("hro.house.texas.gov")));
  assert.ok(out.gathered.notes.some(n => /has not reached the House floor/.test(n)));
  assert.deepEqual(out.gathered.unread, []);
  const pdf = { status: 200, contentType: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.7 sample") };
  const noReader = await gatherTxSources(SB4, { fetch: standInFetch({ "hro.house.texas.gov": pdf }).fetch });
  assert.ok(!noReader.gathered.docs.some(d => d.id === "HRO"));
  assert.ok(noReader.gathered.notes.some(n => /published as a PDF, and no PDF reader is installed/.test(n)));
  assert.equal(noReader.gathered.unread.length, 1, "a document that is there but cannot be read holds the summary");
  const withReader = await gatherTxSources(SB4, { fetch: standInFetch({ "hro.house.texas.gov": pdf }).fetch, pdfToText: async () => fx("hro-sample.txt") });
  assert.ok(withReader.gathered.docs.some(d => d.id === "HRO"));
  assert.deepEqual(withReader.gathered.unread, []);
  // With under a minute left in the run, the documents a summary can do without are not requested at all.
  const late = standInFetch();
  const hurried = await gatherTxSources(SB4, { fetch: late.fetch, deadline: 1_050_000, now: () => 1_000_000 });
  assert.deepEqual(late.seen.map(u => u.split("/").at(-1)), ["Text.aspx?LegSess=89R&Bill=SB4", "SB00004F.htm"], "only the list of versions and the bill text");
  assert.equal(hurried.gathered.unread.length, 1);
  assert.ok(hurried.gathered.notes.some(n => /was not read: this run was out of time/.test(n)));
});

test("approved explainers are used only when passed in, approved and matching", async () => {
  const primer = { id: "tx-school-property-tax", kind: "topic", title: "How Texas school property taxes work", bullets: ["Sample bullet one.", "Sample bullet two.", "Sample bullet three."],
    sources: [{ label: "Tax Code, Chapter 11", url: "https://statutes.capitol.texas.gov/Docs/TX/htm/TX.11.htm" }], lawAsOf: "2026-11-17", reviewed: true, match: { title: /residence homesteads?/i } };
  assert.deepEqual(matchTxPrimers([primer], { title: CAPTION, text: "", actions: "" }).map(p => p.id), ["tx-school-property-tax"]);
  assert.deepEqual(matchTxPrimers([{ ...primer, reviewed: false }], { title: CAPTION, text: "", actions: "" }), [], "an explainer the owner has not approved is never used");
  assert.deepEqual(matchTxPrimers([primer], { title: "Relating to water wells.", text: "", actions: "" }), []);
  const out = await gatherTxSources(SB4, { fetch: standInFetch().fetch, primers: [primer] });
  const doc = out.gathered.docs.find(d => d.id === "PRIMER");
  assert.match(doc.text, /^How Texas school property taxes work\. Sample bullet one\./);
  assert.deepEqual(out.gathered.primers.map(p => p.id), ["tx-school-property-tax"]);
});
