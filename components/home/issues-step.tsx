import "./flow.css";
import { getDb } from "@/db";
import { answerIssuesStep } from "@/app/start/actions";
import { IssueCap } from "@/components/start/issue-cap";
import { ISSUE_CATEGORIES } from "@/lib/federal/categories";
import { pickedIssues } from "@/lib/reader-issues";
import { issuesAsked } from "@/lib/follow-defaults";

/**
 * The second step, after the legislators (owner, 18 Nov 2026, point 2): "Pick up to three issues" from the 14, or
 * "Skip for now". It is put to a reader once: when they save or skip, that is recorded (reader_setup.issues_asked_at)
 * and the step leaves the page. Issues can be changed afterwards with the small picker over the coming votes.
 *
 * It stays on the page until the reader answers it here. Picking an issue in the small picker below does not remove
 * it (the chips here follow that choice instead), because a block that vanished above the reader's finger would make
 * the page jump on phones that do not hold their place. So a reader who picked issues before this step existed sees
 * it once, with their issues already ticked; "Skip for now" leaves those issues as they are.
 */
export async function IssuesStep({ userId }: { userId: string | null }) {
  if (!userId) return null;
  const [issues, asked] = await Promise.all([pickedIssues(userId).catch(() => [] as string[]), issuesAsked(getDb(), userId).catch(() => true)]);
  if (asked) return null;
  return <section className="flow-block issues-step" id="issues-step" aria-labelledby="issues-step-h">
    <h2 id="issues-step-h">Next: pick up to three issues</h2>
    <p className="meta">Bills on the issues you pick are listed first. There are {ISSUE_CATEGORIES.length} to choose from, and you can change them at any time.</p>
    <form action={answerIssuesStep}>
      <IssueCap options={ISSUE_CATEGORIES.map(c => ({ slug: c.slug, name: c.name }))} initial={issues} legend="Your issues" />
      <div className="issues-step-actions"><button type="submit" name="choice" value="save">Save my issues</button><button type="submit" name="choice" value="skip" className="quiet">Skip for now</button></div>
    </form>
  </section>;
}
