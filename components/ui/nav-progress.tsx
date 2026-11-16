"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Round E: a thin bar at the top as soon as a link is tapped, until the next page
 * arrives, so a slow phone always shows that the tap worked. (A route-wide loading
 * page would have turned every "not found" into a 200 response.)
 */
export function NavProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setPending(url.pathname);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  const active = pending !== null && pending !== pathname;
  return active ? <div className="nav-progress" role="progressbar" aria-label="Loading the next page" /> : null;
}
