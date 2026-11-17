// The trial welcome screen (test-ready build, 17 Nov 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { bookingUrl, inviteLanding, TRY_FIRST } from "../lib/trial-welcome.ts";

test("the booking link is used only when it is a real https address", () => {
  assert.equal(bookingUrl("https://calendly.com/someone/15min"), "https://calendly.com/someone/15min");
  for (const bad of [undefined, "", "  ", "calendly.com/x", "http://calendly.com/x", "javascript:alert(1)", "https://localhost"]) assert.equal(bookingUrl(bad), null, String(bad));
});

test("an invite link lands on the welcome screen the first time, the home page after", () => {
  assert.equal(inviteLanding(0), "/welcome"); assert.equal(inviteLanding(1), "/welcome"); assert.equal(inviteLanding(2), "/");
});

test("the welcome screen offers three things to try, each one tap away, in plain words", () => {
  assert.equal(TRY_FIRST.length, 3);
  for (const t of TRY_FIRST) { assert.match(t.href, /^\//); assert.ok(t.what.split(/\s+/).length <= 30, t.title); assert.doesNotMatch(`${t.title} ${t.what}`, /cloture|appropriat|stakeholder|leverage/i); }
});
