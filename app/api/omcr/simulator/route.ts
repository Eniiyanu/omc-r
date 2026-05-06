import { isConfigured } from "@/lib/atlascore";
import { getSimulatorState, setSimulatorActive } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isConfigured()) {
    // Live feed is always active — no simulator to toggle
    return Response.json({ active: true, source: "atlascore-backend" });
  }
  return Response.json(getSimulatorState());
}

export async function PATCH(request: Request) {
  if (isConfigured()) {
    // No-op: the atlascore feed cannot be paused from here
    return Response.json({ active: true, source: "atlascore-backend" });
  }
  const body = await request.json().catch(() => ({}));
  const active = Boolean(body.active);
  return Response.json(setSimulatorActive(active));
}
