/**
 * The written half of Editor → What's next: Claude's ranked recommendations, the owner-only
 * steps, and progress against the master plan. Updated by Claude at every check-in (the live
 * numbers on the page come from the health probe, so they are always current). Its only import is the product name.
 */
import { BRAND } from "./brand.ts";
export type Recommendation = { title: string; why: string; needs: "your go-ahead" | "you" | "nothing; in progress" };
export type OwnerStep = { key: string; title: string; minutes: number; why: string; steps: string[]; doneWhen: string };
export type RoundStatus = { round: string; what: string; state: "live" | "live, waiting on data" | "live behind a switch" | "in progress" };

export const PLAN_UPDATED = "2026-11-18T05:30:00Z";
export const PLAN_NOTE = "Texas: all five pieces are built, tested and live, three days ahead of the first checkpoint. The site now loads Texas bills in back-to-back runs inside the source’s free limits, newest filings first; reads committees chamber by chamber and hearings with their agendas; labels every decision on a Texas bill as a recorded vote, a voice vote, not individually recorded, or “the record does not say”, and never shows a member’s position without a recorded vote; returns all five legislators for a Texas address; and has a Texas dashboard with 2021 to 2025 taken from Texas Legislature Online’s own statistics. The Texas checklist below shows each of your points with its evidence and the days left. Not proven yet, and said plainly there: the loader has not yet run on the live site with your key; Texas summaries are built but have not been started, cannot yet read the House Research Organization’s PDF analyses, and are not yet drawn on the Texas bill page; four explainers wait for your approval. The target stays Monday 14 December. The rename is done everywhere readers see the name; the old name stays only as the name of the voting-record section. Federal summaries: the limit is 40, 4 of 31 bills pass, the rest run from 13:00 UTC today; trial readers see the ones that passed.";

export const RECOMMENDED: Recommendation[] = [
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
