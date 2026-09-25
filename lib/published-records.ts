import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adjudications, corrections, publications } from "@/db/schema";

/** Published, reviewed CHECKING records that are neither corrected nor retracted. */
export async function countPublishedRecords(): Promise<number> {
  const db = getDb();
  const retraction = db.select({ id: sql`1` }).from(sql`publications AS retraction`)
    .where(sql`retraction.retraction_of_id = ${publications.id}`);
  const row = await db.select({ count: sql<number>`count(*)` }).from(publications)
    .innerJoin(adjudications, eq(publications.adjudicationId, adjudications.id))
    .where(and(eq(adjudications.state, "CHECKING"), isNull(publications.retractionOfId),
      notExists(db.select({ id: corrections.id }).from(corrections).where(eq(corrections.publicationId, publications.id))),
      notExists(retraction))).get();
  return Number(row?.count ?? 0);
}
