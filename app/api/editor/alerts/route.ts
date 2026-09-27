import { editorialAuth, editorJson } from "@/lib/editor-auth";
import { evaluateNow, sendTestAlert } from "@/lib/monitoring-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Current monitoring state without sending anything. */
export async function GET() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const result = await evaluateNow();
  return editorJson({ configured: result.configured, checks: result.checks, wouldAlert: result.alerts.map(a => a.kind), suppressed: result.suppressed.map(a => a.kind) });
}

/** Sends a test alert to the configured recipient. */
export async function POST() {
  const auth = await editorialAuth();
  if (!auth.user) return auth.error!;
  const result = await sendTestAlert(`editor ${auth.user.email}`);
  return editorJson(result, result.delivery.ok ? 200 : 502);
}
