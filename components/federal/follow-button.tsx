import { toggleFollow } from "@/app/politicians/actions";

/** A server-action form, so it works without client JavaScript. */
export function FollowButton({ politicianId, following, canFollow }: { politicianId: string; following: boolean; canFollow: boolean }) {
  if (!canFollow) return <span className="follow-note">Sign-in for readers arrives in Phase C.</span>;
  return <form action={toggleFollow} className="follow-form"><input type="hidden" name="politicianId" value={politicianId} />
    <button type="submit" className={following ? "follow-btn on" : "follow-btn"} aria-pressed={following}>{following ? "Following" : "Follow"}</button></form>;
}
