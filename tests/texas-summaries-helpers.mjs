// Shared by the Texas summary tests: the saved official documents and a stand-in for the network. Not a test file.
import { readFileSync } from "node:fs";
import { decodeBody } from "../lib/texas/analysis/sources.ts";

export const bytes = name => readFileSync(new URL(`./fixtures/texas-sources/${name}`, import.meta.url));
export const fx = name => decodeBody(bytes(name));
export const ACTIONS = JSON.parse(fx("actions-89R-SB4.json")).actions;
export const CAPTION = "Relating to an increase in the amount of the exemption of residence homesteads from ad valorem taxation by a school district and the protection of school districts against certain losses in local revenue.";
export const SB4 = { id: "tx-89-sb4", identifier: "SB 4", tloSession: "89R", sessionName: "89th Legislature, Regular Session", tloUrl: "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB4",
  title: CAPTION, latestActionDate: "2025-06-16", latestActionDescription: "See remarks for effective date", actions: ACTIONS, votes: [],
  versions: [{ note: "Introduced", date: "2025-02-06", url: "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004I.htm" }, { note: "Enrolled", date: "2025-05-30", url: "https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00004F.htm" }] };

/** A stand-in for the network: serves the saved documents by address and records every request. */
export function standInFetch(overrides = {}) {
  const map = { "Text.aspx": "tlo-text-page-89R-SB4.htm", "billtext/html/SB00004F": "billtext-89R-SB00004F.htm", "analysis/html/SB00004F": "analysis-89R-SB00004F.htm",
    "analysis/html/SB00004H": "analysis-89R-SB00004H.htm", "fiscalnotes/html/SB00004F": "fiscalnote-89R-SB00004F.htm", "hro.house.texas.gov": "hro-sample.txt", "statutes.capitol.texas.gov/Docs/TX": "statutes-sample-TX.11.htm", ...overrides };
  const seen = [];
  const fetch = async url => {
    seen.push(url);
    const key = Object.keys(map).find(k => url.includes(k)), hit = key ? map[key] : null;
    if (typeof hit === "number") return { status: hit };
    if (hit && typeof hit === "object") return hit;
    return hit ? { status: 200, contentType: "text/html", bytes: bytes(hit) } : { status: 404 };
  };
  return { fetch, seen };
}

