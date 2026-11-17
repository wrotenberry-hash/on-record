/**
 * The trial reader's welcome screen (test-ready build, 17 Nov 2026): what to try, how to tell us what is wrong, and a
 * link to book a 15-minute feedback call. Pure: no imports, so the tests load it directly.
 */

/** Three things to try, in the order of the first 60 seconds. Each is one tap from the welcome screen. */
export const TRY_FIRST: ReadonlyArray<{ title: string; what: string; href: string; cta: string }> = [
  { title: "See who represents you", what: "Type your ZIP code. You get your senators and representative, and what each one last voted on, in one plain line.", href: "/", cta: "Find my legislators" },
  { title: "Say where you stand", what: "Pick a bill that is coming up for a vote and tap Support, Oppose or Not sure. Your answer is private.", href: "/coming", cta: "See what's coming up" },
  { title: "Make yourself heard", what: "Open any bill and use Contact your legislators: their office phone, their official contact form and a short message you can edit.", href: "/voice", cta: "Open Your voice" },
];

/**
 * The booking link for feedback calls, from TRIAL_BOOKING_URL. Only an https address is accepted, so a typo can never
 * turn the button into something else. Returns null when it is not set or not usable.
 */
export function bookingUrl(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  try { const u = new URL(v); return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null; } catch { return null; }
}

/** Where an invite link lands: the welcome screen the first time, the home page after that. */
export function inviteLanding(activeDays: number): "/welcome" | "/" {
  return activeDays <= 1 ? "/welcome" : "/";
}
