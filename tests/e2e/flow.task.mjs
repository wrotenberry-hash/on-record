/**
 * The 60-second flow (landing → ZIP or address → the reader's legislators → first answer), by the landing-flow
 * builder: tests/e2e/flow.mjs. That file is a script with its own sign-in, checks (taps, seconds, tap-target
 * sizes, accessibility, messages) and report; each of its runs is started here and becomes one row of this
 * suite's report. Targets are the script's own: at most 3 taps and 60 seconds to the first saved answer.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ROOT } from "./lib/env.mjs";

function runFlow(only, base, out) {
  return new Promise(done => {
    const child = spawn(process.execPath, [resolve(ROOT, "tests/e2e/flow.mjs"), "--base", base, "--out", out, "--only", only], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => { stdout += d; }); child.stderr.on("data", d => { stderr += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 240_000);
    child.on("exit", code => { clearTimeout(timer); let report = null; try { report = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch { /* not JSON */ } done({ code, report, stderr: stderr.trim().split("\n").slice(-3).join(" ") }); });
  });
}

const flow = (id, only, name, target, note) => ({ id, name, target, reader: "none",
  async run(t) {
    const { code, report, stderr } = await runFlow(only, t.base, resolve(t.shotsDir, "flow"));
    if (!report) t.fail(`tests/e2e/flow.mjs --only ${only} did not finish (exit ${code}). ${stderr.slice(0, 240)}`);
    const r = report.results?.[0] ?? {};
    if (r.skipped) t.blocked(`Skipped by the flow script: ${r.skipped}`);
    const out = { taps: r.tapsToFirstAnswer ?? 0, seconds: r.secondsToFirstAnswer ?? null, screenshot: r.screenshots?.at(-1) ?? null, note: note(r) };
    if (report.problems?.length) { const e = new Error(report.problems.slice(0, 3).join(" | ").slice(0, 380)); e.result = out; throw e; }
    return out;
  } });

export const tasks = [
  flow("flow", "zip", "The 60-second flow: ZIP only", { taps: 3, seconds: 60 },
    r => `${r.legislators?.length ?? 0} legislators in ${r.secondsToLegislators} s (${r.tapsToLegislators} tap), first answer saved at ${r.secondsToFirstAnswer} s; typed at a person's speed`),
  flow("flow-split", "split", "The 60-second flow: a ZIP that crosses districts", { taps: 3, seconds: 60 },
    r => `${r.legislators?.length ?? 0} legislators after choosing the district; first answer at ${r.secondsToFirstAnswer} s`),
  flow("flow-address", "address", "The 60-second flow: ZIP and street address, five legislators", { taps: 3, seconds: 60 },
    r => `${r.legislators?.length ?? 0} legislators (${(r.legislators ?? []).join(", ")}); first answer at ${r.secondsToFirstAnswer} s; the address lookup is a local stand-in for the Census service`),
  flow("flow-mistakes", "mistakes", "The 60-second flow: a wrong ZIP or address is explained and the typing is kept", { taps: null, seconds: null },
    r => (r.cases ?? []).map(c => `${c.case}: “${String(c.message).slice(0, 60)}”`).join("; ")),
  flow("flow-issues", "issues", "The 60-second flow: picking an issue brings its bills first", { taps: null, seconds: null },
    r => (r.firstLineAfter ? `after picking Health care the first line reads “${String(r.firstLineAfter).slice(0, 90)}”` : "")),
];
