/**
 * Who mails the postcard (docs/CONSTITUENT_VOICE.md, point 4; docs/POSTCARD_VENDORS.md). One interface, two senders:
 *
 *   - `mockSender`: a rehearsal. It mails nothing, calls no outside service, never reads the address and costs nothing.
 *   - `vendorSender`: THE PLACE FOR A REAL VENDOR. IT IS A STUB. No vendor has been chosen, no adapter is written and
 *     this file names no outside host. It refuses every card.
 *
 * Nothing here reads the environment by itself: the caller (a server action or page) passes it in, so the tests can
 * pass their own. The settings name the switch and the limits in one place.
 */
import { MAIL_VERIFICATION_FLAG, POSTCARD_ENV, VERIFICATION_FLAG } from "../verify/config.ts";
import { POSTCARD, type PostcardMode } from "./rules.ts";

export type PostcardJob = {
  postcardId: string; code: string; expiresAt: number;
  /** The home address, decrypted only when a sender asks for it. A rehearsal never asks. */
  address: () => Promise<string | null>;
};
export type SendFailure = "adapter_not_built" | "no_address" | "vendor_refused" | "unreachable";
export type SendResult = { ok: true; status: "mock" | "sent"; vendorRef: string | null; costUsd: number } | { ok: false; reason: SendFailure };
export type PostcardSender = {
  vendor: string;
  /** What one card costs, in dollars: reserved against the monthly cap before the card is sent. */
  costUsd: number;
  send(job: PostcardJob): Promise<SendResult>;
};

/** The rehearsal: nothing leaves this machine, the address is never read, and the cost is zero. */
export const mockSender: PostcardSender = {
  vendor: "mock", costUsd: 0,
  async send() { return { ok: true, status: "mock", vendorRef: null, costUsd: 0 }; },
};

/**
 * The vendors compared in docs/POSTCARD_VENDORS.md, and whether the code that talks to each one has been written.
 * Every one is false: NO ADAPTER IS BUILT. Naming a vendor and a key in the settings therefore mails nothing.
 */
export const VENDOR_ADAPTER_BUILT: Record<string, boolean> = { lob: false, postgrid: false, click2mail: false, stannp: false };

/**
 * STUB, NOT A SENDER. A real adapter would: read the address (`job.address()`), split it (`splitStoredAddress`), send
 * the words from `postcardLines` to the vendor with `job.postcardId` as the idempotency key so a retry cannot mail
 * twice, and return the vendor's reference and the price it charged. Until the owner has picked a vendor and seen its
 * real per-piece cost, this refuses, reads nothing and calls nothing.
 */
export function vendorSender(vendor: string, _apiKey: string, pieceCostUsd: number): PostcardSender {
  return { vendor, costUsd: pieceCostUsd, async send() { return { ok: false, reason: "adapter_not_built" }; } };
}

export type NotReady = "unknown_vendor" | "no_key" | "no_piece_cost" | "adapter_not_built";
export type PostcardSettings = { mode: PostcardMode; vendor: string; capUsd: number; pieceCostUsd: number; notReady: NotReady | null };

/**
 * The switch and the limits, from the environment.
 *   MAIL_VERIFICATION_ENABLED=1 (and VERIFICATION_ENABLED=1)  the postcard step exists at all. Off by default.
 *   POSTCARD_VENDOR             empty or "mock": a rehearsal. A vendor's name: that vendor, once the rest is set.
 *   POSTCARD_API_KEY            the vendor's key.
 *   POSTCARD_PIECE_COST_USD     what one card really costs. No default: the owner sets it after reading the vendor's price.
 *   POSTCARD_MONTHLY_CAP_USD    the monthly cap. Default 100.
 * A vendor is used only when its name is known, its key and the piece cost are set, and its adapter is built.
 */
export function postcardSettings(env: Record<string, string | undefined>): PostcardSettings {
  const get = (k: string) => env[k]?.trim() || "";
  const capRaw = Number(get(POSTCARD_ENV.monthlyCapUsd) || POSTCARD.defaultCapUsd), capUsd = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : POSTCARD.defaultCapUsd;
  const costRaw = Number(get(POSTCARD_ENV.pieceCostUsd)), pieceCostUsd = Number.isFinite(costRaw) && costRaw > 0 ? costRaw : 0;
  const vendor = get(POSTCARD_ENV.vendor).toLowerCase();
  const base = { vendor: vendor || "mock", capUsd, pieceCostUsd, notReady: null };
  if (get(MAIL_VERIFICATION_FLAG) !== "1" || get(VERIFICATION_FLAG) !== "1") return { ...base, mode: "off" };
  if (!vendor || vendor === "mock") return { ...base, vendor: "mock", pieceCostUsd: 0, mode: "mock" };
  const notReady: NotReady | null = !(vendor in VENDOR_ADAPTER_BUILT) ? "unknown_vendor" : !get(POSTCARD_ENV.key) ? "no_key" : !pieceCostUsd ? "no_piece_cost" : !VENDOR_ADAPTER_BUILT[vendor] ? "adapter_not_built" : null;
  return notReady ? { ...base, mode: "not_ready", notReady } : { ...base, mode: "live" };
}

/** The sender for these settings, or null when nothing may be sent (off, or a vendor that is not ready). */
export function senderFor(s: PostcardSettings, env: Record<string, string | undefined>): PostcardSender | null {
  if (s.mode === "mock") return mockSender;
  if (s.mode === "live") return vendorSender(s.vendor, env[POSTCARD_ENV.key]?.trim() || "", s.pieceCostUsd);
  return null;
}

/** Plain words for the editor: why a named vendor is not being used. */
export const NOT_READY_LABEL: Record<NotReady, string> = {
  unknown_vendor: "the vendor named in POSTCARD_VENDOR is not one the site knows", no_key: "POSTCARD_API_KEY is not set",
  no_piece_cost: "POSTCARD_PIECE_COST_USD (the real cost of one card) is not set", adapter_not_built: "the code that talks to this vendor has not been written",
};
