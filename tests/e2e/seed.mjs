/**
 * Test data for the usability suite. Writes only to the local file database
 * (.data/on-record.db) and refuses to run against anything else. Everything it
 * adds is labelled so `cleanup()` can remove it again:
 *   - invites with the label "e2e" (one first-time reader per use);
 *   - for task 14, counted answers from made-up accounts whose ids start "e2e-".
 * Run by tests/e2e/run.mjs; `node tests/e2e/seed.mjs --cleanup` removes leftovers by hand.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, assertLocalDatabase, localEnv } from "./lib/env.mjs";
import { inviteToken, newInviteId } from "../../lib/trial-token.ts";

const LABEL = "e2e";
let client;
export function db() {
  if (!client) {
    assertLocalDatabase();
    const { createClient } = createRequire(resolve(ROOT, "package.json"))("@libsql/client");
    client = createClient({ url: `file:${resolve(ROOT, ".data/on-record.db")}` });
  }
  return client;
}
const all = async (sql, args = []) => (await db().execute({ sql, args })).rows;
const run = (sql, args = []) => db().execute({ sql, args });
/** SQLite answers "database is locked" while the app writes; wait and try again. */
async function retry(fn, tries = 8) {
  for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= tries || !/locked|busy/i.test(String(e?.message))) throw e; await new Promise(r => setTimeout(r, 150 * (i + 1))); } }
}

/** A new invite nobody has used, and the cookie value that signs a reader in with it. The key never leaves this process. */
export async function freshInvite({ activeDays = 0, lastActiveDay = null } = {}) {
  const key = (process.env.EDITOR_ACCESS_KEY ?? localEnv().EDITOR_ACCESS_KEY ?? "").trim();
  if (!key) throw new Error("EDITOR_ACCESS_KEY is not set in .env.local: the suite cannot sign a test reader in.");
  const id = newInviteId(), now = Date.now();
  const number = Number((await all("select coalesce(max(number), 0) + 1 as n from beta_invites"))[0].n);
  await retry(() => run("insert into beta_invites (id, number, label, created_at, active_days, last_active_day, first_seen_at, last_seen_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, number, LABEL, now, activeDays, lastActiveDay, activeDays ? now - activeDays * 86400e3 : null, activeDays ? now - 86400e3 : null]));
  return { id, token: await inviteToken(key, id) };
}

/** The trial opens once an AI call has succeeded. A local copy without one gets a marked stand-in row so the gate is open. */
export async function ensureTrialOpen() {
  const ok = (await all("select count(*) as n from model_calls where error is null"))[0].n;
  if (Number(ok) > 0) return false;
  await retry(() => run("insert into model_calls (id, purpose, model, input_tokens, cached_input_tokens, output_tokens, web_search_calls, cost_usd, created_at) values (?, 'e2e', 'e2e-stand-in', 0, 0, 0, 0, 0, ?)",
    [`e2e-${crypto.randomUUID()}`, Date.now()]));
  return true;
}

/**
 * The local copy holds real bills and votes but not production's summaries. For a bill with no summary at all, this adds
 * a stand-in: a copy of the newest summary in the local copy that passed its check, under the current generator's
 * version, with an id starting "e2e-" so cleanup() removes it. It lets the suite test what a trial reader sees on a bill
 * page with a passing summary. Whether readers may see it is still the publish gate's decision: with the gate closed the
 * page shows none. Returns true when a stand-in was added.
 */
export async function standInSummary(billId) {
  if (!billId || (await all("select 1 from analysis_bill_summaries where bill_id = ?", [billId])).length) return false;
  const version = /PROMPT_VERSION = "([^"]+)"/.exec(readFileSync(resolve(ROOT, "lib/analysis/generate.ts"), "utf8"))?.[1];
  const source = (await all(`select s.id from analysis_bill_summaries s join analysis_summary_structure x on x.summary_id = s.id
    where s.status = 'visible' and s.check_passed = 1 and s.id not like 'e2e-%' order by s.created_at desc limit 1`))[0]?.id;
  if (!version || !source) return false;
  const id = `e2e-${crypto.randomUUID()}`;
  const sequence = Number((await all("select coalesce(max(sequence), 0) + 1 as n from analysis_bill_summaries"))[0].n);
  const copy = async (table, key, change) => {
    const row = (await all(`select * from ${table} where ${key} = ?`, [source]))[0];
    if (!row) return;
    const next = { ...row, ...change }, cols = Object.keys(next);
    await retry(() => run(`insert into ${table} (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")})`, cols.map(c => next[c])));
  };
  await copy("analysis_bill_summaries", "id", { id, bill_id: billId, sequence, prompt_version: version, created_at: Date.now(), reviewed_at: null });
  await copy("analysis_summary_details", "summary_id", { summary_id: id, prompt_version: version });
  await copy("analysis_summary_structure", "summary_id", { summary_id: id, prompt_version: version });
  return true;
}

