/**
 * Which invite links have been opened and which came back, by number, for the editor's invites page (owner,
 * 20 Nov 2026: "Tell me how many of the original links have been opened, and by which numbers, so I can see who has
 * come back"). Per link the site records only the days it was used, never which pages. Pure, so node's test runner loads it.
 */
export type InviteUse = { number: number; firstSeenAt: number | null; activeDays: number; revokedAt: number | null };

/** "1–3, 5, 8–9" for [1, 2, 3, 5, 8, 9]; "none" for an empty list. */
export function numberRanges(numbers: readonly number[]): string {
  const n = [...new Set(numbers)].sort((a, b) => a - b), out: string[] = [];
  for (let i = 0; i < n.length; i++) { let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; out.push(j > i ? `${n[i]}–${n[j]}` : `${n[i]}`); i = j; }
  return out.length ? out.join(", ") : "none";
}

export function inviteUseSummary(rows: readonly InviteUse[]) {
  const opened = rows.filter(r => r.firstSeenAt), back = rows.filter(r => r.activeDays >= 2);
  return { total: rows.length, opened: opened.map(r => r.number), cameBack: back.map(r => r.number), notOpened: rows.filter(r => !r.firstSeenAt).map(r => r.number), revoked: rows.filter(r => r.revokedAt).map(r => r.number) };
}

/** The new links as one block of text to copy: "1. https://…" a line. */
export const linksBlock = (urls: ReadonlyArray<string | null>) => urls.map((u, i) => `${i + 1}. ${u ?? "(link not available)"}`).join("\n");
