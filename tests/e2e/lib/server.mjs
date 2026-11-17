import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./env.mjs";

export function freePort() {
  return new Promise((ok, fail) => { const s = createServer(); s.unref(); s.on("error", fail); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); });
}

/** Turbopack refuses a node_modules folder that is a link out of the project (a git worktree set up that way); webpack does not. */
function bundlerFlag() { try { return lstatSync(resolve(ROOT, "node_modules")).isSymbolicLink() ? ["--webpack"] : []; } catch { return []; } }

function runToEnd(args, env, log) {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [resolve(ROOT, "node_modules/next/dist/bin/next"), ...args], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", d => log(String(d))); child.stderr.on("data", d => log(String(d)));
    child.on("exit", code => (code === 0 ? ok() : fail(new Error(`next ${args[0]} ended with code ${code}`))));
  });
}

/**
 * Starts the app on a free port with public reading off. `mode` is "dev"
 * (next dev, the default) or "prod" (next build, then next start: the numbers a
 * reader would get). Returns the base URL and a stop function.
 */
export async function startApp({ mode = "dev", extraEnv = {}, log = () => {} } = {}) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, ...extraEnv, PUBLIC_READ_ENABLED: "false", NEXT_PUBLIC_SITE_URL: base, NEXT_TELEMETRY_DISABLED: "1", PORT: String(port) };
  // The suite only ever writes to the local file database.
  delete env.ON_RECORD_DATABASE_URL; delete env.ON_RECORD_DATABASE_TOKEN; delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN;
  if (mode === "prod") await runToEnd(["build", ...bundlerFlag()], env, log);
  const args = mode === "prod" ? ["start", "-p", String(port), "-H", "127.0.0.1"] : ["dev", ...bundlerFlag(), "-p", String(port), "-H", "127.0.0.1"];
  const child = spawn(process.execPath, [resolve(ROOT, "node_modules/next/dist/bin/next"), ...args], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let output = "", exited = null;
  child.stdout.on("data", d => { output += d; log(String(d)); }); child.stderr.on("data", d => { output += d; log(String(d)); });
  child.on("exit", code => { exited = code ?? 1; });
  const stop = async () => { if (exited === null) { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); } await new Promise(r => setTimeout(r, 500)); } };
  const deadline = Date.now() + 180_000;
  for (;;) {
    if (exited !== null) throw new Error(`The app server stopped before it was ready (code ${exited}).\n${output.slice(-1500)}`);
    try { const r = await fetch(`${base}/api/automation/health`, { signal: AbortSignal.timeout(60_000) }); if (r.ok) break; } catch { /* not up yet */ }
    if (Date.now() > deadline) { await stop(); throw new Error(`The app server did not answer within 3 minutes.\n${output.slice(-1500)}`); }
    await new Promise(r => setTimeout(r, 500));
  }
  return { base, mode, stop };
}