export async function appUserForInvite(inviteId) {
  return (await all("select id from app_users where external_key = ?", [`invite:${inviteId}`]))[0]?.id ?? null;
}

/** Real ids from the local database for the pages that need one (a bill, a member, a vote, a Texas bill and member). */
export async function samples(state = "TX") {
  const one = async (sql, args = []) => (await all(sql, args))[0] ?? null;
  const senators = await all("select id, full_name from official_politicians where chamber = 'senate' and state = ? order by id limit 2", [state]);
  const vote = senators[0] ? await one(`select r.id as roll, r.bill_id as bill from official_member_votes v join official_roll_calls r on r.id = v.roll_call_id
    where v.politician_id = ? and r.bill_id is not null order by r.voted_at desc limit 1`, [senators[0].id]) : null;
  const bill = (await one("select id from official_bills where id = ?", [vote?.bill ?? ""])) ?? (await one("select id from official_bills order by latest_action_at desc limit 1"));
  return { state, member: senators[0]?.id ?? null, member2: senators[1]?.id ?? null, roll: vote?.roll ?? null, bill: bill?.id ?? null,
    txBill: (await one("select id from tx_bills order by id limit 1").catch(() => null))?.id ?? null,
    txMember: (await one("select id from tx_people order by id limit 1").catch(() => null))?.id ?? null };
}

/** Task 9: the reader last came three days ago (times only, exactly what the app keeps). Returns the time for the visit cookie. */
export async function agePreviousVisit(inviteId, daysAgo = 3) {
  const user = await appUserForInvite(inviteId), at = Date.now() - daysAgo * 86400e3;
  if (user) await retry(() => run("insert into reader_visits (user_id, last_seen_at, previous_seen_at) values (?, ?, null) on conflict(user_id) do update set last_seen_at = excluded.last_seen_at, previous_seen_at = null", [user, at]));
  return at;
}

/**
 * Task 14: 28 made-up verified readers in one state answer one bill (20 support, 8 oppose), so the "n of at least 25"
 * rule is met. Their accounts are 3 days old (answers count after 24 hours). The totals row is rebuilt the way
 * lib/verify/store.ts recomputeBill does it: verified tier, account older than 24 hours.
 */
export async function seedDistrictAnswers({ billId, state, district = "37", n = 28 }) {
  const now = Date.now(), old = now - 3 * 86400e3, run0 = `e2e-${now.toString(36)}`;
  for (let i = 0; i < n; i++) {
    const user = `${run0}-u${i}`, account = `e2e-${run0}-a${i}`;
    await retry(() => run("insert into app_users (id, kind, external_key, created_at) values (?, 'public', ?, ?)", [user, `e2e:${user}`, old]));
    await retry(() => run("insert into reader_accounts (id, app_user_id, email_hash, email, created_at, verified_at) values (?, ?, ?, ?, ?, ?)", [account, user, `e2e-${user}`, `${user}@e2e.invalid`, old, old]));
    await retry(() => run(`insert into verification_profiles (account_id, tier, signup_challenge_at, phone_hash, phone_line_type, phone_verified_at, district_id, state_code, address_matched_at, created_at, updated_at)
      values (?, 2, ?, ?, 'mobile', ?, ?, ?, ?, ?, ?)`, [account, old, `e2e-phone-${user}`, old, `${state}-${district}`, state, old, old, old]));
    await retry(() => run("insert into voice_votes (user_id, bill_key, account_id, answer, counts, created_at, updated_at) values (?, ?, ?, ?, 1, ?, ?)", [user, billId, account, i < 20 ? "support" : i < 26 ? "oppose" : "unsure", old, old]));
    // One person, one residence (18 Nov 2026): each made-up account has one home, and its answer is stamped with that home's district,
    // so the site's own recount gives the same totals as the copy of the rule below.
    await retry(() => run("insert into account_residences (account_id, address_key, building_key, has_unit, congressional, state_code, set_at) values (?, ?, ?, 0, ?, ?, ?)", [account, `e2e-home-${user}`, `e2e-home-${user}`, `${state}-${district}`, state, old]));
    await retry(() => run("insert into position_residences (user_id, bill_id, account_id, congressional, state_code, stamped_at) values (?, ?, ?, ?, ?, ?)", [user, billId, account, `${state}-${district}`, state, old]));
  }
  await recomputeTotals(billId);
  return { billId, scope: state, n };
}

/**
 * A copy of the counting rule for the made-up accounts above (address-matched, older than 24 hours, a home in a state):
 * a federal bill counts each answer for the nation, the state and the congressional district on its stamp
 * (lib/constituent/rules.ts is the rule the site itself runs; tests/constituent.test.mjs covers it).
 */
