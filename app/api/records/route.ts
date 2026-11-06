import { editorJson } from "@/lib/editor-auth";
import { PUBLIC_READ_DISABLED_MESSAGE, PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { listPublicRecords } from "@/lib/published-records";

export async function GET() {
  if (!publicReadEnabled(process.env[PUBLIC_READ_FLAG]))
    return editorJson({ error: PUBLIC_READ_DISABLED_MESSAGE }, 403);
  try {
    return editorJson({ records: await listPublicRecords() });
  } catch (error) {
    console.error("Published records unavailable", error);
    return editorJson({ error: "Published records unavailable" }, 503);
  }
}
