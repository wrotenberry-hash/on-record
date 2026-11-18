/**
 * The join code and an administrator's email, as the database keeps them: keyed hashes (lib/verify/crypto.ts, under the
 * site's existing secret, each with its own purpose). The code itself is shown to the editor once and is written
 * nowhere. Loaded by tests/associations.test.mjs as it is, so the test runs the same hashing as the site.
 */
import { keyedHash } from "../verify/crypto.ts";
import { makeJoinCode, normaliseJoinCode } from "./rules.ts";

/** The hash of a typed code, or null when what was typed cannot be a code. Case, spaces and the dash do not matter. */
export async function joinCodeHash(raw: unknown): Promise<string | null> {
  const code = normaliseJoinCode(raw);
  return code ? keyedHash("association-join", code) : null;
}
/** A new code for the editor to pass on, and the hash to store. */
export async function newJoinCode(): Promise<{ code: string; hash: string }> {
  const code = makeJoinCode();
  return { code, hash: (await joinCodeHash(code))! };
}
/** Finds an administrator by the address they type. The address itself is kept too, because the sign-in link is sent to it. */
export const adminEmailHash = (email: string) => keyedHash("association-admin", email.trim().toLowerCase());
