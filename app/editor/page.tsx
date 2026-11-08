import { requireEditorUser } from "@/lib/auth";
import EditorClient from "./editor-client";

// Identity comes from the session cookie on each request, so no static render.
export const dynamic = "force-dynamic";

/**
 * The sign-in gate lives here, not in the layout, because only a page sees the
 * query string: the morning email links to /editor?case=<id>, and a reviewer
 * whose 30-day session has lapsed must land on that case after signing in.
 */
export default async function EditorPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const { case: caseId } = await searchParams;
  const returnTo = caseId && /^[\w-]{1,100}$/.test(caseId) ? `/editor?case=${encodeURIComponent(caseId)}` : "/editor";
  await requireEditorUser(returnTo);
  return <EditorClient />;
}
