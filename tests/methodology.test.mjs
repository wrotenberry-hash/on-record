import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCapturedRevision,
  appendPublicationEvent,
  assessAggregateEligibility,
  calculateInternalRAS,
  canPublishAdjudication,
  evidenceConfidenceTotal,
  instrumentErrors,
  isContextAssessment,
  isRating,
  lockMateriality,
  propositionsEquivalent,
  publicationErrors,
} from "../lib/methodology.ts";

const earlier = "2026-09-01T10:00:00.000Z";
const lock = "2026-09-01T11:00:00.000Z";
const evaluation = "2026-09-01T12:00:00.000Z";
const later = "2026-09-01T13:00:00.000Z";
const link = { id: "link-1", propositionId: "prop-1", evidenceId: "evidence-1", relation: "supports", rationale: "Official data", assessedAt: later };
const instrument = () => ({ accuracy: 85, accuracyRationale: "Evidence supports a qualified reading", contextIntegrity: 100, contextRationale: "Context preserved", evidenceConfidence: { authority: 20, sufficiencyCorroboration: 18, directness: 22, temporalMethodologicalFit: 20 }, evidenceRationale: "Sources inspected", materiality: "M2", assessedBy: "editor-2", assessedAt: later, methodologyVersion: "v1" });
const adjudication = () => ({
  id: "adjudication-1", propositionId: "prop-1", methodologyVersion: "v1", createdAt: later,
  materiality: lockMateriality({ level: "M2", rationale: "Material claim", decidedAt: earlier, lockedAt: lock, reviewerId: "editor-1", evidenceEvaluationStartedAt: evaluation }),
  evidenceEvaluationStartedAt: evaluation,
  searches: [
    { side: "supporting", strategy: "Primary government data", evidenceIds: ["evidence-1"], searchedAt: later },
    { side: "contrary", strategy: "Official rebuttals and contrary data", evidenceIds: [], searchedAt: later },
  ],
  applicabilityIds: ["link-1"], outcome: { status: "RESOLVED", score: 85, rationale: "Evidence supports the bounded proposition", instrument: instrument() },
  reviewedBy: "editor-2", reviewedAt: later,
});

test("rating anchors are exact and CHECKING never carries a score", () => {
  for (const value of [100, 95, 85, 65, 35, 15, 0]) assert.equal(isRating(value), true);
  for (const value of [99, 50, -1, "85", null]) assert.equal(isRating(value), false);
  const checking = { ...adjudication(), outcome: { status: "CHECKING", score: 85, rationale: "Still investigating" } };
  assert.equal(canPublishAdjudication(checking, [link]), false);
  assert.match(publicationErrors(checking, [link]).join(" "), /CHECKING cannot have a numeric score/);
  const unresolved = { ...adjudication(), outcome: { status: "CHECKING", rationale: "Evidence is inconclusive" } };
  assert.equal(canPublishAdjudication(unresolved, []), true);
});

test("materiality locks before evaluation and bilateral searches gate resolved publication", () => {
  assert.throws(() => lockMateriality({ level: "M2", rationale: "Material", decidedAt: earlier, lockedAt: later, reviewerId: "editor", evidenceEvaluationStartedAt: evaluation }), /before evidence evaluation/);
  assert.equal(canPublishAdjudication(adjudication(), [link]), true);
  assert.match(publicationErrors({ ...adjudication(), searches: adjudication().searches.slice(0, 1) }, [link]).join(" "), /contrary evidence search/);
  assert.match(publicationErrors({ ...adjudication(), outcome: { status: "RESOLVED", score: 75, rationale: "Other" } }, [link]).join(" "), /allowed rating anchor/);
  assert.match(publicationErrors({ ...adjudication(), materiality: { ...adjudication().materiality, lockedAt: later } }, [link]).join(" "), /materiality/i);
  assert.match(publicationErrors(adjudication(), []).join(" "), /considered evidence link/);
  assert.match(publicationErrors({ ...adjudication(), searches: [{ side: "supporting", strategy: "search", evidenceIds: [], searchedAt: "invalid" }, adjudication().searches[1]] }, [link]).join(" "), /supporting evidence search/);
});

