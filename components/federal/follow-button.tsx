import { toggleFollow } from "@/app/politicians/actions";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { followedIds } from "@/lib/federal/queries";

/** A server-action form, so it works without client JavaScript. */
export function FollowButton({ politicianId, following, canFollow }: { politicianId: string; following: boolean; canFollow: boolean }) {
  if (!canFollow) return <span className="follow-note">Sign-in for readers arrives in Phase C.</span>;
  return <form action={toggleFollow} className="follow-form"><input type="hidden" name="politicianId" value={politicianId} />
    <button type="submit" className={following ? "follow-btn on" : "follow-btn"} aria-pressed={following}>{following ? "Following" : "Follow"}</button></form>;
}

/**
 * The same button for a page that has not looked up the reader's follows itself (the Texas member page): it finds out
 * who is asking and whether they follow this member. `id` is a Biographical Directory id or a tx_people id.
 */
export async function FollowMember({ id }: { id: string }) {
  const access = await viewerAccess();
  const canFollow = !!access.editor || !!access.invite;
  const following = canFollow ? (await currentAppUserId().then(followedIds).catch(() => new Set<string>())).has(id) : false;
  return <FollowButton politicianId={id} following={following} canFollow={canFollow} />;
}
