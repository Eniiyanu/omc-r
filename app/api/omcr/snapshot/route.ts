import { buildSnapshot, isConfigured } from "@/lib/atlascore";
import { getSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isConfigured()) {
    try {
      const snapshot = await buildSnapshot();
      return Response.json(snapshot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json(
        { error: "Failed to fetch from atlascore backend", detail: message },
        { status: 502 }
      );
    }
  }

  return Response.json(getSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
