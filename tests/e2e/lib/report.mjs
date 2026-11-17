/** Pure: decides pass or fail for one task and writes the Markdown report. Tested in tests/e2e-report.test.mjs. */

export function judge(result) {
  if (result.status === "blocked" || result.status === "needs keys") return result.status;
  if (result.error) return "fail";
  const t = result.target ?? {};
  if (t.taps != null && result.taps > t.taps) return "fail";
  if (t.seconds != null && result.seconds > t.seconds) return "fail";
  if (result.sideways?.length) return "fail";
  return "pass";
}

export function why(result) {
  const t = result.target ?? {}, out = [];
  if (result.error) out.push(result.error);
  if (!result.error && result.status !== "blocked" && result.status !== "needs keys") {
    if (t.taps != null && result.taps > t.taps) out.push(`${result.taps} taps, target ${t.taps}`);
    if (t.seconds != null && result.seconds > t.seconds) out.push(`${result.seconds} s, target ${t.seconds} s`);
  }
  for (const s of result.sideways ?? []) out.push(`sideways scrolling on ${s.url} (${s.px} px too wide)`);
  if (result.note) out.push(result.note);
  if (result.swipes && !/swipe/i.test(out.join(" "))) out.push(`${result.swipes} swipe${result.swipes === 1 ? "" : "s"} in the menu`);
  return out.join("; ");
}

const cell = v => String(v ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const targetText = t => [t?.taps != null ? `≤ ${t.taps} taps` : null, t?.seconds != null ? `≤ ${t.seconds} s` : null].filter(Boolean).join(", ");

export function markdownReport(r) {
  const lines = [];
  const counts = s => r.tasks.filter(t => t.result === s).length;
  lines.push("# Usability suite report", "",
    `Run ${r.startedAt} · ${r.server.mode === "prod" ? "production build (next build + next start)" : r.server.mode === "dev" ? "development server (next dev)" : `server at ${r.server.base}`} · phone ${r.viewport.width}×${r.viewport.height} · CPU slowed ${r.cpuSlowdown}×.`,
    "Local server and local database copy: network time is not included in any number here. Written by `npm run e2e`; overwritten on every run.", "",
    `**Tasks: ${counts("pass")} passed, ${counts("fail")} failed, ${counts("blocked")} blocked, ${counts("needs keys")} need keys.**`
      + (r.axe ? ` **Accessibility: ${r.axe.pages.filter(p => !p.violations.length && !p.error).length} of ${r.axe.pages.length} pages with 0 violations.**` : "")
      + (r.speed ? ` **Speed: ${r.speed.pages.filter(p => p.ok).length} of ${r.speed.pages.length} pages interactive under ${r.speed.budgetMs / 1000} s.**` : ""), "");
  lines.push("## Tasks", "", "Taps are taps on links and buttons from the home page; typing is not a tap. Seconds are scripted (no reading time).", "",
    "| # | Task | Target | Taps | Seconds | Result | Note |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const t of r.tasks) lines.push(`| ${cell(t.id)} | ${cell(t.name)} | ${cell(targetText(t.target))} | ${t.result === "blocked" || t.result === "needs keys" ? "–" : t.taps}${t.swipes ? ` + ${t.swipes} swipe${t.swipes === 1 ? "" : "s"}` : ""} | ${t.seconds ?? "–"} | ${t.result === "pass" ? "pass" : `**${t.result}**`} | ${cell(why(t))} |`);
  const small = r.tasks.flatMap(t => (t.smallTargets ?? []).map(s => ({ ...s, task: t.id })));
  if (small.length) { lines.push("", "### Small tap targets", "", "Tapped during a task and under 24 px in one direction (WCAG 2.2 asks for 24; the house rule for buttons is 44):", "");
    for (const s of small) lines.push(`- Task ${s.task}: “${cell(s.label)}” is ${s.width}×${s.height} px`); }
  if (r.axe) {
    lines.push("", "## Accessibility (axe-core, WCAG 2.1 A and AA)", "", `axe-core ${r.axe.version ?? ""} on every page a task landed on and on the list of reader pages (tests/e2e/pages.mjs). Zero violations are required.`, "",
      "| Page | Violations | What |", "| --- | --- | --- |");
    for (const p of r.axe.pages) lines.push(`| ${cell(p.page)} | ${p.error ? "**error**" : p.violations.length ? `**${p.violations.reduce((n, v) => n + v.count, 0)}**` : "0"} | ${cell(p.error ?? p.violations.map(v => `${v.id} ×${v.count} (${v.help}): ${v.nodes[0]?.target ?? ""}`).join("; "))} |`);
  }
  if (r.speed) {
    lines.push("", "## Speed", "",
      `Budget: interactive in under ${r.speed.budgetMs / 1000} s with the CPU slowed ${r.cpuSlowdown}×. “Interactive” is the later of domInteractive (Navigation Timing API) and the end of the last long task (50 ms or more) before the page went quiet for 1 second. Each page is loaded once to warm up and then ${r.speed.runs} times; the slowest run is shown. JavaScript is what the page loaded, over the wire and unpacked (Resource Timing API).`,
      r.server.mode === "prod" ? "Production build on a local server: real phones add network time on top." : "**Development server:** scripts are not minified or compressed, so JavaScript sizes and times are well above what readers get. Run `npm run e2e -- --prod` for the real numbers.", "",
      "| Page | First byte ms | domInteractive ms | Last long task ends ms | Interactive ms | JS files | JS over the wire kB | JS unpacked kB | Result |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const p of r.speed.pages) lines.push(p.error ? `| ${cell(p.page)} | – | – | – | – | – | – | – | **error**: ${cell(p.error)} |`
      : `| ${cell(p.page)} | ${p.firstByteMs} | ${p.domInteractiveMs} | ${p.lastLongTaskEndMs} | ${p.interactiveMs} | ${p.jsFiles} | ${p.jsTransferredKb} | ${p.jsUnpackedKb} | ${p.ok ? "pass" : "**fail**"} |`);
  }
  lines.push("", "## How to rerun", "", "```", "npm run e2e                 # everything, on a server the runner starts", "npm run e2e -- --only 4,13  # some tasks", "npm run e2e -- --prod       # build first, for real speed numbers", "```", "", `Screenshots: ${r.shotsDir}`, "");
  return lines.join("\n");
}
