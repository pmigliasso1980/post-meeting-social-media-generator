import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

const RECALL_API = "https://api.recall.ai/api/v1";

/**
 * Tries to get transcript text in different ways (different Recall plans expose different formats).
 * 1) GET /bot/{id}/transcript (text/plain)
 * 2) GET /bot/{id} and read fields like transcript_url / transcript.text
 * 3) If there’s a transcript_url, it tries to download it as text
 */
async function fetchTranscriptText(botId: string, botJson?: any): Promise<string | null> {
  // 1) direct endpoint (if it exists)
  try {
    const r = await fetch(`${RECALL_API}/bot/${botId}/transcript`, {
      headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
      // some providers require no-cache
      cache: "no-store",
    });
    if (r.ok) {
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("text/")) {
        const text = await r.text();
        if (text && text.trim().length > 0) return text;
      }
    }
  } catch {
    // ignore
  }

  // 2) field inside the JSON (sometimes they store the transcript inline or another URL)
  const data = botJson;
  if (data) {
    // a) inline transcript text
    if (typeof data.transcript === "string" && data.transcript.trim().length > 0) {
      return data.transcript;
    }
    if (data.transcript?.text && typeof data.transcript.text === "string") {
      return data.transcript.text;
    }

    // b) URL to the transcript
    const urlCandidate =
      data.transcript_url ||
      data.media?.transcript_url ||
      data.outputs?.transcript_url;
    if (urlCandidate && typeof urlCandidate === "string") {
      try {
        const r2 = await fetch(urlCandidate, {
          headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
          cache: "no-store",
        });
        if (r2.ok) {
          const ct = r2.headers.get("content-type") || "";
          if (ct.includes("text/") || ct.includes("json")) {
            const txt = await r2.text();
            if (txt && txt.trim().length > 0) return txt;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 3) as a fallback, re-query the bot JSON in case we didn’t pass it
  try {
    const r3 = await fetch(`${RECALL_API}/bot/${botId}/`, {
      headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
      cache: "no-store",
    });
    if (r3.ok) {
      const j = await r3.json();
      // retry heuristics from (2)
      if (typeof j.transcript === "string" && j.transcript.trim().length > 0) return j.transcript;
      if (j.transcript?.text && typeof j.transcript.text === "string") return j.transcript.text;

      const urlCandidate =
        j.transcript_url || j.media?.transcript_url || j.outputs?.transcript_url;
      if (urlCandidate && typeof urlCandidate === "string") {
        try {
          const r4 = await fetch(urlCandidate, {
            headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
            cache: "no-store",
          });
          if (r4.ok) {
            const ct = r4.headers.get("content-type") || "";
            if (ct.includes("text/") || ct.includes("json")) {
              const txt = await r4.text();
              if (txt && txt.trim().length > 0) return txt;
            }
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  return null;
}

/** Saves the transcript in /public/transcripts/<meetingId>.txt and returns the public path */
async function persistTranscript(meetingId: string, text: string): Promise<string> {
  const publicDir = path.join(process.cwd(), "public");
  const folder = path.join(publicDir, "transcripts");
  await fs.mkdir(folder, { recursive: true });
  const filePath = path.join(folder, `${meetingId}.txt`);
  await fs.writeFile(filePath, text, "utf8");
  // public path
  return `/transcripts/${meetingId}.txt`;
}

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  const onlyEventId = fd ? String(fd.get("eventId") || "") : "";

  const whereBase = {
    notetakerEnabled: true,
    recallBotId: { not: null as any },
  } as const;

  const events = await prisma.calendarEvent.findMany({
    where: onlyEventId
      ? { id: onlyEventId, ...whereBase }
      : { ...whereBase, startTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });

  let checked = 0;
  let updatedJoined = 0;
  let completed = 0;
  let savedTranscripts = 0;

  for (const ev of events) {
    if (!ev.recallBotId) continue;
    checked++;

    try {
      const r = await fetch(`${RECALL_API}/bot/${ev.recallBotId}/`, {
        headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      const status: string =
        data.status || data.state || data.phase || "unknown";

      if (status === "joined" && ev.recallStatus !== "joined") {
        updatedJoined++;
        await prisma.calendarEvent.update({
          where: { id: ev.id },
          data: { recallStatus: "joined" },
        });
      }

      const isComplete =
        status === "media_ready" ||
        status === "complete" ||
        status === "processed" ||
        status === "done";

      if (isComplete) {
        completed++;

        // Creates or updates Meeting linked to the event
        const meeting = await prisma.meeting.upsert({
          where: { calendarEventId: ev.id },
          update: {
            startedAt: ev.startTime,
            endedAt: ev.endTime,
            platform: ev.platform || undefined,
          },
          create: {
            userId: ev.userId,
            calendarEventId: ev.id,
            startedAt: ev.startTime,
            endedAt: ev.endTime,
            platform: ev.platform || undefined,
          },
          include: { event: true },
        });

        // Downloads transcript (if possible) and persists file
        try {
          const text = await fetchTranscriptText(ev.recallBotId, data);
          if (text && text.trim().length > 0) {
            const publicUrl = await persistTranscript(meeting.id, text);
            await prisma.meeting.update({
              where: { id: meeting.id },
              data: { transcriptUrl: publicUrl },
            });
            savedTranscripts++;
          }
        } catch (e) {
          console.error("failed to persist transcript for", ev.id, e);
        }

        // Marks the CalendarEvent as ready
        await prisma.calendarEvent.update({
          where: { id: ev.id },
          data: { recallStatus: "media_ready" },
        });
      }
    } catch (e) {
      console.error("recall/poll error", ev.id, e);
    }
  }

  return Response.json({
    ok: true,
    checked,
    updatedJoined,
    completed,
    savedTranscripts,
  });
}
