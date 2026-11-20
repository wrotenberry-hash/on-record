/**
 * Suggest changes: the text of each version of a bill, kept section by section as published (bill_text_sections;
 * owner, 20 Nov 2026; docs/SUGGEST_CHANGES.md). An option on a menu of changes quotes one of these rows word for word,
 * and the "exact section" page (/bills/[id]/text) shows it with a link to the official file.
 *
 * Rules:
 *   - A version already stored is never fetched again; a version is stored whole or not at all.
 *   - A failed or empty read stores nothing. What was not read is said in `notes`, in plain words.
 *   - The text is stored in full however long it is; a very long version gets a note.
 *   - No model is used and nothing here costs money: these are plain requests to govinfo.gov and capitol.texas.gov.
 *
 * Relative imports and a database handle that can be passed in (`db`), so tests/bill-text.test.mjs runs this against a
 * temporary database with a stand-in for the network (`fetchText`). The site passes neither.
 *
 * Texas: the path is built on the same readers as the Texas summary gatherer (lib/texas/analysis/gather.ts) and is
 * TESTED ON SAVED PAGES ONLY (tests/fixtures/texas-sources). It has not been run against capitol.texas.gov.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { billTextSections, officialBills, officialBillTexts, txBills, txBillVersions } from "../../db/schema.ts";
import { billStatusUrl, htmlUrlForPackage, packageFromUrl, parseBillStatus } from "../analysis/billtext.ts";
import { BRAND } from "../brand.ts";
import { decodeBody, isOfficialUrl, parseTloTextPage, tloTextPageUrl } from "../texas/analysis/sources.ts";
import { TX_SESSIONS } from "../texas/parse.ts";
import { splitFederalDetailed, splitTexas, type SplitSection } from "./sections.ts";
import type { BillSystem, StoredSection, StoredVersion } from "./types.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the app passes its typed handle, the tests a plain one
export type Db = LibSQLDatabase<any>;
export type FetchText = (url: string) => Promise<string | null>;
export type EnsureOptions = {
  /** The time written on the rows (milliseconds). */
  now?: number;
  /** Only the newest this-many versions are read and kept. Default 4. */
  maxVersions?: number;
  /** One request for one address: the page's text, or null when it could not be read. Never throws. */
  fetchText?: FetchText;
  /** The database to use; the site's own when left out. */
  db?: Db;
};
export type EnsureResult = { system: BillSystem; versions: StoredVersion[]; notes: string[] };

export const DEFAULT_MAX_VERSIONS = 4;
/** A version longer than this is stored in full and noted. */
export const LONG_VERSION_CHARS = 400_000;

const USER_AGENT = `${BRAND.userAgentName}/0.2 (+https://on-record-wrotenberry.vercel.app)`;

/** One request, identified by the site's user agent. Never throws and never retries. */
async function officialFetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" }, signal: AbortSignal.timeout(45_000), cache: "no-store", redirect: "follow" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // The Texas Legislature serves some pages as windows-1252 without saying so.
    return isOfficialUrl(url) ? decodeBody(bytes) : new TextDecoder("utf-8").decode(bytes);
  } catch { return null; }
}

async function handle(db?: Db): Promise<Db> {
  return db ?? (await import("@/db")).getDb();
}

/** "Reported in House" → "reported in House": a version's name inside a sentence. */
function inSentence(label: string): string {
  return label.toLowerCase().replace(/\bhouse\b/g, "House").replace(/\bsenate\b/g, "Senate");
}

type Listed = { version: string; label: string; date: string | null; url: string };

async function storedCodes(db: Db, billKey: string): Promise<Set<string>> {
  const rows = await db.selectDistinct({ version: billTextSections.version }).from(billTextSections).where(eq(billTextSections.billKey, billKey));
  return new Set(rows.map(r => r.version));
}

/** Writes one version, whole or not at all. */
async function store(db: Db, billKey: string, system: BillSystem, v: Listed, sections: SplitSection[], now: number): Promise<void> {
  const rows = sections.map((s, seq) => ({ billKey, system, version: v.version, versionLabel: v.label, versionDate: v.date, seq, num: s.num, heading: s.heading, body: s.body, sourceUrl: v.url, retrievedAt: now }));
  await db.transaction(async tx => {
    for (let i = 0; i < rows.length; i += 100) await tx.insert(billTextSections).values(rows.slice(i, i + 100)).onConflictDoNothing();
  });
}

/**
 * Reads and keeps the text of a bill's newest versions, section by section. `billKey` is a federal bill's id
 * ("119-hr-2102", official_bills) or a Texas bill's id (tx_bills). Safe to call again: only versions not yet stored
 * are requested.
 */
