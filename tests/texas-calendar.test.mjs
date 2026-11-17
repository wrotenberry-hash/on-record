import test from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, firstWeekdayAfter, inDays, nthWeekday, tloSessionCode, TX_PREFILING_RECORDED, TX_REGULAR_SESSION_DAYS, TX_RULES, txCalendar, txConveneDate,
  txKeyDates, txKeyDatesFor, txSessionDay, txSessionLabel, txSessionState, txToday, weekday } from "../lib/texas/calendar.ts";
import { currentTxSession, TX_SESSIONS } from "../lib/texas/parse.ts";

const S90 = TX_SESSIONS.find(s => s.id === "90");
const row = id => txKeyDatesFor(S90).find(k => k.id === id);

test("date maths: weekdays, nth weekday, days between", () => {
  assert.equal(weekday("2027-01-12"), 2); // Tuesday
  assert.equal(nthWeekday(2027, 1, 2, 2), "2027-01-12");
  assert.equal(nthWeekday(2025, 1, 2, 2), "2025-01-14");
  assert.equal(nthWeekday(2023, 1, 2, 2), "2023-01-10");
  assert.equal(firstWeekdayAfter("2026-11-03", 1), "2026-11-09");
  assert.equal(firstWeekdayAfter("2026-11-09", 1), "2026-11-16"); // strictly after
  assert.equal(addDays("2027-01-12", 139), "2027-05-31");
  assert.equal(addDays("2027-02-28", 1), "2027-03-01"); // 2027 is not a leap year
  assert.equal(daysBetween("2026-11-17", "2027-01-12"), 56);
  assert.equal(daysBetween("2027-01-12", "2026-11-17"), -56);
  assert.equal(inDays(0), "today"); assert.equal(inDays(1), "tomorrow"); assert.equal(inDays(56), "in 56 days");
});

test("today is the date in Austin, not the UTC date", () => {
  assert.equal(txToday(Date.parse("2027-01-12T03:00:00Z")), "2027-01-11"); // 9 pm Central on the 11th
  assert.equal(txToday(Date.parse("2027-01-12T06:00:00Z")), "2027-01-12"); // midnight Central (CST is UTC-6)
  assert.equal(txToday(Date.parse("2027-06-01T04:59:00Z")), "2027-05-31"); // 11:59 pm Central (CDT is UTC-5)
});

test("which session is current and which is upcoming", () => {
  const nov = txSessionState("2026-11-17");
  assert.equal(nov.current.id, "892"); assert.equal(nov.inSession, false); assert.equal(nov.upcoming.id, "90"); assert.equal(nov.focus.id, "90");
  assert.equal(nov.daysUntilUpcoming, 56); assert.deepEqual(nov.ingestOrder, ["90", "892"]);
  // The day before: still upcoming, tomorrow.
  const eve = txSessionState("2027-01-11");
  assert.equal(eve.focus.id, "90"); assert.equal(eve.inSession, false); assert.equal(eve.daysUntilUpcoming, 1);
  // Opening day: the 90th is current, nothing is upcoming, and nothing points at the 89th any more.
  const open = txSessionState("2027-01-12");
  assert.equal(open.current.id, "90"); assert.equal(open.inSession, true); assert.equal(open.upcoming, null); assert.equal(open.focus.id, "90");
  assert.deepEqual(open.ingestOrder, ["90"]);
  // Last day, and the day after.
  assert.equal(txSessionState("2027-05-31").inSession, true);
  const after = txSessionState("2027-06-01");
  assert.equal(after.inSession, false); assert.equal(after.current.id, "90"); assert.equal(after.focus.id, "90"); assert.equal(after.upcoming, null);
  // Agrees with the older helper on every date it is used for.
  for (const d of ["2019-01-08", "2025-01-13", "2025-01-14", "2025-06-02", "2025-06-03", "2025-08-15", "2026-11-16", "2027-01-12", "2027-06-15"]) {
    const a = txSessionState(d), b = currentTxSession(d);
    assert.equal(a.current.id, b.session.id, d); assert.equal(a.inSession, b.inSession, d);
  }
  // A called session entered later becomes the focus while it runs.
  const withCalled = [{ id: "901", tlo: "901", name: "90th Legislature, 1st Called Session", start: "2027-07-06", end: "2027-08-04", regular: false }, ...TX_SESSIONS];
  assert.equal(txSessionState("2027-06-20", withCalled).focus.id, "901");
  assert.equal(txSessionState("2027-07-10", withCalled).current.id, "901");
  assert.deepEqual(txSessionState("2027-06-20", withCalled).ingestOrder, ["901", "90"]);
});

