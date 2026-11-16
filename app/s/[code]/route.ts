import { redirect } from "next/navigation";
import { openShareLink } from "@/lib/share";

export const dynamic = "force-dynamic";

/** A short share link: counts the visit (aggregate only) and lands on the exact item. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const target = await openShareLink((await params).code);
  redirect(target ? `${target}${target.includes("?") ? "&" : "?"}from=share` : "/");
}
