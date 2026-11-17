import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** Installable web app (Round D). Names and icons only; no record content. */
export default function manifest(): MetadataRoute.Manifest {
  return { name: BRAND.name, short_name: BRAND.name, description: "How your legislators voted, in plain words.", start_url: "/", display: "standalone",
    background_color: "#f6f5f1", theme_color: "#163b3c", icons: [{ src: BRAND.icons.small, sizes: "192x192", type: "image/png" }, { src: BRAND.icons.large, sizes: "512x512", type: "image/png" }, { src: BRAND.icons.large, sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
