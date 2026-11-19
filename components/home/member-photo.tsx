"use client";
import { useEffect, useRef, useState } from "react";
import { noPhotoLabel, photoAlt } from "@/lib/flow/cards";

/**
 * A legislator's official portrait, or their initials when there is none. The picture comes from the site itself
 * (/api/photo/<id>, lib/photos.ts): the reader's device never contacts an outside host. The placeholder is the same
 * grey box with two letters for every member, whatever their party.
 */
export function MemberPhoto({ src, name, initials }: { src: string | null; name: string; initials: string }) {
  const [failed, setFailed] = useState(false), img = useRef<HTMLImageElement>(null);
  // A picture that failed before the page became interactive fires no error event here, so look once.
  useEffect(() => { const el = img.current; if (el && el.complete && el.naturalWidth === 0) setFailed(true); }, []);
  if (!src || failed) return <span className="leg-photo leg-initials" role="img" aria-label={noPhotoLabel(name)}>{initials}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- served by this site's own route with its own cache headers; no image optimiser, so no second copy and no outside host
  return <img ref={img} className="leg-photo" src={src} alt={photoAlt(name)} width={64} height={80} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
