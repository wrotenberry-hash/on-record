"use client";
import { useRef, useState } from "react";
import { logShare } from "@/components/share/share-panel";

/**
 * A 15–30 second captioned vertical video (9:16), made on the reader's own phone:
 * the card's text animates in, scene by scene. Text animation only: no voice, no
 * synthetic speech, no faces or likenesses. Nothing is uploaded; the file is made
 * in the browser with the canvas and MediaRecorder, then shared or saved.
 */
export type Scene = { eyebrow: string; heading: string; badge?: "Official" | "Analysis" | "Readers"; points: string[]; foot?: string };
const W = 720, H = 1280, FPS = 30;
const C = { bg: "#f7f6f2", ink: "#172224", muted: "#4f6b68", line: "#163b3c", card: "#ffffff", border: "#d9ded9",
  Official: ["#e3efe6", "#245236"], Analysis: ["#eae6f4", "#45366e"], Readers: ["#f6ebdd", "#6b4a1e"] } as const;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = []; let line = "";
  for (const w of text.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function draw(ctx: CanvasRenderingContext2D, s: Scene, t: number, i: number, n: number) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top"; let y = 64;
  const fade = (start: number) => { const a = ease((t - start) / 0.5); ctx.globalAlpha = a; return (1 - a) * 24; };
  ctx.font = "700 22px sans-serif"; ctx.fillStyle = C.muted; let dy = fade(0); ctx.fillText(s.eyebrow.slice(0, 48), 48, y + dy); ctx.fillText(`${i + 1}/${n}`, W - 90, y);
  y += 52; ctx.font = "700 50px sans-serif"; ctx.fillStyle = C.ink; dy = fade(0.2);
  for (const l of wrap(ctx, s.heading, W - 96).slice(0, 5)) { ctx.fillText(l, 48, y + dy); y += 60; }
  if (s.badge) { dy = fade(0.5); y += 12; ctx.font = "700 20px sans-serif"; const [bg, fg] = C[s.badge]; const bw = ctx.measureText(s.badge.toUpperCase()).width + 24;
    ctx.fillStyle = bg; ctx.fillRect(48, y + dy, bw, 34); ctx.fillStyle = fg; ctx.fillText(s.badge.toUpperCase(), 60, y + 7 + dy); y += 50; }
  y += 18;
  s.points.slice(0, 4).forEach((p, k) => {
    dy = fade(0.9 + k * 0.6); ctx.font = "30px sans-serif"; const lines = wrap(ctx, p, W - 140).slice(0, 6), h = lines.length * 40 + 36;
    ctx.fillStyle = C.card; ctx.strokeStyle = C.border; ctx.lineWidth = 2; ctx.fillRect(48, y + dy, W - 96, h); ctx.strokeRect(48, y + dy, W - 96, h);
    ctx.fillStyle = C.ink; lines.forEach((l, j) => ctx.fillText(l, 70, y + 18 + j * 40 + dy)); y += h + 20;
  });
  ctx.globalAlpha = 1;
  if (s.foot) { ctx.font = "20px sans-serif"; ctx.fillStyle = C.muted; wrap(ctx, s.foot, W - 96).slice(0, 2).forEach((l, j) => ctx.fillText(l, 48, H - 170 + j * 26)); }
  ctx.fillStyle = C.line; ctx.fillRect(48, H - 110, W - 96, 3);
  ctx.font = "700 38px sans-serif"; ctx.fillStyle = C.ink; ctx.fillText("Talk is cheap.", 48, H - 88);
  ctx.font = "700 22px sans-serif"; ctx.fillStyle = C.line; ctx.fillText("ON RECORD", W - 190, H - 78);
}

export function VideoMaker({ scenes, filename, caption, kind }: { scenes: Scene[]; filename: string; caption: string; kind: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "making" | "done" | "unsupported">("idle");
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null);
  const per = Math.min(6, Math.max(3.5, 22 / Math.max(1, scenes.length))), total = Math.min(30, Math.max(15, per * scenes.length));
  async function make() {
    const el = canvas.current, ctx = el?.getContext("2d");
    if (!el || !ctx || typeof MediaRecorder === "undefined" || !el.captureStream) { setState("unsupported"); return; }
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(m => MediaRecorder.isTypeSupported(m));
    if (!type) { setState("unsupported"); return; }
    setState("making");
    const rec = new MediaRecorder(el.captureStream(FPS), { mimeType: type, videoBitsPerSecond: 2_500_000 }), chunks: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>(r => { rec.onstop = () => r(); });
    rec.start(500);
    const start = performance.now(), sceneLen = total / scenes.length;
    await new Promise<void>(resolve => {
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        if (t >= total) { resolve(); return; }
        const i = Math.min(scenes.length - 1, Math.floor(t / sceneLen));
        draw(ctx, scenes[i], t - i * sceneLen, i, scenes.length);
        requestAnimationFrame(tick);
      };
      tick();
    });
    rec.stop(); await done;
    const ext = type.includes("mp4") ? "mp4" : "webm", blob = new Blob(chunks, { type: type.split(";")[0] });
    setVideo({ url: URL.createObjectURL(blob), file: new File([blob], `${filename}.${ext}`, { type: blob.type }) });
    setState("done");
  }
  async function share() {
    if (!video) return;
    try { if (navigator.canShare?.({ files: [video.file] })) { await navigator.share({ files: [video.file], text: caption }); logShare("share_video", kind); } }
    catch { /* cancelled */ }
  }
  return <div className="video-maker">
    <canvas ref={canvas} width={W} height={H} className={`video-canvas${state === "making" ? " on" : ""}`} aria-hidden="true" />
    {state === "idle" && <button type="button" className="secondary-button" onClick={() => void make()}>Make a {Math.round(total)}-second video</button>}
    {state === "making" && <p className="meta" role="status">Making the video on this phone ({Math.round(total)} seconds)…</p>}
    {state === "unsupported" && <p className="meta" role="status">This browser cannot make videos. Share the image instead.</p>}
    {state === "done" && video && <>
      <video src={video.url} controls playsInline className="share-preview share-story" />
      <div className="share-actions"><button type="button" onClick={() => void share()}>Share video</button>
        <a className="secondary-link" href={video.url} download={video.file.name} onClick={() => logShare("share_video", kind)}>Save video</a></div></>}
    <p className="meta">Text animation only: no voice and no faces. Made on your device; nothing is uploaded.</p>
  </div>;
}
