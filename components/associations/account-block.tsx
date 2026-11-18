import { getDb } from "@/db";
import { shortDate } from "@/components/federal/badges";
import { WHAT_AN_ASSOCIATION_SEES } from "@/lib/associations/rules";
import { associationsEnabled } from "@/lib/associations/session";
import { membershipsOf } from "@/lib/associations/store";
import { MemberForms } from "./member-forms";

/**
 * The Account page's block for associations: the ones this reader is in, a Leave button for each, and the join form.
 * Nothing is drawn while associations are switched off. The reader sees only their own memberships.
 */
export async function AssociationsBlock({ accountId }: { accountId: string }) {
  if (!associationsEnabled()) return null;
  const memberships = await membershipsOf(getDb(), accountId).catch(() => []);
  return <div className="fed-section" id="associations"><h2>Associations</h2>
    <p className="meta">{WHAT_AN_ASSOCIATION_SEES}</p>
    <MemberForms memberships={memberships.map(m => ({ id: m.id, name: m.name, joined: shortDate(m.joinedAt) }))} />
  </div>;
}
