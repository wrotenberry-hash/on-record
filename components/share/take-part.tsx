import { TAKE_PART_LINE } from "@/lib/public-access";
import "./share.css";

/** Where the vote box would be, for a visitor reading one shared bill without an invite: a plain line on how to take part. */
export function TakePart() {
  return <div className="take-part" id="your-view"><h2>How to take part</h2><p>{TAKE_PART_LINE}</p></div>;
}
