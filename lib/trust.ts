import { ACCOUNT_MIN_AGE_MS, MIN_SHOWN } from "./verify/rules.ts";

/**
 * The facts the trust pages are built from (Methodology, Pledge, About, Privacy, Terms), as data. The pages render
 * these lists and tests/trust.test.mjs checks them against the code, so a page cannot say one thing while the code
 * does another. When you add an official source, a cookie or an outside service anywhere in the code, add it here:
 * the test fails with the name of what is missing until you do.
 *
 * Pure: the only import is the pure rules file, so the tests load it directly. No product name appears here; the
 * pages add it from lib/brand.ts.
 */

/* ───────────────────────────── 1. Where the facts come from ───────────────────────────── */

export type SourceGroup = "congress" | "summaries" | "texas" | "lookup";
export type Source = {
  id: string; group: SourceGroup; name: string;
  /** Who publishes it. */
  publisher: string;
  /** True when a government body publishes it; false for an open copy of public records kept by someone else. */
  government: boolean;
  /** The source's public home page. */
  url: string;
  /** What the site reads from it, in plain words. */
  reads: string;
  /** How often, as the code does it. */
  refreshed: string;
  /** Hosts the code contacts or links for this source; checked against the code by the test. */
  hosts: string[];
};

export const SOURCE_GROUPS: Record<SourceGroup, { title: string; note: string }> = {
  congress: { title: "Congress: votes, bills and members", note: "The site updates itself twice a day, at 13:00 and 19:00 UTC (morning and afternoon in the United States). Each update picks up where the last one stopped. A roll-call vote is one where each member's vote is recorded by name." },
  summaries: { title: "Documents a bill summary may use", note: "These are read when a summary is written for a bill, and linked from that summary." },
  texas: { title: "Texas Legislature", note: "Texas data comes through two services that copy the Legislature's records. Every Texas bill links to its page on Texas Legislature Online, which is the source of record." },
  lookup: { title: "Finding your legislators", note: "" },
};

