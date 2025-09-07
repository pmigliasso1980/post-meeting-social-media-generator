import { prisma } from "@/lib/prisma";

export default async function Upcoming() {
  const events = await prisma.calendarEvent.findMany({ orderBy: { startTime: "asc" } });
  return (
    <main style={{ padding: 24 }}>
      <h1>Upcoming events</h1>
      {events.map(ev => (
        <div className="card" key={ev.id}>
          <h3>{ev.title}</h3>
          <p>{new Date(ev.startTime).toLocaleString()} — {ev.platform} {ev.conferencingLink ? <a href={ev.conferencingLink} target="_blank">link</a> : null}</p>
          <form action="/api/events/toggle-notetaker" method="post">
            <input type="hidden" name="eventId" value={ev.id} />
            <label>
              <input type="checkbox" name="notetakerEnabled" defaultChecked={ev.notetakerEnabled} onChange={() => {}} /> Enable notetaker
            </label>
            <button type="submit" style={{ marginLeft: 8 }}>Save</button>
          </form>
        </div>
      ))}
    </main>
  );
}
