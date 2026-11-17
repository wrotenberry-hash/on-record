import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TX_HISTORY_SESSIONS, MISSING_FROM_TX_SESSIONS, sessionKind, legislatureForYear, tloHeadingToSession, readCount,
  parseTloLegislativeStatistics, parseTloBillList, figuresFromStats, figureFromList, figuresFromLegiscan,
  readStoredCounts, mergeFigures, rowSourceLine, historyPlan, isFinal, figureCell, officialGap, chamberPassage, reconcileFiled, isTxBill, TX_DASH_RULES,
} from "../lib/texas/history-parse.ts";

/**
 * Texas dashboard history (owner's point 6). The fixtures in tests/fixtures/tx-history/ are copies of pages read from
 * Texas Legislature Online on 17 Nov 2026: the Legislative Statistics report, the 89th 2nd called session's signed and
 * unsigned lists, the 89th regular session's vetoed list, and the two joint resolutions the special-session rules are
 * quoted from. The numbers asserted below are the ones printed on those pages.
 */
const FX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "tx-history");
const page = name => readFileSync(join(FX, name), "utf8");
const T = Date.UTC(2026, 10, 17);

test("the sessions compared: 87th to 90th, regular and called, with TLO codes", () => {
  assert.deepEqual(TX_HISTORY_SESSIONS.map(s => s.id), ["90", "892", "891", "89", "884", "883", "882", "881", "88", "873", "872", "871", "87"]);
  const s884 = TX_HISTORY_SESSIONS.find(s => s.id === "884");
  assert.equal(s884.tlo, "884"); assert.equal(s884.regular, false); assert.equal(s884.called, 4); assert.equal(s884.name, "88th Legislature, 4th Called Session");
  assert.equal(TX_HISTORY_SESSIONS.find(s => s.id === "87").tlo, "87R");
  assert.deepEqual(MISSING_FROM_TX_SESSIONS, ["884", "883", "882", "881", "873", "872", "871"], "called sessions of the 87th and 88th are not in TX_SESSIONS yet");
  assert.equal(sessionKind({ regular: true }), "Regular session");
  assert.equal(sessionKind({ regular: false }), "Called (special) session");
  assert.equal(legislatureForYear(2021), 87); assert.equal(legislatureForYear(2026), 89); assert.equal(legislatureForYear(2027), 90);
});

test("TLO session headings, including the page's irregular spellings", () => {
  assert.deepEqual(tloHeadingToSession("90th Regular Session - 2027"), { id: "90", legislature: 90, called: 0, year: 2027 });
  assert.deepEqual(tloHeadingToSession("88th Legislature - 4th Called Session - 2023"), { id: "884", legislature: 88, called: 4, year: 2023 });
  assert.deepEqual(tloHeadingToSession("85 Legislature - 1st Called Session 2017"), { id: "851", legislature: 85, called: 1, year: 2017 });
  assert.deepEqual(tloHeadingToSession("81st Legislature 1st Called Session - 2009"), { id: "811", legislature: 81, called: 1, year: 2009 });
  assert.equal(tloHeadingToSession("Status"), null);
  assert.equal(readCount(" 1,047 "), 1047); assert.equal(readCount("n/a"), null); assert.equal(readCount(""), null);
});

test("Legislative Statistics: every session table is read, and the House and Senate bills add up", () => {
  const p = parseTloLegislativeStatistics(page("legislative-statistics-2026-11-17.html"));
  assert.equal(p.reportDate, "2026-11-17");
  assert.equal(p.sessions.length, 45);
  assert.deepEqual(p.sessions.filter(s => s.problem), []);
  const s89 = p.sessions.find(s => s.id === "89");
  assert.equal(s89.heading, "89th Regular Session - 2025");
  assert.deepEqual([s89.introduced.HB, s89.introduced.SB, s89.introduced.billsTotal], [5644, 3075, 8719]);
  assert.deepEqual([s89.passed.billsTotal, s89.vetoed.billsTotal, s89.vetoed.HJR], [1213, 26, null]);
  for (const id of TX_HISTORY_SESSIONS.map(s => s.id)) assert.ok(p.sessions.some(s => s.id === id), `session ${id} is on the page`);
});