export const SOURCES: Source[] = [
  { id: "house-clerk", group: "congress", name: "Clerk of the U.S. House: roll-call votes", publisher: "Office of the Clerk, U.S. House of Representatives", government: true,
    url: "https://clerk.house.gov/Votes", hosts: ["clerk.house.gov"],
    reads: "Every recorded House vote: the question, the result, the official totals, and how each member voted.",
    refreshed: "New votes at every update, at most 40 each time. Earlier votes of this Congress are filled in 40 per update." },
  { id: "senate", group: "congress", name: "U.S. Senate: roll-call votes and floor schedule", publisher: "U.S. Senate", government: true,
    url: "https://www.senate.gov/legislative/votes_new.htm", hosts: ["www.senate.gov"],
    reads: "Every recorded Senate vote (question, result, official totals, each senator's vote) and the bills named on the Senate floor schedule.",
    refreshed: "New votes at every update, at most 40 each time. The floor schedule at every update." },
  { id: "congress-gov", group: "congress", name: "Congress.gov", publisher: "Library of Congress", government: true,
    url: "https://www.congress.gov/", hosts: ["api.congress.gov", "www.congress.gov"],
    reads: "Bill titles, sponsors, subjects, every official action on a bill, amendments, text versions, the full list of bills in a Congress, and Congress.gov's own counts of bills and laws. The plain explanations of vote types are fixed text written from its glossary.",
    refreshed: "The list of recently changed bills once a day. A bill's details when its latest action changes, 25 bills per update, voted bills first." },
  { id: "govinfo", group: "congress", name: "govinfo: bill status records and bill text", publisher: "U.S. Government Publishing Office", government: true,
    url: "https://www.govinfo.gov/", hosts: ["www.govinfo.gov"],
    reads: "Each bill's status record (sponsor, cosponsors, text versions, the Congressional Research Service summary, the list of cost estimates) and the text of the bill itself.",
    refreshed: "Sponsors and cosponsors once a week per bill. Bill text when a summary is written or re-checked." },
  { id: "house-floor", group: "congress", name: "House floor schedule: bills this week", publisher: "Office of the Clerk, U.S. House of Representatives", government: true,
    url: "https://docs.house.gov/floor/", hosts: ["docs.house.gov"],
    reads: "The bills the House plans to take up this week.",
    refreshed: "At every update." },
  { id: "congress-legislators", group: "congress", name: "congress-legislators member file", publisher: "The @unitedstates project, a public-domain data project kept by volunteers. Not a government site.", government: false,
    url: "https://github.com/unitedstates/congress-legislators", hosts: ["unitedstates.github.io"],
    reads: "The list of sitting members of Congress (name, party, state, district, term, official website), committees and who sits on them, and leadership posts.",
    refreshed: "Members about once a day (at most every 20 hours). Committees once a week." },
  { id: "white-house", group: "congress", name: "The White House", publisher: "Executive Office of the President", government: true,
    url: "https://www.whitehouse.gov/", hosts: ["www.whitehouse.gov"],
    reads: "The President's name and party on the Congress dashboard.",
    refreshed: "Entered by hand, with the date the term began." },

  { id: "crs", group: "summaries", name: "Congressional Research Service summary", publisher: "Congressional Research Service, Library of Congress", government: true,
    url: "https://www.congress.gov/", hosts: ["www.congress.gov"],
    reads: "The short official summary of a bill, as published on Congress.gov and carried in the bill's status record.",
    refreshed: "When a summary is written." },
  { id: "cbo", group: "summaries", name: "Congressional Budget Office cost estimates", publisher: "Congressional Budget Office", government: true,
    url: "https://www.cbo.gov/cost-estimates", hosts: [],
    reads: "The list of cost estimates in the bill's status record, with a link to each. The figures are used only when a committee report or the Congressional Record prints the estimate.",
    refreshed: "When a summary is written." },
  { id: "committee-reports", group: "summaries", name: "Committee reports", publisher: "U.S. Government Publishing Office (govinfo)", government: true,
    url: "https://www.govinfo.gov/app/collection/crpt", hosts: ["www.govinfo.gov"],
    reads: "The committee's stated purpose and background for the bill, the cost estimate it reprints, and any minority or dissenting views.",
    refreshed: "When a summary is written." },
  { id: "congressional-record", group: "summaries", name: "Congressional Record", publisher: "U.S. Government Publishing Office (govinfo)", government: true,
    url: "https://www.govinfo.gov/app/collection/crec", hosts: ["www.govinfo.gov"],
    reads: "What each named member said about the bill on the House or Senate floor.",
    refreshed: "When a summary is written." },
  { id: "federal-register", group: "summaries", name: "Federal Register", publisher: "Office of the Federal Register, National Archives", government: true,
    url: "https://www.federalregister.gov/", hosts: ["www.federalregister.gov", "www.govinfo.gov"],
    reads: "For a bill that would cancel an agency rule: the rule, the agency's own summary, its stated reasons, its main changes and its own estimates.",
    refreshed: "When a summary is written." },
  { id: "us-code", group: "summaries", name: "U.S. Code", publisher: "U.S. Government Publishing Office (govinfo)", government: true,
    url: "https://www.govinfo.gov/app/collection/uscode", hosts: ["www.govinfo.gov"],
    reads: "The sections of current law that a bill would change.",
    refreshed: "When a summary is written." },
  // Texas build, summaries (17 Nov 2026): the documents a Texas bill summary may use.
  { id: "tx-bill-documents", group: "summaries", name: "Texas bill texts, committee analyses and fiscal notes",
    publisher: "Texas Legislature Online (Texas Legislative Council). The analyses are written by House committees and the Senate Research Center; the fiscal notes by the Legislative Budget Board", government: true,
    url: "https://capitol.texas.gov/", hosts: ["capitol.texas.gov"],
    reads: "For a Texas bill that has had a committee hearing or a vote, or that a reader follows: the bill's text, the committee's analysis of it, and the Legislative Budget Board's estimate of what it would cost.",
    refreshed: "When a Texas summary is written." },
  { id: "hro", group: "summaries", name: "House Research Organization bill analyses", publisher: "House Research Organization, Texas House of Representatives", government: true,
    url: "https://hro.house.texas.gov/", hosts: ["hro.house.texas.gov"],
    reads: "For a Texas bill that reached the House floor: what supporters say and what critics say, as the analysis prints them.",
    refreshed: "When a Texas summary is written." },
  { id: "tx-statutes", group: "summaries", name: "Texas statutes", publisher: "Texas Legislative Council", government: true,
    url: "https://statutes.capitol.texas.gov/", hosts: ["statutes.capitol.texas.gov"],
    reads: "The sections of current Texas law that a bill would change.",
    refreshed: "When a Texas summary is written." },

  { id: "open-states", group: "texas", name: "Open States", publisher: "Plural Policy. An open-data service that copies state legislatures' records. Not a government site.", government: false,
    url: "https://openstates.org/", hosts: ["v3.openstates.org"],
    reads: "Texas bills with their actions, votes, sponsors and text versions; Texas legislators; committees; and scheduled hearings.",
    refreshed: "Bills and hearings at every update, at most 12 requests each time. Legislators and committees once a week." },
  { id: "legiscan", group: "texas", name: "LegiScan", publisher: "LegiScan LLC. A service that copies state legislatures' records. Not a government site.", government: false,
    url: "https://legiscan.com/", hosts: ["api.legiscan.com"],
    reads: "Used only as a fallback: Texas bill numbers, titles and status when Open States is missing or not answering, and bill counts for earlier sessions. It supplies no votes.",
    refreshed: "When Open States cannot be reached; session counts once a week." },
  { id: "tlo", group: "texas", name: "Texas Legislature Online", publisher: "Texas Legislative Council", government: true,
    url: "https://capitol.texas.gov/", hosts: ["capitol.texas.gov"],
    reads: "The source of record. Every Texas bill on the site links to its history page here, so you can check the copy against the original.",
    refreshed: "Linked, not copied." },
  { id: "texas-officers", group: "texas", name: "Texas Governor, Lieutenant Governor and Speaker of the House", publisher: "Their official sites", government: true,
    url: "https://gov.texas.gov/", hosts: ["gov.texas.gov", "www.ltgov.texas.gov", "house.texas.gov"],
    reads: "The names of the three presiding officers on the Texas dashboard, when Open States does not report them.",
    refreshed: "Entered by hand, labelled with the session they were checked for." },

  { id: "census", group: "lookup", name: "U.S. Census Bureau geocoder", publisher: "U.S. Census Bureau", government: true,
    url: "https://geocoding.geo.census.gov/geocoder/", hosts: ["geocoding.geo.census.gov"],
    reads: "Turns a street address, a cross street or a spot chosen on the map into a U.S. House district and the two state legislative districts. A ZIP code alone is matched to its state and House district from a Census table kept inside the site, without asking anyone.",
    refreshed: "Each time a reader looks up an address or uses a spot on the map." },
  { id: "census-boundaries", group: "lookup", name: "U.S. Census Bureau boundary files", publisher: "U.S. Census Bureau", government: true,
    url: "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html", hosts: ["www2.census.gov"],
    reads: "The outlines of U.S. House districts and of ZIP code areas, drawn on the small map that helps a reader choose a district when an address cannot be placed. The lines are general outlines: close to a line they can be off by a street.",
    refreshed: "Copied into the site when a new Congress is seated or a state redraws its map." },
];

