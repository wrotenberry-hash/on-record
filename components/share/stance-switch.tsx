import Link from "next/link";
import "./share.css";

/**
 * "Add my answer to the card" (owner's point 10). Off until the reader turns it on. It is a plain link that reloads
 * the share screen with the switch flipped, so it works without scripts and the server decides what the line says:
 * the reader's own answer on that bill, and nothing else. `line` is that answer once it is on.
 */
export function StanceSwitch({ on, href, line }: { on: boolean; href: string; line: string | null }) {
  return <>
    <Link className="stance-switch" role="switch" aria-checked={on} href={href} scroll={false} prefetch={false}>
      <span className="track" aria-hidden="true" />
      <span><b>Add my answer to the card</b><small>{on ? "On. Tap to take it off." : "Off. The card carries the fact only."}</small></span>
    </Link>
    {on && line && <p className="stance-note" role="status">The card now carries the line “{line}” in its own box, marked as added by you. It is your answer, not part of the record.
      Anyone you send the card to will see it. The link you share records that the card has this line. It does not record who made it.</p>}
  </>;
}