test("a statistics table whose bills do not add up is not stored", () => {
  const bad = `<table><tr><th scope="col" colspan="11">87th Regular Session - 2021</th></tr><tr><th scope="col">Status</th><th scope="col">HB</th><th scope="col">SB</th><th scope="col">Total HB &amp; SB</th></tr>
    <tr><td>Introduced</td><td>10</td><td>5</td><td>16</td></tr></table>`;
  const [s] = parseTloLegislativeStatistics(bad).sessions;
  assert.match(s.problem, /do not add up/);
  assert.deepEqual(figuresFromStats(s, "u", 1), {});
  assert.equal(parseTloLegislativeStatistics("<html>changed layout</html>").sessions.length, 0);
});

test("official figures from the statistics page; no bill passed means none signed", () => {
  const p = parseTloLegislativeStatistics(page("legislative-statistics-2026-11-17.html")), url = "https://capitol.texas.gov/Reports/Report.aspx?ID=legislativestatistics";
  const f89 = figuresFromStats(p.sessions.find(s => s.id === "89"), url, T);
  assert.equal(f89.filed.n, 8719); assert.equal(f89.filedHouse.n, 5644); assert.equal(f89.passedBoth.n, 1213); assert.equal(f89.vetoed.n, 26);
  assert.equal(f89.jrFiled.n, 208 + 87); assert.equal(f89.jrPassed.n, 8 + 10);
  assert.equal(f89.filed.basis, "official"); assert.equal(f89.filed.url, url); assert.equal(f89.filed.readAt, T);
  assert.equal(f89.signed, undefined, "signed comes from its own list");
  const f891 = figuresFromStats(p.sessions.find(s => s.id === "891"), url, T);
  assert.equal(f891.passedBoth.n, 0); assert.equal(f891.signed.n, 0); assert.equal(f891.withoutSignature.n, 0);
  assert.match(f891.signed.source, /no bill passed both chambers/);
});

test("TLO bill lists: count, House and Senate bills only, and the empty sentence", () => {
  const signed = parseTloBillList(page("892-signedbygov.html"));
  assert.equal(signed.title, "Bills Signed by the Governor"); assert.equal(signed.stated, 31); assert.equal(signed.problem, null);
  assert.deepEqual(signed.byType, { HB: 11, HCR: 11, SB: 9 });
  assert.equal(figureFromList(signed, "signed", "u", T).signed.n, 20, "concurrent resolutions are not bills");
  const none = parseTloBillList(page("892-filedwogovsign.html"));
  assert.equal(none.noneStatement, true); assert.equal(none.stated, 0); assert.equal(none.problem, null);
  assert.equal(figureFromList(none, "withoutSignature", "u", T).withoutSignature.n, 0);
  const vetoed = parseTloBillList(page("89R-vetoedbygov.html"));
  assert.equal(vetoed.stated, 26); assert.deepEqual(vetoed.byType, { HB: 12, SB: 14 });
  const comma = parseTloBillList(`<h2>Bills Signed by the Governor</h2>Number of Bills: 1,002<a href="History.aspx?LegSess=89R&amp;Bill=HB1">HB 1</a>`);
  assert.equal(comma.stated, 1002); assert.match(comma.problem, /says 1002 bills but lists 1/);
  assert.deepEqual(figureFromList(comma, "signed", "u", T), {}, "a list that does not match its own count is not used");
  assert.match(parseTloBillList("<html><body>Server busy</body></html>").problem, /neither a count/);
});

test("LegiScan counts: House and Senate bills by status, always counted", () => {
  const f = figuresFromLegiscan([{ number: "HB 1", status: 4 }, { number: "SB 2", status: 2 }, { number: "SB 3", status: 5 }, { number: "HB 4", status: 1 }, { number: "HR 9", status: 4 }, { number: "HB 5", status: 3 }], 2100, T);
  assert.deepEqual(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.n])), { filed: 5, passedOrigin: 4, passedBoth: 3, becameLaw: 1, vetoed: 1 });
  assert.ok(Object.values(f).every(x => x.basis === "counted"));
  assert.deepEqual(figuresFromLegiscan([{ number: "HR 1", status: 4 }], 1, T), {});
});

