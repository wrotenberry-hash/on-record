/**
 * The usability tasks from docs/USABILITY_TASKS.md (Round E of the master
 * plan), as a first-time trial reader on a phone. Each starts on the home page.
 * Targets: at most 3 taps, at most 2 for the core tasks (1–3); task 15 has a
 * time target of 90 seconds. Every task also has a scripted time budget of 30
 * seconds: a script does not stop to read, so a longer run means slow pages.
 *
 * The task contract is in tests/e2e/README.md.
 */
import { STANDIN_SMS_CODE } from "./lib/standins.mjs";

const SECONDS = 30;
const menu = label => `nav.mobile-nav a:text-is("${label}")`;
const CARD = "section.personal .flow-cards .flow-card:not(.flow-placeholder)";
const MY_SENATOR = `${CARD} a.flow-name`;
const CARD_BILL = `${CARD} a[href^="/bills/"]`;

export const tasks = [
  { id: "1", name: "Find my legislators", target: { taps: 2, seconds: SECONDS }, reader: "new",
    async run(t) {
      // A first-time reader starts at the invite link, which opens the welcome screen.
      await t.start(`/trial/${t.tools.invite.token}`);
      await t.tap('main a[href="/"]:has-text("find my legislators")', "Start: find my legislators");
      await t.type(".place-form input[name=zip]", "78701");
      await t.tap(".place-form button[type=submit]", "Show my legislators");
      await t.see(".flow-cards .flow-card a.flow-name", "the reader's legislators, as links");
      const n = await t.page.locator(".flow-cards .flow-card:not(.flow-placeholder) .flow-name").count();
      if (n < 3) t.fail(`Only ${n} legislators shown for ZIP 78701; expected two senators and a representative.`);
      return `${n} legislators shown after the ZIP, from the welcome screen (typing the ZIP is not a tap)`;
    } },

  { id: "2", name: "How my senator voted on the latest bill", target: { taps: 2, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.see(CARD, "the reader's legislators on the home page");
      const row = t.page.locator(CARD).first();
      const line = (await row.locator(".flow-line").first().innerText()).replace(/\s+/g, " ");
      if (!/voted (yes|no|present)|did not vote/i.test(line)) t.fail(`The first legislator's card does not say how they voted: “${line.slice(0, 120)}”`);
      if (!(await row.locator('a[href^="/bills/"]').count())) t.fail("The vote is not linked to its bill.");
      return "on the home page, no taps";
    } },

  { id: "3", name: "Understand what a bill does", target: { taps: 2, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(CARD_BILL, "the bill my senator last voted on");
      await t.see("h1", "the bill page");
      if (!(await t.has('h2:has-text("What it does"), h2:has-text("In plain English"), h2:has-text("What would change")')))
        t.blocked("The bill page has no plain-language summary a reader may see. Readers get summaries only once the owner opens the gate (PUBLIC_MIN_PROMPT in lib/analysis/publish-gate.ts is null), so this cannot pass yet.");
      return "plain-language summary shown";
    } },

  { id: "4", name: "Follow an issue", target: { taps: 3, seconds: SECONDS }, reader: "onboarded", issues: [],
    async run(t) {
      await t.start();
      await t.tap(".flow-issues > summary", "Pick up to 3 issues");
      await t.tap('.flow-issues label.chip-check:has(input[value="taxes"])', "Taxes");
      await t.page.waitForFunction(() => /Taxes/.test(document.querySelector(".flow-issues > summary")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
      if (!/Taxes/.test(await t.text(".flow-issues > summary"))) t.fail("The picker does not name the issue after it was ticked.");
      await t.page.reload({ waitUntil: "load" });
      await t.see('section.personal h2:has-text("Moving on your issues")', "“Moving on your issues” on the home page after following");
      return "followed from the picker on the home page; kept after a reload";
    } },

  { id: "5", name: "Compare two members", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(MY_SENATOR, "my senator");
      await t.tap('a[href^="/compare?a="][href*="&b="]', "Compare with the other senator");
      await t.see("h1", "the comparison");
      const h1 = await t.text("h1");
      if (!/ and /.test(h1)) t.fail(`The comparison page does not name two members: “${h1}”`);
      await t.see('h2:has-text("Recent shared votes"), h2:has-text("By issue")', "how the two voted");
      return h1;
    } },

  { id: "6", name: "Find a bill by keyword", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(menu("Search"));
      await t.type('input[name="q"]', "hospital");
      await t.tap('main form button:has-text("Search")');
      await t.see('main a[href^="/bills/"]', "a bill in the results for “hospital”");
      return `${t.swipes ? "menu needed a swipe; " : ""}typing the words is not a tap`;
    } },

  { id: "7", name: "Turn on alerts", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(menu("Account"));
      const box = t.page.locator('input[name="instantVotes"]');
      await t.see(box, "the alert choices");
      if (await box.isChecked()) t.fail("Vote alerts were already on for a new reader.");
      await t.tap('label.consent:has(input[name="instantVotes"])', "When my legislators vote");
      await t.tap('button:has-text("Save alert choices")');
      await t.page.waitForLoadState("load");
      await t.page.reload({ waitUntil: "load" });
      if (!(await t.page.locator('input[name="instantVotes"]').isChecked())) t.fail("The alert choice was not kept after saving.");
      return t.swipes ? "Account is at the far end of the menu (1 swipe)" : "";
    } },

  { id: "8", name: "Texas Legislature this week", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(menu("Texas"));
      await t.see('h2:has-text("Moving this week")', "“Moving this week” on the Texas page");
      return t.swipes ? "Texas is off-screen in the menu (1 swipe)" : "";
    } },

  { id: "9", name: "What changed since my last visit", target: { taps: 3, seconds: SECONDS }, reader: "returning",
    async run(t) {
      await t.start();
      await t.see('section.since-panel h2:has-text("Since you last visited")', "“Since you last visited” on the first page of the visit");
      const items = await t.page.locator("section.since-panel li").count();
      const empty = await t.has("section.since-panel p.meta");
      if (!items && !empty) t.fail("The panel shows neither changes nor an empty-state line.");
      return items ? `${items} changes listed, no taps` : "panel shown with its empty-state line";
    } },

  { id: "10", name: "Bills that became law this Congress", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(menu("Dashboard"));
      await t.see('h2:has-text("The bill funnel")', "the bill funnel");
      const text = await t.text("main");
      if (!/became law/i.test(text)) t.fail("The dashboard does not say how many bills became law.");
      return t.swipes ? "Dashboard is off-screen in the menu (1 swipe)" : "";
    } },

  { id: "11", name: "Who controls the Texas Senate, who runs it", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(menu("Texas"));
      await t.see('h2:has-text("Who controls it and who runs it")', "“Who controls it and who runs it”");
      const text = await t.text("main");
      if (!/Texas Senate \(31 seats\)/.test(text)) t.fail("The Texas page does not show the Senate's seats by party.");
      if (!/Lieutenant Governor: .+presides over the Texas Senate/.test(text)) t.fail("The Texas page does not say who presides over the Senate.");
      return t.swipes ? "Texas is off-screen in the menu (1 swipe)" : "";
    } },

  { id: "12", name: "Committee that stalls the most bills", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(menu("Dashboard"));
      const section = t.page.locator('.fed-section:has(h2:has-text("Where bills stall")), section:has(h2:has-text("Where bills stall"))').last();
      await t.see('h2:has-text("Where bills stall")', "“Where bills stall”");
      const body = (await section.innerText().catch(() => "")).replace(/\s+/g, " ");
      if (!/committee/i.test(body)) t.fail(`“Where bills stall” does not name a committee or say why it cannot: “${body.slice(0, 140)}”`);
      return t.swipes ? "Dashboard is off-screen in the menu (1 swipe)" : "";
    } },

  { id: "13", name: "Say whether I support a bill", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      // One tap when a scheduled bill on the home page can be answered there; otherwise through the bill page.
      const here = t.page.locator('#coming-up .flow-bills > li button:text-is("Support")').first();
      if (await here.count()) {
        await t.tap(here, "Support (on the home page)");
        await t.see('#coming-up .flow-saved:has-text("Support")', "“Saved: Support” under the bill");
        await t.page.reload({ waitUntil: "load" });
        await t.see('#coming-up .flow-saved:has-text("Your answer: Support")', "the answer kept after a reload");
        return "one tap on the home page; answer saved and kept";
      }
      await t.tap(CARD_BILL, "the bill my senator last voted on");
      await t.tap('#your-view button[name="stance"][value="support"]', "Support");
      await t.see('#your-view button[name="stance"][value="support"][aria-pressed="true"]', "Support shown as chosen");
      await t.page.reload({ waitUntil: "load" });
      await t.see('#your-view button[name="stance"][value="support"][aria-pressed="true"]', "the answer kept after a reload");
      return "through the bill page (no scheduled bill on the home page could be answered there: their records are not loaded in the local copy); answer saved and kept";
    } },

  { id: "14", name: "My district vs my legislator", target: { taps: 3, seconds: SECONDS }, reader: "onboarded", needs: ["standins", "districtAnswers"],
    async run(t) {
      await t.start();
      await t.tap(MY_SENATOR, "my senator");
      await t.see('h2:has-text("What verified readers say")', "“What verified readers say” on the member page");
      const text = await t.text('.fed-section.sentiment');
      if (!/District-matched in [A-Z]{2}(-\d{2}|-AL)?: \d+ support · \d+ oppose/.test(text)) t.fail(`District totals are not shown beside the member's vote: “${text.slice(0, 160)}”`);
      return "district totals beside the member's vote (28 seeded test answers; real totals need the Turnstile and Twilio keys)";
    } },

  { id: "15", name: "Verify and cast a first counted vote", target: { taps: null, seconds: 90 }, reader: "account", needs: ["standins"],
    async run(t) {
      // Starts on the signed-in Account page, as in docs/USABILITY_TASKS.md (email sign-in is its own, earlier task).
      await t.start("/account");
      await t.see("#v-phone", "the phone step on the Account page");
      // A different made-up number each run: one phone may verify only one account.
      await t.type("#v-phone", `512 ${200 + Math.floor(Math.random() * 700)} ${String(1000 + Math.floor(Math.random() * 9000))}`);
      await t.tap('form.verify-form label.consent:has(input[name="consent"])', "consent to one text");
      await t.page.waitForFunction(() => !!document.querySelector('form.verify-form input[name="cf-turnstile-response"]')?.value, null, { timeout: 8000 }).catch(() => {});
      await t.tap('button:has-text("Text me a code")');
      await t.see("#v-code", "the code step");
      await t.type("#v-code", STANDIN_SMS_CODE);
      await t.tap('form.verify-form button:has-text("Confirm")');
      await t.see("#v-street", "the district step");
      await t.type("#v-street", "1100 Congress Ave"); await t.type("#v-city", "Austin"); await t.type("#v-state", "TX"); await t.type("#v-zip", "78701");
      await t.tap('button:has-text("Match my district")');
      await t.see('[role="status"]:has-text("District TX-37")', "the matched district");
      await t.tap(menu("This week"));
      await t.tap('main a[href^="/bills/"]', "a bill");
      await t.page.waitForFunction(() => { const f = document.querySelector('#your-view input[name="cf-turnstile-response"]'); return !f || !!f.value; }, null, { timeout: 8000 }).catch(() => {});
      await t.tap('#your-view button[name="stance"][value="support"]', "Support");
      await t.see('#your-view button[name="stance"][value="support"][aria-pressed="true"]', "Support shown as chosen");
      const note = await t.text("#your-view");
      if (!/count/i.test(note)) t.fail("The bill page does not say whether the answer counts.");
      return "local stand-ins for the text message, bot check and district lookup; by hand this needs the Turnstile and Twilio keys";
    } },

  { id: "16", name: "Share a vote card to Stories", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(MY_SENATOR, "my senator");
      await t.tap('a[href^="/share/card?t=vote"]', "Share (on the latest vote)");
      await t.see('.share-formats button[aria-checked="true"]:has-text("Story")', "Story as the default size");
      await t.tap('.share-actions button:text-is("Share")');
      const shared = await t.page.waitForFunction(() => window.__shared?.length ? window.__shared[0] : null, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => null);
      if (!shared) t.fail(`The share sheet was not opened. The page said: “${await t.text('.share-panel [role="status"]').catch(() => "nothing")}”`);
      if (!shared.files?.[0] || shared.files[0].type !== "image/png" || !/story/.test(shared.files[0].name)) t.fail("The share sheet did not get the Story image.");
      return `share sheet opened with ${shared.files[0].name} (the phone's share sheet is a local stand-in)`;
    } },

  { id: "17", name: "Share a bill carousel", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(CARD_BILL, "the bill my senator last voted on");
      if (!(await t.has('a[href^="/share/card?t=carousel"]')))
        t.blocked("The bill has no summary a reader may see, so there is no 5-slide explainer to share. Readers get summaries only once the owner opens the gate (PUBLIC_MIN_PROMPT is null).");
      await t.tap('a[href^="/share/card?t=carousel"]', "5-slide explainer");
      await t.see('.share-actions button:has-text("Share all 5 slides")', "the 5 slides and their share button");
      await t.tap('.share-actions button:has-text("Share all 5 slides")');
      const shared = await t.page.waitForFunction(() => window.__shared?.length ? window.__shared[0] : null, null, { timeout: 20000 }).then(h => h.jsonValue()).catch(() => null);
      if (!shared || shared.files?.length !== 5) t.fail("The share sheet did not get five slides.");
      return "five slides handed to the share sheet (local stand-in)";
    } },

  { id: "18", name: "Copy a link that previews correctly", target: { taps: 3, seconds: SECONDS }, reader: "onboarded",
    async run(t) {
      await t.start();
      await t.tap(MY_SENATOR, "my senator");
      await t.tap('a[href^="/share/card?t=vote"]', "Share (on the latest vote)");
      const card = new URL(t.page.url());
      await t.tap('.share-actions button:has-text("Copy link")');
      await t.see('.share-panel [role="status"]:has-text("Link copied")', "“Link copied”");
      const link = await t.page.evaluate(() => navigator.clipboard.readText());
      if (!/\/s\/[A-Za-z0-9_-]+$/.test(link)) t.fail(`The copied text is not a short link: “${link.slice(0, 80)}”`);
      // Open the link as the person it was sent to would (same site, whatever address it was copied with).
      const res = await t.page.goto(new URL(link).pathname, { waitUntil: "load" });
      const landed = new URL(t.page.url());
      t.visited.add(landed.pathname + landed.search);
      if (!res?.ok() || landed.pathname !== "/share/card" || landed.searchParams.get("roll") !== card.searchParams.get("roll") || landed.searchParams.get("member") !== card.searchParams.get("member"))
        t.fail(`The short link did not open the exact card (landed on ${landed.pathname}${landed.search}).`);
      const og = await t.page.locator('meta[property="og:image"]').first().getAttribute("content").catch(() => null);
      if (!og) t.fail("The page the link opens has no preview image (og:image).");
      const img = await t.context.request.get(new URL(og, t.base).pathname + new URL(og, t.base).search);
      const buf = await img.body();
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (!img.ok() || w !== 1200 || h !== 630) t.fail(`The preview image is ${w}×${h}, not 1200×630.`);
      return "short link opens the exact card; preview image 1200×630 (outside previews stay blank while the site is private)";
    } },
];
