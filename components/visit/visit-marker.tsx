"use client";
import { useEffect } from "react";
import { markVisit } from "@/app/visit/actions";

/** Records the visit time once per tab session (for "Since you last visited"). */
export function VisitMarker() {
  useEffect(() => {
    try { if (sessionStorage.getItem("or_v")) return; sessionStorage.setItem("or_v", "1"); } catch { /* storage blocked: still mark */ }
    void markVisit().catch(() => undefined);
  }, []);
  return null;
}