/* ───────────────────────────── 2. Official and Analysis ───────────────────────────── */

export const LABELS = [
  { label: "Official", means: "Copied from a government record, with a link to that record. Nothing is added or reworded.",
    where: "Votes and how each member voted, bill titles and status, sponsors, committees, the floor schedule, and counts made directly from those records." },
  { label: "Analysis", means: "Written by the site to explain a record. An AI model drafts it and fixed rules check it. It is never mixed into an Official section.",
    where: "Bill summaries (the headline, the plain-English part and every section under them), the note on what changed between two versions of a bill, and the tag on a bill that was sorted into an issue by AI." },
  { label: "Your view", means: "Your own Support, Oppose or Unsure answer. Your individual vote is private; counted votes are added into anonymous totals.",
    where: "The answer box on a bill page, and your own page of answers." },
] as const;

/* ───────────────────────────── 3. How a bill summary is written and checked ───────────────────────────── */

/** The parts of a summary, in page order (docs/WRITING_STANDARD.md). */
export const SUMMARY_PARTS = [
  { part: "Headline", rule: "At most 15 words. Starts with a plain verb, names the everyday thing people know, and uses no abbreviations." },
  { part: "In plain English", rule: "Two or three sentences, at most 80 words: what the bill does, who feels it, and why it is being argued over now." },
  { part: "What would change", rule: "Two to six rows, each “Today: … → If this passes: …”, with the numbers and dates from the sources." },
  { part: "How it works today", rule: "Three to five short points, each tied to a source, so a reader who has never heard of the subject can follow." },
  { part: "Why now", rule: "One or two sentences with the date or the vote that put the bill in front of Congress." },
  { part: "Who it affects", rule: "Each point cites the section of the bill or the source that says it." },
  { part: "The case for and the case against", rule: "Reasons, not mechanics, each credited to the named person or body that gave it in the official record. If the record holds no reason for one side, the page says “No public statement of reasons found.”" },
  { part: "What we don't know", rule: "One to three points the sources leave open." },
  { part: "Sources", rule: "Every document the summary used, linked." },
] as const;

/** The written checks, run by a program on every draft (lib/analysis/checker.ts and standard.ts). */
export const WRITTEN_CHECKS = [
  "Every point cites a section of the bill or one of the sources, and shares key words with what it cites.",
  "Names, numbers and dates in the summary must appear in a source. An agency's name does not count as a mention of a program.",
  "Terms on the site's list of jargon must be replaced with plain words or explained on first use. Abbreviations are spelled out.",
  "No loaded words. A fixed list of words such as “sweeping”, “radical”, “common-sense” and “bipartisan” fails a draft, as does any verdict, grade or first-person opinion.",
  "Balance. The case for and the case against must be of similar length, and each reason must be credited to someone the official record names on that side.",
  "A change stated without its number fails: say from what, to what.",
  "Reading level. A draft above a 12th-grade reading level fails; the target is about 8th grade.",
] as const;

/** Who does what. `by` is "program" (fixed rules, no AI), "ai" (a model call) or "person" (the editor). */
export const SUMMARY_STEPS = [
  { step: "Gather the official documents for the bill.", by: "program" },
  { step: "Draft the summary from those documents only.", by: "ai" },
  { step: "Fix small faults a program fixes reliably, such as an abbreviation that was not spelled out.", by: "program" },
  { step: "Run the written checks.", by: "program" },
  { step: "Run the average-reader test: two AI readers read the summary cold, and a checking call compares their answers with the documents.", by: "ai" },
  { step: "Rewrite a failed draft with the exact failure as feedback, at most twice.", by: "ai" },
  { step: "Read every summary that still fails, or that the model marked low-confidence. It stays hidden until the editor approves it.", by: "person" },
  { step: "Audit one summary in every five that passed.", by: "person" },
  { step: "Approve each reusable explainer before it is used anywhere.", by: "person" },
  { step: "Each week, check a random 20% of the summaries on show against the bill text again. One that fails is taken down and listed on the corrections page.", by: "program" },
] as const;

/* ───────────────────────────── 4. How the numbers are computed ───────────────────────────── */

/** The member page's "How these are counted" block says the same thing; tests/trust.test.mjs holds the two together. */
export const MEMBER_STATS_METHOD = {
  base: "Both figures use the roll calls (votes recorded by name) in the site's copy of the official record that list the member.",
  missed: "Missed votes: the roll calls where the member is listed “Not Voting”.",
  withParty: "Voted with most of their own party: on roll calls where the member voted Yea or Nay (yes or no), whether they voted the way most other members of their party voted. Ties, and roll calls with fewer than two other members of that party voting, are left out.",
  same: "The same method is used for every member. These are counts, not ratings.",
} as const;

