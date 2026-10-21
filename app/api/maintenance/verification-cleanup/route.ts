import { getD1Binding } from "@/db";
import { cleanupAuthorized, cleanupVerification } from "@/lib/verification-cleanup.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!await cleanupAuthorized(request, "e415eea5733f7b1370b986a445c2f40826de278065024f72767b19521961886d", 1792615522413)) {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }
  const db = getD1Binding();
  if (!db) return Response.json({ message: "Database unavailable" }, { status: 503 });
  try {
    const result = await cleanupVerification(db);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ message: "Cleanup failed" }, { status: 503 });
  }
}
