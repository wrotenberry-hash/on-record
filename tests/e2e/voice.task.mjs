/**
 * Constituent voice on a phone (owner, 18 Nov 2026; docs/CONSTITUENT_VOICE.md):
 *   - the promise on the bill page, Support / Oppose / Unsure, and totals after an answer;
 *   - the same voting box on a Texas bill;
 *   - a reader outside Texas sees who can weigh in on a Texas bill, and no buttons.
 * The Texas bills are the labelled test bills from texas.task.mjs (ids starting "e2e-"), removed when each task ends.
 */
import { cleanupTexas, seedTexas } from "./texas.task.mjs";
import { appUserForInvite, execute, query } from "./seed.mjs";

const SENATE_BILL = "e2e-tx-90-sb9001";
const CARD_BILL = 'section.personal .flow-cards .flow-card:not(.flow-placeholder) a[href^="/bills/"]';
const OLD_PROMISE = /Only you see this\. It is|never shown to anyone else or added up into a poll/;

const withTexas = run => async t => {
  if (!(await seedTexas())) t.blocked("The local database has no Texas member for Senate district 14 or House district 49.");
  try { return await run(t); } finally { await cleanupTexas().catch(() => {}); }
};

/** An answer given under the old promise (the old table), for the reader of this invite. */
async function earlierAnswer(t) {
  const user = await appUserForInvite(t.tools.invite.id);
  const bill = (await query("select id from official_bills order by latest_action_at desc limit 1"))[0]?.id;
  if (!user || !bill) return null;
  await execute("delete from voice_legacy_choices where user_id = ?", [user]);
  await execute("insert or replace into opinion_user_votes (user_id, bill_id, stance, updated_at) values (?, ?, 'support', ?)", [user, bill, Date.now() - 5 * 86400e3]);
  return bill;
}