const HOURS = ACCOUNT_MIN_AGE_MS / 3_600_000;
export const READER_TOTALS = {
  minShown: MIN_SHOWN, waitHours: HOURS,
  rules: [
    "Your individual vote is private. Counted votes are added, without a name, into totals that anyone can see.",
    "An answer is counted only from an address-matched or mail-verified resident. Address-matched means a confirmed email, a text-message code sent to a U.S. mobile number that is not an internet (VoIP) number and is not used by another account, and a home address the Census Bureau's geocoder placed. Mail-verified adds a code from a postcard mailed to that address. An account with only a phone can read, follow and save a private position, and is counted in no total.",
    "An answer counts only if the home address is inside the bill's jurisdiction. A federal bill counts residents of any state or the District of Columbia; residents of a U.S. territory are counted as their own group. A state bill counts residents of that state only. Anyone else can read the bill and see the totals.",
    "Support, Oppose and Unsure are all counted answers. Totals are shown for the nation (federal bills), the state and the district, with mail-verified and address-matched residents listed separately, mail-verified first.",
    "One person, one home. One account per phone number, and one home address per account, which can be changed once every 90 days. So a resident is counted in one congressional district, one state senate district and one state house district at a time.",
    "An answer is counted in the districts the resident lived in when they gave it. Moving later does not carry earlier answers to the new district; new answers follow the new address.",
    "At most six accounts count at one home address. Further accounts there can read and follow, and are counted only after the editor has reviewed them.",
    `A new account's answers start counting ${HOURS} hours after the account was created.`,
    `A total is never shown below ${MIN_SHOWN} counted voters. Below that a district says “Not enough constituents yet — share this bill.” A group of fewer than 5 voters is shown by its size only, not by answer.`,
    "Answers given before 19 November 2026, when the site said no answer would be added up, stay uncounted unless the person who gave them chooses, once, to count them.",
    "Answers that look like coordinated activity (a sudden surge, many new accounts from one network or device, the same reason text from several accounts) are set aside from the totals until the editor has looked. They are never deleted.",
    "A whole account is set aside the same way, and never deleted, when one device or network sets up accounts at many addresses, when a burst of new accounts or address changes arrives in one district just before a vote, or when an address is changed again and again.",
    "No individual vote and no reason is ever shown to anyone but the person who gave it. A legislator's office sees the totals for its own district only, and an association sees totals for its own members only. Neither ever sees a person.",
    "The place your device or internet address appears to be is used only as a sign of possible fraud for review. It never decides whether you may vote on a bill.",
    "Every total carries the words “Not a scientific poll”.",
  ],
} as const;

/* ───────────────────────────── 5. How a claim is checked ───────────────────────────── */

export const CLAIM_STEPS = [
  { title: "The original is captured", text: "We start from the statement itself: an official release, a speech, an interview, a post. The page is saved as published, with its address and the time. A later edit or removal is recorded as a new observation. We do not guess at motive." },
  { title: "The exact words are kept", text: "The sentence is quoted word for word, inside the passage it came from. A reviewer opens the original and confirms the sentence is there and in context. If it cannot be found, the case stops." },
  { title: "The claim is written out plainly", text: "Beside the quote sits the factual claim in neutral words, with its time, place and scope. Two people making the same claim share one wording, so the same evidence applies to both." },
  { title: "How much it matters is decided first", text: "A reviewer decides how much the claim matters and writes down why, before any evidence is read. That decision is locked, so it cannot be adjusted to fit what the evidence later shows." },
  { title: "Evidence is searched for in both directions", text: "Every record documents a search for evidence that supports the claim and a search for evidence against it. An AI model may suggest leads, but each lead counts for nothing until a person has opened it and judged whether it bears on this exact claim." },
  { title: "A person reviews, then publishes as CHECKING", text: "The reviewer records what the evidence shows and what is still open, and publishes. Every record carries the status CHECKING. It says what is being examined and what has been found so far. It does not assign a number." },
] as const;

/* ───────────────────────────── 6. The pledge ───────────────────────────── */

export type PledgeItem = { id: string; promise: string; check: string };

export const PLEDGE_ALWAYS: PledgeItem[] = [
  { id: "same-rules", promise: "Use the same rules for every member and every party.",
    check: "The wording of a vote, the counts on a member's page and the checks on a summary are fixed rules that work the same way whatever the party. The site also compares summaries of bills from each party for length, loaded words and balance, and alerts the editor if they drift apart." },
  { id: "sources", promise: "Show where every fact came from.",
    check: "Each vote, bill and status line links to the government page it was copied from. Each summary lists the documents it used." },
  { id: "labels", promise: "Label what is Official and what is Analysis.",
    check: "On a bill page each section of content is labelled Official or Analysis, and your own answer is labelled Your view. A copied record and the site's own explanation are never mixed in one section." },
  { id: "both-sides", promise: "Give the case for and the case against, each credited to who said it.",
    check: "A summary fails its checks if a reason is not credited to a named person or body in the official record, or if one side is written at much greater length than the other. When the record holds no reason for a side, the page says so." },
  { id: "unknowns", promise: "Say what we do not know.",
    check: "Every summary has a “What we don't know” section. A summary with no concrete fact must say the sources do not say." },
  { id: "corrections", promise: "Correct errors in public.",
    check: "The corrections page lists every correction, every summary withdrawn after a re-check, and every fix made after a reader's report. Earlier versions are kept, not overwritten." },
  { id: "private-answers", promise: "Keep your answers private.",
    check: `Your individual Support, Oppose or Unsure answer, and your reason, are shown only to you. Only anonymous totals are shown to anyone else, and never below ${MIN_SHOWN} counted voters.` },
];

