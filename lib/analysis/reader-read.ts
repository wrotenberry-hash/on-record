/**
 * "Nothing unread is shown to trial readers" (owner, 20 Nov 2026: "Keep reading every new summary against its sources
 * before it goes on show"). A summary written by generator b12 or later passes the reader gate only when its bill is
 * listed here, which happens after it has been read against its own official sources and found sound. A summary that
 * was read and misstates a detail goes in lib/analysis/reader-holds.ts instead, with the reason, and stays hidden.
 * Summaries written before b12 were each read when they went on show (the same reading found the thirteen in the hold
 * list), so they are not affected.
 *
 * One line per bill: the bill id, lower case as stored, and the day it was read. A rewrite by a later generator needs
 * a new reading: take the line out when the summary is rewritten.
 */
export const READ_FROM_GENERATOR = 12;
export const READ_AND_SOUND: Record<string, string> = {
};

/** The listed bill ids that are well formed (anything else is ignored rather than put into a query). */
export function readAndSoundIds(): string[] { return Object.keys(READ_AND_SOUND).filter(id => /^[0-9]+-[a-z]+-[0-9]+$/.test(id)); }
