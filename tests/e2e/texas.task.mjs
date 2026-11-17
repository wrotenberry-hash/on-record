/**
 * Texas on a phone (owner, 17 Nov 2026, points 2 and 4): find my state senator and state representative from a
 * street address; see how my state senator voted on a bill with a record vote; a bill decided by voice vote shows
 * the label and no member's position.
 *
 * The local database copy has no Texas record vote in the Senate and no voice vote, so each task adds two labelled
 * test bills (ids starting "e2e-", titles saying "test") before it runs and removes them when it ends;
 * `cleanupTexas()` here, and the same deletes in seed.mjs cleanup(), remove any left by a run that was cut short. The members are
 * the ones already in the local copy (Senate district 14, House district 49), which the Census stand-in returns for
 * 1100 Congress Ave, Austin.
 */
import { execute, query, retry } from "./seed.mjs";

const SENATE_BILL = "e2e-tx-90-sb9001", VOICE_BILL = "e2e-tx-90-hb9002", VOTE = "e2e-vote-sb9001";
const tlo = b => `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=90R&Bill=${b}`;

/** Removes every Texas test row (ids starting "e2e-"). Safe to run any time. */
export async function cleanupTexas() {
  const tables = (await query("select name from sqlite_master where type = 'table'")).map(r => r.name);
  if (!tables.includes("tx_bills")) return;
  await retry(() => execute("delete from tx_member_votes where vote_id like 'e2e-%'"));
  await retry(() => execute("delete from tx_votes where id like 'e2e-%' or bill_id like 'e2e-%'"));
  for (const t of ["tx_bill_actions", "tx_bill_sponsors", "tx_bill_versions"]) await retry(() => execute(`delete from ${t} where bill_id like 'e2e-%'`));
  await retry(() => execute("delete from tx_bills where id like 'e2e-%'"));
}

async function person(chamber, district) {
  return (await query("select id, name from tx_people where chamber = ? and district = ? and is_current = 1", [chamber, district]))[0] ?? null;
}

/** Two test bills: a Senate bill with a record vote that lists the reader's state senator, and a House bill passed by voice vote. */
export async function seedTexas() {
  await cleanupTexas();
  const senator = await person("upper", "14"), other = (await query("select id, name from tx_people where chamber = 'upper' and district <> '14' and is_current = 1 limit 1"))[0];
  const rep = await person("lower", "49");
  if (!senator || !rep) return null;
  const now = Date.now(), day = n => new Date(now - n * 86400e3).toISOString().slice(0, 10);
  const bill = (id, ident, title, chamber, stage, last) => retry(() => execute(`insert into tx_bills (id, openstates_id, session, identifier, title, chamber, classification, subjects, stage, first_action_date, latest_action_date,
    latest_action_description, tlo_url, openstates_url, feed, source_url, retrieved_at) values (?, null, '90', ?, ?, ?, '["bill"]', '[]', ?, ?, ?, ?, ?, null, 'openstates', ?, ?)`,
    [id, ident, title, chamber, stage, day(6), day(2), last, tlo(ident.replace(" ", "")), tlo(ident.replace(" ", "")), now]));
  const act = (billId, seq, d, chamber, description, cls) => retry(() => execute("insert into tx_bill_actions (bill_id, seq, date, description, chamber, classification) values (?, ?, ?, ?, ?, ?)",
    [billId, seq, d, description, chamber, JSON.stringify(cls)]));
  await bill(SENATE_BILL, "SB 9001", "Relating to a test bill with a record vote (test data).", "upper", "passed_first", "Passed");
  for (const [i, d, desc, cls] of [[1, day(6), "Filed", ["filing"]], [2, day(5), "Referred to Education K-16", ["referral-committee"]], [3, day(4), "Reported favorably w/o amendment(s)", ["committee-passage"]],
    [4, day(2), "Read 2nd time & passed to engrossment", ["reading-2"]], [5, day(2), "Record vote", []]]) await act(SENATE_BILL, i, d, "upper", desc, cls);
  await retry(() => execute("insert into tx_votes (id, bill_id, motion, date, result, chamber, counts, tally_ok, retrieved_at) values (?, ?, 'Passed to engrossment', ?, 'pass', 'upper', ?, 1, ?)",
    [VOTE, SENATE_BILL, day(2), JSON.stringify(other ? { yes: 1, no: 1 } : { yes: 1 }), now]));
  await retry(() => execute("insert into tx_member_votes (vote_id, person_id, name, option) values (?, ?, ?, 'yes')", [VOTE, senator.id, senator.name]));
  if (other) await retry(() => execute("insert into tx_member_votes (vote_id, person_id, name, option) values (?, ?, ?, 'no')", [VOTE, other.id, other.name]));
  await bill(VOICE_BILL, "HB 9002", "Relating to a test bill passed by voice vote (test data).", "lower", "passed_first", "Passed to engrossment by viva voce vote");
  for (const [i, desc, cls] of [[1, "Filed", ["filing"]], [2, "Amended", ["amendment-passage"]], [3, "Nonrecord vote recorded in Journal", []], [4, "Passed to engrossment by viva voce vote", ["passage"]]])
    await act(VOICE_BILL, i, i === 1 ? day(6) : day(1), "lower", desc, cls);
  await retry(() => execute("insert into tx_bill_sponsors (bill_id, name, person_id, \"primary\") values (?, ?, ?, 1)", [VOICE_BILL, rep.name, rep.id]));
  return { senator, rep };
}

