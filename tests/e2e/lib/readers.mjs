import { openPhone } from "./browser.mjs";
import { LONG_TASK_RECORDER, SHARE_SHEET_STANDIN } from "./checks.mjs";
import { agePreviousVisit, freshInvite } from "../seed.mjs";

export const DEFAULT_ZIP = "78701";
export const DEFAULT_ISSUES = ["health-care", "defense-veterans", "elections-government"];

/** Onboarding through the app's own pages: ZIP, House district when the ZIP crosses districts, up to three issues. */
export async function onboard(page, { zip = DEFAULT_ZIP, issues = DEFAULT_ISSUES, district = "TX-37" } = {}) {
  await page.goto("/start", { waitUntil: "load" });
  await page.fill("#zip", zip);
  await page.click('form.start-form button:has-text("Next")');
  await page.waitForURL(/step=2/);
  await page.waitForLoadState("load");
  const pick = page.locator('select[name="district"]');
  if (district && await pick.count() && await pick.locator(`option[value="${district}"]`).count()) await pick.selectOption(district);
  for (const slug of issues) await page.locator(`input[name="issue"][value="${slug}"]`).check();
  await page.click('form.start-two button:has-text("Done")');
  await page.waitForURL(u => new URL(String(u)).pathname === "/");
  await page.waitForLoadState("load");
}

/** Email sign-in the way a reader does it: ask for a link on the Account page, open the link from the (stand-in) inbox. */
async function signInByEmail(page, standins) {
  const email = `e2e-${Date.now().toString(36)}@example.com`;
  await page.goto("/account", { waitUntil: "load" });
  await page.fill("#account-email", email);
  await page.waitForFunction(() => { const f = document.querySelector('input[name="cf-turnstile-response"]'); return !f || !!f.value; }, null, { timeout: 8000 }).catch(() => {});
  await page.click('button:has-text("Email me a link")');
  const deadline = Date.now() + 15_000;
  let link = null;
  while (!link && Date.now() < deadline) {
    const mail = standins.emails.find(m => [m.to].flat().includes(email));
    link = mail ? /https?:\/\/\S+\/account\/verify\?t=\S+/.exec(mail.text)?.[0] ?? null : null;
    if (!link) await page.waitForTimeout(200);
  }
  if (!link) throw new Error(`The sign-in email did not arrive at the stand-in inbox. The page said: “${(await page.locator('main [role="status"]').first().innerText().catch(() => "nothing")).slice(0, 160)}”`);
  const u = new URL(link);
  await page.goto(u.pathname + u.search, { waitUntil: "load" });
}

/**
 * A signed-in first-time trial reader on a phone, in the state the task asks for:
 *   "new"        just opened an invite link;
 *   "onboarded"  also gave a ZIP and picked issues (through /start);
 *   "returning"  onboarded, and last visited three days ago;
 *   "account"    onboarded and signed in by email (needs the stand-in inbox).
 */
export async function prepareReader(kind, { browser, base, task = {}, standins = null }) {
  const invite = await freshInvite(task.invite ?? {});
  const phone = await openPhone(browser, { baseURL: base, cookies: [{ name: "or_trial", value: invite.token, url: base, httpOnly: true, sameSite: "Lax" }] });
  await phone.context.addInitScript(SHARE_SHEET_STANDIN);
  await phone.context.addInitScript(LONG_TASK_RECORDER);
  // The development server draws its own floating badge over the page; readers never see it.
  await phone.context.addInitScript(() => { const hide = () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.documentElement.appendChild(s); };
    if (document.documentElement) hide(); else document.addEventListener("readystatechange", hide, { once: true }); });
  if (kind !== "new") await onboard(phone.page, { issues: task.issues ?? DEFAULT_ISSUES, zip: task.zip ?? DEFAULT_ZIP });
  if (kind === "returning") {
    const at = await agePreviousVisit(invite.id, 3);
    await phone.context.addCookies([{ name: "or_lv", value: `${at}|`, url: base, httpOnly: true, sameSite: "Lax" }]);
  }
  if (kind === "account") {
    if (!standins) throw new Error("needs the local stand-ins");
    await signInByEmail(phone.page, standins);
  }
  return { ...phone, invite };
}
