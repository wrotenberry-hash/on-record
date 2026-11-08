import { and, desc, eq, isNull, notExists, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adjudications, corrections, publications, representations, sourceCaptures, sourceCommunications } from "@/db/schema";
import { loadCase } from "@/app/api/editor/cases/_shared";
import { displaySearchNote, passageAround } from "@/lib/public-access";

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

export type PublicEvidence = { propositionEvidenceId: string; id: string; title: string; sourceName: string; sourceUrl: string | null; sourceType: string; excerpt: string; stance: string; applicability: string; publishedAt: number | null };
export type PublicRecord = {
  id: string; publicationId: string; publishedAt: number; status: "CHECKING"; communicationId: string; speakerName: string;
  source: { canonicalUrl: string | null; passage: string; sourceVerification: { recordedAt: number; method: string } };
  representation: { exactText: string }; proposition: { text: string; issue: string | null };
  evidence: PublicEvidence[];
  adjudication: { state: "CHECKING"; explanation: string; supportingSearch: string; contrarySearch: string; evidenceCutoffAt: number | null };
  review: { decision: string; reviewedAt: number }; corrections: unknown[];
};

type PublishedRow = { publicationId: string; representationId: string; adjudicationId: string; publishedAt: number };

/**
 * The public shape of one published record, or null when the publication is
 * not in a publishable state (corrected, retracted, missing a human gate).
 * Only this function decides what leaves the private editorial record.
 */
async function toPublicRecord(row: PublishedRow): Promise<PublicRecord | null> {
  const db = getDb();
  const item = await loadCase(row.representationId);
  if (!item || item.publication?.id !== row.publicationId || item.adjudication?.id !== row.adjudicationId ||
      !item.sourceAuthentication || item.review?.decision !== "APPROVED") return null;
  const [correctionRows, retractions] = await Promise.all([
    db.select().from(corrections).where(eq(corrections.publicationId, row.publicationId)),
    db.select({ id: publications.id }).from(publications).where(eq(publications.retractionOfId, row.publicationId)).limit(1),
  ]);
  if (correctionRows.length || retractions.length) return null;
  return { id: item.id, publicationId: row.publicationId, publishedAt: row.publishedAt, status: "CHECKING",
    communicationId: item.communicationId, speakerName: item.speakerName,
    source: { canonicalUrl: item.canonicalUrl, passage: passageAround(item.originalContent, item.exactText),
      sourceVerification: { recordedAt: item.sourceAuthentication.verifiedAt, method: item.sourceAuthentication.method } },
    representation: { exactText: item.exactText }, proposition: { text: item.canonicalProposition, issue: item.issue },
    evidence: item.evidence.filter(e => item.adjudication?.consideredEvidenceIds.includes(e.propositionEvidenceId))
      .map(e => ({ propositionEvidenceId: e.propositionEvidenceId, id: e.id, title: e.title, sourceName: e.sourceName,
        sourceUrl: e.sourceUrl, sourceType: e.sourceType, excerpt: e.excerpt, stance: e.stance, applicability: e.applicability,
        publishedAt: e.publishedAt })),
    adjudication: { state: "CHECKING", explanation: item.adjudication.explanation,
      supportingSearch: displaySearchNote(item.adjudication.supportingSearch), contrarySearch: displaySearchNote(item.adjudication.contrarySearch),
      evidenceCutoffAt: item.adjudication.evidenceCutoffAt },
    review: { decision: item.review.decision, reviewedAt: item.review.createdAt },
    corrections: correctionRows };
}

function publishedRows() {
  return getDb().select({ publicationId: publications.id, representationId: representations.id,
    adjudicationId: adjudications.id, publishedAt: publications.publishedAt })
    .from(publications).innerJoin(adjudications, eq(publications.adjudicationId, adjudications.id))
    .innerJoin(representations, eq(adjudications.representationId, representations.id))
    .innerJoin(sourceCaptures, eq(representations.captureId, sourceCaptures.id))
    .innerJoin(sourceCommunications, eq(sourceCaptures.communicationId, sourceCommunications.id))
    .where(eq(adjudications.state, "CHECKING"));
}

export async function listPublicRecords(): Promise<PublicRecord[]> {
  const rows = await publishedRows().orderBy(desc(publications.publishedAt)).limit(100);
  return (await Promise.all(rows.map(toPublicRecord))).filter((x): x is PublicRecord => x !== null);
}

/** One record by its representation id (the id in a record's permalink). Newest publication wins. */
export async function getPublicRecord(id: string): Promise<PublicRecord | null> {
  if (typeof id !== "string" || id.length > 100) return null;
  const rows = await publishedRows().orderBy(desc(publications.publishedAt)).limit(100);
  const row = rows.find(r => r.representationId === id);
  return row ? toPublicRecord(row) : null;
}

export type PublicCorrection = { kind: "correction" | "retraction"; at: number; speakerName: string; exactText: string; reason: string;
  originalRecordId: string; replacementRecordId: string | null };

/**
 * Every correction and retraction, newest first, for the public corrections
 * page. Reviewer identity stays private; the reason and dates are public.
 */
export async function listPublicCorrections(): Promise<PublicCorrection[]> {
  const db = getDb();
  const [corrected, retracted] = await Promise.all([
    db.select({ at: corrections.correctedAt, reason: corrections.reason, representationId: representations.id, exactText: representations.exactText,
      speakerName: sql<string>`(select display_name from people where people.id = ${sourceCommunications.speakerId})`,
      replacementRepresentationId: sql<string | null>`(select a2.representation_id from publications p2 join adjudications a2 on a2.id = p2.adjudication_id where p2.id = ${corrections.replacementPublicationId})` })
      .from(corrections).innerJoin(publications, eq(publications.id, corrections.publicationId))
      .innerJoin(adjudications, eq(adjudications.id, publications.adjudicationId))
      .innerJoin(representations, eq(representations.id, adjudications.representationId))
      .innerJoin(sourceCaptures, eq(sourceCaptures.id, representations.captureId))
      .innerJoin(sourceCommunications, eq(sourceCommunications.id, sourceCaptures.communicationId))
      .orderBy(desc(corrections.correctedAt)).limit(200),
    db.select({ at: publications.publishedAt, reason: publications.note, representationId: representations.id, exactText: representations.exactText,
      speakerName: sql<string>`(select display_name from people where people.id = ${sourceCommunications.speakerId})` })
      .from(publications).innerJoin(adjudications, eq(adjudications.id, publications.adjudicationId))
      .innerJoin(representations, eq(representations.id, adjudications.representationId))
      .innerJoin(sourceCaptures, eq(sourceCaptures.id, representations.captureId))
      .innerJoin(sourceCommunications, eq(sourceCommunications.id, sourceCaptures.communicationId))
      .where(sql`${publications.retractionOfId} is not null`).orderBy(desc(publications.publishedAt)).limit(200),
  ]);
  const items: PublicCorrection[] = [
    ...corrected.map(c => ({ kind: "correction" as const, at: c.at, speakerName: c.speakerName, exactText: c.exactText, reason: c.reason,
      originalRecordId: c.representationId, replacementRecordId: c.replacementRepresentationId ?? null })),
    ...retracted.map(r => ({ kind: "retraction" as const, at: r.at, speakerName: r.speakerName, exactText: r.exactText,
      reason: r.reason ?? "Retracted.", originalRecordId: r.representationId, replacementRecordId: null })),
  ];
  return items.sort((a, b) => b.at - a.at);
}
