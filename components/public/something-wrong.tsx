import Link from "next/link";

/**
 * "Something wrong? Tell us", in the footer of every reader page. Opens the
 * report form (/report) for the page the reader is on; reports go to the
 * editor's queue and, when fixed, to the public corrections log. A plain link,
 * so it works without JavaScript; `page` is the kind of page ("/bills/[id]"),
 * and the report page finds the exact one from the browser's Referer header.
 */
export function SomethingWrong({ page }: { page: string }) {
  if (page === "/report") return null;
  return <p className="something-wrong"><Link href={`/report?page=${encodeURIComponent(page)}`} prefetch={false} rel="nofollow">Something wrong? Tell us</Link></p>;
}
