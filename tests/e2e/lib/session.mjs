import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PHONE } from "./browser.mjs";

export class TaskFailure extends Error {}
/** Thrown by a task that cannot run here (for example it needs keys or a content gate is closed). Not a pass, not a product failure. */
export class TaskBlocked extends Error { constructor(message, status = "blocked") { super(message); this.status = status; } }

const pathOf = url => { try { const u = new URL(url); return u.pathname + u.search; } catch { return url; } };

/**
 * What a task gets: a phone-sized page and a few verbs that count as a reader
 * would. `tap` counts one tap (and a swipe when the target was off-screen in a
 * sideways menu); `type` and `choose` are not taps (typing a ZIP or search
 * words is not counted, as in docs/USABILITY_TASKS.md). Every page landed on is
 * checked for sideways scrolling and remembered for the accessibility pass.
 */
export class TaskRun {
  constructor({ page, context, base, shotsDir, task, tools = {} }) {
    Object.assign(this, { page, context, base, shotsDir, task, tools });
    this.taps = 0; this.swipes = 0; this.steps = []; this.visited = new Set(); this.sideways = []; this.smallTargets = []; this.startedAt = null; this.shots = [];
    page.setDefaultTimeout(20_000);
  }
  /** Starts the clock on the home page, where every task begins. */
  async start(path = "/") { await this.page.goto(path, { waitUntil: "load" }); this.startedAt = Date.now(); await this.landed("open " + path); return this; }
  seconds() { return this.startedAt ? Math.round((Date.now() - this.startedAt) / 100) / 10 : 0; }
  loc(target) { return typeof target === "string" ? this.page.locator(target) : target; }
  async landed(step) {
    await this.page.waitForLoadState("load").catch(() => {});
    const url = pathOf(this.page.url());
    this.visited.add(url);
    const over = await this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => 0);
    if (over > 1 && !this.sideways.some(s => s.url === url)) this.sideways.push({ url, px: over });
    this.steps.push({ step, url, at: this.seconds() });
  }
  /** One tap on a link or button the reader can see. */
  async tap(target, name = "") {
    const el = this.loc(target).first();
    await el.waitFor({ state: "visible" });
    let box = await el.boundingBox();
    if (box && (box.x + box.width / 2 < 0 || box.x + box.width / 2 > PHONE.width)) { this.swipes++; await el.scrollIntoViewIfNeeded(); box = await el.boundingBox(); }
    else await el.scrollIntoViewIfNeeded();
    const label = name || (await el.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 50) || (await el.getAttribute("aria-label").catch(() => "")) || "control";
    if (box && Math.min(box.height, box.width) < 24) this.smallTargets.push({ label, height: Math.round(box.height), width: Math.round(box.width) });
    const before = this.page.url();
    await el.click();
    this.taps++;
    // A tap that moves to another page: wait for it, then check the page we landed on.
    await this.page.waitForURL(u => String(u) !== before, { timeout: 2500 }).catch(() => {});
    await this.landed(`tap “${label}”`);
  }
  /** Typing is not a tap. */
  async type(target, text) { const el = this.loc(target).first(); await el.waitFor({ state: "visible" }); await el.fill(text); this.steps.push({ step: `type into ${typeof target === "string" ? target : "field"}`, at: this.seconds() }); }
  /** Picking from a drop-down is not counted as a tap either; the notes say when a task used one. */
  async choose(target, value) { await this.loc(target).first().selectOption(value); this.steps.push({ step: "choose from a list", at: this.seconds() }); }
  /** Fails the task unless the reader can see this within a few seconds. */
  async see(target, what = "") {
    const el = this.loc(target).first();
    try { await el.waitFor({ state: "visible", timeout: 8000 }); } catch { throw new TaskFailure(`Not shown: ${what || target}`); }
    return el;
  }
  async text(target) { return (await this.loc(target).first().innerText()).replace(/\s+/g, " ").trim(); }
  async has(target) { return (await this.loc(target).count()) > 0 && await this.loc(target).first().isVisible().catch(() => false); }
  fail(message) { throw new TaskFailure(message); }
  blocked(message, status = "blocked") { throw new TaskBlocked(message, status); }
  async shot(name = "") {
    mkdirSync(this.shotsDir, { recursive: true });
    const file = resolve(this.shotsDir, `${String(this.task.id).padStart(2, "0")}${name ? "-" + name : ""}.png`);
    await this.page.screenshot({ path: file, fullPage: true }).catch(() => {});
    this.shots.push(file); return file;
  }
}
