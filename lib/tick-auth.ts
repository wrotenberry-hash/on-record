/**
 * The unattended job accepts either of two bearer secrets:
 *  - CRON_SECRET, which Vercel Cron sends on its scheduled GET, and
 *  - AUTOMATION_TICK_SECRET, for a manual or external POST.
 * With neither configured, every request is refused. Comparison is over SHA-256
 * digests so the check takes the same time whatever the guess.
 */
export async function sameSecret(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map(x => crypto.subtle.digest("SHA-256", encoder.encode(x))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function bearerToken(authorization: string | null | undefined): string {
  return authorization?.match(/^Bearer (\S+)$/)?.[1] ?? "";
}

export type TickSecrets = { cronSecret?: string | null; tickSecret?: string | null };

/** Returns which secret matched, or null when the request is not authorized. */
export async function tickAuthorized(authorization: string | null | undefined, secrets: TickSecrets): Promise<"cron" | "tick" | null> {
  const supplied = bearerToken(authorization);
  if (!supplied) return null;
  const cron = secrets.cronSecret?.trim(), tick = secrets.tickSecret?.trim();
  if (cron && await sameSecret(supplied, cron)) return "cron";
  if (tick && await sameSecret(supplied, tick)) return "tick";
  return null;
}