test("stored rows: this module's format, and the older LegiScan stage counts read as counted", () => {
  const fig = { n: 5, basis: "official", source: "S", url: "u", readAt: T };
  assert.deepEqual(readStoredCounts({ v: 2, figures: { filed: fig, bogus: fig, vetoed: { n: "x" } } }, "row", T), { filed: fig });
  const legacy = readStoredCounts({ filed: 10, passed_first: 3, governor: 1, law: 5, vetoed: 1 }, "LegiScan master list, session 2100", T);
  assert.equal(legacy.filed.n, 20); assert.equal(legacy.passedBoth.n, 7); assert.equal(legacy.becameLaw.n, 5); assert.equal(legacy.passedOrigin.n, 10);
  assert.ok(Object.values(legacy).every(x => x.basis === "counted"));
  assert.deepEqual(readStoredCounts(null, "x", T), {}); assert.deepEqual(readStoredCounts({}, "x", T), {});
});

test("a counted figure never replaces an official one", () => {
  const off = { n: 8719, basis: "official", source: "TLO", url: "u", readAt: T }, cnt = { n: 8700, basis: "counted", source: "LegiScan", url: "l", readAt: T + 1 };
  const a = mergeFigures({ filed: off }, { filed: cnt, passedOrigin: cnt });
  assert.equal(a.figures.filed, off); assert.equal(a.figures.passedOrigin, cnt); assert.deepEqual(a.kept, ["filed"]); assert.deepEqual(a.changed, ["passedOrigin"]);
  const b = mergeFigures({ filed: cnt }, { filed: off });
  assert.equal(b.figures.filed, off, "an official figure replaces a counted one");
  const c = mergeFigures({ filed: off }, { filed: { ...off, n: 8720, readAt: T + 5 } });
  assert.equal(c.figures.filed.n, 8720, "a newer official figure replaces an older one");
  assert.deepEqual(mergeFigures({ filed: off }, { filed: off }).changed, []);
  assert.equal(rowSourceLine({ filed: off, passedOrigin: cnt }), "TLO; LegiScan (counted)");
  assert.equal(rowSourceLine({}), "nothing read yet");
});

test("what to read next: the statistics page first, then lists for sessions that sent bills to the Governor", () => {
  const sessions = TX_HISTORY_SESSIONS.filter(s => ["89", "891"].includes(s.id));
  assert.deepEqual(historyPlan({}, T, { legiscan: false, sessions }), [{ kind: "stats" }]);
  const p = parseTloLegislativeStatistics(page("legislative-statistics-2026-11-17.html"));
  const byId = Object.fromEntries(sessions.map(s => [s.id, figuresFromStats(p.sessions.find(x => x.id === s.id), "u", T)]));
  assert.deepEqual(historyPlan(byId, T + 60e3, { legiscan: false, sessions }), [{ kind: "list", session: "89", list: "signedbygov" }, { kind: "list", session: "89", list: "filedwogovsign" }]);
  byId["89"].signed = { n: 1047, basis: "official", source: "S", url: "u", readAt: T }; byId["89"].withoutSignature = { n: 140, basis: "official", source: "W", url: "u", readAt: T };
  assert.deepEqual(historyPlan(byId, T + 60e3, { legiscan: false, sessions }), [], "nothing to do within the week");
  // A week later the 2025 figures are read again until they have been read in 2026 or later (they were: read 17 Nov 2026), so nothing.
  assert.deepEqual(historyPlan(byId, T + 8 * 86400e3, { legiscan: false, sessions }), []);
  assert.deepEqual(historyPlan(byId, T + 60e3, { legiscan: true, sessions }), [{ kind: "legiscan", session: "891" }, { kind: "legiscan", session: "89" }]);
});

test("a figure is final once read in a later year than the session met", () => {
  const s90 = TX_HISTORY_SESSIONS.find(s => s.id === "90"), s89 = TX_HISTORY_SESSIONS.find(s => s.id === "89");
  const at = readAt => ({ n: 1, basis: "official", source: "S", url: "u", readAt });
  assert.equal(isFinal(at(Date.UTC(2026, 0, 2)), s89), true);
  assert.equal(isFinal(at(Date.UTC(2025, 11, 31)), s89), false);
  assert.equal(isFinal(at(T), s90), false);
  const byId = Object.fromEntries(TX_HISTORY_SESSIONS.map(s => [s.id, { filed: at(T) }]));
  assert.deepEqual(historyPlan(byId, T + 8 * 86400e3, { legiscan: false }), [{ kind: "stats" }], "the 90th's count of bills filed is read again each week");
});