export const tasks = [
  { id: "voice-earlier", name: "A returning reader is asked once whether to count the answers they gave before", target: { taps: 1, seconds: 30 }, reader: "onboarded",
    async run(t) {
      const bill = await earlierAnswer(t);
      if (!bill) t.blocked("No reader or bill in the local database to give an earlier answer.");
      await t.start();
      await t.see("#earlier-answers", "the question about earlier answers, on the first page they open");
      const ask = await t.text("#earlier-answers");
      if (!/You answered 1 bill before answers were added into totals\. Those answers were private, and still are\./.test(ask)) t.fail(`The question reads: “${ask.slice(0, 240)}”`);
      await t.tap('#earlier-answers button[value="private"]', "No, keep them private");
      await t.page.waitForLoadState("load");
      if (await t.has("#earlier-answers")) t.fail("The question is asked again after it was answered.");
      const row = (await query("select counts from voice_votes where user_id = ? and bill_key = ?", [await appUserForInvite(t.tools.invite.id), bill]))[0];
      if (Number(row?.counts) !== 0) t.fail(`The earlier answer should stay uncounted; its marker is ${row?.counts}.`);
      await t.page.goto(`/bills/${bill}`, { waitUntil: "load" });
      if (!(await t.has('#your-view button[name="stance"][value="support"][aria-pressed="true"]'))) t.fail("The earlier answer is no longer shown to the reader as theirs.");
      return "asked once on the home page; “keep them private” leaves the answer uncounted, still shown to the reader, and the question does not come back";
    } },

  { id: "voice-vote", name: "Vote Unsure on a bill, see the promise, and see the totals for my nation, state and district", target: { taps: 2, seconds: 30 }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(CARD_BILL, "the bill my senator last voted on");
      await t.see("#your-view", "the voting box");
      const box = await t.text("#your-view");
      if (!box.includes("Your individual vote is private. Counted votes are added into anonymous totals.")) t.fail(`The promise is not on the bill page: “${box.slice(0, 200)}”`);
      if (OLD_PROMISE.test(await t.text("main"))) t.fail("The bill page still makes the old promise.");
      if (await t.has("#totals .voice-totals")) t.fail("Totals are shown before the reader has answered.");
      await t.tap('#your-view button[name="stance"][value="unsure"]', "Unsure");
      await t.see('#your-view button[name="stance"][value="unsure"][aria-pressed="true"]', "Unsure shown as chosen");
      await t.see("#totals .voice-totals", "the totals, after answering");
      const totals = await t.text("#totals");
      for (const want of ["Not a scientific poll.", "The nation (the states and DC)", "Texas", "Your district: Congressional district TX-37", "Not enough constituents yet — share this bill."])
        if (!totals.includes(want)) t.fail(`The totals do not say “${want}”: “${totals.slice(0, 300)}”`);
      if (/verified readers|Real people/i.test(totals)) t.fail("The totals use the old names for who is counted.");
      // Each legislator's actual vote, with their own district's total beside it.
      const beside = await t.page.locator(".vote-row .district-total").allInnerTexts();
      if (!beside.length) t.fail("No district total is shown beside a legislator's vote.");
      if (!beside.every(b => /Residents of [A-Z]{2}(-\d{2}|-AL)?[:,]/.test(b) && b.includes("Not a scientific poll."))) t.fail(`A total beside a vote is not labelled: “${beside[0]}”`);
      return "the promise; Unsure saved; each legislator's vote with their district's total beside it; totals for the nation, Texas and TX-37, each saying there are not enough voters yet; “Not a scientific poll.”";
    } },

  { id: "voice-texas", name: "Vote on a Texas bill: the same box, with totals for Texas and my state districts", target: { taps: 2, seconds: 30 }, reader: "new",
    run: withTexas(async t => {
      await t.start();
      await t.type("input[name=zip]", "78701"); await t.type("input[name=street]", "1100 Congress Ave");
      await t.tap(".place-form button[type=submit]", "Check address");
      await t.tap(".place-confirm button[name=confirm]", "Yes, show my legislators"); // 21 Nov 2026: the matched address is confirmed first
      await t.page.locator(".flow-cards .flow-card, .place-form [role=alert]").first().waitFor({ timeout: 30_000 });
      await t.page.goto(`/texas/bills/${SENATE_BILL}`, { waitUntil: "load" });
      await t.see("#your-view", "the voting box on a Texas bill");
      if (!(await t.text("#your-view")).includes("Your individual vote is private. Counted votes are added into anonymous totals.")) t.fail("The promise is not on the Texas bill page.");
      await t.tap('#your-view button[name="stance"][value="support"]', "Support");
      await t.see('#your-view button[name="stance"][value="support"][aria-pressed="true"]', "Support shown as chosen");
      const totals = await t.text("#totals");
      for (const want of ["Not a scientific poll.", "Texas", "State senate district 14", "State house district 49"]) if (!totals.includes(want)) t.fail(`The Texas totals do not say “${want}”: “${totals.slice(0, 300)}”`);
      if (totals.includes("The nation")) t.fail("A Texas bill shows a national total.");
      const mine = await t.text("#your-legislators");
      if (!/Voted Yes on/.test(mine) || !mine.includes("Residents of TX-SD-14: Not enough constituents yet — share this bill.")) t.fail(`The state senator's vote is not shown beside the district's total: “${mine.slice(0, 240)}”`);
      return "Support saved on a Texas bill; totals for Texas, state senate district 14 and state house district 49; no national total";
    }) },

  { id: "voice-outside", name: "A reader outside Texas opens a Texas bill: who can weigh in, the totals, and no vote buttons", target: { taps: 1, seconds: 30 }, reader: "new",
    run: withTexas(async t => {
      await t.start();
      await t.type("input[name=zip]", "74074"); // Stillwater, Oklahoma
      await t.tap(".place-form button[type=submit]", "Show my legislators");
      await t.page.locator(".flow-cards .flow-card, .place-form [role=alert], .place-form select").first().waitFor({ timeout: 30_000 });
      await t.page.goto(`/texas/bills/${SENATE_BILL}`, { waitUntil: "load" });
      await t.see("#your-view", "the box where the vote would be");
      const box = await t.text("#your-view");
      if (!box.includes("People who live in Texas can weigh in on this bill. You can still read it and see the totals.")) t.fail(`The page does not say who can weigh in: “${box.slice(0, 240)}”`);
      if (await t.has('#your-view button[name="stance"]')) t.fail("Vote buttons are shown to a reader outside Texas.");
      await t.see("#totals .voice-totals", "the totals, which anyone can see");
      if (!(await t.has("#decisions"))) t.fail("The rest of the bill is not readable.");
      return "an Oklahoma reader sees “People who live in Texas can weigh in on this bill”, no vote buttons, the totals and the rest of the bill";
    }) },
];
