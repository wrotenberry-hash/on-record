/**
 * The reader pages checked for accessibility (axe, WCAG 2.1 A and AA) and for
 * speed, besides every page a task lands on. Static pages are found by reading
 * the app folder, so a new page is picked up without editing this file; pages
 * that need an id get one from the local database (seed.mjs `samples`).
 * To leave a page out, add it to SKIP with the reason.
 */
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./lib/env.mjs";

/** Not reader pages: the editor's tools, embeds (blank while the site is private), one-off links and API routes. */
const SKIP = [/^\/editor/, /^\/embed/, /^\/api/, /^\/skip$/, /^\/s\//, /^\/auth/, /^\/account\/(verify|unsubscribe)$/];

function staticPages(dir = resolve(ROOT, "app"), prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) { if (!/^[[(_@]/.test(name)) out.push(...staticPages(full, `${prefix}/${name}`)); }
    else if (name === "page.tsx") out.push(prefix || "/");
  }
  return out;
}

/** Pages with an id or a query, by route. A null sample (nothing in the database) drops the page. */
function samplePages(s) {
  return [
    s.member && `/politicians/${s.member}`, s.bill && `/bills/${s.bill}`, "/issues/health-care",
    s.member && s.member2 && `/compare?a=${s.member}&b=${s.member2}`, "/search?q=hospital", "/start?step=2",
    s.member && s.roll && `/share/card?t=vote&member=${s.member}&roll=${s.roll}`, s.bill && `/share/card?t=bill&bill=${s.bill}`,
    s.txBill && `/texas/bills/${encodeURIComponent(s.txBill)}`, s.txMember && `/texas/members/${encodeURIComponent(s.txMember)}`,
    "/no-such-page",
  ].filter(Boolean);
}

export function readerPages(samples) {
  const pages = [...staticPages().filter(p => !SKIP.some(re => re.test(p))).sort(), ...samplePages(samples)];
  return [...new Set(pages)];
}

/** One name per kind of page, so the same page with another id is not checked twice. */
export function pageKey(pathAndQuery) {
  const u = new URL(pathAndQuery, "http://x");
  const path = u.pathname.replace(/^\/(politicians|bills|issues|records)\/[^/]+$/, "/$1/[id]").replace(/^\/texas\/(bills|members)\/[^/]+$/, "/texas/$1/[id]")
    .replace(/^\/share\/(vote|agreement)\/.+$/, "/share/$1/[…]");
  const marks = ["t", "step", "issue"].filter(k => u.searchParams.has(k)).map(k => `${k}=${u.searchParams.get(k)}`);
  if (u.searchParams.has("q")) marks.push("q");
  if (u.searchParams.has("a") && u.searchParams.has("b")) marks.push("a&b");
  return path + (marks.length ? `?${marks.join("&")}` : "");
}
