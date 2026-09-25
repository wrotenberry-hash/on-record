/** Cloudflare Cron Trigger adapter for a Site reachable by an authorized machine client. */
const scheduledIntake = {
  /** The Worker's own URL does nothing; only the schedule calls the Site. */
  async fetch() {
    return new Response("On Record scheduled intake runs on a cron schedule only.", { status: 404,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
  },
  async scheduled(event, env, ctx) {
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
      if (!response.ok) throw Error(`On Record job failed (${response.status}) for cron "${event.cron}": ${payload.slice(0, 300)}`);
      console.log(`On Record job (${response.status}) for cron "${event.cron}": ${payload.slice(0, 500)}`);
    })());
  },
};
export default scheduledIntake;