test("explicit checking components validate without deriving a rating", () => {
  assert.equal(evidenceConfidenceTotal(instrument()), 80);
  assert.deepEqual(instrumentErrors(instrument()), []);
  for (const value of [100, 85, 60, 30, 0, "N/A"]) assert.equal(isContextAssessment(value), true);
  assert.equal(isContextAssessment(65), false);
  assert.match(instrumentErrors({ ...instrument(), evidenceConfidence: { ...instrument().evidenceConfidence, authority: 26 } }).join(" "), /authority/);
  assert.match(instrumentErrors({ ...instrument(), accuracy: 97 }).join(" "), /accuracy/);
  assert.match(instrumentErrors({ ...instrument(), materiality: "M0" }).join(" "), /M0/);
  assert.match(publicationErrors({ ...adjudication(), outcome: { status: "RESOLVED", score: 95, rationale: "Qualified", instrument: instrument() } }, [link]).join(" "), /must match/);
  assert.match(publicationErrors({ ...adjudication(), outcome: { status: "RESOLVED", score: 85, rationale: "No components" } }, [link]).join(" "), /completed checking instrument/);
  assert.equal(canPublishAdjudication(adjudication(), [link]), true);
});

test("dependency clusters follow the internal RAS formula while public aggregate remains withheld", () => {
  assert.throws(() => calculateInternalRAS([{ id: "bad", claims: [{ materiality: "M1", accuracy: 50 }] }]), /Invalid cluster claim/);
  const clusters = [
    { id: "a", claims: [{ materiality: "M1", accuracy: 100 }, { materiality: "M2", accuracy: 0 }] },
    { id: "b", claims: [{ materiality: "M3", accuracy: 95 }] },
  ];
  const clusterA = 75 / 1.75;
  const expected = (Math.sqrt(1.75) * clusterA + Math.sqrt(1.25) * 95) / (Math.sqrt(1.75) + Math.sqrt(1.25));
  assert.ok(Math.abs(calculateInternalRAS(clusters) - expected) < 1e-10);
  assert.throws(() => calculateInternalRAS([{ id: "zero", claims: [{ materiality: "M0", accuracy: 100 }] }]), /positive materiality/);
});

test("equivalent proposition identity ignores speaker and affiliation, preserves temporal scope", () => {
  const a = { id: "a", canonicalText: "Employment increased", meaning: { time: "2025", place: "Texas", quantifier: "All jobs", scope: "Yearly" }, issueIds: ["economy"] };
  const b = { ...a, id: "b", canonicalText: "EMPLOYMENT INCREASED", speakerId: "other", affiliation: "opposite" };
  assert.equal(propositionsEquivalent(a, b), true);
  assert.equal(propositionsEquivalent(a, { ...b, meaning: { ...b.meaning, time: "2024" } }), false);
});

test("captures and publication corrections append while preserving links", () => {
  const first = { id: "r1", capturedAt: earlier, content: "original", contentSha256: "abc" };
  const second = { id: "r2", previousRevisionId: "r1", capturedAt: later, content: "edited", contentSha256: "def" };
  const one = appendCapturedRevision([], first);
  const two = appendCapturedRevision(one, second);
  assert.equal(two.length, 2);
  assert.equal(one[0].content, "original");
  assert.throws(() => appendCapturedRevision(two, second), /already exists/);
  const publication = { id: "p1", adjudicationId: "a1", publishedAt: earlier, actorId: "editor" };
  const correction = { ...publication, id: "p2", publishedAt: later, correctionOfEventId: "p1", correctionExplanation: "Updated source" };
  assert.equal(appendPublicationEvent([publication], correction).length, 2);
  assert.throws(() => appendPublicationEvent([publication], { ...correction, correctionOfEventId: "missing" }), /prior publication/);
});

test("aggregate scores remain disabled regardless of corpus size", () => {
  assert.deepEqual(assessAggregateEligibility(Array(1000).fill({})), {
    eligible: false, score: null, reason: "Founder-approved coverage and sampling gates are pending",
  });
});
