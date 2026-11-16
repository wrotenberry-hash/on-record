import { GLOSSARY, glossParts } from "@/lib/glossary";
import { Term } from "@/components/ui/term";

/** Text with its jargon terms tappable for a plain-language definition. */
export function Glossed({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <>{glossParts(text).map((p, i) => p.term ? <Term key={i} definition={GLOSSARY[p.term]}>{p.text}</Term> : <span key={i}>{p.text}</span>)}</>;
}
