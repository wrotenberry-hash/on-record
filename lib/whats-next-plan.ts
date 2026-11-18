/**
 * The written half of Editor → What's next: Claude's ranked recommendations, the owner-only
 * steps, and progress against the master plan. Updated by Claude at every check-in (the live
 * numbers on the page come from the health probe, so they are always current). Its only import is the product name.
 */
import { BRAND } from "./brand.ts";
export type Recommendation = { title: string; why: string; needs: "your go-ahead" | "you" | "nothing; in progress" };
export type OwnerStep = { key: string; title: string; minutes: number; why: string; steps: string[]; doneWhen: string };
export type RoundStatus = { round: string; what: string; state: "live" | "live, waiting on data" | "live behind a switch" | "in progress" };

export const PLAN_UPDATED = "2026-11-18T21:00:00Z";
export const PLAN_NOTE = "This evening’s run (19:00 UTC) worked on 19 bills: 5 passed and 14 were held, for $3.30 (about 17 cents each). There are now 28 summaries, 14 on show to trial readers and 14 held; 13 of the 34 bills voted on in the last 90 days are covered, and the month’s OpenAI spend is $9.16 of $40. Both back-to-back runs now keep going after this morning’s fix. Each ran five times in a row and was then stopped by the host’s own limit on a run that starts the next run. I have not worked around that limit: about five runs fit in each scheduled update, and the rest waits for the next one. I read the five newly passing summaries against their saved sources. H.R. 8278 is clean. H.R. 8884 misstates two details. H.J.Res. 213, H.J.Res. 210 and H.R. 9576 each have a smaller point. None invents a fact. With the five from this morning, seven summaries on show misstate a detail, and the decision to hold them is still yours (first item below). One more false alarm in the checks is fixed: the site’s own explanation of “fiscal year” mentions October, and the source check refused it; only the two summaries it affected get another try. Texas loaded for the first time in full: 1,610 bills filed for the 2027 session, 60 committees with their chamber, 590 memberships; no hearings are listed at the source yet. Screenshots for your colleague: the set is ready to run with the bill review first, and waits only for one trial invite link from you (Editor → Trial invites, copy one unused link, paste it in the chat, revoke it afterwards).";

