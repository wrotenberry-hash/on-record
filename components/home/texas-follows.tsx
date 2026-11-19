import "./flow.css";
import Link from "next/link";
import { getDb } from "@/db";
import { FollowButton } from "@/components/federal/follow-button";
import { followedMemberIds, texasMembersByIds } from "@/lib/flow/card-store";
import { endOfList, partyWord, seatLine } from "@/lib/flow/cards";

export type TexasFollow = { id: string; name: string; party: string; chamber: string; district: string };

/** The Texas legislators a reader follows (a follow of a Texas member is kept under the member's tx_people id). */
export async function texasFollowsOf(userId: string | null): Promise<TexasFollow[]> {
  if (!userId) return [];
  const db = getDb();
  return texasMembersByIds(db, await followedMemberIds(db, userId)).catch(() => []);
}

/**
 * On the Following page: the Texas legislators the reader follows, each with a link to their page and the same
 * Following button as a member of Congress, so a follow made by default can be undone here. The reader's own list;
 * it is shown to no one else.
 */
export function TexasFollows({ people }: { people: TexasFollow[] }) {
  if (!people.length) return null;
  return <article className="follow-card" aria-labelledby="tx-follows-h">
    <h2 id="tx-follows-h">Texas legislators you follow</h2>
    <ul className="result-list">{people.map(p => <li key={p.id}>
      <Link href={`/texas/members/${encodeURIComponent(p.id)}`}><b>{p.name}</b></Link>
      <span className="meta">{partyWord(p.party)} · {seatLine({ level: "state", chamber: p.chamber === "upper" ? "upper" : "lower", district: p.district })}</span>
      <FollowButton politicianId={p.id} following canFollow /></li>)}</ul>
    <p className="list-end">{endOfList(people.length, people.length, { one: "Texas legislator you follow", many: "Texas legislators you follow" }).text} Their recorded votes are on each one’s page.</p>
  </article>;
}
