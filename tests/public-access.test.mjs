import test from "node:test";
import assert from "node:assert/strict";
import { publicReadEnabled, publiclyListable, PUBLIC_INVENTORY_STATUSES, inventoryVisible,
  PUBLIC_INVENTORY_MIN_PUBLISHED, passageAround } from "../lib/public-access.ts";

test("anonymous read access is off unless the flag is explicitly truthy", () => {
  for (const value of [undefined, null, "", "0", "false", "off", "no", "public", " "]) assert.equal(publicReadEnabled(value), false, String(value));
  for (const value of ["1", "true", "TRUE", " yes ", "on"]) assert.equal(publicReadEnabled(value), true, value);
});

test("rejected representations are never publicly listable", () => {
  assert.deepEqual([...PUBLIC_INVENTORY_STATUSES], ["CANDIDATE", "APPROVED"]);
  assert.equal(publiclyListable("CANDIDATE"), true);
  assert.equal(publiclyListable("APPROVED"), true);
  assert.equal(publiclyListable("REJECTED"), false);
  assert.equal(publiclyListable(""), false);
});

test("the incoming inventory waits for twenty reviewed records even when reading is public", () => {
  assert.equal(PUBLIC_INVENTORY_MIN_PUBLISHED, 20);
  assert.equal(inventoryVisible(false, 100), false);
  assert.equal(inventoryVisible(true, 0), false);
  assert.equal(inventoryVisible(true, 19), false);
  assert.equal(inventoryVisible(true, 20), true);
  assert.equal(inventoryVisible(true, Number.NaN), false);
});

test("public records carry the passage around the quote, not the whole capture", () => {
  const before = Array.from({ length: 300 }, (_, i) => `before${i}`).join(" ");
  const after = Array.from({ length: 300 }, (_, i) => `after${i}`).join(" ");
  const quote = "Unemployment fell to 3.4 percent in March.";
  const content = `${before} ${quote} ${after}`;
  const passage = passageAround(content, quote, 100);
  assert.ok(passage.includes(quote));
  assert.ok(passage.startsWith("… "));
  assert.ok(passage.endsWith(" …"));
  assert.ok(passage.length < 100 * 2 + quote.length + 40, "passage stays near the radius");
  assert.ok(!passage.includes("before0 "), "far-away text is trimmed");
  assert.match(passage, /… before\d+ /, "leading cut lands on a word boundary");
  assert.match(passage, / after\d+ …$/, "trailing cut lands on a word boundary");
});

test("a short capture or an unfound quote still yields a non-empty passage", () => {
  assert.equal(passageAround("Short statement with the quote.", "the quote"), "Short statement with the quote.");
  const long = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
  const fallback = passageAround(long, "not present", 50);
  assert.ok(fallback.startsWith("w0 "));
  assert.ok(fallback.endsWith(" …"));
  assert.equal(passageAround("", ""), "");
});
