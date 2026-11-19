import { getDb } from "@/db";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { responseRequest } from "@/lib/automated-research";
import { analysisLimits } from "@/lib/analysis/generate";
import { OPENSTATES_BASE } from "@/lib/texas/parse";
import { readBudget } from "@/lib/texas/chain";
import { BRAND } from "@/lib/brand";
import { dueForCheck, openaiLine, openStatesLine, readKeyCheck, type KeyCheck } from "@/lib/key-check-rules";

const CURSOR = "keycheck:last";

/**
 * One small live call with each key (rules and pacing: lib/key-check-rules.ts). The OpenAI call is the smallest the
 * site can make with the model the reader test uses, and is written to the cost ledger like every other call. The
 * Open States call is one request for the Texas jurisdiction record and is counted in the day's request budget.
 * Returns the earlier answer when the last check was under 30 minutes ago.
 */
export async function keyCheck(now = Date.now()): Promise<KeyCheck & { fresh: boolean; nextAt: number }> {
  const db = getDb(), last = readKeyCheck(await getCursor(db, CURSOR));
  const { KEY_CHECK_EVERY_MS } = await import("@/lib/key-check-rules");
  if (last && !dueForCheck(last, now)) return { ...last, fresh: false, nextAt: last.at + KEY_CHECK_EVERY_MS };
  // Claim the slot first, so two requests at the same moment make one pair of calls, not two.
  const pending: KeyCheck = { at: now, openai: { ok: false, line: "OpenAI key: the check is running." }, openStates: { ok: false, line: "Open States key: the check is running." } };
  await setCursor(db, CURSOR, JSON.stringify(pending));

  const key = process.env.OPENAI_API_KEY?.trim() || "", model = analysisLimits().model;
  let openai = openaiLine(null, !!key);
  if (key) {
    try {
      await responseRequest(key, model, { input: "Reply with the one word: ok", max_output_tokens: 16, timeoutMs: 30_000 }, { purpose: "key_check" });
      openai = openaiLine(null, true);
    } catch (e) { openai = openaiLine(e instanceof Error ? e.message : String(e), true); }
  }

  const os = process.env.OPENSTATES_API_KEY?.trim() || "";
  let status = 0;
  if (os) {
    try {
      const res = await fetch(`${OPENSTATES_BASE}/jurisdictions/ocd-jurisdiction/country:us/state:tx/government`, {
        headers: { "X-API-KEY": os, Accept: "application/json", "User-Agent": `${BRAND.userAgentName}/1.0 (key check)` }, signal: AbortSignal.timeout(25_000), cache: "no-store" });
      status = res.status;
    } catch { status = 0; }
    // The request counts toward the day's Open States allowance, like the loader's own.
    const b = readBudget(await getCursor(db, "tx:budget"), now); b.used++; b.lastAt = now;
    await setCursor(db, "tx:budget", JSON.stringify(b)).catch(() => undefined);
  }
  const done: KeyCheck = { at: now, openai, openStates: openStatesLine(status, !!os) };
  await setCursor(db, CURSOR, JSON.stringify(done));
  return { ...done, fresh: true, nextAt: now + KEY_CHECK_EVERY_MS };
}