test("session codes and names for sessions not entered yet", () => {
  assert.equal(tloSessionCode("90"), "90R"); assert.equal(tloSessionCode("901"), "901"); assert.equal(tloSessionCode("892"), "892");
  for (const s of TX_SESSIONS) assert.equal(tloSessionCode(s.id), s.tlo, s.id);
  assert.equal(txSessionLabel("90"), "90th Legislature, Regular Session");
  assert.equal(txSessionLabel("901"), "90th Legislature, 1st Called Session");
  assert.equal(txSessionLabel("912"), "91st Legislature, 2nd Called Session");
  assert.equal(txSessionLabel("93"), "93rd Legislature, Regular Session");
  assert.equal(txSessionLabel("x"), "Session x");
});

test("the hard-coded session dates agree with the rules", () => {
  // Government Code 301.001: noon on the second Tuesday in January of each odd-numbered year.
  for (const s of TX_SESSIONS.filter(x => x.regular)) assert.equal(s.start, txConveneDate(Number(s.start.slice(0, 4))), s.name);
  assert.equal(txConveneDate(2026), null); assert.equal(txConveneDate(2027), "2027-01-12"); assert.equal(txConveneDate(2029), "2029-01-09");
  // Constitution Art. III, Sec. 24(b): at most 140 days, the opening day being day 1.
  assert.equal(TX_REGULAR_SESSION_DAYS, 140);
  for (const s of TX_SESSIONS.filter(x => x.regular)) assert.equal(s.end, txSessionDay(s.start, 140), s.name);
  assert.equal(txSessionDay("2027-01-12", 1), "2027-01-12");
});

test("2027 key dates, each recomputed from its rule", () => {
  const k = txKeyDatesFor(S90);
  assert.deepEqual(k.map(x => x.id), ["prefiling", "convene", "filing-deadline", "last-day", "veto-deadline", "effective-91st"]);
  assert.deepEqual(k.map(x => x.date), [...k.map(x => x.date)].sort()); // in date order
  // Early filing: the date on Texas Legislature Online's filed-bills reports, which is also what House Rule 8, Sec. 7 gives:
  // the first Monday after the general election (the Tuesday after the first Monday in November, 2 U.S.C. 7).
  const election = addDays(nthWeekday(2026, 11, 1, 1), 1);
  assert.equal(election, "2026-11-03");
  assert.equal(row("prefiling").date, TX_PREFILING_RECORDED["90"].date);
  assert.equal(row("prefiling").date, firstWeekdayAfter(election, 1));
  assert.equal(row("prefiling").date, "2026-11-09"); assert.equal(row("prefiling").basis, "record"); assert.equal(row("prefiling").expected, false);
  // Opens: second Tuesday in January 2027.
  assert.equal(row("convene").date, nthWeekday(2027, 1, 2, 2)); assert.equal(row("convene").date, "2027-01-12"); assert.equal(weekday(row("convene").date), 2);
  // Day 60 (House Rule 8, Sec. 8), counting opening day as day 1.
  assert.equal(row("filing-deadline").date, addDays("2027-01-12", 59)); assert.equal(row("filing-deadline").date, "2027-03-12"); assert.equal(row("filing-deadline").expected, true);
  assert.equal(daysBetween("2027-01-12", "2027-03-12") + 1, 60);
  // Day 140.
  assert.equal(row("last-day").date, "2027-05-31"); assert.equal(daysBetween("2027-01-12", "2027-05-31") + 1, 140); assert.equal(row("last-day").date, S90.end);
  // Twenty days after adjournment (Art. IV, Sec. 14).
  assert.equal(row("veto-deadline").date, addDays("2027-05-31", 20)); assert.equal(row("veto-deadline").date, "2027-06-20");
  // "Until ninety days after the adjournment" (Art. III, Sec. 39): in force from the 91st day.
  assert.equal(row("effective-91st").date, addDays("2027-05-31", 91)); assert.equal(row("effective-91st").date, "2027-08-30");
  // The same rules applied to the 2025 session's dates on file (opened 14 Jan, 140th day 2 June).
  const k25 = txKeyDatesFor(TX_SESSIONS.find(s => s.id === "89"));
  assert.deepEqual(k25.map(x => [x.id, x.date]), [["convene", "2025-01-14"], ["filing-deadline", "2025-03-14"], ["last-day", "2025-06-02"], ["veto-deadline", "2025-06-22"], ["effective-91st", "2025-09-01"]]);
  // No prefiling row without a record that was read; no rows for a called session.
  assert.equal(k25.some(x => x.id === "prefiling"), false);
  assert.deepEqual(txKeyDatesFor(TX_SESSIONS.find(s => s.id === "892")), []);
});

