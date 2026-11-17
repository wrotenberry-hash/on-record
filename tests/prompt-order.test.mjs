import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generatorNumber, atOrAfter, generatorNumberSql } from "../lib/analysis/prompt-order.ts";

test("generator versions order by number, not as text", () => {
  assert.equal(generatorNumber("b9-2026-11-17"), 9);
  assert.equal(generatorNumber("b11-2026-11-17"), 11);
  assert.ok("b11-2026-11-17" < "b9-2026-11-17", "as text, b11 sorts below b9: the reason this file exists");
  assert.equal(atOrAfter("b11-2026-11-17", "b9-2026-11-17"), true);
  assert.equal(atOrAfter("b9-2026-11-17", "b11-2026-11-17"), false);
  assert.equal(atOrAfter("b11-2026-11-17", "b11-2026-11-17"), true);
});

test("a closed or unreadable gate shows nothing", () => {
  assert.equal(atOrAfter("b11-2026-11-17", null), false);
  assert.equal(atOrAfter("b11-2026-11-17", "latest"), false);
  assert.equal(atOrAfter(null, "b5-2026-11-16"), false);
  assert.equal(atOrAfter("", "b5-2026-11-16"), false);
});

test("the database comparison reads the same number", () => {
  assert.equal(generatorNumberSql("s.prompt_version"), "cast(substr(s.prompt_version, 2) as integer)");
});

test("no gate compares prompt versions as text", () => {
  const gate = readFileSync(new URL("../lib/analysis/publish-gate.ts", import.meta.url), "utf8");
  assert.ok(!/prompt_?[vV]ersion\}?\s*>=\s*['$]/.test(gate.replace(/cast\(substr\([^)]*\) as integer\)/g, "N")), "publish-gate.ts must compare generator numbers");
  assert.ok(gate.includes("generatorNumber(PUBLIC_MIN_PROMPT)"));
});

test("Texas summaries do not ride on the federal gate", () => {
  const gate = readFileSync(new URL("../lib/analysis/publish-gate.ts", import.meta.url), "utf8");
  const tx = readFileSync(new URL("../lib/texas/summaries.ts", import.meta.url), "utf8");
  assert.match(gate, /export const TEXAS_SUMMARIES_PUBLIC = false;/);
  assert.ok(!tx.includes("PUBLIC_MIN_PROMPT"), "Texas summaries must use their own switch");
});

test("the gate is open from the first generator that passed the full standard", () => {
  const gate = readFileSync(new URL("../lib/analysis/publish-gate.ts", import.meta.url), "utf8");
  const min = /export const PUBLIC_MIN_PROMPT = (null|"([^"]+)")/.exec(gate);
  assert.ok(min, "PUBLIC_MIN_PROMPT not found");
  if (min[2]) assert.ok(generatorNumber(min[2]) >= 11, "nothing written before generator b11 may be shown");
});
