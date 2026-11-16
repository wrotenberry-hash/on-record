import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { readerIssues } from "@/db/schema";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";

/** Round D: up to three issues a reader picked at onboarding. Cookie for anyone; reader_issues for trial readers so it syncs. Never shown to others. */
export const ISSUES_COOKIE = "or_issues";
const valid = (s: string) => ISSUE_CATEGORIES.some(c => c.slug === s);
export function cleanIssues(raw: string[]) { return [...new Set(raw.filter(valid))].slice(0, 3); }

export async function pickedIssues(userId: string | null): Promise<string[]> {
  if (userId) { const rows = await getDb().select({ s: readerIssues.slug }).from(readerIssues).where(eq(readerIssues.userId, userId)).catch(() => []); if (rows.length) return rows.map(r => r.s); }
  return cleanIssues(String((await cookies()).get(ISSUES_COOKIE)?.value ?? "").split(","));
}

/** Server actions only. */
export async function savePickedIssues(userId: string | null, slugs: string[]) {
  const picked = cleanIssues(slugs);
  (await cookies()).set(ISSUES_COOKIE, picked.join(","), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 24 * 3600 });
  if (userId) {
    const db = getDb();
    await db.delete(readerIssues).where(eq(readerIssues.userId, userId));
    if (picked.length) await db.insert(readerIssues).values(picked.map(slug => ({ userId, slug, createdAt: Date.now() })));
  }
  return picked;
}
