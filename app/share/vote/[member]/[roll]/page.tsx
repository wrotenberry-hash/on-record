import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Older share links: the vote card now lives on the shared card page (Round G). */
export default async function ShareVotePage({ params }: { params: Promise<{ member: string; roll: string }> }) {
  const { member, roll } = await params;
  redirect(/^[A-Z]\d{6}$/.test(member) && /^[a-z0-9-]{5,40}$/.test(roll) ? `/share/card?t=vote&member=${member}&roll=${roll}` : "/politicians");
}
