import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a summary run can be started between the two scheduled updates, paced, without taking one of the day's two", () => {
  const route = read("app/api/automation/summaries/route.ts"), tick = read("app/api/automation/tick/route.ts"), vercel = JSON.parse(read("vercel.json"));
  // Paced: one start every 10 minutes, and the time is recorded before anything is started.
  assert.match(route, /const EVERY_MS = 10 \* 60 \* 1000, CURSOR = "summaries:start:at";/);
  assert.match(route, /if \(now - last < EVERY_MS\) return Response\.json\(\{ service: "on-record", started: false/);
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.ok(get.indexOf("setCursor(db, CURSOR") < get.indexOf("fireSummaryChain("), "the pace is set before the run starts");
  // It starts the same chain the scheduled update starts, with the host's own secret; it writes nothing itself.
  assert.match(get, /fireSummaryChain\(new URL\(request\.url\)\.origin, 1\)/);
  assert.doesNotMatch(get, /runAnalysisBatch|automationRuns|CRON_SECRET|searchParams/, "the start takes no parameters, writes no summary itself, and never touches the day's ledger");
  // The run itself still needs the secret, and still steps aside for another run.
  assert.match(route, /if \(!via\) return Response\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);/);
  assert.match(read("lib/analysis/generate.ts"), /if \(busy\) return finish\("SKIPPED", "another summary run is in progress"\);/);
  // The two scheduled updates are unchanged, and only they count toward the daily limit.
  assert.deepEqual(vercel.crons.map(c => c.schedule), ["0 13 * * *", "0 19 * * *"]);
  assert.match(tick, /if \(today\.length >= dailyLimit\)/);
});
