/** Cloudflare Cron Trigger adapter for a Site reachable by an authorized machine client. */
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      if (!env.ON_RECORD_URL || !env.ON_RECORD_TICK_SECRET) throw Error("Scheduler secrets are missing");
      const base = new URL(env.ON_RECORD_URL);
      if (base.protocol !== "https:" || base.username || base.password) throw Error("Invalid Site URL");
      const endpoint = new URL("/api/automation/tick", base);
      const response = await fetch(endpoint, { method: "POST", headers: {
        Authorization: `Bearer ${env.ON_RECORD_TICK_SECRET}`,
        "Cache-Control": "no-store",
      }, signal: AbortSignal.timeout(110000) });
      const payload = await response.text();
      if (!response.ok) throw Error(`On Record job failed (${response.status}): ${payload.slice(0, 300)}`);
      console.log(`On Record job: ${payload.slice(0, 500)}`);
    })());
  },
};
