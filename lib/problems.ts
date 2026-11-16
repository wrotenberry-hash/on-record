import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { problemReports } from "@/db/schema";
import { cleanReason } from "@/lib/verify/rules";
import { requestContext, withinLimit } from "@/lib/verify/store";
import { countEvent } from "@/lib/events";

/**
 * Round G "Report a problem", on every card and share page. A report holds what
 * the reader chose and an optional note (280 characters), no identity. The editor
 * resolves each one; fixed reports appear in the public corrections log as the
 * fix made, never with the reader's note.
 */
export const PROBLEM_REASONS = { wrong_fact: "A fact is wrong", wrong_vote: "A vote is wrong or mislabelled", unfair_wording: "The wording is unfair or one-sided",
  missing_context: "Important context is missing", broken: "The card or page is broken", other: "Something else" } as const;
export type ProblemReason = keyof typeof PROBLEM_REASONS;

export async function reportProblem(input: { subjectKind: string; subjectRef: string; page: string; reason: string; details: unknown }) {
  if (!(input.reason in PROBLEM_REASONS)) return "bad";
  const ctx = await requestContext();
  if (!(await withinLimit("report_device_day", ctx.device)) || !(await withinLimit("report_ip_day", ctx.ipRange))) return "rate";
  const page = input.page.startsWith("/") && input.page.length < 300 ? input.page : "/";
  await getDb().insert(problemReports).values({ id: crypto.randomUUID(), subjectKind: input.subjectKind.replace(/[^a-z_-]/gi, "").slice(0, 30) || "page",
    subjectRef: input.subjectRef.slice(0, 200), page, reason: input.reason as ProblemReason, details: cleanReason(input.details), createdAt: Date.now() });
  await countEvent("problem_reported", input.reason);
  return "ok";
}

export async function problemList(status: "open" | "closed") {
  const db = getDb();
  return db.select().from(problemReports).where(status === "open" ? eq(problemReports.status, "open") : inArray(problemReports.status, ["fixed", "no_change", "dismissed"]))
    .orderBy(desc(problemReports.createdAt)).limit(200);
}

export async function resolveProblem(id: string, status: "fixed" | "no_change" | "dismissed", resolution: string | null) {
  await getDb().update(problemReports).set({ status, resolution: resolution?.trim().slice(0, 500) || null, resolvedAt: Date.now() }).where(eq(problemReports.id, id));
}

/** The public log: fixes made after a report (what was wrong and what changed), plus counts by outcome. */
export async function correctionsFromReports() {
  const db = getDb();
  const fixed = await db.select({ page: problemReports.page, reason: problemReports.reason, resolution: problemReports.resolution, at: problemReports.resolvedAt })
    .from(problemReports).where(eq(problemReports.status, "fixed")).orderBy(desc(problemReports.resolvedAt)).limit(100);
  const counts = await db.select({ status: problemReports.status, n: sql<number>`count(*)` }).from(problemReports).groupBy(problemReports.status);
  return { fixed, counts: Object.fromEntries(counts.map(c => [c.status, Number(c.n)])) as Record<string, number> };
}

export async function problemCounts() {
  const c = await getDb().select({ status: problemReports.status, n: sql<number>`count(*)` }).from(problemReports).groupBy(problemReports.status);
  return Object.fromEntries(c.map(x => [x.status, Number(x.n)])) as Record<string, number>;
}
