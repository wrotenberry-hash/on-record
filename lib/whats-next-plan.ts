/**
 * The written half of Editor → What's next: Claude's ranked recommendations, the owner-only
 * steps, and progress against the master plan. Updated by Claude at every check-in (the live
 * numbers on the page come from the health probe, so they are always current). No imports.
 */
export type Recommendation = { title: string; why: string; needs: "your go-ahead" | "you" | "nothing; in progress" };
export type OwnerStep = { key: string; title: string; minutes: number; why: string; steps: string[]; doneWhen: string };
export type RoundStatus = { round: string; what: string; state: "live" | "live, waiting on data" | "live behind a switch" | "in progress" };

export const PLAN_UPDATED = "2026-11-16T18:20:00Z";
export const PLAN_NOTE = "Every round in the master plan is built and live. The one thing not yet proven is the bill summaries: no AI call has succeeded in production since the key was replaced. The 19:00 UTC run on 16 Nov is the first test.";

export const RECOMMENDED: Recommendation[] = [
  { title: "Prove the bill summaries (Round 1)", needs: "your go-ahead",
    why: "Bill pages, the 5-slide explainer, the fairness check and the trial invitation all wait on real summaries. After the first run that produces them: review the first 5 strictly against the bill text, fix the patterns behind any errors, then let summaries run up to the $25 monthly cap." },
  { title: "Replace the OpenAI key with one that does not expire", needs: "you",
    why: "The current key stops working on 23 Nov. When it does, summaries and statement research stop. 5 minutes (steps below)." },
  { title: "Add the free Open States key so the Texas pages fill", needs: "you",
    why: "Texas bills, members, votes and the Texas dashboard are built but empty without it. 5 minutes, free." },
  { title: "Open the invite-only trial to 5 people", needs: "your go-ahead",
    why: "The trial unlocks itself after the first successful AI call. Real readers are the only way to measure whether people come back and share. You create the links at Editor → Trial invites." },
  { title: "Turn on real-person verification", needs: "you",
    why: "Counted Support/Oppose answers and “my district vs my legislator” need the Cloudflare and Twilio keys (about 30 minutes, about 7 cents per verified person, capped at $10 a month)." },
  { title: "Decide what happens to the claim-checking queue", needs: "you",
    why: "Statement intake is paused because cases are waiting and none were reviewed last week. Recommended default: leave it paused and launch the trial on votes and bills alone; come back to claims after the trial." },
];

export const OWNER_STEPS: OwnerStep[] = [
  { key: "openaiKey", title: "OpenAI key with no expiry", minutes: 5, why: "The current key expires 23 Nov 2026.", doneWhen: "the key has more than 30 days left",
    steps: ["platform.openai.com → API keys → Create new secret key → Expiration: Never → copy it.",
      "Vercel → on-record → Settings → Environment Variables → OPENAI_API_KEY (Production) → Edit → paste → Save.",
      "Same page: delete OPENAI_KEY_EXPIRES (or set it to a date a year out).", "Deployments → latest → Redeploy."] },
  { key: "openStates", title: "Open States key (Texas data)", minutes: 5, why: "Fills the Texas pages and dashboard. Free.", doneWhen: "the probe shows the key is set",
    steps: ["open.pluralpolicy.com → Sign up → Profile → API key → copy.", "Vercel → on-record → Settings → Environment Variables → add OPENSTATES_API_KEY (Production) → Save → Redeploy."] },
  { key: "turnstile", title: "Cloudflare Turnstile keys", minutes: 10, why: "The invisible “are you a person” check at sign-up and first vote. Free.", doneWhen: "the probe shows Turnstile is set",
    steps: ["dash.cloudflare.com → Turnstile → Add widget → name “On Record”, hostname on-record-wrotenberry.vercel.app, Widget mode Invisible, Pre-clearance No → Create.",
      "Copy the Site Key and Secret Key.", "Vercel → Environment Variables (Production): TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY."] },
  { key: "twilio", title: "Twilio Verify (text-message codes)", minutes: 20, why: "One phone per account, so only real people count. About $0.07 per verified person; the app stops at $10 a month.", doneWhen: "the probe shows Twilio is set",
    steps: ["twilio.com → sign up → upgrade from trial (payment method and a small balance).",
      "Console → Verify → Services → Create new → name “On Record”, SMS only → copy the Service SID (starts VA).",
      "Console → Account → API keys & tokens → Create API key (Standard) → copy its SID (starts SK) and Secret. Copy the Account SID (starts AC) from the Console home.",
      "Vercel → Environment Variables (Production): TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_VERIFY_SERVICE_SID, then VERIFICATION_ENABLED = 1 → Redeploy.",
      "Test on your phone: Account → Make your answers count → number → code → address → open a bill → Support."] },
  { key: "contact", title: "Contact address and About text", minutes: 10, why: "The About and Corrections pages show placeholders until then.", doneWhen: "PUBLIC_CONTACT_EMAIL is set and you have sent the About text",
    steps: ["Vercel → Environment Variables (Production): PUBLIC_CONTACT_EMAIL = the address readers should write to.",
      "Send Claude 3–5 sentences: who you are, where you are based, how this is funded, and whether to promise a response time."] },
  { key: "bluesky", title: "Bluesky account for On Record", minutes: 10, why: "Lets approved posts go out once the site is public. Nothing posts while it is private.", doneWhen: "the probe shows Bluesky is connected",
    steps: ["bsky.app → create the On Record account.", "Settings → Privacy and security → App passwords → Add → copy.",
      "Vercel → Environment Variables (Production): BLUESKY_HANDLE (for example onrecord.bsky.social) and BLUESKY_APP_PASSWORD."] },
  { key: "threads", title: "Threads account (later)", minutes: 30, why: "Second posting channel. Needs a Meta developer app; fine to leave until after the trial.", doneWhen: "the probe shows Threads is connected",
    steps: ["Create the Threads account, then a Meta developer app with the Threads API and a long-lived token.", "Vercel: THREADS_USER_ID and THREADS_ACCESS_TOKEN."] },
];

export const ROUNDS: RoundStatus[] = [
  { round: "1", what: "Prove the bill summaries", state: "in progress" },
  { round: "A", what: "Federal data depth (actions, amendments, versions, committees, floor)", state: "live, waiting on data" },
  { round: "B", what: "Bill experience (timeline, party split, search, follow)", state: "live" },
  { round: "C", what: "Vote experience (what Yes/No means, compare, your legislators)", state: "live" },
  { round: "H", what: "What's happening and Texas", state: "live, waiting on data" },
  { round: "I", what: "Dashboards", state: "live, waiting on data" },
  { round: "D", what: "Reasons to come back (start, alerts, recap)", state: "live" },
  { round: "J", what: "Real-person verification", state: "live behind a switch" },
  { round: "G", what: "Sharing (cards, video, short links, post queue)", state: "live" },
  { round: "E", what: "Usability (18 phone tasks pass)", state: "live" },
  { round: "F", what: "Quality (weekly re-check, fairness check, corrections log)", state: "live, waiting on data" },
];