export const RECOMMENDED: Recommendation[] = [
  { title: "Paste one trial invite link so the screenshot set can be made", needs: "you",
    why: "The share-ready screenshots for your colleague have to come from the live site, signed in as a trial reader, and I hold no invite. Editor → Trial invites: copy one unused link, paste it in the chat, and revoke it after I confirm the files are delivered. It is a reader-only link, not a key. The set leads with the bill review (plain-English summary, what would change, how it works today, both sides, what we don’t know) and ends with two screens on votes. About 1 minute for you, 10 for the run." },
  { title: "Decide: hide the seven summaries that misstate a detail until they are rewritten?", needs: "you",
    why: "They passed every automatic check, but read against their sources each misstates a detail. From this morning: H.R. 3276’s headline says it funds grants where the bill only allows the money if Congress later provides it; H.R. 4219 credits the committee report for a point made in floor debate; H.R. 9500 says declared emergency where the law says declared disaster; H.R. 4646 states the sponsor’s claim about thousands of workers as fact; H.R. 9497 gives one member’s project count (14) where another said 10. From this evening: H.R. 8884 says Congress rejected a public comment period where a committee majority voted down an amendment, and gives 2022 where the last day to start was in 2021; H.J.Res. 213 calls Rep. Rivas “he” where no source gives a pronoun. Three more have a headline or a credit that says a little more than the sources (H.J.Res. 210, H.R. 9576, and one line of H.J.Res. 213). No invite has been used, so no outside reader has seen them. Recommended: reply \"hold the seven\" and they are hidden until rewritten; reply \"add the rules\" and I will propose checks for these kinds of slip for you to approve before they are switched on." },
  { title: "Residents’ votes on bills: built; seven decisions are yours", needs: "you",
    why: "Every bill page now makes the new promise, offers Support, Oppose and Unsure on federal and Texas bills, counts only address-matched or mail-verified residents who live inside the bill’s jurisdiction, and shows totals for the nation, state and district from 25 voters, with each legislator’s vote beside their district’s total. Also built: the office dashboard for legislators, postcards for mail-verified (switched off; nothing can be mailed), and associations (switched off). Nothing is counted yet. Your decisions, in order: (1) add the text-message and bot-check keys in Vercel (Twilio and Cloudflare Turnstile; never paste them in chat), because without them nobody can be address-matched; (2) confirm or change the nine defaults in docs/CONSTITUENT_VOICE.md; (3) real residential address: the Census check cannot tell a home from a business, the Postal Service check can but its terms limit it to mailing; (4) postcards: Lob or PostGrid, about 91 cents a card with no monthly fee, so $100 buys about 109 cards a month (docs/POSTCARD_VENDORS.md); (5) offices: whether to accept bare house.gov addresses, whether offices may sign in before the site is public, and whether the weekly email may be sent; (6) associations: an administrator who looks before and after one member changes an answer can work out that answer, so decide whether to switch them on; (7) have your lawyer read the privacy draft’s new entries." },
  { title: "One person, one residence: two choices only you can make", needs: "you",
    why: "The six rules you set are built and tested (14 tests, including your three), and stay switched off with the rest of verification. Two parts wait on you. First, unit numbers: the Postal Service’s address check can say when an apartment number is missing, but its terms allow it only for mailing, so I left it off; choose between turning it on together with mailed codes after your lawyer agrees, or a paid address service. Second, mailed codes: the rules work, but sending needs a mail provider and a monthly limit (about a dollar a postcard). The defaults I chose are listed in docs/ONE_RESIDENCE.md." },
  { title: "Read and approve the four Texas explainers", needs: "you",
    why: "How the Legislature passes a bill, the Lieutenant Governor and the Speaker, the session calendar, special sessions: https://claude.ai/artifact/Y5wHar4nsoSXgktfXPS8xs. Each says what was left out and why, and one sentence is marked as a reading rather than a quotation. Reply \"approve Texas explainers\" or say what to change." },
  { title: "Add a free LegiScan key (Texas backup source)", needs: "you",
    why: "It is the backup you named, and it fills two things the official pages do not give: recorded votes when the main source has none, and how many bills passed the chamber where they started in past sessions. 5 minutes, free: legiscan.com, create an account, copy the API key, then in Vercel add it as LEGISCAN_API_KEY (Settings, Environment Variables, Production). Do not paste the key into chat." },
  { title: "Press Run the update now once (optional)", needs: "you",
    why: "One press starts the federal summaries and the Texas loader now instead of at 13:00 UTC. Either way Claude reports what loaded, how many summaries passed and what it cost." },
  { title: "Try the first 60 seconds on your phone", needs: "you",
    why: "Open the home page signed in as editor at /start, type your ZIP, add your street address, tap Support or Oppose on an upcoming bill, then open a bill and use Contact your legislators. A script did it in 11 seconds; a person is the real test." },
  { title: "Replace the OpenAI key with one that does not expire", needs: "you",
    why: "The current key stops working on 23 Nov. When it does, summaries and statement research stop. 5 minutes (steps below)." },
  { title: "Hand out 5 trial invites, after the rewritten summaries pass", needs: "your go-ahead",
    why: "The 25 links are ready at Editor → Trial invites. Waiting one day means the first readers see the improved summaries. Real readers are the only way to measure whether people come back and share." },
  { title: "Turn on real-person verification", needs: "you",
    why: "Counted Support/Oppose answers and “my district vs my legislator” need the Cloudflare and Twilio keys (about 30 minutes, about 7 cents per verified person, capped at $10 a month)." },
  { title: "Decide whether claim checking keeps running", needs: "you",
    why: "The 89 old cases were set aside tonight (kept, not deleted), so the daily statement intake has switched itself back on: from 13:00 UTC tomorrow each morning run captures a statement, drafts the research and queues one case for you. With emails off you will only see it here. Recommended default: let it run for the trial week (it costs cents) and review one case to see whether you still want it." },
];

