import { clearAlarm } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ alarm_id: string }> }
) {
  const { alarm_id } = await params;
  const ok = clearAlarm(alarm_id);
  if (!ok) {
    return Response.json({ error: "Alarm not found" }, { status: 404 });
  }

  return Response.json({ message: "Alarm cleared", alarm_id });
}
