/**
 * Suggest changes, the editor's approval queue: the database side of lib/changes/queue-rules.ts (owner, 20 Nov 2026).
 * Every function takes the database handle and reads no request and no secret, so tests/change-queue.test.mjs runs
 * these same functions against a temporary database built from the real migrations. Who the editor is, is decided
 * by the caller (app/editor/changes/actions.ts); `by` arrives here already checked.
 *
 * Nothing here is read by a reader page. A menu's status becoming "live" records the editor's approval and no more:
 * in this phase no page shows a menu to readers.
 *
 * The editor does not rewrite wording here. An option is approved or rejected as drafted; a rejected one is drafted
 * again later. Decisions are taken only while a menu waits for review, so an approved menu cannot be changed into
 * one with a single direction: it can only be closed.
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { billTextSections, changeMenus, changeOptions, officialBills, txBills } from "../../db/schema.ts";
import type { Db } from "../verify/residence-store.ts";
import type { BillSystem } from "./types.ts";
import { billHref, canGoLive, groupOptions, optionCounts, readChecks, type MenuStatus, type OptionCounts, type OptionGroup, type QueueOption, type QueueSection } from "./queue-rules.ts";

export type ChangeMenu = typeof changeMenus.$inferSelect;
type OptionRow = typeof changeOptions.$inferSelect;

/** The bill a menu belongs to. A federal bill carries its type and number (for `billLabel`); a Texas bill its identifier ("HB 2"). */
export type MenuBill = { key: string; system: BillSystem; billType: string | null; number: number | null; identifier: string | null; title: string | null; href: string };

/** One row of the queue. `versionLabel` is the stored name of the text version the menu was drafted from, when its text is stored. */
export type MenuRow = { menu: ChangeMenu; bill: MenuBill; versionLabel: string | null; counts: OptionCounts; groups: number };

export type MenuDetail = { menu: ChangeMenu; bill: MenuBill; versionLabel: string | null; groups: OptionGroup[]; counts: OptionCounts; live: { ok: boolean; reasons: string[] } };

const STATUS_ORDER: MenuStatus[] = ["review", "live", "failed", "closed"];
const QUEUE_MAX = 300;

const unfiled = (m: Pick<ChangeMenu, "billKey" | "system">): MenuBill => ({ key: m.billKey, system: m.system, billType: null, number: null, identifier: null, title: null, href: billHref(m.system, m.billKey) });
async function billsFor(db: Db, menus: Array<Pick<ChangeMenu, "billKey" | "system">>): Promise<Map<string, MenuBill>> {
  const out = new Map<string, MenuBill>();
  for (const m of menus) out.set(m.billKey, unfiled(m));
  const federal = menus.filter(m => m.system === "federal").map(m => m.billKey), texas = menus.filter(m => m.system === "texas").map(m => m.billKey);
  if (federal.length) for (const b of await db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title }).from(officialBills).where(inArray(officialBills.id, federal)))
    Object.assign(out.get(b.id) ?? {}, { billType: b.billType, number: b.number, title: b.title });
  if (texas.length) for (const b of await db.select({ id: txBills.id, identifier: txBills.identifier, title: txBills.title }).from(txBills).where(inArray(txBills.id, texas)))
    Object.assign(out.get(b.id) ?? {}, { identifier: b.identifier, title: b.title });
  return out;
}

/** Every menu for the editor: the ones waiting first, then approved, then failed and closed; newest first inside each. */
export async function menusForReview(db: Db): Promise<MenuRow[]> {
  const menus = await db.select().from(changeMenus).orderBy(desc(changeMenus.createdAt), desc(changeMenus.id)).limit(QUEUE_MAX);
  if (!menus.length) return [];
  const ids = menus.map(m => m.id), keys = [...new Set(menus.map(m => m.billKey))];
  const [bills, tallies, groupTallies, labels] = await Promise.all([
    billsFor(db, menus),
    db.select({ menuId: changeOptions.menuId, status: changeOptions.status, n: sql<number>`count(*)` }).from(changeOptions).where(inArray(changeOptions.menuId, ids)).groupBy(changeOptions.menuId, changeOptions.status),
    db.select({ menuId: changeOptions.menuId, n: sql<number>`count(distinct ${changeOptions.groupKey})` }).from(changeOptions).where(inArray(changeOptions.menuId, ids)).groupBy(changeOptions.menuId),
    db.select({ billKey: billTextSections.billKey, version: billTextSections.version, label: sql<string>`min(${billTextSections.versionLabel})` }).from(billTextSections)
      .where(inArray(billTextSections.billKey, keys)).groupBy(billTextSections.billKey, billTextSections.version),
  ]);
  const rows = menus.map(menu => {
    const counts = optionCounts(tallies.filter(t => t.menuId === menu.id).flatMap(t => Array.from({ length: Number(t.n) }, () => ({ status: t.status }))));
    return { menu, bill: bills.get(menu.billKey) ?? unfiled(menu), counts, groups: Number(groupTallies.find(g => g.menuId === menu.id)?.n ?? 0),
      versionLabel: labels.find(l => l.billKey === menu.billKey && l.version === menu.version)?.label ?? null };
  });
  return STATUS_ORDER.flatMap(status => rows.filter(r => r.menu.status === status));
}

