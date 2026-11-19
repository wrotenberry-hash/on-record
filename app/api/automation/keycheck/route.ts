import { keyCheck } from "@/lib/key-check";

/**
 * One small live call with the OpenAI key and one with the Open States key, to confirm a key the owner has just
 * replaced (owner, 19 Nov 2026). Says pass or fail for each, in a sentence; never a key or any part of one.
 * Like the health probe it needs no sign-in, so it is paced: the calls go out at most once every 30 minutes
 * (lib/key-check-rules.ts) and the earlier answer is returned in between. It shows no site content.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const r = await keyCheck();
    return Response.json({ service: "on-record", checkedAt: new Date(r.at).toISOString(), fresh: r.fresh, nextCheckAfter: new Date(r.nextAt).toISOString(),
      openai: r.openai, openStates: r.openStates }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ service: "on-record", error: (e instanceof Error ? e.message : "key check failed").replace(/sk-[A-Za-z0-9_-]{6,}/g, "[key]").slice(0, 200) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
