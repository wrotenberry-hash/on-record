/**
 * The written half of Editor → What's next: Claude's ranked recommendations, the owner-only
 * steps, and progress against the master plan. Updated by Claude at every check-in (the live
 * numbers on the page come from the health probe, so they are always current). Its only import is the product name.
 */
import { BRAND } from "./brand.ts";
export type Recommendation = { title: string; why: string; needs: "your go-ahead" | "you" | "nothing; in progress" };
export type OwnerStep = { key: string; title: string; minutes: number; why: string; steps: string[]; doneWhen: string };
export type RoundStatus = { round: string; what: string; state: "live" | "live, waiting on data" | "live behind a switch" | "in progress" };

export const PLAN_UPDATED = "2026-11-19T19:30:00Z";
export const PLAN_NOTE = "Today (19 Nov): the summary limit of 40 has been reached, so no new summary is being written. There are 40 summaries, 20 on show and 20 held; 16 of the 35 bills voted on in the last 90 days are covered and 7 are not written. Raising the limit is yours to decide (second item below). This morning’s run put six more summaries on show; I have not read those six against their sources, because the run’s saved source text had already expired from the log when I next looked. Seven summaries read earlier still misstate a detail. Spend is $11.94 of $40 this month. The OpenAI key stops working on 23 Nov, four days from now. Texas is loaded: 1,654 bills for 2027 and 692 from the 2025 second called session. No trial invite has been used. Your persuasion and retention round is built: all twelve points, after reporting what already existed. The first screen now shows your legislators with a photo or initials, the party as a word and their last three votes; your own legislators are followed for you with vote alerts on, and issues are a second step. The weekly email follows your order and stops at five items. A reader is told what happened to every bill they answered or follow. “Your voice” is now “Your record”, with outcomes and one plain count per legislator. Every list ends, and the home screen and dashboards say “You’re caught up.” Share cards carry one sourced fact. The 14 issue pages are written for a newcomer. The four measures you asked for are on this page, below. Two things are built but switched off, and only you turn them on: pages that open without sign-in (shared bills and the issue pages), and every automatic email to readers. The emails are off because, until the site has its own sending address, the only inbox they could reach is yours. Not proven yet: whether real portraits load (the photo sites refuse the build machine, so I will only know from the live site), real email and phone delivery, and the public pages with the switch on. Screenshots for your colleague still wait for one trial invite link from you.";

export const RECOMMENDED: Recommendation[] = [
  { title: "Paste one trial invite link so the screenshot set can be made", needs: "you",
    why: "The share-ready screenshots for your colleague have to come from the live site, signed in as a trial reader, and I hold no invite. Editor → Trial invites: copy one unused link, paste it in the chat, and revoke it after I confirm the files are delivered. It is a reader-only link, not a key. The set leads with the bill review (plain-English summary, what would change, how it works today, both sides, what we don’t know) and ends with two screens on votes. About 1 minute for you, 10 for the run." },
  { title: "Decide: hide the seven summaries that misstate a detail until they are rewritten?", needs: "you",
    why: "They passed every automatic check, but read against their sources each misstates a detail. From this morning: H.R. 3276’s headline says it funds grants where the bill only allows the money if Congress later provides it; H.R. 4219 credits the committee report for a point made in floor debate; H.R. 9500 says declared emergency where the law says declared disaster; H.R. 4646 states the sponsor’s claim about thousands of workers as fact; H.R. 9497 gives one member’s project count (14) where another said 10. From this evening: H.R. 8884 says Congress rejected a public comment period where a committee majority voted down an amendment, and gives 2022 where the last day to start was in 2021; H.J.Res. 213 calls Rep. Rivas “he” where no source gives a pronoun. Three more have a headline or a credit that says a little more than the sources (H.J.Res. 210, H.R. 9576, and one line of H.J.Res. 213). No invite has been used, so no outside reader has seen them. Recommended: reply \"hold the seven\" and they are hidden until rewritten; reply \"add the rules\" and I will propose checks for these kinds of slip for you to approve before they are switched on." },
  { title: "Decide: raise the summary limit above 40?", needs: "you",
    why: "The limit you set (40) was reached this morning, so the 7 bills voted on in the last 90 days that have no summary will not get one, and neither will bills voted on from now on. Writing has cost about 17 cents a bill; the month’s summaries have cost $6.64 of the $25 cap. Recommended: reply \"raise the limit to 60\", which covers the 7 and about two more weeks of votes for roughly $3 to $4. Until you say so nothing more is written." },
  { title: "Decide: open shared bill pages and the 14 issue pages to people without an invite?", needs: "you",
    why: "Your points 10 and 11 ask for pages that open without sign-in; your hard stop says nothing goes public beyond trial invites. So they are built behind one switch that is off. Turning it on opens three things together: the page of a bill someone was sent a link to (no vote box, no reader’s data), the picture on a shared card, and the 14 issue pages. Recommended: not yet. First settle the seven summaries that misstate a detail and let your lawyer see the terms draft. When you want it on, say so and I will give you the one setting to add in Vercel." },
  { title: "Give the site its own sending address, so readers can get the weekly email", needs: "you",
    why: "The weekly email, vote alerts and notices are built, but none is emailed today: without a sending address on the site’s own domain, the only inbox the email service can reach is yours, and you said no automatic emails. This needs a domain first. Once there is one I will list the exact steps. Also yours to choose then: vote alerts could email a signed-in reader up to twice on a day Congress votes; the calmer choice is phone notifications for votes and email only for the weekly summary." },
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
  { round: "P", what: "Persuasion and retention: five legislators, default follows, weekly email, closing the loop, Your record, finite lists, one-fact share cards, issue entry pages, four measures", state: "live behind a switch" },
];
