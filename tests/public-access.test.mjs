import test from "node:test";
import assert from "node:assert/strict";
import { publicReadEnabled, publiclyListable, PUBLIC_INVENTORY_STATUSES } from "../lib/public-access.ts";

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