export const PLEDGE_NEVER: PledgeItem[] = [
  { id: "no-grades", promise: "Grade, rate or score a member or a party.",
    check: "No page carries a rating. Where the site shows a count, such as missed votes, it shows the count, how it was made, and the same count for every member." },
  { id: "no-endorsements", promise: "Endorse a candidate, a party or a bill, or tell you how to vote.",
    check: "A summary that contains a verdict, a recommendation or a first-person opinion fails its checks and is not shown." },
  { id: "no-procedural-spin", promise: "Present a procedural vote as a vote for or against a bill.",
    check: "Every vote is sorted by type. A vote on whether or how to proceed is labelled “a procedural step (not a vote on the bill itself)”." },
  { id: "no-news-sources", promise: "Write a summary from news stories or advocacy groups.",
    check: "The only documents a summary may use are the official ones listed on the How this works page. Each is linked from the summary." },
  { id: "no-data-sharing", promise: "Sell your information, or share it with a campaign, a party or a political committee.",
    check: "The site has no advertising or tracking code from outside companies. Usage is counted as daily totals only, with no record of who read what." },
  { id: "no-sending", promise: "Send a message to an official in your name.",
    check: "Nothing on the site sends mail, makes a call or fills in a form for you." },
];

/* ───────────────────────────── 7. Privacy: cookies ───────────────────────────── */

export type Cookie = {
  name: string;
  /** "cookie", or "tab" for a value kept in the browser tab only and never sent to the site. */
  kind: "cookie" | "tab";
  purpose: string; holds: string; lasts: string;
  /** "everyone", "verification" (only with real-person verification on) or "editor" (never set for a reader). */
  who: "everyone" | "verification" | "editor";
};

export const COOKIES: Cookie[] = [
  { name: "or_trial", kind: "cookie", who: "everyone", purpose: "Lets you in as an invited trial reader.", holds: "The code from your invite link.", lasts: "90 days after your latest visit" },
  { name: "or_reader", kind: "cookie", who: "everyone", purpose: "Keeps you signed in after you tap the link in your email.", holds: "A signed token naming your account.", lasts: "90 days" },
  { name: "or_loc", kind: "cookie", who: "everyone", purpose: "Remembers which legislators are yours.", holds: "Your state and district codes, such as TX and TX-37, and how they were found (a ZIP code, an address, a cross street, a spot on the map, or your own choice). Not your address, and not the spot.", lasts: "400 days" },
  { name: "or_place_pending", kind: "cookie", who: "everyone", purpose: "Holds the result of checking your address until you say it is the right one.", holds: "Your ZIP code and your state and district codes. Not your address.", lasts: "10 minutes" },
  { name: "or_zip", kind: "cookie", who: "everyone", purpose: "Keeps the ZIP code you typed so you do not have to type it again.", holds: "Your ZIP code. It is kept in your browser; the site does not save it in its database.", lasts: "400 days" },
  { name: "or_first", kind: "cookie", who: "everyone", purpose: "Lets the site count, in total, how long first-time readers take to give their first answer.", holds: "The time of your first visit. Only a total by time band is recorded, never your own time.", lasts: "1 year" },
  { name: "or_issues", kind: "cookie", who: "everyone", purpose: "Remembers the issues you picked.", holds: "Up to three issue names.", lasts: "400 days" },
  { name: "or_lv", kind: "cookie", who: "everyone", purpose: "Lets the site show what is new since you last visited.", holds: "The time of your last visit and the one before. Times only, never pages.", lasts: "400 days" },
  { name: "or_dev", kind: "cookie", who: "everyone", purpose: "Limits how often one device can ask for sign-in links, answer, or send reports.", holds: "A random number for this browser. The site stores only a scrambled form of it.", lasts: "400 days" },
  { name: "or_fb", kind: "cookie", who: "everyone", purpose: "Stops the one-question feedback prompt from asking you twice.", holds: "The word “sent” or “dismissed”.", lasts: "365 days" },
  { name: "or_from_share", kind: "cookie", who: "everyone", purpose: "Counts, in total, how many people who arrive through a shared link go on to set up the site.", holds: "The short code of the shared link. Deleted when you finish getting started.", lasts: "7 days" },
  { name: "or_office", kind: "cookie", who: "everyone", purpose: "Keeps a legislator's office signed in to its dashboard. Set only when someone who works for a legislator signs in on the page for offices with a government email address; never set for anyone else.", holds: "A signed token naming the office's sign-in.", lasts: "30 days" },
  { name: "or_pp", kind: "cookie", who: "verification", purpose: "Holds your phone number while you type in the text-message code.", holds: "Your phone number, encrypted. Deleted when the code is confirmed.", lasts: "10 minutes" },
  { name: "or_assoc", kind: "cookie", who: "everyone", purpose: "Only for a person who administers an association: keeps them signed in to that association's totals after they tap the link in their email. Not set for anyone else.", holds: "A signed token naming that administrator's entry on the association's list.", lasts: "7 days" },
  { name: "or_mvo", kind: "cookie", who: "verification", purpose: "Remembers that you tapped “Not now” on the postcard offer, so the offer is not shown again on this device.", holds: "The word “no”.", lasts: "400 days" },
  { name: "on_record_session", kind: "cookie", who: "editor", purpose: "Keeps the editor signed in. Never set for a reader.", holds: "A signed token.", lasts: "30 days" },
  { name: "or_err", kind: "tab", who: "everyone", purpose: "Stops the same error page from being counted twice in the same tab.", holds: "A short code for each error page already counted. It stays in your browser and is never sent to the site.", lasts: "Until you close the tab" },
  { name: "or_v", kind: "tab", who: "everyone", purpose: "Stops one visit from being recorded twice in the same tab.", holds: "The digit 1. It stays in your browser and is never sent to the site.", lasts: "Until you close the tab" },
];

