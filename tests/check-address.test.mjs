// Owner, 21 Nov 2026 (a trial reader typed his address and waited for suggestions): "Address entry: option A … Add one
// line under the field: 'Your address is checked once against the U.S. Census Bureau and is never sent to an
// advertiser or data company.'" Option A: no suggest-as-you-type and no new key; clearer wording, a "Check address"
// button, and the matched address shown back for confirmation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADDRESS_PROMISE, CHECK_ADDRESS, NO_SUGGESTIONS, yesLabel } from "../lib/address-words.ts";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the words, as the owner gave them", () => {
  assert.equal(ADDRESS_PROMISE, "Your address is checked once against the U.S. Census Bureau and is never sent to an advertiser or data company.");
  assert.equal(CHECK_ADDRESS, "Check address");
  assert.match(NO_SUGGESTIONS, /^Suggestions do not appear as you type/);
  assert.equal(yesLabel("Show my legislators"), "Yes, show my legislators"); assert.equal(yesLabel("Update my legislators"), "Yes, update my legislators");
});

test("the form: the promise sits right under the street field, and the button says what it does", () => {
  const f = read("components/home/place-form.tsx");
  assert.match(f, /name="street" autoComplete="street-address"[^>]*\n[^>]*\/>\n\s*<p className="hint place-promise">\{ADDRESS_PROMISE\}<\/p>/, "directly under the field");
  assert.match(f, /<button type="submit" disabled=\{pending\}>\{pending \? "Checking your address…" : CHECK_ADDRESS\}<\/button>/);
  assert.match(f, /autoComplete="street-address"/, "the phone's own saved address is still offered");
  assert.doesNotMatch(f, /fetch\(|googleapis|mapbox|geoapify|radar\.|smarty/i, "no suggest-as-you-type service, no new key");
});

test("the matched address is shown back and nothing is saved until the reader says yes", () => {
  const a = read("app/start/actions.ts"), f = read("components/home/place-form.tsx");
  const found = a.slice(a.indexOf("if (d.matchedAddress?.trim()) {"), a.indexOf("} else {", a.indexOf("if (d.matchedAddress?.trim()) {")));
  assert.match(found, /return \{ error: null, message: null, zip: typedZip, street: typedStreet, n: \(prev\?\.n \?\? 0\) \+ 1, confirm: \{ matched: d\.matchedAddress\.trim\(\) \} \};/);
  assert.doesNotMatch(found, /saveLocation/, "not saved at this point");
  assert.match(found, /set\(PENDING_COOKIE, `\$\{zip\}~\$\{encodeLocation\(loc\)\}`, \{ httpOnly: true[^}]*maxAge: 600 \}\)/, "the ZIP and district ids wait on the reader's device for ten minutes; never the address");
  // Saying yes saves that match as it was found: the Census Bureau is not asked a second time.
  const yes = a.slice(a.indexOf('if (formData.get("confirm") === "1") {'), a.indexOf("const zip = cleanZip(typedZip), place"));
  assert.match(yes, /await saveLocation\(uid, pending\); await rememberZip\(okZip\);/); assert.doesNotMatch(yes, /geocodeAddress/, "checked once");
  assert.match(yes, /jar\.delete\(PENDING_COOKIE\);/);
  assert.match(f, /<button type="submit" name="confirm" value="1" disabled=\{pending\}>/);
  assert.match(f, /<button type="button" className="secondary" onClick=\{\(\) => setSetAside\(state\.n\)\}>No, let me fix it<\/button>/, "the typing stays; the match is put aside");
  assert.match(f, /<p className="place-matched"><b>\{matched\}<\/b><\/p>/);
  // A ZIP code alone has no address to confirm: it still goes straight to the legislators.
  assert.match(a, /await countEvent\("lookup_zip_ok", access\.audience\);\s*loc = \{ state: place\.state/);
  assert.match(read("lib/trust.ts"), /name: "or_place_pending"[^}]*holds: "Your ZIP code and your state and district codes\. Not your address\.", lasts: "10 minutes"/);
});
