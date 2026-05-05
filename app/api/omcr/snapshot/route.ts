import { getSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
