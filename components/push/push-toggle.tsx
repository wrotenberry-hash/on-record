"use client";
import { useEffect, useState } from "react";

const b64ToBytes = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, c => c.charCodeAt(0)); };

/** Turn alerts on this device on or off (web push). On iPhone, add On Record to the Home Screen first. */
export function PushToggle() {
  const [state, setState] = useState<"unknown" | "unsupported" | "off" | "on" | "blocked" | "busy">("unknown"), [note, setNote] = useState("");
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
      if (Notification.permission === "denied") { setState("blocked"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);
  async function turnOn() {
    setState("busy"); setNote("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if ((await Notification.requestPermission()) !== "granted") { setState("blocked"); return; }
      const { publicKey } = await (await fetch("/api/push/key")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setState(r.ok ? "on" : "off"); if (!r.ok) setNote("Could not save. Try again.");
    } catch { setState("off"); setNote("This browser did not allow alerts. On iPhone, add On Record to your Home Screen first."); }
  }
  async function turnOff() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
    if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setState("off");
  }
  if (state === "unsupported") return <p className="meta">This browser cannot show alerts. On iPhone, tap Share → Add to Home Screen, then open On Record from there.</p>;
  if (state === "blocked") return <p className="meta">Alerts are blocked for this site in your browser settings.</p>;
  return <div className="push-toggle"><button type="button" className={state === "on" ? "follow-btn on" : "follow-btn"} disabled={state === "busy" || state === "unknown"} onClick={() => void (state === "on" ? turnOff() : turnOn())} aria-pressed={state === "on"}>
    {state === "on" ? "Alerts on this device: on" : "Turn on alerts on this device"}</button>{note && <p className="meta">{note}</p>}</div>;
}
