/**
 * Contact your legislator, from a bill page: open one of the reader's own legislators, see the office phone
 * number, the official contact form (or website) and a message the reader can change, and copy the message.
 * Target: 2 taps from the bill page. Nothing is sent by the site; the copy stays on the reader's device.
 */
import { query } from "./seed.mjs";

export default {
  id: "contact", name: "Contact my legislator about a bill", target: { taps: 2, seconds: 30 }, reader: "onboarded",
  async run(t) {
    const bill = t.tools.sample.bill;
    await t.start(`/bills/${bill}`);
    await t.see('#contact h2:has-text("Contact your legislators about this bill")', "the contact block on the bill page");
    const row = t.page.locator("#contact details").first();
    await t.see(row, "one row per legislator of the reader's");
    const who = (await row.locator("summary b").first().innerText()).trim();
    await t.tap(row.locator("summary"), `${who}: Call or write`);
    const message = row.locator("textarea");
    await t.see(message, "a message the reader can change");
    const text = await message.inputValue();
    if (text.length < 80 || !text.includes(who.split(" ").at(-1))) t.fail(`The starting message is not addressed to ${who}: “${text.slice(0, 100)}”`);
    const phone = await row.locator('a[href^="tel:"]').count(), web = await row.locator('a[target="_blank"][href^="http"]').count();
    const onFile = Number((await query("select count(*) as n from legislator_contacts")).at(0)?.n ?? 0);
    if (!phone || !web) {
      if (!onFile) t.blocked("No official phone numbers or contact forms are loaded in this local database (legislator_contacts is empty; they arrive with the scheduled official-records update), so the phone and form links cannot be checked here. The message and the copy button were present.");
      t.fail(`${who}: ${phone ? "" : "no phone link; "}${web ? "" : "no contact form or website link"}`);
    }
    await message.fill(`${text}\n\nP.S. I live in Austin.`); // the reader may change anything; typing is not a tap
    await t.tap(row.locator('button:has-text("Copy message")'), "Copy message");
    await t.see(row.locator('[role="status"]:has-text("Message copied")'), "“Message copied”");
    const copied = await t.page.evaluate(() => navigator.clipboard.readText());
    if (!copied.endsWith("P.S. I live in Austin.")) t.fail("What was copied is not the message as the reader changed it.");
    return `${who}: phone link, ${await row.locator('a[target="_blank"][href^="http"]').first().innerText().then(x => x.replace(/\s+/g, " ").trim().slice(0, 40)).catch(() => "form link")}, editable message, copied`;
  },
};
