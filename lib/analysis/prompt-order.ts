/**
 * Generator versions are named "b5-2026-11-16", "b11-2026-11-17", ... Compared as text, "b11" sorts BELOW "b9", so a gate
 * written as text >= text would hide every summary from generator 10 onward. The gate compares the generator's number.
 */
export function generatorNumber(version: string | null | undefined): number | null {
  const m = /^[a-z]+(\d+)/i.exec(version?.trim() ?? "");
  return m ? Number(m[1]) : null;
}

/** True when a summary written by `version` may be shown under a gate opened at `min` (null gate = nothing shown). */
export function atOrAfter(version: string | null | undefined, min: string | null): boolean {
  const v = generatorNumber(version), m = generatorNumber(min);
  return v !== null && m !== null && v >= m;
}

/** The same comparison in SQLite: the digits after the first letter, as a number. "b11-2026-11-17" casts to 11. */
export function generatorNumberSql(column: string): string { return `cast(substr(${column}, 2) as integer)`; }
