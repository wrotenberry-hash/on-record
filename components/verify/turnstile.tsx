"use client";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = { render: (el: HTMLElement, opts: { sitekey: string; action?: string; callback: (token: string) => void; "error-callback"?: () => void }) => string };
declare global { interface Window { turnstile?: TurnstileApi; __orTurnstile?: Promise<void> } }

function load(src: string) {
  if (window.turnstile) return Promise.resolve();
  window.__orTurnstile ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script"); s.src = `${src}${src.includes("?") ? "&" : "?"}render=explicit`; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error("bot check did not load")); document.head.appendChild(s);
  });
  return window.__orTurnstile;
}

/**
 * Cloudflare Turnstile in invisible mode (the widget type is set in the
 * Cloudflare dashboard). It fills a hidden `cf-turnstile-response` field the
 * server checks. Loaded only on the forms that need it.
 */
export function Turnstile({ siteKey, scriptUrl, action }: { siteKey: string; scriptUrl: string; action: string }) {
  const box = useRef<HTMLDivElement>(null), [token, setToken] = useState(""), [failed, setFailed] = useState(false);
  useEffect(() => {
    let done = false;
    load(scriptUrl).then(() => { if (!done && box.current && window.turnstile) window.turnstile.render(box.current, { sitekey: siteKey, action, callback: setToken, "error-callback": () => setFailed(true) }); })
      .catch(() => setFailed(true));
    return () => { done = true; };
  }, [siteKey, scriptUrl, action]);
  return <>
    <div ref={box} className="turnstile-box" />
    <input type="hidden" name="cf-turnstile-response" value={token} />
    {failed && <small className="meta">The automatic bot check could not load. Reload the page to try again.</small>}
  </>;
}
