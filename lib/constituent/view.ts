/**
 * What the voting box on a bill page needs for the person looking at it (docs/CONSTITUENT_VOICE.md): their answer,
 * what their account has confirmed, whether they may weigh in on this bill, and the totals for where they live.
 * Server only. The rules are lib/constituent/rules.ts; nothing here decides whether an answer counts.
 */
import { getDb } from "@/db";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { currentAppUserId, type ViewerAccess } from "@/lib/viewer";
import { currentLocation } from "@/lib/location";
import { verificationConfig } from "@/lib/verify/config";
import { profileFor } from "@/lib/verify/store";
import { liveHolds, mailVerified, residenceOf } from "@/lib/verify/residence-store";
import { answerFor, answerHistory } from "@/lib/opinions";
import { importLegacy, jurisdictionOf, totalsForBill } from "@/lib/constituent/store";
import { isTerritory, placeName, shownTotals, standing, TERRITORIES_SCOPE, tierOf, type Jurisdiction, type ScopeTotals, type Shown, type Standing, type Tier } from "@/lib/constituent/rules";
import { socialProof } from "@/lib/constituent/proof";

export type TotalsBlock = { scope: string; title: string; kind: "nation" | "state" | "district"; shown: Shown };
export type VoteBoxData = {
  jurisdiction: Jurisdiction; canAnswer: boolean; userId: string | null; answer: "support" | "oppose" | "unsure" | null;
  history: Awaited<ReturnType<typeof answerHistory>>; tier: Tier; standing: Standing; held: boolean;
  /** The bot check an address-matched reader passes before their first counted answer. */
  needsChallenge: boolean; verificationOn: boolean; legacy: { pending: number; choice: "count" | "private" | null };
  /** Where this person's totals are read from: their home on file, or the district they looked up. */
  place: { state: string; congressional: string | null; stateUpper: string | null; stateLower: string | null; fromHome: boolean } | null;
  totals: TotalsBlock[]; showTotals: boolean;
  /**
   * Before the reader answers: only how many counted residents of their district and state have weighed in, and only
   * for a place with 25 or more (lib/constituent/proof.ts). Never a split. Empty once they have answered, because the
   * totals themselves are then on the page.
   */
  proof: string[];
};

const districtName = (scope: string) => (/-SD-/.test(scope) ? `State senate district ${scope.split("-SD-")[1]}` : /-HD-/.test(scope) ? `State house district ${scope.split("-HD-")[1]}`
  : /-AL$/.test(scope) ? `${placeName(scope.slice(0, 2))} (one district)` : `Congressional district ${scope}`);

/** The totals shown for a place on a bill: the nation, the state, the district (federal); the state and its two districts (state bill). */
export function totalsBlocks(j: Jurisdiction, place: VoteBoxData["place"], totals: ReadonlyMap<string, ScopeTotals>): TotalsBlock[] {
  const block = (scope: string | null | undefined, title: string, kind: TotalsBlock["kind"]): TotalsBlock[] => (scope ? [{ scope, title, kind, shown: shownTotals(totals.get(scope), kind) }] : []);
  if (j.level === "federal") {
    const terr = place && isTerritory(place.state);
    return [...block(terr ? TERRITORIES_SCOPE : "US", terr ? "U.S. territories" : "The nation (the states and DC)", "nation"),
      ...(place ? [...block(place.state, placeName(place.state).replace(/^the /, "The "), "state"), ...block(place.congressional, `Your district: ${districtName(place.congressional ?? "")}`, "district")] : [])];
  }
  const inState = place?.state === j.code;
  return [...block(j.code, placeName(j.code).replace(/^the /, "The "), "state"),
    ...(inState ? [...block(place!.stateUpper, `Your district: ${districtName(place!.stateUpper ?? "")}`, "district"), ...block(place!.stateLower, `Your district: ${districtName(place!.stateLower ?? "")}`, "district")] : [])];
}
export function scopesToRead(j: Jurisdiction, place: VoteBoxData["place"]): string[] {
  return [...new Set([j.level === "federal" ? "US" : j.code, TERRITORIES_SCOPE, place?.state, ...(j.level === "federal" ? [place?.congressional] : [place?.stateUpper, place?.stateLower])].filter((x): x is string => !!x))];
}

