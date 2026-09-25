import { redirect } from "next/navigation";

// The private review build opens on the checking instrument.
export default function Home() { redirect("/editor"); }