export const OWNER_STEPS: OwnerStep[] = [
  { key: "openaiKey", title: "OpenAI key with no expiry", minutes: 5, why: "The current key expires 23 Nov 2026.", doneWhen: "the key has more than 30 days left",
    steps: ["platform.openai.com → API keys → Create new secret key → Expiration: Never → copy it.",
      "Vercel → on-record → Settings → Environment Variables → OPENAI_API_KEY (Production) → Edit → paste → Save.",
      "Same page: delete OPENAI_KEY_EXPIRES (or set it to a date a year out).", "Deployments → latest → Redeploy."] },
  { key: "openStates", title: "Open States key (Texas data)", minutes: 5, why: "Fills the Texas pages and dashboard. Free.", doneWhen: "the probe shows the key is set",
    steps: ["open.pluralpolicy.com → Sign up → Profile → API key → copy.", "Vercel → on-record → Settings → Environment Variables → add OPENSTATES_API_KEY (Production) → Save → Redeploy."] },
  { key: "turnstile", title: "Cloudflare Turnstile keys", minutes: 10, why: "The invisible “are you a person” check at sign-up and first vote. Free.", doneWhen: "the probe shows Turnstile is set",
    steps: [`dash.cloudflare.com → Turnstile → Add widget → name “${BRAND.name}”, hostname on-record-wrotenberry.vercel.app, Widget mode Invisible, Pre-clearance No → Create.`,
      "Copy the Site Key and Secret Key.", "Vercel → Environment Variables (Production): TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY."] },
  { key: "twilio", title: "Twilio Verify (text-message codes)", minutes: 20, why: "One phone per account, so only real people count. About $0.07 per verified person; the app stops at $10 a month.", doneWhen: "the probe shows Twilio is set",
    steps: ["twilio.com → sign up → upgrade from trial (payment method and a small balance).",
      `Console → Verify → Services → Create new → name “${BRAND.name}”, SMS only → copy the Service SID (starts VA).`,
      "Console → Account → API keys & tokens → Create API key (Standard) → copy its SID (starts SK) and Secret. Copy the Account SID (starts AC) from the Console home.",
      "Vercel → Environment Variables (Production): TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_VERIFY_SERVICE_SID, then VERIFICATION_ENABLED = 1 → Redeploy.",
      "Test on your phone: Account → Make your answers count → number → code → address → open a bill → Support."] },
  { key: "contact", title: "Contact address and About text", minutes: 10, why: "The About and Corrections pages show placeholders until then.", doneWhen: "PUBLIC_CONTACT_EMAIL is set and you have sent the About text",
    steps: ["Vercel → Environment Variables (Production): PUBLIC_CONTACT_EMAIL = the address readers should write to.",
      "Send Claude 3–5 sentences: who you are, where you are based, how this is funded, and whether to promise a response time."] },
  { key: "bluesky", title: `Bluesky account for ${BRAND.name}`, minutes: 10, why: "Lets approved posts go out once the site is public. Nothing posts while it is private.", doneWhen: "the probe shows Bluesky is connected",
    steps: [`bsky.app → create the ${BRAND.name} account.`, "Settings → Privacy and security → App passwords → Add → copy.",
      "Vercel → Environment Variables (Production): BLUESKY_HANDLE (for example onrecord.bsky.social) and BLUESKY_APP_PASSWORD."] },
  { key: "threads", title: "Threads account (later)", minutes: 30, why: "Second posting channel. Needs a Meta developer app; fine to leave until after the trial.", doneWhen: "the probe shows Threads is connected",
    steps: ["Create the Threads account, then a Meta developer app with the Threads API and a long-lived token.", "Vercel: THREADS_USER_ID and THREADS_ACCESS_TOKEN."] },
];

export const ROUNDS: RoundStatus[] = [
  { round: "1", what: "Prove the bill summaries", state: "in progress" },
  { round: "A", what: "Federal data depth (actions, amendments, versions, committees, floor)", state: "live" },
  { round: "B", what: "Bill experience (timeline, party split, search, follow)", state: "live" },
  { round: "C", what: "Vote experience (what Yes/No means, compare, your legislators)", state: "live" },
  { round: "H", what: "What's happening and Texas", state: "live" },
  { round: "I", what: "Dashboards (Congress and Texas)", state: "live" },
  { round: "D", what: "Reasons to come back (start, alerts, recap)", state: "live" },
  { round: "J", what: "Real-person verification", state: "live behind a switch" },
  { round: "G", what: "Sharing (cards, video, short links, post queue)", state: "live" },
  { round: "E", what: "Usability (18 phone tasks pass)", state: "live" },
  { round: "F", what: "Quality (weekly re-check, fairness check, corrections log)", state: "live, waiting on data" },
];
