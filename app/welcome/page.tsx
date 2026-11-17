import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { BRAND, brandTitle } from "@/lib/brand";
import { bookingUrl, TRY_FIRST } from "@/lib/trial-welcome";
import { viewerAccess } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Welcome"), description: "What to try first, and how to tell us what you think." };

/** The first screen a trial reader sees after opening an invite link. Private like every other page. */
export default async function WelcomePage() {
  const access = await viewerAccess();
  const booking = bookingUrl(process.env.TRIAL_BOOKING_URL), contact = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  return <PublicShell current="/welcome" access={access}>
    <article className="prose">
      <div className="eyebrow">WELCOME TO THE TRIAL</div>
      <h1>Thank you for trying {BRAND.name}.</h1>
      <p className="lede">{BRAND.name} shows what your legislators actually did, in plain words, and gives you a way to say where you stand. You are one of the first 25 people to use it. Nothing here is public yet.</p>

      <h2>Three things to try (about a minute each)</h2>
      <ol>
        {TRY_FIRST.map(t => <li key={t.title}><b>{t.title}.</b> {t.what} <Link href={t.href}>{t.cta}</Link></li>)}
      </ol>

      <h2>Tell us what is wrong</h2>
      <ul>
        <li>Every page has a <b>Something wrong?</b> link at the bottom. Use it for a wrong fact, a confusing sentence or anything broken.</li>
        <li>After a few visits we ask one short question about whether this is useful. That is the only time we ask.</li>
        <li>{booking
          ? <>Got 15 minutes? <a href={booking} target="_blank" rel="noopener noreferrer">Book a short call</a> and tell us what worked and what did not.</>
          : access.editor ? "[Founder: add your booking link as TRIAL_BOOKING_URL in Vercel and a button appears here.]"
          : contact ? <>Happy to talk it through? Write to <b>{contact}</b> and we will set up a 15-minute call.</> : "We may ask you for a 15-minute call about what worked and what did not."}</li>
      </ul>

      <h2>What you should know</h2>
      <ul>
        <li>You do not need an account. We ask for an email only if you want to follow someone, get alerts or have your answers counted.</li>
        <li>Your answers are private. Totals for a district are shown only once 25 verified people have answered.</li>
        <li>Facts marked Official come from government records. Text marked Analysis is written by us from those records and checked before you see it. <Link href="/method">How this works</Link>.</li>
        <li>This is a trial: please do not share your invite link. It works on your devices for 60 days.</li>
      </ul>

      <div className="landing-actions"><Link className="cta" href="/">Start: find my legislators</Link></div>
      <p className="muted">{BRAND.tagline}</p>
    </article>
  </PublicShell>;
}
