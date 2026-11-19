/**
 * Whether the site may email readers on its own initiative (the weekly email, vote alerts, notices about bills).
 *
 * Until a sending address on the site's own verified domain is set (`READER_FROM_EMAIL`), the only inbox the shared
 * test sender can reach is the account owner's, and the owner has said no automatic emails. So without that address
 * nothing is sent, and pages must not offer email. Pure: it sends nothing and imports nothing, so a page can ask it.
 * 18 Nov 2026; moved here on 19 Nov so screens can read it without importing the sender.
 */
export function readerEmailReady(env: Record<string, string | undefined> = process.env): boolean { return !!env.READER_FROM_EMAIL?.trim(); }
