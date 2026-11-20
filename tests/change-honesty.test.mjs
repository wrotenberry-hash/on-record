// Suggest changes: what no screen of this feature may say (owner's conditions, 20 Nov 2026).
//   1. "Until counting is on and delivery exists, every screen says the choice is 'recorded' and never 'sent to your
//      legislator'. No neighbor counts are shown or implied."
//   2. "If a hearing date can't be confirmed, the page says the date isn't known."
// and from the brief: "Never overpromise impact."
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const walk = dir => !existsSync(join(ROOT, dir)) ? [] : readdirSync(join(ROOT, dir)).flatMap(f => {
  const rel = join(dir, f);
  return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(f) ? [rel] : [];
});
// Every file of the feature, and the two bill pages that carry its block.
const FILES = [...walk("lib/changes"), ...walk("components/changes"), ...walk("app/editor/changes"), ...walk("app/bills/[id]/text"), ...walk("app/texas/bills/[id]/text"),
  "app/bills/[id]/page.tsx", "app/texas/bills/[id]/page.tsx"];
// Comments explain the rules and may name what is forbidden; what a reader can be shown is in strings and markup.
const shown = f => readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

test("the feature's files are all looked at", () => {
  assert.ok(FILES.length >= 12, `${FILES.length} files`);
  for (const f of ["lib/changes/window.ts", "lib/changes/draft.ts", "lib/changes/run.ts", "components/changes/window-block.tsx"]) assert.ok(FILES.includes(f), f);
});

test("no screen says a choice is sent, delivered or shown to a legislator", () => {
  const SENT = /\b(?:sent|send|sends|delivered|deliver|delivers|forwarded|passed on|goes|go)\b[^.\n"`]{0,40}\bto (?:your|their|the|his|her)\b[^.\n"`]{0,30}\b(?:legislators?|representatives?|senators?|members? of congress|office)\b/i;
  const SEES = /\byour (?:legislators?|representatives?|senators?)\b[^.\n"`]{0,30}\b(?:will see|sees|can see|is told|are told|will hear|hears)\b/i;
  for (const f of FILES) {
    // The drafting instructions tell the writer who may later see a count; that text goes to the model, never to a reader.
    const text = f === "lib/changes/draft.ts" ? shown(f).replace(/export const MENU_INSTRUCTIONS = `[\s\S]*?`;/, "") : shown(f);
    assert.doesNotMatch(text, SENT, f); assert.doesNotMatch(text, SEES, f);
  }
});

test("no neighbor counts are shown or implied", () => {
  for (const f of FILES) {
    const text = shown(f);
    assert.doesNotMatch(text, /neighbou?rs?\b/i, f);
    assert.doesNotMatch(text, /\b(?:others|other people|people) in your (?:district|area|state)\b[^.\n]{0,40}\b(?:chose|asked|agree|picked|want)/i, f);
  }
});

test("nothing promises an effect: procedure is stated, outcomes are not forecast", () => {
  const PROMISE = /\b(?:make a difference|your voice (?:counts|matters|will)|will be heard|make them listen|you can change (?:this|the) bill|your input (?:will|can) change|have an impact|make an impact)\b/i;
  for (const f of FILES) assert.doesNotMatch(shown(f), PROMISE, f);
});

test("a hearing date that has not been confirmed is never printed, and the page says the date isn't known", () => {
  const w = readFileSync(join(ROOT, "lib/changes/window.ts"), "utf8");
  assert.match(w, /The date isn't known\./);
  assert.match(w, /No hearing date is known\./);
  // The Texas bill page names a listed hearing without its date.
  const tx = readFileSync(join(ROOT, "app/texas/bills/[id]/page.tsx"), "utf8");
  assert.doesNotMatch(shown("app/texas/bills/[id]/page.tsx"), /Upcoming hearing:/);
  assert.match(tx, /Its date has not been confirmed against the Legislature&apos;s own notice, so the date isn&apos;t shown here\./);
  assert.doesNotMatch(shown("app/texas/bills/[id]/page.tsx"), /hearings\.map\(h => `[^`]*toLocaleString/, "no hearing time is formatted on the Texas bill page");
});

test("a drafted menu is never shown to readers by this phase's code", () => {
  // Only the editor's pages and the drafting run read the menu tables.
  const readers = [...walk("app"), ...walk("components"), ...walk("lib")].filter(f => /changeMenus|changeOptions|change_menus|change_options/.test(readFileSync(join(ROOT, f), "utf8")));
  for (const f of readers) assert.match(f, /^(?:app\/editor\/changes\/|lib\/changes\/|app\/api\/automation\/(?:changes|change-packets)\/)/, `${f} reads the menu tables`);
});
