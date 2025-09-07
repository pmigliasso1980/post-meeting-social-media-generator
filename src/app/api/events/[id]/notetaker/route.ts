import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleRecallBot } from "@/lib/recall";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const ev = await prisma.calendarEvent.findUnique({
    where: { id: params.id },
  });
  if (!ev || ev.userId !== userId) return new Response("Not found", { status: 404 });

  const enable = !ev.notetakerEnabled;

  if (!enable) {
    // Apagamos: limpiamos tracking local (no cancelamos el bot remoto en este MVP)
    await prisma.calendarEvent.update({
      where: { id: ev.id },
      data: { notetakerEnabled: false, recallBotId: null, recallStatus: null },
    });
    return Response.json({ ok: true, enabled: false });
  }

  // Encender: necesitamos un meeting link válido
  if (!ev.conferencingLink) {
    return new Response("No conferencing link in this event.", { status: 400 });
  }

  // Programar bot real en Recall
  const bot = await scheduleRecallBot(ev.conferencingLink, ev.startTime);

  await prisma.calendarEvent.update({
    where: { id: ev.id },
    data: {
      notetakerEnabled: true,
      recallBotId: bot?.id ?? null,
      recallStatus: bot?.id ? "scheduled" : "created",
    },
  });

  return Response.json({ ok: true, enabled: true, botId: bot?.id ?? null });
}
