#!/usr/bin/env node
/**
 * The usability suite: every task in docs/USABILITY_TASKS.md as a first-time
 * trial reader on a phone (390×844, CPU slowed 4×), then accessibility (axe,
 * WCAG 2.1 A and AA) and speed checks on every reader page. See README.md here.
 *
 *   node tests/e2e/run.mjs [--only 1,4,flow] [--base http://localhost:3000] [--prod]
 *                          [--no-axe] [--no-speed] [--shots <folder>] [--verbose]
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { E2E_DIR, assertLocalDatabase } from "./lib/env.mjs";
import { CPU_SLOWDOWN, PHONE, loadPlaywright, axeSourcePath } from "./lib/browser.mjs";
import { startApp } from "./lib/server.mjs";
import { startStandins } from "./lib/standins.mjs";
import { TaskBlocked, TaskRun } from "./lib/session.mjs";
import { prepareReader } from "./lib/readers.mjs";
import { axeViolations, measureSpeed } from "./lib/checks.mjs";
import { judge, markdownReport } from "./lib/report.mjs";
import { pageKey, readerPages } from "./pages.mjs";
import { EXTRA_TASK_FILES } from "./registry.mjs";
import { cleanup, ensureTrialOpen, samples, seedDistrictAnswers, execute } from "./seed.mjs";

const SPEED_BUDGET_MS = 2000, SPEED_RUNS = 2;
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const value = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const only = value("only")?.split(",").map(s => s.trim()).filter(Boolean) ?? null;
const shotsDir = resolve(value("shots") ?? process.env.E2E_SHOTS ?? resolve(tmpdir(), "on-record-e2e"));
const say = (...a) => console.log(...a);

/** Every task: the table in tasks.mjs, then the files named in registry.mjs, then any *.task.mjs in this folder. */
async function loadTasks() {
  const files = ["tasks.mjs", ...EXTRA_TASK_FILES.filter(f => existsSync(resolve(E2E_DIR, f))), ...readdirSync(E2E_DIR).filter(f => f.endsWith(".task.mjs")).sort()];
  const out = [];
  for (const f of [...new Set(files)]) {
    const m = await import(pathToFileURL(resolve(E2E_DIR, f)).href);
    const list = [m.tasks, m.default].flat().filter(t => t && typeof t.run === "function");
    if (!list.length) throw new Error(`${f} exports no task (see tests/e2e/README.md for the contract).`);
    for (const t of list) out.push({ target: {}, reader: "onboarded", ...t, id: String(t.id), file: f });
  }
  const seen = new Set();
  for (const t of out) { if (seen.has(t.id)) throw new Error(`Two tasks share the id “${t.id}”.`); seen.add(t.id); }
  return out;
}

