import { getSimulatorState, setSimulatorActive } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getSimulatorState());
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const active = Boolean(body.active);
  return Response.json(setSimulatorActive(active));
}
