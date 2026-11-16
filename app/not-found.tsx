import Link from "next/link";

/** Round E: not found, with the three most useful ways back in. */
export default function NotFound() {
  return <main className="state-page">
    <div className="state-brand">ON <span>RECORD</span></div>
    <h1>We could not find that page.</h1>
    <p>The link may be old, or the item may not be in On Record yet.</p>
    <ul className="analysis-list"><li><Link href="/search">Search bills and members</Link></li><li><Link href="/legislators">Find your legislators</Link></li><li><Link href="/">Home</Link></li></ul>
  </main>;
}
