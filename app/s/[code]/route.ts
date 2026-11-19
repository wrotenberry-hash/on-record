import { redirect } from "next/navigation";
import { shareLanding } from "@/lib/share";

export const dynamic = "force-dynamic";

/**
 * A short share link: counts the visit (aggregate only) and lands on the exact item. With SHARED_PAGES_PUBLIC on
 * (off by default), a visitor with no invite lands on the bill the card is about instead (lib/share.ts, shareLanding).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  redirect(await shareLanding((await params).code));
}
