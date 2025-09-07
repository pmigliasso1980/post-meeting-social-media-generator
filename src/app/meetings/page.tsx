import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";

export default async function MeetingsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  const events = userId
    ? await prisma.calendarEvent.findMany({
        where: {
          userId,
          startTime: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
        orderBy: { startTime: "asc" },
        include: {
          // if you save a relation to Meeting:
          meeting: { select: { id: true } },
        },
      })
    : [];

  return (
    <div style={{ padding: 24 }}>
      <form action="/api/google/events/sync" method="post">
        <button style={{ padding: "8px 12px", border: "1px solid #000" }}>
          Sync Google Calendar
        </button>
      </form>

      <form action="/api/recall/poll" method="post" style={{ marginTop: 8 }}>
        <button style={{ padding: "8px 12px", border: "1px solid #000" }}>
          Poll Recall
        </button>
      </form>

      <div style={{ marginTop: 24 }}>
        {events.length === 0 && <div>No events (yet).</div>}
        {events.map((ev) => (
          <div
            key={ev.id}
            style={{ border: "1px solid #ddd", padding: 12, marginBottom: 12 }}
          >
            <div style={{ fontWeight: 600 }}>{ev.title}</div>
            <div style={{ color: "#666" }}>
              {new Date(ev.startTime).toLocaleString()} —{" "}
              {new Date(ev.endTime).toLocaleString()}
            </div>
            <div style={{ color: "#666" }}>
              Platform: {ev.platform ?? "—"}
            </div>
            {ev.conferencingLink && (
              <div>
                <a href={ev.conferencingLink} target="_blank">
                  Join link
                </a>
              </div>
            )}

            {/* Link to the detail ONLY if a Meeting already exists */}
            {ev.meeting?.id && (
              <div style={{ marginTop: 8 }}>
                <Link href={`/meetings/${ev.meeting.id}`}>Open meeting</Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