test("every key date carries plain words and an official source", () => {
  for (const k of txKeyDatesFor(S90)) {
    assert.match(k.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(k.label.length > 5 && k.label.length <= 60, k.label);
    assert.ok(k.meaning.length > 40 && k.meaning.length <= 320, k.id);
    assert.equal((k.meaning.match(/[.!?](\s|$)/g) ?? []).length, 1, `one sentence: ${k.id}`);
    assert.ok(k.sourceUrl.startsWith("https://capitol.texas.gov/"), k.sourceUrl); // the only official Texas host that could be read
    assert.ok(k.sourceLabel.length > 10 && k.rule.length > 10);
    assert.ok(["record", "rule"].includes(k.basis));
    assert.doesNotMatch(`${k.label} ${k.meaning}`, /sine die|adjourn|engross|enroll|appropriation|quorum|cloture/i);
    assert.equal(/\(expected\)/.test(k.label), k.id === "filing-deadline");
  }
  for (const r of Object.values(TX_RULES)) {
    assert.ok(r.quote.length > 40 && r.cite.length > 10, r.id);
    assert.ok(r.sourceUrl.startsWith("https://capitol.texas.gov/"), r.id); assert.equal(r.readOn, "2026-11-17");
  }
  assert.match(TX_RULES.convene.quote, /second Tuesday in January of each odd-numbered year/);
  assert.match(TX_RULES.length.quote, /one hundred and forty \(140\) days/);
  assert.match(TX_RULES.veto.quote, /within twenty days after such adjournment/);
  assert.match(TX_RULES.effective.quote, /ninety days after the adjournment/);
  assert.match(TX_RULES.filingDeadline.quote, /first 60 calendar days/);
  assert.match(TX_RULES.prefiling.quote, /first Monday after the general election/);
});

test("the calendar marks what has passed and picks the next date", () => {
  const nov = txCalendar("2026-11-17");
  assert.equal(nov.session.id, "90");
  assert.deepEqual(nov.rows.map(r => r.passed), [true, false, false, false, false, false]);
  assert.equal(nov.next.id, "convene"); assert.equal(nov.next.daysAway, 56);
  assert.equal(nov.nextLine, "Next: The session opens at noon, in 56 days");
  // On the day itself a date has not passed yet; the day after it has.
  const open = txCalendar("2027-01-12");
  assert.equal(open.next.id, "convene"); assert.equal(open.next.isToday, true); assert.equal(open.nextLine, "Next: The session opens at noon, today");
  const day2 = txCalendar("2027-01-13");
  assert.equal(day2.next.id, "filing-deadline"); assert.equal(day2.nextLine, "Next: Last day to file most bills, in 58 days");
  assert.equal(txCalendar("2027-05-30").nextLine, "Next: Last day the session can meet, tomorrow");
  // After the last key date nothing is next, and the calendar stays on the 2027 session.
  const done = txCalendar("2027-09-15");
  assert.equal(done.session.id, "90"); assert.equal(done.next, null); assert.equal(done.nextLine, null); assert.ok(done.rows.every(r => r.passed));
  // Between sessions in 2025 the 89th's later dates were still ahead.
  assert.equal(txCalendar("2025-06-10").session.id, "89"); assert.equal(txCalendar("2025-06-10").next.id, "veto-deadline");
  assert.equal(txCalendar("2025-10-01").session.id, "90");
  assert.deepEqual(txCalendar("2026-11-17", []), { session: null, rows: [], next: null, nextLine: null });
});

test("the next two key dates, shaped for What's coming", () => {
  const two = txKeyDates(Date.parse("2026-11-17T15:00:00Z"));
  assert.deepEqual(two.map(d => d.key), ["txdate:90:convene", "txdate:90:filing-deadline"]);
  assert.deepEqual(two.map(d => d.date), ["2027-01-12", "2027-03-12"]);
  assert.equal(new Date(two[0].whenMs).toISOString(), "2027-01-12T18:00:00.000Z"); // noon in Austin (CST)
  assert.equal(two[0].title, "The session opens at noon: Texas Legislature");
  assert.equal(two[1].title, "Last day to file most bills (expected): Texas Legislature");
  assert.ok(two.every(d => d.href === "/texas#key-dates" && d.sourceUrl.startsWith("https://capitol.texas.gov/")));
  assert.equal(txKeyDates(Date.parse("2027-09-15T15:00:00Z")).length, 0);
  assert.equal(txKeyDates(Date.parse("2027-06-01T15:00:00Z"), 5).length, 2);
});
