import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./env.mjs";

export const PHONE = { width: 390, height: 844 };
export const CPU_SLOWDOWN = 4;
/** A real phone's user agent: the app does not count events from clients whose agent says "headless". */
export const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** Playwright from the preinstalled tools folder, else from the project. */
export async function loadPlaywright() {
  try { return createRequire("/opt/node-tools/node_modules/")("playwright"); }
  catch { const m = await import("playwright"); return m.default ?? m; }
}

/**
 * axe-core's browser build as text. It is not a direct dependency: it arrives
 * with eslint-config-next (eslint-plugin-jsx-a11y → axe-core). Looked for, in
 * order: a normal resolve, the pnpm store inside node_modules, /opt/node-tools.
 */
export function axeSourcePath() {
  const tries = [];
  try { tries.push(createRequire(resolve(ROOT, "package.json")).resolve("axe-core/axe.min.js")); } catch { /* not hoisted */ }
  const store = resolve(ROOT, "node_modules/.pnpm");
  if (existsSync(store)) for (const d of readdirSync(store).filter(x => x.startsWith("axe-core@")).sort().reverse()) tries.push(resolve(store, d, "node_modules/axe-core/axe.min.js"));
  tries.push("/opt/node-tools/node_modules/axe-core/axe.min.js");
  return tries.find(p => existsSync(p)) ?? null;
}

/** A phone-sized browser context with the CPU slowed 4× (Chrome DevTools Protocol). */
export async function openPhone(browser, { baseURL, cookies = [], storageState } = {}) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: PHONE_UA, baseURL, storageState,
    permissions: ["clipboard-read", "clipboard-write"] });
  if (cookies.length) await context.addCookies(cookies);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  return { context, page, cdp };
}
