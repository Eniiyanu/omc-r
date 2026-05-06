import { isConfigured } from "@/lib/atlascore";
import { generateAlarmNow, getAlarms } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const severity = searchParams.get("severity") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? 200);

  return Response.json({
    alarms: getAlarms({ status, severity, limit }),
  });
}

export async function POST() {
  if (isConfigured()) {
    // Cannot inject alarms into a live backend — no-op
    return Response.json({ message: "Alarm injection unavailable on live feed" }, { status: 200 });
  }
  const alarm = generateAlarmNow();
  return Response.json({ alarm }, { status: 201 });
}