/**
 * Where a reader's totals are read from: the home on their account when there is one, else the district they looked
 * up. The looked-up place only chooses which totals to show; it never makes an answer count.
 */
export async function readerPlace(userId: string | null, accountId: string | null, verificationOn: boolean): Promise<VoteBoxData["place"]> {
  const [home, looked] = await Promise.all([verificationOn && accountId ? residenceOf(getDb(), accountId).catch(() => null) : null, currentLocation(userId).catch(() => null)]);
  return home ? { state: home.stateCode, congressional: home.congressional, stateUpper: home.stateUpper, stateLower: home.stateLower, fromHome: true }
    : looked ? { state: looked.state, congressional: looked.congressional, stateUpper: looked.stateUpper, stateLower: looked.stateLower, fromHome: false } : null;
}

export async function voteBoxData(billKey: string, access: ViewerAccess): Promise<VoteBoxData | null> {
  const db = getDb(), jurisdiction = await jurisdictionOf(db, billKey).catch(() => null);
  if (!jurisdiction) return null;
  const canAnswer = !!access.invite || !!access.editor, vc = verificationConfig();
  const userId = canAnswer ? await currentAppUserId().catch(() => null) : null;
  const account = canAnswer && userId ? (await currentAccount().catch(() => null)) ?? await accountForAppUser(userId).catch(() => null) : null;
  const [answer, history, profile, home, mail, holds, legacy, looked] = await Promise.all([
    answerFor(userId, billKey).catch(() => null), answerHistory(userId, billKey).catch(() => []),
    vc.enabled && account ? profileFor(account.id).catch(() => null) : null, vc.enabled && account ? residenceOf(db, account.id).catch(() => null) : null,
    vc.enabled && account ? mailVerified(db, account.id).catch(() => false) : false, vc.enabled && account ? liveHolds(db, account.id).catch(() => []) : [],
    userId ? importLegacy(db, userId).catch(() => ({ pending: 0, choice: null })) : { pending: 0, choice: null }, currentLocation(userId).catch(() => null)]);
  const tier = tierOf(account && profile ? { emailVerifiedAt: account.verifiedAt, phoneVerifiedAt: profile.phoneHash ? profile.phoneVerifiedAt : null, hasHome: !!home, mailVerified: mail } : null);
  // A home on file decides. Without one, the district the reader looked up says where their totals are, and whether to
  // show the buttons; it never makes an answer count.
  const place = home ? { state: home.stateCode, congressional: home.congressional, stateUpper: home.stateUpper, stateLower: home.stateLower, fromHome: true }
    : looked ? { state: looked.state, congressional: looked.congressional, stateUpper: looked.stateUpper, stateLower: looked.stateLower, fromHome: false } : null;
  const st = standing(jurisdiction, place?.state ?? null);
  const totals = await totalsForBill(db, billKey, scopesToRead(jurisdiction, place)).catch(() => new Map<string, ScopeTotals>());
  const showTotals = !!answer || st === "outside";
  return { jurisdiction, canAnswer, userId, answer, history, tier, standing: st, held: holds.length > 0, verificationOn: vc.enabled,
    needsChallenge: vc.enabled && vc.turnstileReady && (tier === "address" || tier === "mail") && !profile?.firstVoteChallengeAt, legacy: legacy as VoteBoxData["legacy"], place,
    totals: totalsBlocks(jurisdiction, place, totals), showTotals, proof: canAnswer && !showTotals ? socialProof(jurisdiction, place, totals) : [] };
}
