/** The content-type badge every legislation section carries. Analysis (Phase B) and opinion (Phase C) have their own. */
export function OfficialBadge({ title = "Copied from government records" }: { title?: string }) {
  return <span className="ctype ctype-official" title={title}>Official</span>;
}

/** A member's vote. Neutral colours: Yea and Nay are not good and bad. */
export function PositionPill({ position, raw }: { position: string; raw?: string }) {
  const unusual = raw && !["yea", "aye", "nay", "no", "present", "not voting"].includes(raw.toLowerCase());
  const label = unusual ? raw : position;
  return <span className={`vpos vpos-${position.toLowerCase().replace(/\s+/g, "-")}`}>{label}</span>;
}

const PARTY_LETTER: Record<string, string> = { Democrat: "D", Republican: "R", Independent: "I", Libertarian: "L" };
export function partyLetter(party: string) { return PARTY_LETTER[party] ?? party.slice(0, 1).toUpperCase(); }

export function memberLine(p: { chamber: string; party: string; state: string; district: number | null }) {
  const seat = p.chamber === "senate" ? "Senator" : "Representative";
  const where = p.chamber === "house" && p.district !== null ? `${p.state}-${p.district === 0 ? "At large" : p.district}` : p.state;
  return `${seat} · ${partyLetter(p.party)}-${where}`;
}

export function billLabel(billType: string, number: number) {
  const names: Record<string, string> = { hr: "H.R.", s: "S.", hres: "H.Res.", sres: "S.Res.", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res." };
  return `${names[billType] ?? billType.toUpperCase()} ${number}`;
}

export function shortDate(ms: number | string | null | undefined) {
  if (ms === null || ms === undefined) return "";
  const d = typeof ms === "number" ? new Date(ms) : new Date(`${ms}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}
