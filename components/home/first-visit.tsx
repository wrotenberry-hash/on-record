"use client";
import { useEffect } from "react";
import { FIRST_VISIT_COOKIE } from "@/lib/flow/rules";

/**
 * Notes when this browser first saw the landing form (cookie `or_first`, epoch seconds, one year), once. It is read
 * only when the first answer is saved, to add one to a time bucket ("under a minute", …). Nothing is stored per person.
 */
export function FirstVisit() {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some(c => c.startsWith(`${FIRST_VISIT_COOKIE}=`))) return;
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${FIRST_VISIT_COOKIE}=${Math.floor(Date.now() / 1000)}; max-age=31536000; path=/; samesite=lax${secure}`;
    } catch { /* cookies blocked: the bucket is simply not counted */ }
  }, []);
  return null;
}
