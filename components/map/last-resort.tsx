"use client";
import { useState } from "react";
import { DistrictMap } from "@/components/map/district-map";
import { LAST_RESORT } from "@/lib/map-rules";
import type { ZipMap } from "@/lib/district-shapes";

/**
 * "Choose your district yourself", kept closed until the reader opens it (owner, 20 Nov 2026: "Only show 'tap your
 * district' as a last resort, and when you do, help the person choose: show a small map of the district lines over
 * the ZIP, not just three names"). The map is drawn when the section opens; the buttons are passed in from the server.
 */
export function LastResort({ map, children }: { map: ZipMap | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details className="flow-last-resort" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{LAST_RESORT}</summary>
    {open && map && <DistrictMap map={map} centre={[(map.box.south + map.box.north) / 2, (map.box.west + map.box.east) / 2]} mode="view"
      label={`Map of ZIP code ${map.zip} with the lines of ${map.districts.map(d => d.id).join(", ")}. The buttons under the map name each district.`} />}
    {!map && <p className="meta">No map of these districts is on file, so they are listed by name.</p>}
    {children}
  </details>;
}
