import "./end.css";
import { dashboardClose, listEnd } from "@/lib/dashboard-end";

/** The line that ends a list: "That is all 10." Nothing when the list is empty (the page already says why). */
export function ListEnd(props: { shown: number; total?: number | null; top?: boolean; what?: string }) {
  const text = listEnd(props);
  return text ? <p className="list-end">{text}</p> : null;
}

/** The one line that closes a dashboard: "You're caught up." and when the figures were last updated. */
export function CaughtUp(props: { updated: string | null; updatedAt: number | null | undefined; previousVisit: number | null | undefined }) {
  const c = dashboardClose(props);
  return <p className="caught-up" role="status"><b>{c.head}</b> {c.text}</p>;
}