/* ───────────────────────────── 8. Privacy: who else handles data ───────────────────────────── */

export type Processor = {
  id: string; name: string; url: string; role: string;
  /** What it receives about a reader; "Nothing about readers." when it receives none. */
  receives: string;
  /** "always", "optional" (only if the reader uses the feature) or "verification" (only with verification on). */
  when: "always" | "optional" | "verification";
  readerData: boolean;
  hosts: string[];
};

export const PROCESSORS: Processor[] = [
  { id: "vercel", name: "Vercel", url: "https://vercel.com/", role: "Hosts the site.", when: "always", readerData: true, hosts: [],
    receives: "Every request to the site passes through Vercel, as with any web host: your internet address, the page asked for, and anything you send in a form." },
  { id: "turso", name: "Turso", url: "https://turso.tech/", role: "Stores the site's database.", when: "always", readerData: true, hosts: [],
    receives: "Everything listed under “What the site stores”." },
  { id: "resend", name: "Resend", url: "https://resend.com/", role: "Sends the site's email.", when: "optional", readerData: true, hosts: ["api.resend.com"],
    receives: "Your email address and the text of each email sent to you: the sign-in link; the weekly email and bill alerts, unless you turn them off; and any briefing, vote alert or reminder you turned on." },
  { id: "census", name: "U.S. Census Bureau geocoder", url: "https://geocoding.geo.census.gov/geocoder/", role: "Finds the districts for a street address.", when: "optional", readerData: true, hosts: ["geocoding.geo.census.gov"],
    receives: "The street address you type, or the spot you choose on the map, sent from the site's server. The Census Bureau does not receive your name, your email or your device's internet address." },
  { id: "osm", name: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright", role: "Supplies the map pictures under the district lines and the pin.", when: "optional", readerData: true, hosts: ["tile.openstreetmap.org"],
    receives: "Only if you open the map: requests for pictures of the area shown, sent from the site's server. OpenStreetMap does not receive your address, the spot you choose, your name, your email or your device's internet address." },
  { id: "push", name: "Your browser's notification service (Apple, Google or Mozilla)", url: "https://developer.mozilla.org/en-US/docs/Web/API/Push_API", role: "Wakes your device when you have turned on alerts.", when: "optional", readerData: true, hosts: [],
    receives: "An empty signal with no content. Your device then asks the site itself for the text of the alert." },
  { id: "twilio", name: "Twilio", url: "https://www.twilio.com/", role: "Checks that a phone number is a real mobile line and texts the code.", when: "verification", readerData: true, hosts: ["lookups.twilio.com", "verify.twilio.com"],
    receives: "Your phone number and the code you type." },
  { id: "usps", name: "U.S. Postal Service address check", url: "https://developers.usps.com/addressesv3", role: "Says whether a street address has several homes, so a unit number can be asked for. Switched off; the site's owner has not turned it on.", when: "verification", readerData: true, hosts: ["apis.usps.com"],
    receives: "If it is turned on: the street address and unit you type, sent from the site's server. Not your name, your email or your device's internet address." },
  { id: "postcard", name: "A postcard printing and mailing company, and the U.S. Postal Service", url: "https://www.usps.com/", role: "Would print and mail the postcard that carries the code for a mail-verified account. Switched off: no company has been chosen and no postcard is mailed.", when: "verification", readerData: true, hosts: [],
    receives: "If it is turned on: your home address and the code printed on the card, sent from the site's server. Not your name, your email, your phone number or anything about your answers. A postcard can be read by anyone who handles the mail; it shows the code and the name of this site, and nothing else." },
  { id: "turnstile", name: "Cloudflare Turnstile", url: "https://www.cloudflare.com/application-services/products/turnstile/", role: "The automatic bot check on the sign-in form, the phone step, and an address-matched reader's first counted answer.", when: "verification", readerData: true, hosts: ["challenges.cloudflare.com"],
    receives: "Its script runs in your browser on those forms, so Cloudflare sees your browser and internet address. The site also sends Cloudflare your internet address with the result of the check." },
  { id: "openai", name: "OpenAI", url: "https://openai.com/", role: "Drafts and tests bill summaries, sorts bills into issues, and suggests research leads on officials' public statements.", when: "always", readerData: false, hosts: ["api.openai.com"],
    receives: "Nothing about readers. It receives bill text, official documents and public statements by officials." },
  { id: "photos", name: "The Biographical Directory of the U.S. Congress, and the Texas House and Senate sites", url: "https://bioguide.congress.gov/", role: "Where legislators' official portraits come from. The pictures are fetched by the site's server, not by your device.", when: "always", readerData: false,
    hosts: ["bioguide.congress.gov", "house.texas.gov", "www.house.texas.gov", "senate.texas.gov", "www.senate.texas.gov"],
    receives: "Nothing about readers. The site's server asks for a member's portrait and passes it on to you, so these sites never see your device or your internet address." },
  { id: "social", name: "Bluesky and Threads", url: "https://bsky.app/", role: "Where the site's own accounts would post once the site is public. Switched off while the site is private.", when: "always", readerData: false, hosts: ["bsky.social", "graph.threads.net"],
    receives: "Nothing about readers. Only the site's own posts, built from the official record." },
];

/* ───────────────────────────── 9. Privacy: what is stored ───────────────────────────── */

