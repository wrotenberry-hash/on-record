import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { representations } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { loadCase } from "./_shared";

export async function GET() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  try {
    const rows = await getDb().select({ id: representations.id }).from(representations)
      .orderBy(desc(representations.extractedAt)).limit(100);
    const cases = (await Promise.all(rows.map(({ id }) => loadCase(id)))).filter(x => x !== null);
    return editorJson({ cases });
  } catch (error) {
    console.error("Cases listing failed", error);
    return editorJson({ error: "Case listing unavailable" }, 503);
  }
}