const toOption = (o: OptionRow): QueueOption => ({ id: o.id, seq: o.seq, source: o.source, sourceLabel: o.sourceLabel, sourceRef: o.sourceRef, sectionVersion: o.sectionVersion, sectionNum: o.sectionNum,
  quote: o.quote, otherQuote: o.otherQuote, groupKey: o.groupKey, kind: o.kind, about: o.about, direction: o.direction, wording: o.wording, checks: readChecks(o.checks), status: o.status, editorNote: o.editorNote });

/** One menu with its bill and its options in groups, each group beside the stored section it cites. Null when there is no such menu. */
export async function menuDetail(db: Db, id: string): Promise<MenuDetail | null> {
  const menu = await db.select().from(changeMenus).where(eq(changeMenus.id, id)).get();
  if (!menu) return null;
  const options = (await db.select().from(changeOptions).where(eq(changeOptions.menuId, id)).orderBy(changeOptions.seq)).map(toOption);
  const nums = [...new Set(options.map(o => o.sectionNum))];
  const [bills, stored, label] = await Promise.all([
    billsFor(db, [menu]),
    nums.length ? db.select().from(billTextSections).where(and(eq(billTextSections.billKey, menu.billKey), inArray(billTextSections.num, nums))).orderBy(billTextSections.version, billTextSections.seq) : [],
    db.select({ label: billTextSections.versionLabel }).from(billTextSections).where(and(eq(billTextSections.billKey, menu.billKey), eq(billTextSections.version, menu.version))).limit(1).get(),
  ]);
  const sections: QueueSection[] = stored.map(s => ({ version: s.version, versionLabel: s.versionLabel, num: s.num, heading: s.heading, body: s.body, sourceUrl: s.sourceUrl }));
  const groups = groupOptions(options, sections);
  return { menu, bill: bills.get(menu.billKey) ?? unfiled(menu), versionLabel: label?.label ?? null, groups, counts: optionCounts(options), live: canGoLive(groups) };
}

export type Decision = "approved" | "rejected";

/**
 * The editor approves or rejects one option as drafted. Only while its menu waits for review, and never a retired
 * option. A note is kept with a rejection (and cleared by an approval without one). Returns the menu's id, or null
 * when nothing was changed.
 */
export async function decideOption(db: Db, i: { optionId: string; decision: Decision; note?: string | null; by: string; now: number }): Promise<string | null> {
  const row = await db.select({ menuId: changeOptions.menuId, status: changeOptions.status, menuStatus: changeMenus.status }).from(changeOptions)
    .innerJoin(changeMenus, eq(changeMenus.id, changeOptions.menuId)).where(eq(changeOptions.id, i.optionId)).get();
  if (!row || row.status === "retired" || row.menuStatus !== "review") return null;
  await db.update(changeOptions).set({ status: i.decision, decidedAt: i.now, decidedBy: i.by, editorNote: i.note?.trim().slice(0, 500) || null })
    .where(and(eq(changeOptions.id, i.optionId), ne(changeOptions.status, "retired")));
  return row.menuId;
}

/** The editor approves or rejects every option of one group at once. Same limits as `decideOption`. Returns how many options the group has (0: nothing changed). */
export async function decideGroup(db: Db, i: { menuId: string; groupKey: string; decision: Decision; note?: string | null; by: string; now: number }): Promise<number> {
  const menu = await db.select({ status: changeMenus.status }).from(changeMenus).where(eq(changeMenus.id, i.menuId)).get();
  if (!menu || menu.status !== "review") return 0;
  const inGroup = and(eq(changeOptions.menuId, i.menuId), eq(changeOptions.groupKey, i.groupKey), ne(changeOptions.status, "retired"));
  const n = Number((await db.select({ n: sql<number>`count(*)` }).from(changeOptions).where(inGroup).get())?.n ?? 0);
  if (!n) return 0;
  await db.update(changeOptions).set({ status: i.decision, decidedAt: i.now, decidedBy: i.by, editorNote: i.note?.trim().slice(0, 500) || null }).where(inGroup);
  return n;
}

/**
 * The editor approves the menu. Only a menu waiting for review, and only when `canGoLive` finds nothing: an option
 * approved without its opposite, or an approved option whose quoted words are not in the stored section, stops it.
 * Sets the status to "live" and who decided and when. In this phase a live menu is still shown to no reader.
 */
export async function makeLive(db: Db, i: { menuId: string; by: string; now: number }): Promise<{ ok: boolean; reasons: string[] }> {
  const detail = await menuDetail(db, i.menuId);
  if (!detail) return { ok: false, reasons: ["There is no such menu."] };
  if (detail.menu.status !== "review") return { ok: false, reasons: ["This menu is not waiting for review."] };
  if (!detail.live.ok) return detail.live;
  await db.update(changeMenus).set({ status: "live", decidedAt: i.now, decidedBy: i.by }).where(and(eq(changeMenus.id, i.menuId), eq(changeMenus.status, "review")));
  return { ok: true, reasons: [] };
}

/** The editor sets a menu aside, whether it was waiting or approved. Nothing is deleted. Returns false when nothing was changed. */
export async function closeMenu(db: Db, i: { menuId: string; by: string; now: number }): Promise<boolean> {
  const menu = await db.select({ status: changeMenus.status }).from(changeMenus).where(eq(changeMenus.id, i.menuId)).get();
  if (!menu || (menu.status !== "review" && menu.status !== "live")) return false;
  await db.update(changeMenus).set({ status: "closed", decidedAt: i.now, decidedBy: i.by }).where(and(eq(changeMenus.id, i.menuId), inArray(changeMenus.status, ["review", "live"])));
  return true;
}
