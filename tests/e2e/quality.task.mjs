/**
 * Quality checks that are not in the master plan's task list but belong to the
 * same bar: the one-question feedback prompt (third active day, not before, can
 * be dismissed, stores the answer) and "Something wrong? Tell us" on every page.
 */
import { PHONE, PHONE_UA } from "./lib/browser.mjs";
import { query } from "./seed.mjs";

const yesterday = () => new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
const PROMPT = "form.feedback-prompt";
const inviteRow = async id => (await query("select active_days, last_active_day from beta_invites where id = ?", [id]))[0];

export const tasks = [
  { id: "fb-2", name: "Feedback prompt: not asked on the second day", target: { taps: null, seconds: 30 }, reader: "new", invite: { activeDays: 1, lastActiveDay: yesterday() },
    async run(t) {
      await t.start();
      const s = t.tools.sample;
      // Several pages, some of which work out who the reader is more than once at the same moment.
      for (const p of [`/bills/${s.bill}`, `/politicians/${s.member}`, `/share/card?t=vote&member=${s.member}&roll=${s.roll}`, "/issues", "/"]) {
        await t.page.goto(p, { waitUntil: "load" });
        if (await t.has(PROMPT)) t.fail(`The feedback question was asked on the reader's second day (on ${p}).`);
      }
      const row = await inviteRow(t.tools.invite.id);
      if (Number(row.active_days) !== 2) t.fail(`One day's visits were counted as ${Number(row.active_days) - 1} days (the invite now says ${row.active_days} active days, expected 2).`);
      return "second day: not asked; the day was counted once";
    } },

  { id: "fb-3", name: "Feedback prompt: asked on the third day, answer stored", target: { taps: 1, seconds: 30 }, reader: "new", invite: { activeDays: 2, lastActiveDay: yesterday() },
    async run(t) {
      const before = Number((await query("select count(*) as n from reader_feedback"))[0].n);
      await t.start();
      await t.see(PROMPT, "the one-question prompt on the third day");
      if ((await t.page.locator(`${PROMPT} textarea`).count()) !== 1) t.fail("The prompt does not ask exactly one question.");
      const answer = `e2e ${Date.now().toString(36)}: show me the next vote before it happens`;
      await t.type("#fb-answer", answer);
      await t.tap(`${PROMPT} button:has-text("Send")`);
      await t.page.waitForLoadState("load");
      await t.page.goto("/issues", { waitUntil: "load" });
      if (await t.has(PROMPT)) t.fail("The prompt came back after the reader answered it.");
      const rows = await query("select answer, audience from reader_feedback order by created_at desc limit 1");
      const after = Number((await query("select count(*) as n from reader_feedback"))[0].n);
      if (after !== before + 1 || rows[0]?.answer !== answer) t.fail("The answer was not stored.");
      await query("delete from reader_feedback where answer = ?", [answer]);
      return `asked once on day 3, answer stored (audience “${rows[0].audience}”, no invite or page kept), not asked again`;
    } },

  { id: "fb-no", name: "Feedback prompt: “Not now” ends it", target: { taps: 1, seconds: 30 }, reader: "new", invite: { activeDays: 2, lastActiveDay: yesterday() },
    async run(t) {
      const before = Number((await query("select count(*) as n from reader_feedback"))[0].n);
      await t.start();
      await t.see(PROMPT, "the one-question prompt on the third day");
      await t.tap(`${PROMPT} button:has-text("Not now")`);
      await t.page.waitForLoadState("load");
      await t.page.goto("/", { waitUntil: "load" });
      if (await t.has(PROMPT)) t.fail("The prompt came back after “Not now”.");
      if (Number((await query("select count(*) as n from reader_feedback"))[0].n) !== before) t.fail("Dismissing the prompt stored an answer.");
      return "dismissed, nothing stored, not asked again";
    } },

  { id: "wrong", name: "Something wrong? Tell us (from any page)", target: { taps: 2, seconds: 30 }, reader: "onboarded",
    async run(t) {
      const bill = t.tools.sample.bill, page = `/bills/${bill}`;
      const open = async () => Number((await query("select count(*) as n from problem_reports where page = ? and subject_kind = 'page' and status = 'open'", [page]))[0].n);
      const before = await open();
      await t.start(page);
      await t.tap('p.something-wrong a');
      await t.see('form.verify-form input[name="reason"]', "the report form");
      const note = `e2e ${Date.now().toString(36)}`;
      await t.type('textarea[name="details"]', note);
      await t.tap('form.verify-form button:has-text("Send report")');
      await t.see('[role="status"]:has-text("Thank you")', "a thank-you after sending");
      if ((await open()) !== before + 1) t.fail(`The report did not reach the queue with the page it was about (${page}).`);
      // The same without JavaScript: the link and the form are plain HTML.
      const browser = t.context.browser(), plain = await browser.newContext({ viewport: PHONE, userAgent: PHONE_UA, javaScriptEnabled: false, baseURL: t.base });
      try {
        await plain.addCookies((await t.context.cookies()).filter(c => c.name !== "or_dev"));
        const p = await plain.newPage();
        await p.goto("/texas", { waitUntil: "load" });
        await p.click('p.something-wrong a');
        await p.waitForURL(/\/report/);
        await p.check('input[name="reason"][value="broken"]');
        await p.click('form.verify-form button:has-text("Send report")');
        await p.waitForURL(/reported=ok/);
        if (!(await p.locator('[role="status"]:has-text("Thank you")').count())) t.fail("Without JavaScript the report was not confirmed.");
        const n = Number((await query("select count(*) as n from problem_reports where page = '/texas' and reason = 'broken' and subject_kind = 'page' and created_at > ?", [Date.now() - 60_000]))[0].n);
        if (n < 1) t.fail("Without JavaScript the report did not reach the queue.");
      } finally { await plain.close(); }
      await query("delete from problem_reports where subject_kind = 'page' and (details = ? or (page = '/texas' and reason = 'broken' and created_at > ?))", [note, Date.now() - 120_000]);
      return "report filed with the page it was about; also works with JavaScript off";
    } },
];