export type Stored = { what: string; detail: string; when: "everyone" | "account" | "optional" | "verification" };

export const STORED: Stored[] = [
  { when: "everyone", what: "Your place", detail: "Your state and district codes, kept in a cookie and, for an invited reader, in the database so they follow you to another device. The site does not keep your street address from a legislator lookup, and it does not save your ZIP code in its database: the ZIP stays in a cookie in your browser." },
  { when: "everyone", what: "Your issues and follows", detail: "Up to three issues you picked, and the members and bills you follow. When you use the call, copy, form or email button in the contact panel on a bill, that bill is added to the bills you follow, so the site can tell you what happens to it; the panel says so and has a Stop button that removes it. The site does not keep which office you contacted, which button you used or what you wrote. The first time you enter your address, the site follows your own legislators for you and switches vote alerts on; you can undo both. To avoid following someone again after you unfollow them, and to ask about issues only once, the site keeps the district codes those follows were made for and the time you answered the issues step." },
  { when: "everyone", what: "Your answers", detail: "Support, Oppose or Unsure on a bill; each change you make to an answer, with the time; and the reason you may add, up to 280 characters. Your individual answer and your reason are shown only to you. If your account is address-matched or mail-verified and you live inside the bill's jurisdiction, the answer is also added, without your name, into totals anyone can see. Answers you gave before 19 November 2026 are not added unless you choose that." },
  { when: "everyone", what: "Visit times", detail: "The time of your last visit and the one before, to show what is new. For an invite link: the first and last day it was used and on how many days. Never which pages you opened. One more fact is kept per reader: whether you came back during your second week, noted once, so the site can tell how many people return." },
  { when: "everyone", what: "Notices about bills you weighed in on", detail: "When a bill you answered or follow gets a floor vote, passes, fails, is signed or is vetoed, the site writes you one notice saying what happened and how your legislators voted. The notice is kept so you can read it later, with whether it has been shown to you on the site yet, and is deleted with your account. It does not keep your answer; your answer is read from your own answers when the notice is shown or emailed to you. When the weekly email is opened (its picture is loaded) or the link in a notice is followed, the site adds one to a count using a random one-time mark that is kept nowhere else and is not linked to you." },
  { when: "account", what: "Your email address", detail: "Kept to send your sign-in link and the site's emails to you. The sign-in links you asked for are kept with it." },
  { when: "account", what: "Emails that are on unless you turn them off", detail: "Once you sign in: a weekly email on how your own legislators and the members you follow voted, with one bill in your issues that moved and one thing coming up; and an email when a bill you follow moves, or when a bill you answered or follow gets a floor vote, passes, fails, is signed or is vetoed. Each can be switched off on the Account page, and the weekly email from the link at the bottom of it. The site keeps your choice and a log of the weekly emails sent." },
  { when: "optional", what: "Emails and alerts you turn on", detail: "The briefing, alerts when a legislator you follow votes on a bill (one message per update, at most), and reminders you set, with the item's title and date. The site keeps your choices and the text of alerts sent to you." },
  { when: "optional", what: "Push alerts", detail: "If you turn them on: the address your browser gives the site for sending a notification to this device, and its two keys." },
  { when: "optional", what: "Your answer on a card you share", detail: "Only if you switch on “Add my answer to the card”: the picture carries one line with your answer (support, oppose or unsure), marked as added by the person sharing. The link you share records that the card has that line. It does not record who made it. Anyone you send the card to can see the line." },
  { when: "optional", what: "Reports and feedback", detail: "A problem report holds the page, the reason you chose and your optional note. The one-question feedback answer is stored with no link to you." },
  { when: "optional", what: "Associations you join", detail: "If you join an association with its code: that your account is a member, and the date you joined. The association is shown totals only, for its counted members and from 25 of them: never your name, your email, whether you joined, or your own answer. Leaving removes the record at once, and so does deleting your account or the association closing. The join code is not stored, only a scrambled form of it." },
  { when: "optional", what: "Association administrators", detail: "If the site's editor lists you as an administrator of an association: your email address, kept to send your sign-in link, the sign-in links you asked for, and the date you first signed in. All of it is deleted when the editor takes you off the list." },
  { when: "optional", what: "A legislator's office that signs in", detail: "If you work for a legislator and sign in on the page for offices: your work email address, the member you said you work for, the sign-in links you asked for and when one was used, the time you last opened the dashboard, your choice about the weekly email, and a log of the weekly emails sent to you. An address that asks for a link and never uses it is removed after a week. An office sees totals for its own district only; it never sees a reader, an answer or a reason." },
  { when: "everyone", what: "Errors on the site", detail: "When a page fails, the site counts it: the day, the kind of page (never the exact address) and a short technical message. Nothing about you is kept with it." },
  { when: "everyone", what: "Limits on repeated use", detail: "A scrambled form of your device's random number and of your network range, kept for 48 hours, to stop one device or network from flooding the site. The raw internet address is not stored." },
  { when: "verification", what: "Phone number", detail: "Never stored. The site keeps only a keyed hash of it (a scrambled fingerprint that cannot be turned back into the number), so one phone cannot verify two accounts, plus the line type and the time it was confirmed. While you type the code, the number sits encrypted in a cookie on your own device for 10 minutes. If you delete your account, that fingerprint alone is kept for 90 days, with nothing that says whose it was, so the same number cannot open a new account straight away; then it is deleted too." },
  { when: "verification", what: "Home address", detail: "Sent to the Census Bureau to find your districts, then stored encrypted, with the codes of your state and your congressional, state senate and state house districts. The site also keeps a scrambled fingerprint of the address in a standard form, with and without the unit number, to count how many accounts share one home. Totals use the district codes alone. You have one home address at a time; a new one replaces the old one. Each counted answer keeps the district codes you had when you gave it." },
  { when: "verification", what: "Postcard code", detail: "Only if you ask for a postcard, a step that is switched off for now. The code printed on the card is never stored. The site keeps a keyed hash of it (a scrambled fingerprint), the date it was made, the date it stops working (30 days later) and the date you typed it in. For each postcard the site keeps the date, the scrambled fingerprint of the address it was for, which mailing company handled it and that company's reference number, whether it was sent, and what it cost. If your account becomes mail-verified, the site keeps the date with the scrambled fingerprints of your address and your phone number. All of it is deleted when you delete your account." },
  { when: "verification", what: "Sign-up checks", detail: "The time you passed the bot check, and a scrambled form of the network range and device you signed up from, cleared after 30 days. An answer from a signed-in account also carries a scrambled form of the network range and device it came from, cleared after 30 days unless the answer is under review. Each time you set, change or try to change your home address, the date is kept with a scrambled form of the device and network range it came from; those two are cleared after 30 days. If your account is set aside for review, the reason and the date are kept." },
];

