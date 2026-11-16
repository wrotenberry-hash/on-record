"use client";
import { useEffect } from "react";
/** Registers the service worker so the app can be installed (no caching, no tracking). */
export function SwRegister() {
  useEffect(() => { if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined); }, []);
  return null;
}
