import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { intakeCandidates, intakeRuns, sourceCommunications } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { discoverOriginalLinks, historicLeads, sourceCatalog, type Source } from "@/lib/source-discovery";

export const runtime = "edge";

async function enqueue(sourceId: string, url: string, lane: string, medium: string, era: string) {
  const db = getDb();
  const alreadyCaptured = await db.select({ id: sourceCommunications.id }).from(sourceCommunications)
    .where(eq(sourceCommunications.canonicalUrl, url)).limit(1).get();
  if (alreadyCaptured) return false;
  const inserted = await db.insert(intakeCandidates).values({ id: crypto.randomUUID(), sourceId, canonicalUrl: url,
    lane, medium, era, discoveredAt: Date.now() }).onConflictDoNothing().returning({ id: intakeCandidates.id });
  return inserted.length > 0;
}

async function scanSource(source: Source, day: string) {
  const db = getDb();
  const id = crypto.randomUUID();
  const claimed = await db.insert(intakeRuns).values({ id, day, lane: source.id, status: "RUNNING", startedAt: Date.now() })
    .onConflictDoNothing().returning({ id: intakeRuns.id });
  if (!claimed.length) {
    const prior = await db.select().from(intakeRuns).where(and(eq(intakeRuns.day, day), eq(intakeRuns.lane, source.id))).get();
    return { source: source.name, status: prior?.status ?? "SKIPPED", added: prior?.caseCount ?? 0,
      error: prior?.error, reused: true };
  }
  try {
    const links = await discoverOriginalLinks(source);
    let added = 0;
    for (const link of links) if (await enqueue(source.id, link, source.lane, source.medium, source.era)) added++;
    await db.update(intakeRuns).set({ status: "COMPLETE", caseCount: added, completedAt: Date.now() }).where(eq(intakeRuns.id, id));
    return { source: source.name, status: "COMPLETE", added };
  } catch (caught) {
    const error = (caught instanceof Error ? caught.message : "Discovery failed").slice(0, 400);
    await db.update(intakeRuns).set({ status: "FAILED", error, completedAt: Date.now() }).where(eq(intakeRuns.id, id));
    return { source: source.name, status: "FAILED", added: 0, error };
  }
}

/** Scan once per source per UTC day; archive seeds are idempotent. No model spend here. */
export async function POST() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  return runDiscovery();
}

export async function runDiscovery() {
  const day = new Date().toISOString().slice(0, 10);
  try {
    let historicAdded = 0;
    for (const lead of historicLeads) if (await enqueue(lead.id, lead.url, lead.lane, lead.medium, lead.era)) historicAdded++;
    const results = await Promise.all(sourceCatalog.map(source => scanSource(source, day)));
    return editorJson({ day, historicAdded, results });
  } catch (error) {
    console.error("Source discovery failed", error);
    return editorJson({ error: "Could not scan original sources" }, 503);
  }
}
