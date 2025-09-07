// src/app/api/google/events/sync/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import { detectPlatformAndLink } from "@/lib/google";

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // --- window: desde hoy -1 día (buffer) hasta hoy + 30 días
  const now = Date.now();
  const timeMin = new Date(now - 1 * 24 * 60 * 60 * 1000);  // -1 día
  const timeMax = new Date(now + 30 * 24 * 60 * 60 * 1000); // +30 días

  // Tomamos la primera cuenta de Google del user (o las que tengas si querés loopear)
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    orderBy: { id: "asc" },
  });
  if (!account?.access_token) {
    return Response.json({ ok: false, reason: "no-google-account" }, { status: 400 });
  }

  const oAuth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oAuth2.setCredentials({
    access_token: account.access_token || undefined,
    refresh_token: account.refresh_token || undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  const calendar = google.calendar({ version: "v3", auth: oAuth2 });

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),      // 👈 límite superior
    singleEvents: true,                   // expande recurrencias
    orderBy: "startTime",
    maxResults: 250,
  });

  const items = res.data.items ?? [];

  // Contadores para diagnóstico
  let written = 0;
  const skipped = { allDay: 0, transparent: 0, privacy: 0 };

  // (opcional, pero útil) limpiar eventos *de Google* fuera de la ventana
  await prisma.calendarEvent.deleteMany({
    where: {
      userId,
      provider: "google",
      OR: [
        { startTime: { lt: timeMin } },
        { startTime: { gt: timeMax } },
      ],
    },
  });

  // Upsert solo de los eventos “válidos” dentro de la ventana
  for (const e of items) {
    // Skip all-day
    const isAllDay = !!e.start?.date && !e.start?.dateTime;
    if (isAllDay) {
      skipped.allDay++;
      continue;
    }

    // Skip transparent (free)
    if (e.transparency === "transparent") {
      skipped.transparent++;
      continue;
    }

    // Skip privados
    if (e.visibility === "private") {
      skipped.privacy++;
      continue;
    }

    const start = e.start?.dateTime!;
    const end = e.end?.dateTime ?? e.start?.dateTime!;
    if (!e.id || !e.summary || !start) continue;

    const { platform, link } = detectPlatformAndLink({
      location: e.location ?? undefined,
      description: e.description ?? undefined,
      conferencingLink:
        (e as any).hangoutLink ??
        (e.conferenceData?.entryPoints?.[0]?.uri as string | undefined),
    });

    await prisma.calendarEvent.upsert({
      where: {
        provider_providerEventId: { provider: "google", providerEventId: e.id },
      },
      create: {
        userId,
        provider: "google",
        providerEventId: e.id,
        title: e.summary,
        description: e.description ?? null,
        startTime: new Date(start),
        endTime: new Date(end),
        attendeesJson: (e.attendees as any) ?? null,
        location: e.location ?? null,
        conferencingLink: link ?? null,
        platform,
      },
      update: {
        title: e.summary,
        description: e.description ?? null,
        startTime: new Date(start),
        endTime: new Date(end),
        attendeesJson: (e.attendees as any) ?? null,
        location: e.location ?? null,
        conferencingLink: link ?? null,
        platform,
      },
    });

    written++;
  }

  return Response.json({
    ok: true,
    totalFromGoogle: items.length,
    written,
    skipped,
    window: { timeMin, timeMax },
  });
}
