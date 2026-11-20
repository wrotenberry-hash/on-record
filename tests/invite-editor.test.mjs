// An invite link opened by the signed-in editor (20 Nov 2026). While the editor is signed in, the site shows the
// editor's view and ignores an invite, so the owner's own test of a link landed on the editor's workspace and looked
// broken. The link now says what is happening, is not used up, and tells the editor how to see a reader's view.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("a genuine link opened by the editor explains itself and is not used up", () => {
  const route = read("app/trial/[token]/route.ts");
  const editor = route.indexOf('if (await getEditorUser().catch(() => null)) return to("/trial?state=editor");');
  assert.ok(editor > 0);
  // Only after the link has been checked (an invalid or withdrawn link still says so), and before anything is counted or set.
  assert.ok(editor > route.indexOf("if (!invite)") && editor > route.indexOf("if (!gate.open)"));
  assert.ok(editor < route.indexOf('countEvent("invite_redeemed"') && editor < route.indexOf("response.cookies.set(TRIAL_COOKIE"));
  const page = read("app/trial/page.tsx");
  assert.match(page, /editor: \{ title: "You are signed in as the editor\."/);
  assert.match(page, /open the link in a private window where you have not signed in/);
  assert.match(page, /has not been used up/);
  // The reason it happens: the home page sends anyone without an invite, the editor included, to the workspace,
  // and an editor's sign-in comes before an invite.
  assert.match(read("app/page.tsx"), /if \(!publicRead && !access\.invite\) redirect\("\/editor"\);/);
  assert.match(read("lib/viewer.ts"), /const invite = !publicRead && !editor \? await currentInvite\(\) : null;/);
});
