import { applyHandCorrections } from "@/lib/analysis/hand-corrections-run";

/**
 * Applies the hand corrections the owner has approved (lib/analysis/hand-corrections.ts): the three briefing items,
 * 20 Nov 2026. It writes only the text that is in the code, only once the approval switch in the code is on, and each
 * correction only once, so calling it again changes nothing. It answers with bill ids only. No model call.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const result = await applyHandCorrections().catch(error => ({ approved: false, applied: [] as string[], already: [] as string[], skipped: [{ billId: "-", why: (error instanceof Error ? error.message : "failed").slice(0, 200) }] }));
  return Response.json({ service: "on-record", ...result }, { headers: { "Cache-Control": "no-store" } });
}
