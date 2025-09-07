import { prisma } from "@/lib/prisma";

const RECALL_API = "https://api.recall.ai/api/v1";

export async function POST(req: Request) {
  const fd = await req.formData();
  const eventId = String(fd.get("eventId") || "");
  const enabled = fd.get("notetakerEnabled") === "on";

  const ev = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!ev) return new Response("Not found", { status: 404 });

  // Simple toggle in DB
  const updated = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: { notetakerEnabled: enabled },
  });

  // Best-effort: create or cancel bot
  try {
    if (enabled) {
      if (!ev.conferencingLink) throw new Error("No conferencing link to schedule Recall bot.");
      const minutesBefore = Number(process.env.RECALL_JOIN_MINUTES_BEFORE ?? "5");
      const joinAt = new Date(new Date(ev.startTime).getTime() - minutesBefore * 60_000).toISOString();

      const r = await fetch(`${RECALL_API}/bot/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${process.env.RECALL_API_KEY}`,
        },
        body: JSON.stringify({
          meeting_url: ev.conferencingLink,
          join_at: joinAt,
          // opcionales:
          transcription: { provider: "whisper" }, // ejemplo
          behavior: { auto_leave: true },
          metadata: { calendarEventId: ev.id },
        }),
      });

      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Recall create failed: ${t}`);
      }
      const data = await r.json();

      await prisma.calendarEvent.update({
        where: { id: ev.id },
        data: { recallBotId: data.id, recallStatus: "created" },
      });
    } else {
      if (ev.recallBotId) {
        // Best-effort delete
        await fetch(`${RECALL_API}/bot/${ev.recallBotId}/`, {
          method: "DELETE",
          headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
        }).catch(() => null);

        await prisma.calendarEvent.update({
          where: { id: ev.id },
          data: { recallStatus: null, recallBotId: null },
        });
      }
    }
  } catch (e) {
    console.error("toggle-notetaker recall error:", e);
  }

  return new Response(null, { status: 302, headers: { Location: "/meetings" } });
}
