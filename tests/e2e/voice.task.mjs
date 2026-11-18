/**
 * Constituent voice on a phone (owner, 18 Nov 2026; docs/CONSTITUENT_VOICE.md):
 *   - the promise on the bill page, Support / Oppose / Unsure, and totals after an answer;
 *   - the same voting box on a Texas bill;
 *   - a reader outside Texas sees who can weigh in on a Texas bill, and no buttons.
 * The Texas bills are the labelled test bills from texas.task.mjs (ids starting "e2e-"), removed when each task ends.
 */
import { cleanupTexas, seedTexas } from "./texas.task.mjs";

const SENATE_BILL = "e2e-tx-90-sb9001";
const CARD_BILL = 'section.personal .flow-cards .flow-card:not(.flow-placeholder) a[href^="/bills/"]';
const OLD_PROMISE = /Only you see this\. It is|never shown to anyone else or added up into a poll/;

const withTexas = run => async t => {
  if (!(await seedTexas())) t.blocked("The local database has no Texas member for Senate district 14 or House district 49.");
  try { return await run(t); } finally { await cleanupTexas().catch(() => {}); }
};

export const tasks = [
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
      return "the promise; Unsure saved; totals for the nation, Texas and TX-37, each saying there are not enough voters yet; “Not a scientific poll.”";
    } },

  { id: "voice-texas", name: "Vote on a Texas bill: the same box, with totals for Texas and my state districts", target: { taps: 2, seconds: 30 }, reader: "new",
    run: withTexas(async t => {
      await t.start();
      await t.type("input[name=zip]", "78701"); await t.type("input[name=street]", "1100 Congress Ave");
      await t.tap(".place-form button[type=submit]", "Show my legislators");
      await t.page.locator(".flow-cards .flow-card, .place-form [role=alert]").first().waitFor({ timeout: 30_000 });
      await t.page.goto(`/texas/bills/${SENATE_BILL}`, { waitUntil: "load" });
      await t.see("#your-view", "the voting box on a Texas bill");
      if (!(await t.text("#your-view")).includes("Your individual vote is private. Counted votes are added into anonymous totals.")) t.fail("The promise is not on the Texas bill page.");
      await t.tap('#your-view button[name="stance"][value="support"]', "Support");
      await t.see('#your-view button[name="stance"][value="support"][aria-pressed="true"]', "Support shown as chosen");
      const totals = await t.text("#totals");
      for (const want of ["Not a scientific poll.", "Texas", "State senate district 14", "State house district 49"]) if (!totals.includes(want)) t.fail(`The Texas totals do not say “${want}”: “${totals.slice(0, 300)}”`);
      if (totals.includes("The nation")) t.fail("A Texas bill shows a national total.");
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