/** Gives ZIP 78701 and the Capitol's street address on the home page, as a reader would. */
async function lookUp(t) {
  await t.start();
  await t.type("input[name=zip]", "78701");
  await t.type("input[name=street]", "1100 Congress Ave");
  await t.tap(".place-form button[type=submit]", "Show my legislators");
  await t.page.locator(".flow-cards .flow-card, .place-form [role=alert]").first().waitFor({ timeout: 30_000 });
  const alert = await t.text(".place-form [role=alert]").catch(() => "");
  if (/did not answer/.test(alert)) t.blocked("The Census geocoder did not answer: run without --base (the runner's local stand-in answers it) or point the server's CENSUS_GEOCODER_BASE at a stand-in.", "needs keys");
}

const withTexas = run => async t => {
  const who = await seedTexas();
  if (!who) t.blocked("The local database has no Texas member for Senate district 14 or House district 49.");
  try { return await run(t, who); } finally { await cleanupTexas().catch(() => {}); }
};

export const tasks = [
  { id: "tx-find", name: "Texas: find my state senator and state representative from a street address", target: { taps: 1, seconds: 30 }, reader: "new",
    run: withTexas(async (t, who) => {
      await lookUp(t);
      const names = (await t.page.locator(".flow-cards .flow-card:not(.flow-placeholder) .flow-name").allInnerTexts()).map(s => s.trim());
      const seats = await t.page.locator(".flow-cards .flow-card .flow-seat").allInnerTexts();
      const fed = seats.filter(s => /^U\.S\. Senator/.test(s)).length, rep = seats.filter(s => /^U\.S\. Representative/.test(s)).length;
      if (!names.includes(who.senator.name) || !names.includes(who.rep.name)) t.fail(`Expected ${who.senator.name} and ${who.rep.name} among the cards, found: ${names.join(", ")}`);
      if (fed !== 2 || rep !== 1) t.fail(`Expected two U.S. senators and one U.S. representative beside them, found ${fed} and ${rep}.`);
      const card = t.page.locator(".flow-card", { hasText: who.senator.name });
      const line = (await card.locator(".flow-line").innerText()).trim();
      if (!/^Voted Yes/.test(line)) t.fail(`The state senator's card should show the record vote on SB 9001, it says: “${line}”`);
      const repLine = (await t.page.locator(".flow-card", { hasText: who.rep.name }).locator(".flow-line").innerText()).trim();
      if (/viva voce|voice/i.test(repLine) || /9002/.test(await t.page.locator(".flow-card", { hasText: who.rep.name }).innerText())) t.fail(`The representative's card used the voice vote: “${repLine}”`);
      return `five cards: ${names.join(", ")}; state senator's line: “${line}”; representative: “${repLine}”`;
    }) },

  { id: "tx-senator-vote", name: "Texas: see how my state senator voted on a bill with a record vote", target: { taps: 3, seconds: 30 }, reader: "new",
    run: withTexas(async (t, who) => {
      await lookUp(t);
      await t.tap(t.page.locator(".flow-card", { hasText: who.senator.name }).locator("a", { hasText: "SB 9001" }), "SB 9001");
      await t.see("#decisions", "the bill's decisions");
      const row = t.page.locator('#decisions li[data-decision="recorded"]').first();
      const label = await row.locator(".tx-vote-label").innerText();
      if (!/^Record vote: 1 yes/.test(label)) t.fail(`The record vote's label reads “${label}”`);
      if (!(await t.has('#decisions a:has-text("Official record: Texas Legislature Online")'))) t.fail("No “Official record: Texas Legislature Online” link on the decisions.");
      await t.tap(row.locator('a:has-text("See how each member voted")'), "See how each member voted");
      const list = t.page.locator(".tx-member-list").first();
      await list.waitFor({ state: "visible" });
      if (!(await list.evaluate(el => el.open))) await list.locator("summary").click();
      const yes = await list.locator("p", { hasText: "Yes (" }).innerText();
      if (!yes.includes(who.senator.name)) t.fail(`${who.senator.name} is not listed under Yes: “${yes}”`);
      return `SB 9001: “${label}”; ${who.senator.name} listed under Yes`;
    }) },

  { id: "tx-voice", name: "Texas: a bill decided by voice vote shows the label and no member position", target: { taps: null, seconds: 30 }, reader: "new",
    run: withTexas(async (t, who) => {
      await t.start(`/texas/bills/${VOICE_BILL}`);
      await t.see("#decisions", "the bill's decisions");
      const voice = t.page.locator('li[data-decision="voice"]').first();
      await voice.waitFor({ state: "visible" });
      const label = (await voice.locator(".tx-vote-label").innerText()).trim();
      if (label !== "Voice vote: members' individual votes were not recorded") t.fail(`The voice vote's label reads “${label}”`);
      if (!(await voice.innerText()).includes("What this means: In a voice vote")) t.fail("The words “voice vote” are not explained on first use.");
      if (await t.has("#how-each-member-voted")) t.fail("A member list is shown for a bill with no record vote.");
      if (await t.has('a:has-text("See how each member voted")')) t.fail("“See how each member voted” is offered for a voice vote.");
      // The member page shows the decision and the label, never a position.
      await t.page.goto(`/texas/members/${encodeURIComponent(who.rep.id)}`, { waitUntil: "load" });
      await t.landed("member page");
      const mine = t.page.locator('li[data-member-show]', { hasText: "HB 9002" });
      if (!(await mine.count())) t.fail("The member page does not list the voice-vote decision on HB 9002.");
      for (const text of await mine.allInnerTexts()) if (/\bVoted (yes|no)\b|Listed as|Not listed in this vote/i.test(text)) t.fail(`The member page shows a position for an unrecorded decision: “${text.replace(/\s+/g, " ")}”`);
      const lines = await mine.locator(".vote-position").allInnerTexts();
      return `bill label: “${label}”; member page: ${lines.map(l => `“${l}”`).join(", ")}`;
    }) },
];
