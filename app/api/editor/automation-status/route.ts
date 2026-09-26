import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { automationRuns } from "@/db/schema";
import { editorialAuth, editorJson } from "@/lib/editor-auth";


export async function GET() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const runs = await getDb().select().from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(20);
  return editorJson({ runs });
}
