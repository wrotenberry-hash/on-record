// The three gold examples (owner instruction, 17 Nov 2026) must pass the same checker as any generated summary,
// against the official records they were written from (saved from govinfo.gov and federalregister.gov on 17 Nov 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../lib/analysis/sources.ts";
import { parseBillStatus, parseBillTextHtml } from "../lib/analysis/billtext.ts";
import { checkSummary } from "../lib/analysis/checker.ts";
import { primersFor, primerSourceText } from "../lib/analysis/primers.ts";
import { GOLD_EXAMPLES } from "../lib/analysis/gold-examples.ts";
import { GOLD_APPROVED, goldExamplesBlock } from "../lib/analysis/gold.ts";

const fx = name => readFileSync(new URL(`./fixtures/sources/${name}`, import.meta.url), "utf8");

/** The same assembly lib/analysis/gather.ts does over the network, from saved files. */
export function contextFor({ title, billType, sponsor, status, floor, report, reportCite, rule, preamble, usc, billText }) {
  const docs = [], agencies = [], allowedFor = [], allowedAgainst = [], speakers = [];
  const t = /^s/.test(billType) ? "Sen." : "Rep.";
  allowedFor.push(`${t} ${sponsor}, the sponsor`);
  const st = parseBillStatus(status);
  const sd = S.statusDoc(status, "https://www.congress.gov/"); if (sd) docs.push(sd);
  if (st.crsSummary) docs.push({ id: "CRS", text: st.crsSummary });
  const cra = S.disapprovedRule(title);
  if (cra && rule) {
    const doc = S.federalRegisterDoc(rule);
    doc.text += `\nWhy the agency says it made the rule: ${preamble.why}\nThe rule's main changes: ${preamble.major}\nThe agency's own estimates: ${preamble.impact}\nDollar amounts stated in the rule: ${preamble.consumer}\nThe rule took effect on ${preamble.effective}.\nThe rule's text refers to HealthCare.gov.`;
    docs.push(doc); agencies.push(cra.agency, ...cra.agency.split(/\s+of the\s+/), ...S.frAgencies(rule));
    allowedAgainst.push(`the ${cra.agency.split(/\s+of the\s+/)[0]}, which issued the rule`);
  }
  if (report) {
    const r = S.parseCommitteeReport(report), committee = `${r.chamber} ${r.committee}`;
    docs.push(S.committeeReportDoc(reportCite, "https://www.govinfo.gov/", r)); agencies.push(committee, r.committee);
    allowedFor.push(`the ${committee} (majority, ${reportCite})`);
    if (r.minority) allowedAgainst.push(`the ${committee} minority (minority views, ${reportCite})`);
  }
  if (floor) {
    const rec = S.parseFloorSpeeches(floor);
    docs.push(S.floorDoc("FLOOR", "https://www.govinfo.gov/", rec));
    for (const sp of rec.speeches.slice(0, 10)) { speakers.push({ name: sp.name, text: sp.text }); const who = `${rec.chamber === "Senate" ? "Sen." : "Rep."} ${sp.name} (floor statement, ${rec.date})`; allowedFor.push(who); allowedAgainst.push(who); }
  }
  if (usc) docs.push(usc);
  // Primers are matched as in production, but unreviewed ones are included here: the owner has not approved them yet.
  const primers = primersFor({ title, text: billText ?? "", actions: sd?.text ?? "" }, true);
  if (primerSourceText(primers)) docs.push({ id: "PRIMER", text: primerSourceText(primers) });
  return { title, docs: docs.map(d => ({ id: d.id, text: d.text })), agencies, allowedFor, allowedAgainst, needsBackground: false, structure: true, cancelsRule: !!cra, speakers, primers: primers.map(p => p.id) };
}

const T197 = `A joint resolution providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Centers for Medicare & Medicaid Services of the Department of Health and Human Services relating to "Patient Protection and Affordable Care Act, HHS Notice of Benefit and Payment Parameters for 2027; and Basic Health Program".`;
const CASES = {
  "119-sjres-197": () => ({ text: fx("BILLS-119sjres197pcs.htm"), ctx: contextFor({ billText: fx("BILLS-119sjres197pcs.htm"), title: T197, billType: "sjres", sponsor: "Tammy Baldwin", status: fx("billstatus-119sjres197.xml"),
    floor: fx("CREC-2026-09-29-pt1-PgS5139-2.htm"), rule: S.pickFederalRegisterRule(JSON.parse(fx("fr-search-nbpp2027.json")).results, S.disapprovedRule(T197).rule), preamble: JSON.parse(fx("fr-2026-10050-preamble.json")) }) }),
  "119-hr-2102": () => ({ text: fx("BILLS-119hr2102eh.htm"), ctx: contextFor({ billText: fx("BILLS-119hr2102eh.htm"), title: "To amend title 10, United States Code, to provide for concurrent receipt of veterans' disability compensation and retired pay for disability retirees with combat-related disabilities, and for other purposes.",
    billType: "hr", sponsor: "Gus M. Bilirakis", status: fx("billstatus-119hr2102.xml"), floor: fx("CREC-2026-11-12-pt1-PgH6194-4.htm"), usc: S.parseUsCodeSection(fx("usc-10-1413a.htm"), "10", "1413a") }) }),
  "119-hr-7008": () => ({ text: fx("BILLS-119hr7008pcs.htm"), ctx: contextFor({ billText: fx("BILLS-119hr7008pcs.htm"), title: "Stop Insider Trading Act", billType: "hr", sponsor: "Bryan Steil", status: fx("billstatus-119hr7008.xml"),
    floor: fx("CREC-2026-07-22-pt1-PgH5143.htm"), report: fx("CRPT-119hrpt479.htm"), reportCite: "H. Rept. 119-479" }) }),
};

for (const g of GOLD_EXAMPLES) test(`gold example passes every written rule: ${g.label}`, () => {
  const { text, ctx } = CASES[g.billId]();
  const parsed = parseBillTextHtml(text);
  const r = checkSummary(g.summary, parsed.sections, { subject: ctx.title, fullText: parsed.text, sources: ctx });
  assert.deepEqual(r.failures, []);
  assert.ok(r.metrics.readingGrade <= 10, `reading grade ${r.metrics.readingGrade}`);
});

test("gold examples stay out of the generator prompt until the owner approves them", () => {
  assert.equal(GOLD_EXAMPLES.length, 3);
  if (!GOLD_APPROVED) assert.equal(goldExamplesBlock(), "");
  else assert.match(goldExamplesBlock(), /HealthCare\.gov/);
});
