import { readFile } from "node:fs/promises";
import path from "node:path";
import { emailDomain, isDisposable } from "@/lib/verify/rules";

/**
 * Disposable-email blocklist: lib/data/disposable-domains.txt, 121,570 domains
 * from the MIT-licensed disposable-email-domains package (v1.0.62,
 * github.com/ivolo/disposable-email-domains). Loaded on first use only.
 */
let cached: Set<string> | null = null;
async function list() {
  if (!cached) cached = new Set((await readFile(path.join(process.cwd(), "lib/data/disposable-domains.txt"), "utf8")).split("\n").filter(Boolean));
  return cached;
}
export async function isDisposableEmail(email: string) { return isDisposable(emailDomain(email), await list()); }
