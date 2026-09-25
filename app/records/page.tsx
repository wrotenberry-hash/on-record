import { env } from "cloudflare:workers";
import Link from "next/link";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import PublishedRecords from "./published-records";

// Reads a per-deployment setting, so this page must not be statically rendered.
export const dynamic = "force-dynamic";

export default function RecordsPage() {
  const enabled = publicReadEnabled((env as unknown as Record<string, string | undefined>)[PUBLIC_READ_FLAG]);
  if (enabled) return <PublishedRecords />;
  return <>
    <header className="topbar"><Link className="brand" href="/">ON <span>RECORD</span><i/></Link><nav><Link href="/editor">Checking instrument</Link><small>PRIVATE REVIEW BUILD</small></nav></header>
    <main><div className="intro"><div className="eyebrow">PRIVATE REVIEW</div><h1>Records are not yet public.</h1>
      <p>On Record is being evaluated privately. Published records and the incoming inventory of captured statements will appear here once the editorial team enables public reading.</p></div>
      <div className="notice"><b>Nothing on this site is a finding.</b> Numerical ratings and aggregate scores are disabled.</div></main>
  </>;
}
