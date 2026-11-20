"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./district-map.css";
import { districtColour, LINES_APPROXIMATE, MAP_CREDIT, TILE_MAX_ZOOM, TILE_MIN_ZOOM } from "@/lib/map-rules";
import type { ZipMap } from "@/lib/district-shapes";

/**
 * One small map, two uses (owner, 20 Nov 2026).
 *
 *   "view": the district lines over a ZIP code area, beside the "choose your district" buttons, so the choice is made
 *           from a picture and not from three names. Each district has the colour of its button.
 *   "pin":  the reader moves the map until the marker in the middle sits on their home, then presses the button. The
 *           marker stays in the middle, so it works with a thumb, a mouse or the arrow keys.
 *
 * The map pictures come through this site's own server (app/api/map/tile), so the reader's device talks to nobody
 * else. Without scripts the map cannot be drawn; the page around it says what else to do.
 */
type Props = { map: ZipMap | null; centre: [number, number]; mode: "view" | "pin";
  /** "pin" only: called as the map moves, with the spot under the marker and how far in the map is zoomed. */ onMove?: (lat: number, lon: number, zoom: number) => void; label: string };

export function DistrictMap({ map, centre, mode, onMove, label }: Props) {
  const el = useRef<HTMLDivElement>(null), moved = useRef(onMove);
  const [failed, setFailed] = useState(false);
  useEffect(() => { moved.current = onMove; }, [onMove]);
  useEffect(() => {
    let gone = false, cleanup = () => {};
    import("leaflet").then(L => {
      if (gone || !el.current) return;
      const m = L.map(el.current, { zoomControl: true, attributionControl: false, minZoom: TILE_MIN_ZOOM, maxZoom: TILE_MAX_ZOOM, scrollWheelZoom: false });
      L.tileLayer("/api/map/tile/{z}/{x}/{y}", { maxZoom: TILE_MAX_ZOOM, minZoom: TILE_MIN_ZOOM }).addTo(m);
      if (map) {
        map.districts.forEach((d, i) => {
          const colour = districtColour(i);
          L.polygon(d.rings, { color: colour, weight: 3, fillColor: colour, fillOpacity: mode === "view" ? 0.2 : 0.08, interactive: false }).addTo(m);
          if (d.label) L.marker(d.label, { interactive: false, keyboard: false, icon: L.divIcon({ className: "dm-label", html: `<span style="background:${colour}">${d.id}</span>`, iconSize: [0, 0] }) }).addTo(m);
        });
        L.polygon(map.outline, { color: "#111", weight: 2, dashArray: "6 5", fill: false, interactive: false }).addTo(m);
        m.fitBounds([[map.box.south, map.box.west], [map.box.north, map.box.east]], { padding: [12, 12] });
      } else m.setView(centre, 13);
      if (mode === "pin") {
        if (!map) m.setView(centre, 14);
        const tell = () => { const c = m.getCenter(); moved.current?.(c.lat, c.lng, m.getZoom()); };
        m.on("moveend", tell); m.on("zoomend", tell); m.on("click", e => m.panTo(e.latlng)); tell();
      }
      cleanup = () => m.remove();
    }).catch(() => setFailed(true));
    return () => { gone = true; cleanup(); };
  }, [map, centre, mode]);

  return <figure className={`district-map district-map-${mode}`}>
    <div className="dm-frame">
      <div ref={el} className="dm-canvas" role="application" aria-label={label} tabIndex={0} />
      {mode === "pin" && <span className="dm-pin" aria-hidden="true" />}
    </div>
    {failed && <p className="meta" role="status">The map could not be drawn on this device.</p>}
    <figcaption className="meta">{map ? `${LINES_APPROXIMATE} The dashed line is ZIP code ${map.zip}. ` : ""}{MAP_CREDIT}.</figcaption>
  </figure>;
}