/* ───────────────────────────── 10. Markers for the lawyer and the founder ───────────────────────────── */

/** Every place where a lawyer must decide. The Privacy and Terms pages show each as "[LEGAL REVIEW: …]". */
export const LEGAL_REVIEW = {
  entity: "the legal name and address of the person or company that runs the site and is responsible for reader data",
  effectiveDate: "the date this policy takes effect, and how readers are told",
  hostLogs: "what Vercel and Turso log and for how long, and whether a data processing agreement is in place with each service named here",
  sensitive: "whether political opinions need separate, explicit consent in any state or country the site will serve, and whether a notice for California, Texas or other state privacy laws is required",
  retention: "how long to keep an email address, answers, the answer history, encrypted addresses and inactive accounts. The code sets no end date for these; it deletes them only when the reader deletes the account",
  countedHashes: "the scrambled network range and device kept with an answer are cleared after 30 days, or when a review of that answer closes if later; decide whether 30 days is right",
  deletionGaps: "account deletion leaves two things behind: a random id tied to the invite link the reader came in with, which holds no email and no answers; and, for 90 days, the scrambled fingerprint of the phone number, with no link to the person, so the number cannot open a new account straight away. Decide whether either must go sooner",
  noAccountDelete: "a reader who never signed in by email has no delete button; their answers and follows are tied to the invite link. Decide how such a reader asks for deletion and how fast it is done",
  databaseAccess: "the person who runs the site can read the database directly, including which invite gave which answers; say who has access and under what rule",
  keyRotation: "phone hashes and stored addresses are protected by keys derived from one site secret; decide whether separate keys or a key-change plan are required",
  emailDefault: "the weekly email and bill alerts are switched on by default for a signed-in reader, and vote alerts are switched on the first time a reader enters an address (they reach a reader only by email once signed in, or on a device where the reader allowed notifications); decide whether they must be off until the reader chooses them",
  requests: "how a reader asks for a copy of their data or a correction, and the time limit for answering",
  breach: "the duty to tell readers about a data breach, and how",
  age: "the minimum age to use the site (13, 16 or 18) and the wording. The code does not ask for or check age",
  changes: "how much notice readers get before a change takes effect",
  privacyContact: "the contact address for privacy requests",
  termsEntity: "the legal name of the person or company offering the service",
  termsAge: "the minimum age and whether a parent's consent is needed",
  conduct: "whether the list of things a reader may not do is complete, and the right to end access",
  ownership: "who owns the site's own summaries and explainers, and what a reader may copy or share. Official records are public documents",
  photoRights: "rights to members' official photos: the cards show portraits fetched from the Biographical Directory of the U.S. Congress and, for Texas legislators, from the Texas House and Senate sites. Confirm that each may be shown, and whether a credit line is required",
  aiNotice: "whether the notice that summaries are drafted by an AI model is enough where the site will operate",
  warranty: "the no-warranty wording",
  liability: "the limit of liability, and whether it is allowed for consumers in every state served",
  disputes: "governing law, the court or county for disputes, and whether to require arbitration",
  termsChanges: "how changes to these terms are announced and when they take effect",
  termsContact: "the contact address for legal notices",
} as const;
export type LegalKey = keyof typeof LEGAL_REVIEW;

/** Every place where the founder must write or decide. The editor sees each as "[Founder: …]"; readers see the neutral line. */
export const FOUNDER_PLACEHOLDERS = {
  who: { editor: "your name, where you are based, and one sentence on why you started this.", reader: "A named profile of the founder will be here before public launch." },
  funding: { editor: "confirm how the site is paid for.", reader: "" },
  fundingPledge: { editor: "decide the funding rule (for example: no advertising, no money from campaigns, parties, political committees or advocacy groups) and confirm it. Until you do, the pledge makes no promise about funding.",
    reader: "The rule on what money the site will and will not accept is still to be confirmed by the founder. It will be stated here before public launch." },
  contact: { editor: "a contact address for the record; set PUBLIC_CONTACT_EMAIL in Vercel.", reader: "A contact address will be listed here before public launch." },
} as const;
export type FounderKey = keyof typeof FOUNDER_PLACEHOLDERS;

export const DRAFT_BANNER = "Draft for legal review. Not yet in force.";
