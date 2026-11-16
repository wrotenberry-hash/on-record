import test from "node:test";
import assert from "node:assert/strict";
import { parseOpenStatesBills, txStage, tloBillUrl, txBillId, txTallyMismatch, parseOpenStatesPeople, parseOpenStatesCommittees, parseOpenStatesEvents,
  parseLegiscanMasterList, legiscanStage, currentTxSession, TX_STAGE_LABEL } from "../lib/texas/parse.ts";

// Open States v3 /bills shape (docs.openstates.org/api-v3), trimmed.
export const OS_BILLS = { results: [{
  id: "ocd-bill/3b8b6b0c-0000-4000-8000-000000000001", session: "89", identifier: "HB 2", title: "Relating to public school finance.",
  from_organization: { classification: "lower" }, classification: ["bill"], subject: ["Education - Finance"], first_action_date: "2025-03-03", latest_action_date: "2025-06-04",
  latest_action_description: "Effective on 9/1/25", openstates_url: "https://openstates.org/tx/bills/89/HB2/",
  actions: [
    { organization: { classification: "lower" }, description: "Filed", date: "2025-03-03", classification: ["filing"], order: 1 },
    { organization: { classification: "lower" }, description: "Referred to Public Education", date: "2025-03-10", classification: ["referral-committee"], order: 2 },
    { organization: { classification: "lower" }, description: "Passed", date: "2025-04-10", classification: ["passage"], order: 3 },
    { organization: { classification: "upper" }, description: "Passed", date: "2025-05-20", classification: ["passage"], order: 4 },
    { organization: { classification: "executive" }, description: "Sent to the Governor", date: "2025-05-30", classification: ["executive-receipt"], order: 5 },
    { organization: { classification: "executive" }, description: "Signed by the Governor", date: "2025-06-04", classification: ["executive-signature"], order: 6 } ],
  votes: [{ id: "ocd-vote/1", motion_text: "Final passage", start_date: "2025-04-10T00:00:00", result: "pass", organization: { classification: "lower" },
    counts: [{ option: "yes", value: 2 }, { option: "no", value: 1 }], votes: [{ option: "yes", voter_name: "Smith", voter: { id: "ocd-person/a" } }, { option: "yes", voter_name: "Jones", voter: { id: "ocd-person/b" } }, { option: "no", voter_name: "Lee", voter: { id: "ocd-person/c" } }] }],
  sponsorships: [{ name: "Buckley", primary: true, person: { id: "ocd-person/a", name: "Brad Buckley" } }],
  versions: [{ note: "Introduced", date: "2025-03-03", links: [{ url: "https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00002I.htm", media_type: "text/html" }] }] },
  { id: "ocd-bill/x", session: "89", identifier: "SB  12", title: "Relating to parental rights.", from_organization: { classification: "upper" },
    actions: [{ organization: { classification: "upper" }, description: "Filed", date: "2025-01-14", classification: ["filing"], order: 1 }] },
  { identifier: "no id" } ], pagination: { per_page: 20, page: 1, max_page: 3, total_items: 45 } };

test("Open States bills parse with actions, votes, sponsors and versions", () => {
  const { bills, page, maxPage } = parseOpenStatesBills(OS_BILLS);
  assert.equal(bills.length, 2); assert.equal(page, 1); assert.equal(maxPage, 3);
  const hb2 = bills[0];
  assert.equal(hb2.identifier, "HB 2"); assert.equal(hb2.chamber, "lower"); assert.equal(hb2.actions.length, 6); assert.equal(hb2.votes[0].counts.yes, 2);
  assert.equal(hb2.votes[0].votes[2].personId, "ocd-person/c"); assert.equal(hb2.sponsors[0].primary, true);
  assert.equal(hb2.versions[0].url, "https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00002I.htm");
  assert.equal(bills[1].identifier, "SB 12");
  assert.deepEqual(parseOpenStatesBills(null).bills, []);
});