async function main() {
  assertLocalDatabase();
  const startedAt = new Date().toISOString(), runStart = Date.now();
  mkdirSync(shotsDir, { recursive: true });
  const all = await loadTasks(), tasks = only ? all.filter(t => only.includes(t.id)) : all;
  if (!tasks.length) throw new Error(`No task matches --only ${only?.join(",")}. Known ids: ${all.map(t => t.id).join(", ")}`);
  await cleanup();
  await ensureTrialOpen();

  const externalBase = value("base");
  const standins = externalBase ? null : await startStandins();
  let server = null, browser = null;
  const report = { startedAt, viewport: PHONE, cpuSlowdown: CPU_SLOWDOWN, shotsDir, server: { mode: externalBase ? "external" : flag("prod") ? "prod" : "dev", base: externalBase ?? null }, tasks: [], axe: null, speed: null };
  try {
    if (externalBase) server = { base: externalBase.replace(/\/$/, ""), mode: "external", stop: async () => {} };
    else { say(`Starting the app (${flag("prod") ? "next build, then next start" : "next dev"}) with public reading off…`);
      server = await startApp({ mode: flag("prod") ? "prod" : "dev", extraEnv: standins.env, log: flag("verbose") ? s => process.stdout.write(s) : () => {} }); }
    report.server.base = server.base;
    say(`App at ${server.base}`);
    const pw = await loadPlaywright();
    browser = await pw.chromium.launch();
    const sample = await samples();
    const pages = readerPages(sample);

    // Warm up: a development server builds each page on its first request; that wait is not the reader's.
    { const warm = await prepareReader("onboarded", { browser, base: server.base });
      for (const p of pages) await warm.page.goto(p, { waitUntil: "load", timeout: 120_000 }).catch(() => {});
      await warm.context.close(); }

    const audited = new Map(); // page key → { page, violations }
    const wantAxe = !flag("no-axe");
    if (wantAxe && !axeSourcePath()) throw new Error("axe-core was not found; run with --no-axe or see tests/e2e/README.md.");
    const audit = async (page, label) => {
      const url = new URL(page.url()), key = pageKey(url.pathname + url.search);
      if (!wantAxe || audited.has(key)) return;
      audited.set(key, { page: key, seenAs: label, violations: [] });
      try { audited.get(key).violations = await axeViolations(page); } catch (e) { audited.get(key).error = String(e?.message ?? e).slice(0, 200); }
    };

    for (const task of tasks) {
      const needs = task.needs ?? [];
      const result = { id: task.id, name: task.name, target: task.target, file: task.file, taps: 0, swipes: 0, seconds: null, note: "", error: null, status: null, steps: [], sideways: [], smallTargets: [], screenshot: null };
      let reader = null;
      try {
        if (needs.includes("standins") && !standins) throw new TaskBlocked("Needs the Turnstile and Twilio keys, or run without --base so the runner can start its local stand-ins.", "needs keys");
        if (needs.includes("districtAnswers")) { if (!sample.bill) throw new TaskBlocked("No bill with a recorded vote in the local database."); await seedDistrictAnswers({ billId: sample.bill, state: sample.state }); }
        reader = await prepareReader(task.reader, { browser, base: server.base, task, standins });
        const t = new TaskRun({ page: reader.page, context: reader.context, base: server.base, shotsDir, task, tools: { standins, sample, invite: reader.invite } });
        // Check each page the reader lands on, without the check counting against the clock.
        const landed = t.landed.bind(t); let paused = 0;
        t.landed = async step => { await landed(step); const a = Date.now(); await audit(t.page, `task ${task.id}`); paused += Date.now() - a; };
        const seconds = t.seconds.bind(t); t.seconds = () => Math.max(0, Math.round((seconds() - paused / 1000) * 10) / 10);
        try { result.note = (await task.run(t)) ?? ""; }
        finally { Object.assign(result, { taps: t.taps, swipes: t.swipes, seconds: t.startedAt ? t.seconds() : null, steps: t.steps, sideways: t.sideways, smallTargets: t.smallTargets }); result.screenshot = await t.shot(); }
      } catch (e) {
        if (e instanceof TaskBlocked) { result.status = e.status; result.note = e.message; }
        else result.error = String(e?.message ?? e).split("\n")[0].slice(0, 400);
      } finally { await reader?.context.close().catch(() => {}); }
      result.result = judge(result);
      report.tasks.push(result);
      say(`${result.result.toUpperCase().padEnd(10)} ${String(task.id).padStart(4)}  ${task.name}  (${result.taps} taps${result.swipes ? ` + ${result.swipes} swipe` : ""}, ${result.seconds ?? "–"} s)${result.error ? `  ${result.error}` : ""}`);
    }

    if (wantAxe || !flag("no-speed")) {
      say(`Checking ${pages.length} reader pages (accessibility${flag("no-speed") ? "" : " and speed"})…`);
      const reader = await prepareReader("onboarded", { browser, base: server.base });
      const speed = [];
      for (const p of pages) {
        const key = pageKey(p);
        try {
          if (!flag("no-speed")) {
            const runs = []; for (let i = 0; i < SPEED_RUNS; i++) runs.push(await measureSpeed(reader.page, p));
            const worst = runs.sort((a, b) => b.interactiveMs - a.interactiveMs)[0];
            speed.push({ page: key, ...worst, ok: worst.interactiveMs < SPEED_BUDGET_MS });
          } else await reader.page.goto(p, { waitUntil: "load" });
          await audit(reader.page, "page list");
        } catch (e) { speed.push({ page: key, error: String(e?.message ?? e).split("\n")[0].slice(0, 200), ok: false }); }
      }
      // Pages only a newcomer or a signed-out visitor sees.
      if (wantAxe) { const fresh = await prepareReader("new", { browser, base: server.base }); for (const p of ["/", "/start"]) { await fresh.page.goto(p, { waitUntil: "load" }); const url = new URL(fresh.page.url()), key = `${pageKey(url.pathname + url.search)} (newcomer)`;
        if (!audited.has(key)) { const v = await axeViolations(fresh.page).catch(e => ({ error: String(e) })); audited.set(key, Array.isArray(v) ? { page: key, violations: v } : { page: key, violations: [], error: v.error }); } } await fresh.context.close(); }
      await reader.context.close();
      if (!flag("no-speed")) report.speed = { budgetMs: SPEED_BUDGET_MS, runs: SPEED_RUNS, pages: speed };
    }
    if (wantAxe) report.axe = { version: /axe-core@([\d.]+)/.exec(axeSourcePath() ?? "")?.[1] ?? null, pages: [...audited.values()].sort((a, b) => a.page.localeCompare(b.page)) };
  } finally {
    await browser?.close().catch(() => {});
    await server?.stop().catch(() => {});
    await standins?.stop().catch(() => {});
    await execute("delete from rate_events where at >= ?", [runStart]).catch(() => {});
    if (!flag("keep")) await cleanup().catch(e => say("cleanup:", e.message));
  }

  writeFileSync(resolve(E2E_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(resolve(E2E_DIR, "report.md"), markdownReport(report));
  const failed = report.tasks.filter(t => t.result === "fail").length, axeBad = report.axe?.pages.filter(p => p.violations.length || p.error).length ?? 0, slow = report.speed?.pages.filter(p => !p.ok).length ?? 0;
  say(`\nTasks: ${report.tasks.filter(t => t.result === "pass").length} passed, ${failed} failed, ${report.tasks.filter(t => t.result === "blocked").length} blocked, ${report.tasks.filter(t => t.result === "needs keys").length} need keys.`
    + (report.axe ? ` Accessibility: ${axeBad} page(s) with violations.` : "") + (report.speed ? ` Speed: ${slow} page(s) over ${SPEED_BUDGET_MS / 1000} s.` : ""));
  say(`Report: tests/e2e/report.md and tests/e2e/report.json · screenshots: ${shotsDir}`);
  process.exitCode = failed || axeBad || slow ? 1 : 0;
}

main().catch(e => { console.error(e?.message ?? e); process.exitCode = 2; });
