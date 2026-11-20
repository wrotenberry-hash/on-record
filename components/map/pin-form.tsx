"use client";
import { useCallback, useState } from "react";
import { DistrictMap } from "@/components/map/district-map";
import { placeByPin } from "@/app/start/actions";
import { PIN_MIN_ZOOM } from "@/lib/map-rules";
import type { ZipMap } from "@/lib/district-shapes";

/**
 * "Drop a pin on a map" (owner, 20 Nov 2026). The marker stays in the middle; the reader moves the map under it and
 * presses the button. The button works only once the map is zoomed in far enough to tell one home from the next. The
 * spot goes once to the Census Bureau, which names the districts there. It is not stored.
 */
export function PinForm({ map, centre, next }: { map: ZipMap | null; centre: [number, number]; next: string }) {
  const [spot, setSpot] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const onMove = useCallback((lat: number, lon: number, zoom: number) => setSpot({ lat, lon, zoom }), []);
  const close = !!spot && spot.zoom >= PIN_MIN_ZOOM;
  return <form action={placeByPin} className="pin-form">
    <input type="hidden" name="next" value={next} />
    <input type="hidden" name="lat" value={spot?.lat ?? ""} />
    <input type="hidden" name="lon" value={spot?.lon ?? ""} />
    <DistrictMap map={map} centre={centre} mode="pin" onMove={onMove} label="Map. Move it until the marker in the middle is on your home. Arrow keys move the map; plus and minus zoom." />
    <p className="meta pin-hint" role="status">{close ? "The tip of the marker is the spot. Move the map until it sits on your home." : "Zoom in with + until you can see your street, then move the map so the marker sits on your home."}</p>
    <button type="submit" disabled={!close}>Use this spot</button>
    <noscript><p className="gate gate-closed">The map needs scripts to be switched on in your browser. Without them, go back and try a nearby address instead.</p></noscript>
  </form>;
}
