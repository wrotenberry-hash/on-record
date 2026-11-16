import type { MetadataRoute } from "next";

/** Installable web app (Round D). Names and icons only; no record content. */
export default function manifest(): MetadataRoute.Manifest {
  return { name: "On Record", short_name: "On Record", description: "How your legislators voted, in plain words.", start_url: "/", display: "standalone",
    background_color: "#f6f5f1", theme_color: "#163b3c", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
