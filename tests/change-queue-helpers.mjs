// One made-up bill with two stored versions and one drafted menu of two groups, for tests/change-queue.test.mjs and
// scripts/seed-change-menu.mjs. Nothing here is a real bill. The text is laid out the way a published bill is, with
// line breaks in the middle of sentences, so a quote copied on one line still has to be found.
export const BILL = "119-hr-9100", MENU = "menu-119-hr-9100-rh", NOW = Date.UTC(2026, 10, 20, 15);
const SRC = "https://www.govinfo.gov/content/pkg/BILLS-119hr9100", GOT = { sourceUrl: "https://example.test/", retrievedAt: NOW };

export const SECTIONS = [
  { version: "ih", versionLabel: "Introduced in House", versionDate: "2026-09-14", seq: 1, num: "1", heading: "Short title", body: "This Act may be cited as the ``Rural Clinics Act''." },
  { version: "ih", versionLabel: "Introduced in House", versionDate: "2026-09-14", seq: 2, num: "3", heading: "Authorization of appropriations",
    body: "    (a) In General.--There is authorized to be appropriated to the\nSecretary $50,000,000 for each of fiscal years 2027 through\n2031 to carry out this Act.\n    (b) Availability.--Amounts appropriated under subsection (a)\nshall remain available until September 30, 2032." },
  { version: "ih", versionLabel: "Introduced in House", versionDate: "2026-09-14", seq: 3, num: "4", heading: "Eligible clinics",
    body: "    In this Act, the term ``eligible clinic'' means a clinic that\nserves a county with fewer than 25,000\nresidents." },
  { version: "rh", versionLabel: "Reported in House", versionDate: "2026-11-05", seq: 1, num: "1", heading: "Short title", body: "This Act may be cited as the ``Rural Clinics Act''." },
  { version: "rh", versionLabel: "Reported in House", versionDate: "2026-11-05", seq: 2, num: "3", heading: "Authorization of appropriations",
    body: "    (a) In General.--There is authorized to be appropriated to the\nSecretary $40,000,000 for each of fiscal years 2027 through\n2031 to carry out this Act.\n    (b) Availability.--Amounts appropriated under subsection (a)\nshall remain available until September 30, 2032." },
  { version: "rh", versionLabel: "Reported in House", versionDate: "2026-11-05", seq: 3, num: "4", heading: "Eligible clinics",
    body: "    In this Act, the term ``eligible clinic'' means a clinic that\nserves a county with fewer than 50,000\nresidents." },
];

const PASSED = { passed: true, failures: [], reader: "passed" };
const AMOUNT = { source: "dial", sourceRef: "rh:3:amount:1", sourceLabel: "Section 3 of the bill as reported in the House", sectionVersion: "rh", sectionNum: "3",
  quote: "$40,000,000 for each of fiscal years 2027 through 2031", otherQuote: null, groupKey: "dial:rh:3:1", kind: "amount", about: "the yearly amount the program may receive" };
const COUNTIES = { source: "version", sourceRef: "ih..rh", sourceLabel: "Introduced in House compared with Reported in House", sectionVersion: "rh", sectionNum: "4",
  quote: "serves a county with fewer than 50,000 residents", otherQuote: "serves a county with fewer than 25,000 residents", groupKey: "version:4:1", kind: "difference", about: "which counties a clinic must serve" };

/** The options in the order they were drafted (`seq`), which is not the order they are shown in. */
export const OPTIONS = [
  { id: "opt-keep", seq: 1, ...AMOUNT, direction: "keep", wording: "Keep the yearly amount at $40 million, as the bill is written." },
  { id: "opt-up", seq: 2, ...AMOUNT, direction: "up", wording: "Raise the yearly amount above $40 million." },
  { id: "opt-down", seq: 3, ...AMOUNT, direction: "down", wording: "Lower the yearly amount below $40 million." },
  { id: "opt-remove", seq: 4, ...AMOUNT, direction: "remove", wording: "Remove the yearly amount from the bill." },
  { id: "opt-other", seq: 5, ...COUNTIES, direction: "other_version", wording: "Go back to counties with fewer than 25,000 residents, as the bill was introduced." },
  { id: "opt-this", seq: 6, ...COUNTIES, direction: "this_version", wording: "Keep counties with fewer than 50,000 residents, as the committee reported the bill." },
].map(o => ({ ...o, checks: PASSED, status: "draft", editorNote: null }));

/** Inserts the bill, its stored text and the drafted menu. `schema` is ../db/schema.ts, passed in so this file imports nothing. */
export async function seedMenu(db, schema, { now = NOW } = {}) {
  await db.insert(schema.officialBills).values({ id: BILL, congress: 119, billType: "hr", number: 9100, title: "A bill to support clinics in rural counties.",
    congressUrl: "https://www.congress.gov/bill/119th-congress/house-bill/9100", ...GOT });
  await db.insert(schema.billTextSections).values(SECTIONS.map(s => ({ ...s, billKey: BILL, system: "federal", sourceUrl: `${SRC}${s.version}/html/BILLS-119hr9100${s.version}.htm`, retrievedAt: now })));
  await db.insert(schema.changeMenus).values({ id: MENU, billKey: BILL, system: "federal", version: "rh", status: "review", generator: "m1-2026-11-20", model: "test-model", costUsd: 0.17,
    notes: ["No amendment to this bill is on the official record, so none is offered.", "The date in section 3 was left out: the check could not find it inside the quoted words."],
    windowAtDraft: "In committee: the House Committee on Energy and Commerce has it.", createdAt: now });
  await db.insert(schema.changeOptions).values(OPTIONS.map(o => ({ ...o, menuId: MENU, billKey: BILL, createdAt: now })));
  return { billKey: BILL, menuId: MENU };
}