test("Texas stages from Open Civic Data action classifications", () => {
  const { bills } = parseOpenStatesBills(OS_BILLS);
  assert.equal(txStage(bills[0].actions), "law");
  assert.equal(txStage(bills[0].actions.slice(0, 4)), "passed_both");
  assert.equal(txStage(bills[0].actions.slice(0, 3)), "passed_first");
  assert.equal(txStage(bills[0].actions.slice(0, 2)), "committee");
  assert.equal(txStage(bills[1].actions), "filed");
  assert.equal(txStage([{ order: 1, date: "2025-06-20", description: "Vetoed by the Governor", chamber: "executive", classification: ["executive-veto"] }]), "vetoed");
  assert.equal(TX_STAGE_LABEL.governor, "Sent to the Governor");
});

test("TLO links and ids", () => {
  assert.equal(tloBillUrl("89R", "HB 2"), "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB2");
  assert.equal(txBillId("89", "SB 12"), "tx-89-sb12");
});

test("Texas vote integrity: reported counts against the listed votes", () => {
  const { bills } = parseOpenStatesBills(OS_BILLS);
  assert.equal(txTallyMismatch(bills[0].votes[0]), null);
  const bad = { ...bills[0].votes[0], counts: { yes: 3, no: 1 } };
  assert.deepEqual(txTallyMismatch(bad), [{ option: "yes", official: 3, listed: 2 }]);
});

test("people, committees and events", () => {
  const { people } = parseOpenStatesPeople({ results: [
    { id: "ocd-person/a", name: "Brad Buckley", party: "Republican", current_role: { title: "Representative", org_classification: "lower", district: "54" } },
    { id: "ocd-person/s", name: "Sarah Eckhardt", party: "Democratic", current_role: { title: "Senator", org_classification: "upper", district: 14 } },
    { id: "ocd-person/g", name: "Greg Abbott", current_role: { title: "Governor", org_classification: "executive" } } ], pagination: { max_page: 1 } });
  assert.deepEqual(people.map(p => `${p.chamber}-${p.district}`), ["lower-54", "upper-14"]);
  const c = parseOpenStatesCommittees({ results: [{ id: "ocd-organization/1", name: "Public Education", parent_id: "ocd-organization/tx-lower", memberships: [{ person_name: "Brad Buckley", role: "Chair", person: { id: "ocd-person/a" } }] }] });
  assert.equal(c[0].chamber, "lower"); assert.equal(c[0].members[0].role, "Chair");
  const e = parseOpenStatesEvents({ results: [{ id: "ocd-event/1", name: "Public Education hearing", start_date: "2027-02-03T08:00:00-06:00", location: { name: "E2.036" },
    agenda: [{ related_entities: [{ entity_type: "bill", name: "HB 2", bill: { identifier: "HB 2" } }, { entity_type: "bill", name: "HB  2" }] }], sources: [{ url: "https://capitol.texas.gov/x" }] }] });
  assert.deepEqual(e[0].bills, ["HB 2"]); assert.equal(e[0].location, "E2.036");
});

test("LegiScan fallback master list and status codes", () => {
  const m = parseLegiscanMasterList({ status: "OK", masterlist: { session: { session_id: 2100 }, "0": { number: "HB2", title: "Relating to public school finance.", last_action_date: "2025-06-04", last_action: "Effective on 9/1/25", status: 4, url: "https://legiscan.com/TX/bill/HB2/2025" } } });
  assert.equal(m.length, 1); assert.equal(m[0].number, "HB 2"); assert.equal(legiscanStage(m[0].status), "law");
  assert.equal(legiscanStage(2), "passed_first"); assert.equal(legiscanStage(null), "filed");
});

test("session detection: the 90th Legislature convenes 12 Jan 2027", () => {
  assert.equal(currentTxSession("2026-11-16").inSession, false);
  assert.equal(currentTxSession("2026-11-16").session.id, "892");
  assert.equal(currentTxSession("2027-01-12").session.id, "90");
  assert.equal(currentTxSession("2027-01-12").inSession, true);
  assert.equal(currentTxSession("2027-06-15").inSession, false);
});