async function recomputeTotals(billId, now = Date.now()) {
  const rows = await all(`select v.answer, h.congressional, h.state_code from voice_votes v join reader_accounts a on a.id = v.account_id
    join verification_profiles p on p.account_id = v.account_id join position_residences h on h.user_id = v.user_id and h.bill_id = v.bill_key
    where v.bill_key = ? and v.counts = 1 and p.tier >= 2 and p.phone_hash is not null and a.created_at <= ?
    and exists (select 1 from account_residences r where r.account_id = v.account_id)
    and not exists (select 1 from account_holds ah where ah.account_id = v.account_id and ah.status in ('open', 'confirmed'))
    and not exists (select 1 from flagged_positions fp join integrity_flags f on f.id = fp.flag_id where fp.user_id = v.user_id and fp.bill_id = v.bill_key and f.status in ('open', 'confirmed'))`, [billId, now - 86400e3]);
  const totals = new Map();
  const add = (scope, answer) => { const t = totals.get(scope) ?? { support: 0, oppose: 0, unsure: 0 }; t[answer]++; totals.set(scope, t); };
  for (const r of rows) for (const scope of ["US", r.state_code, r.congressional]) add(scope, r.answer);
  await retry(() => run("delete from voice_totals where bill_key = ?", [billId]));
  for (const [scope, t] of totals) await retry(() => run("insert into voice_totals (bill_key, scope, tier, support, oppose, unsure, updated_at) values (?, ?, 'address', ?, ?, ?, ?)", [billId, scope, t.support, t.oppose, t.unsure, now]));
}

/** Removes what the suite added: its invites, the readers made from them and everything those readers saved. */
export async function cleanup() {
  const invites = (await all("select id from beta_invites where label = ?", [LABEL])).map(r => r.id);
  const users = (await all("select id from app_users where external_key like 'e2e:%'")).map(r => r.id);
  for (const id of invites) { const u = await appUserForInvite(id); if (u) users.push(u); }
  // Totals are rebuilt for every bill that has any, so a run that was cut short leaves nothing stale behind.
  const seededBills = (await all("select bill_key from voice_votes where account_id like 'e2e-%' union select bill_key from voice_totals")).map(r => r.bill_key);
  const tables = (await all("select name from sqlite_master where type = 'table'")).map(r => r.name);
  const has = async (t, c) => tables.includes(t) && (await all(`pragma table_info(${t})`)).some(r => r.name === c);
  const accounts = [];
  for (const u of users) for (const r of await all("select id from reader_accounts where app_user_id = ?", [u])) accounts.push(r.id);
  for (const t of tables) {
    if (await has(t, "user_id")) for (const u of users) await retry(() => run(`delete from ${t} where user_id = ?`, [u]));
    if (await has(t, "account_id")) { for (const a of accounts) await retry(() => run(`delete from ${t} where account_id = ?`, [a])); await retry(() => run(`delete from ${t} where account_id like 'e2e-%'`)); }
    if (t !== "reader_accounts" && await has(t, "app_user_id")) for (const u of users) await retry(() => run(`delete from ${t} where app_user_id = ?`, [u]));
  }
  for (const u of users) { await retry(() => run("delete from reader_accounts where app_user_id = ?", [u])); await retry(() => run("delete from app_users where id = ?", [u])); }
  await retry(() => run("delete from beta_invites where label = ?", [LABEL]));
  await retry(() => run("delete from model_calls where purpose = 'e2e'"));
  for (const t of ["analysis_summary_details", "analysis_summary_structure"]) if (tables.includes(t)) await retry(() => run(`delete from ${t} where summary_id like 'e2e-%'`));
  if (tables.includes("analysis_bill_summaries")) await retry(() => run("delete from analysis_bill_summaries where id like 'e2e-%'"));
  // Texas test bills from texas.task.mjs (ids starting "e2e-"), in case a run was cut short.
  if (tables.includes("tx_member_votes")) await retry(() => run("delete from tx_member_votes where vote_id like 'e2e-%'"));
  for (const t of ["tx_votes", "tx_bill_actions", "tx_bill_sponsors", "tx_bill_versions"]) if (tables.includes(t)) await retry(() => run(`delete from ${t} where ${t === "tx_votes" ? "id like 'e2e-%' or bill_id" : "bill_id"} like 'e2e-%'`));
  if (tables.includes("tx_bills")) await retry(() => run("delete from tx_bills where id like 'e2e-%'"));
  for (const b of seededBills) await recomputeTotals(b);
  return { invites: invites.length, readers: users.length };
}

export { all as query, run as execute, retry };

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv.includes("--cleanup")) console.log("removed", await cleanup());
  else console.log("Usage: node tests/e2e/seed.mjs --cleanup   (the runner seeds on its own)");
}
