import { readFileSync } from "node:fs";
import { axeSourcePath } from "./browser.mjs";

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
let axeSource;

/** WCAG 2.1 A and AA rules (axe-core) on the page as it stands. Returns the violations, shortened. */
export async function axeViolations(page) {
  if (axeSource === undefined) { const p = axeSourcePath(); axeSource = p ? readFileSync(p, "utf8") : null; }
  if (!axeSource) throw new Error("axe-core was not found (looked in node_modules, node_modules/.pnpm and /opt/node-tools). See tests/e2e/README.md.");
  if (!(await page.evaluate(() => typeof window.axe !== "undefined"))) await page.evaluate(axeSource);
  const result = await page.evaluate(tags => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }), AXE_TAGS);
  return result.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map(n => ({ target: n.target.join(" "), html: n.html.slice(0, 200), why: (n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 240) })), count: v.nodes.length }));
}

/** Runs in the page before any of its scripts: remembers every long task (a stretch of 50 ms or more when the page cannot answer a tap). */
export const LONG_TASK_RECORDER = `(() => { window.__longTasks = [];
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.__longTasks.push({ start: e.startTime, end: e.startTime + e.duration }); }).observe({ type: "longtask", buffered: true }); } catch (e) {} })();`;

/**
 * Loads a page and reports when it became interactive, in milliseconds from the
 * start of the navigation:
 *   interactive = the later of (a) domInteractive from the Navigation Timing
 *   API (the HTML is parsed) and (b) the end of the last long task before the
 *   page went quiet (no long task for 1 second after the load event).
 * Also the JavaScript the page loaded: bytes over the wire (transferSize) and
 * unpacked (decodedBodySize) from the Resource Timing API. The CPU is slowed
 * 4× by the caller. Local server: network time is not included.
 */
export async function measureSpeed(page, path) {
  await page.goto(path, { waitUntil: "load" });
  const quietMs = 1000, deadline = Date.now() + 15_000;
  for (;;) {
    const s = await page.evaluate(() => ({ now: performance.now(), load: performance.getEntriesByType("navigation")[0]?.loadEventEnd ?? 0, last: Math.max(0, ...(window.__longTasks ?? []).map(t => t.end)) }));
    if ((s.load > 0 && s.now - Math.max(s.load, s.last) >= quietMs) || Date.now() > deadline) break;
    await page.waitForTimeout(200);
  }
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const scripts = performance.getEntriesByType("resource").filter(r => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name));
    const lastLongTaskEnd = Math.max(0, ...(window.__longTasks ?? []).map(t => t.end));
    const r = n => Math.round(n);
    return { firstByteMs: r(nav.responseStart), domInteractiveMs: r(nav.domInteractive), lastLongTaskEndMs: r(lastLongTaskEnd), longTasks: (window.__longTasks ?? []).length,
      interactiveMs: r(Math.max(nav.domInteractive, lastLongTaskEnd)), loadMs: r(nav.loadEventEnd),
      jsFiles: scripts.length, jsTransferredKb: r(scripts.reduce((n, s) => n + (s.transferSize || 0), 0) / 1024), jsUnpackedKb: r(scripts.reduce((n, s) => n + (s.decodedBodySize || 0), 0) / 1024) };
  });
}

/** The phone's share sheet does not exist in a test browser: this stand-in records what the page hands to it. */
export const SHARE_SHEET_STANDIN = `(() => { window.__shared = [];
  const share = async d => { const files = []; for (const f of (d && d.files) || []) { let w = 0, h = 0; try { const b = await createImageBitmap(f); w = b.width; h = b.height; } catch (e) {} files.push({ name: f.name, type: f.type, size: f.size, width: w, height: h }); }
    window.__shared.push({ text: (d && d.text) || null, url: (d && d.url) || null, files }); };
  try { Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: () => true }); Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: share }); } catch (e) {} })();`;