test("cells for the page: became law is signed plus unsigned; missing figures say why", () => {
  const o = (n, source) => ({ n, basis: "official", source, url: "u", readAt: T });
  const f = { signed: o(1047, "Signed list"), withoutSignature: o(140, "Unsigned list"), passedBoth: o(1213, "Stats"), vetoed: o(26, "Stats") };
  const law = figureCell(f, "becameLaw");
  assert.equal(law.n, 1187); assert.equal(law.basis, "sum"); assert.match(law.source, /Signed list plus Unsigned list/);
  assert.equal(officialGap(f), 0);
  assert.equal(officialGap({ ...f, vetoed: o(20, "Stats") }), 6);
  assert.equal(officialGap({ passedBoth: f.passedBoth }), null);
  assert.equal(figureCell({}, "filed").missing, "Not loaded yet"); assert.equal(figureCell({}, "filed").n, null);
  assert.match(figureCell({}, "passedOrigin").missing, /Not on the official statistics page/);
  assert.equal(figureCell({ becameLaw: { n: 9, basis: "counted", source: "L", url: "l", readAt: T } }, "becameLaw").basis, "counted");
});

test("the session on file: passage by chamber, bills only", () => {
  const p = chamberPassage([
    { identifier: "HB 1", chamber: "lower", stage: "passed_first", n: 1 }, { identifier: "SB 1", chamber: "upper", stage: "passed_first", n: 1 },
    { identifier: "HB 2", chamber: "lower", stage: "law", n: 1 }, { identifier: "SB 2", chamber: "upper", stage: "vetoed", n: 1 },
    { identifier: "HB 3", chamber: "lower", stage: "governor", n: 1 }, { identifier: "HB 4", chamber: "lower", stage: "failed", n: 1 },
    { identifier: "HR 5", chamber: "lower", stage: "law", n: 1 }, { identifier: "HJR 6", chamber: "lower", stage: "passed_both", n: 1 },
  ]);
  assert.deepEqual(p, { filed: 6, passedHouse: 4, passedSenate: 4, passedBoth: 3, awaitingGovernor: 1, law: 1, vetoed: 1 });
  assert.equal(chamberPassage([{ chamber: "lower", stage: "filed", n: 7 }]).filed, 7, "rows already limited to bills");
  assert.equal(isTxBill("HB 12"), true); assert.equal(isTxBill("HJR 12"), false); assert.equal(isTxBill("SCR 1"), false);
});

test("bills on file against the official count of bills filed", () => {
  assert.match(reconcileFiled(120, { n: 368, basis: "official", source: "S", url: "u", readAt: T }).line, /^120 of 368 bills filed are on file \(still loading\)/);
  assert.equal(reconcileFiled(368, { n: 368, basis: "official", source: "S", url: "u", readAt: T }).complete, true);
  assert.match(reconcileFiled(5, undefined).line, /official count is not loaded yet/);
  assert.equal(reconcileFiled(5, { n: 3, basis: "counted", source: "L", url: "l", readAt: T }).official, null, "a counted figure is not the official count");
});

test("the special-session rules are quoted word for word from the pages they cite", () => {
  const plain = html => html.replace(/<[^>]+>/g, " ").replace(/&#xA0;|&nbsp;/g, " ").replace(/[[\]]/g, " ").replace(/\s+/g, " ");
  assert.ok(plain(page("87R-HJ00060I.htm")).includes(TX_DASH_RULES.specialLength.quote));
  assert.ok(plain(page("89R-HJ00192I.htm")).includes(TX_DASH_RULES.specialCall.quote));
  assert.match(TX_DASH_RULES.specialLength.sourceUrl, /HJ00060I/); assert.match(TX_DASH_RULES.specialCall.sourceUrl, /HJ00192I/);
  assert.match(TX_DASH_RULES.length.quote, /one hundred and forty \(140\) days/);
});