export async function ensureBillText(billKey: string, opts: EnsureOptions = {}): Promise<EnsureResult> {
  const db = await handle(opts.db), now = opts.now ?? Date.now(), max = Math.max(1, opts.maxVersions ?? DEFAULT_MAX_VERSIONS), fetchText = opts.fetchText ?? officialFetchText;
  const read: FetchText = async url => { try { const t = await fetchText(url); return t && t.trim() ? t : null; } catch { return null; } };
  const notes: string[] = [];
  const federal = await db.select().from(officialBills).where(eq(officialBills.id, billKey)).get();
  if (federal) { await ensureFederal(db, federal, { now, max, read, notes }); return { system: "federal", versions: await versionsOf(billKey, db), notes }; }
  const texas = await db.select().from(txBills).where(eq(txBills.id, billKey)).get();
  if (texas) { await ensureTexas(db, texas, { now, max, read, notes }); return { system: "texas", versions: await versionsOf(billKey, db), notes }; }
  return { system: "federal", versions: [], notes: ["This bill is not on file, so its text was not read."] };
}

type Run = { now: number; max: number; read: FetchText; notes: string[] };

async function ensureFederal(db: Db, bill: { id: string; congress: number; billType: string; number: number }, run: Run) {
  // 1. Which versions exist: the Government Publishing Office's status record first (it carries each version's code
  //    and address), then the list already on file from Congress.gov.
  let listed: Listed[] = [];
  const statusXml = await run.read(billStatusUrl(bill.congress, bill.billType, bill.number));
  if (statusXml) {
    try { listed = parseBillStatus(statusXml).versions.filter(v => v.code).map(v => ({ version: v.code, label: v.label, date: v.date || null, url: v.htmlUrl })); }
    catch { listed = []; }
  }
  if (!listed.length) {
    const onFile = await db.select().from(officialBillTexts).where(eq(officialBillTexts.billId, bill.id));
    listed = onFile.flatMap(t => {
      const pkg = packageFromUrl(t.htmlUrl ?? t.xmlUrl ?? t.pdfUrl ?? ""), code = pkg?.match(/\d([a-z]+)$/)?.[1];
      return pkg && code ? [{ version: code, label: t.type, date: t.date, url: htmlUrlForPackage(pkg) }] : [];
    }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    if (listed.length) run.notes.push("The official list of this bill's versions could not be read, so the list already on file was used.");
  }
  listed = listed.filter((v, i) => listed.findIndex(x => x.version === v.version) === i);
  if (!listed.length) { run.notes.push("No published text was found for this bill."); return; }

  // 2. The newest versions, each read once.
  const have = await storedCodes(db, bill.id);
  for (const v of listed.slice(0, run.max)) {
    if (have.has(v.version)) continue;
    const html = await run.read(v.url);
    if (!html || !/<pre\b/i.test(html)) { run.notes.push(`The ${inSentence(v.label)} version could not be read.`); continue; }
    const split = splitFederalDetailed(html);
    if (!split.sections.length) { run.notes.push(`The ${inSentence(v.label)} version was read, but no text was found in it.`); continue; }
    await store(db, bill.id, "federal", v, split.sections, run.now);
    if (split.chars > LONG_VERSION_CHARS) run.notes.push(`The ${inSentence(v.label)} version is very long (${split.chars.toLocaleString("en-US")} characters). It is stored in full.`);
    if (split.struck) run.notes.push(`The ${inSentence(v.label)} version prints ${split.struck} ${split.struck === 1 ? "section" : "sections"} as struck out. Struck-out sections are not part of this version and are not stored with it.`);
    if (split.repeated) run.notes.push(`The ${inSentence(v.label)} version prints ${split.repeated} section ${split.repeated === 1 ? "number" : "numbers"} more than once (a file can hold two committees' texts). A repeat is stored with a mark such as "101/2".`);
  }
  if (listed.length > run.max) run.notes.push(`Only the newest ${run.max} versions are kept; ${listed.length - run.max} earlier ${listed.length - run.max === 1 ? "one was" : "ones were"} not read.`);
}

async function ensureTexas(db: Db, bill: { id: string; session: string; identifier: string }, run: Run) {
  // The same steps as the Texas summary gatherer: the Legislature's Text page lists the versions (oldest first); the
  // feed's own list of versions is the fallback. Tested on saved pages only (see the note at the top of this file).
  const tloSession = TX_SESSIONS.find(s => s.id === bill.session)?.tlo ?? bill.session;
  const feed = await db.select().from(txBillVersions).where(eq(txBillVersions.billId, bill.id));
  const listing = await run.read(tloTextPageUrl(tloSession, bill.identifier));
  let rows = listing ? parseTloTextPage(listing).filter(r => r.textUrl).map(r => ({ name: r.version, url: r.textUrl! })) : [];
  if (!rows.length) {
    rows = feed.filter(v => v.url && isOfficialUrl(v.url) && /\/billtext\/html\//.test(v.url)).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).map(v => ({ name: v.note, url: v.url! }));
    if (!listing) run.notes.push("The list of versions on Texas Legislature Online could not be read.");
  }
  if (!rows.length) { run.notes.push("No published text was found for this bill."); return; }
  const have = await storedCodes(db, bill.id), newest = rows.slice(-run.max).reverse();
  for (const [i, r] of newest.entries()) {
    if (have.has(r.name)) continue;
    if (!isOfficialUrl(r.url)) { run.notes.push(`The ${inSentence(r.name)} version was not read: its address is not on an official Texas site.`); continue; }
    const html = await run.read(r.url);
    if (!html) {
      // One refusal ends the use of the Legislature's site for this run; it is not asked again (the gatherer's rule).
      const left = newest.slice(i + 1).filter(x => !have.has(x.name)).length;
      run.notes.push(`The ${inSentence(r.name)} version could not be read.${left ? ` ${left} more ${left === 1 ? "version was" : "versions were"} not asked for after that.` : ""}`);
      break;
    }
    const sections = splitTexas(html);
    if (!sections.length) { run.notes.push(`The ${inSentence(r.name)} version was read, but no text was found in it.`); continue; }
    const date = feed.find(v => v.url === r.url || v.note.toLowerCase() === r.name.toLowerCase())?.date ?? null;
    await store(db, bill.id, "texas", { version: r.name, label: r.name, date, url: r.url }, sections, run.now);
    const chars = sections.reduce((n, s) => n + s.body.length, 0);
    if (chars > LONG_VERSION_CHARS) run.notes.push(`The ${inSentence(r.name)} version is very long (${chars.toLocaleString("en-US")} characters). It is stored in full.`);
  }
  if (rows.length > run.max) run.notes.push(`Only the newest ${run.max} versions are kept; ${rows.length - run.max} earlier ${rows.length - run.max === 1 ? "one was" : "ones were"} not read.`);
}

/** How far along a version is, for putting versions in order when their dates are the same or missing. */
function federalRank(code: string): number {
  if (/^i[hs]$/.test(code)) return 0;
  if (/^r[hs]\d*$/.test(code)) return 1;
  if (/^e[hs]$/.test(code)) return 2;
  if (/^ea[hs]$/.test(code)) return 5;
  if (code === "enr") return 7;
  return /^(?:rf|rd|pc|rt|lt)[hs]$/.test(code) ? 3 : 4;
}
function texasRank(name: string, origin: string | null): number {
  if (/introduced|filed/i.test(name)) return 0;
  if (/committee report/i.test(name)) return origin && new RegExp(origin === "upper" ? "senate" : "house", "i").test(name) ? 1 : 3;
  if (/engrossed/i.test(name)) return 2;
  if (/enrolled/i.test(name)) return 6;
  return /amendment/i.test(name) ? 4 : 5;
}

/** The versions of a bill whose text is stored, newest first. */
export async function versionsOf(billKey: string, db?: Db): Promise<StoredVersion[]> {
  const d = await handle(db);
  // One row per version: how many sections it has and how long its text is.
  const rows = await d.select({ version: billTextSections.version, label: billTextSections.versionLabel, date: billTextSections.versionDate, sourceUrl: billTextSections.sourceUrl,
    system: billTextSections.system, sections: sql<number>`count(*)`, chars: sql<number>`sum(length(${billTextSections.body}))` })
    .from(billTextSections).where(eq(billTextSections.billKey, billKey)).groupBy(billTextSections.version);
  const by = new Map<string, StoredVersion & { system: BillSystem }>();
  for (const r of rows) by.set(r.version, { version: r.version, label: r.label, date: r.date, sourceUrl: r.sourceUrl, sections: Number(r.sections), chars: Number(r.chars), system: r.system });
  const list = [...by.values()];
  if (!list.length) return [];
  let rank: (v: StoredVersion) => number;
  if (list[0].system === "texas") {
    const origin = (await d.select({ chamber: txBills.chamber }).from(txBills).where(eq(txBills.id, billKey)).get())?.chamber ?? null;
    rank = v => texasRank(v.version, origin);
    list.sort((a, b) => rank(b) - rank(a) || (b.date ?? "").localeCompare(a.date ?? "") || a.version.localeCompare(b.version));
  } else {
    rank = v => federalRank(v.version);
    list.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || rank(b) - rank(a) || a.version.localeCompare(b.version));
  }
  return list.map(v => ({ version: v.version, label: v.label, date: v.date, sourceUrl: v.sourceUrl, sections: v.sections, chars: v.chars }));
}

const asStored = (r: typeof billTextSections.$inferSelect): StoredSection => ({ billKey: r.billKey, system: r.system, version: r.version, versionLabel: r.versionLabel, versionDate: r.versionDate,
  seq: r.seq, num: r.num, heading: r.heading, body: r.body, sourceUrl: r.sourceUrl });

/** Every section of one stored version, in the order printed. */
export async function sectionsOf(billKey: string, version: string, db?: Db): Promise<StoredSection[]> {
  const rows = await (await handle(db)).select().from(billTextSections).where(and(eq(billTextSections.billKey, billKey), eq(billTextSections.version, version))).orderBy(asc(billTextSections.seq));
  return rows.map(asStored);
}

/** One section of one stored version by its number ("2", "101", "A-101", "FULL"), or null. */
export async function sectionOf(billKey: string, version: string, num: string, db?: Db): Promise<StoredSection | null> {
  const row = await (await handle(db)).select().from(billTextSections)
    .where(and(eq(billTextSections.billKey, billKey), eq(billTextSections.version, version), eq(billTextSections.num, num))).orderBy(asc(billTextSections.seq)).limit(1).get();
  return row ? asStored(row) : null;
}
