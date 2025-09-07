import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  return (
    <main style={{ padding: 48 }}>
      <h1 style={{ fontSize: 48, marginBottom: 16 }}>
        Post-meeting social media content generator
      </h1>
      <p style={{ fontSize: 22, color: "#444", marginBottom: 24 }}>
        Sign in, sync your calendars, and let a notetaker join calls, pull transcripts,
        and generate social posts.
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <Link href="/meetings">Go to Meetings</Link>
        <span>·</span>
        <Link href="/settings">Settings</Link>
        {!user && (
          <>
            <span>·</span>
            <Link href="/api/auth/signin">Sign in</Link>
          </>
        )}
      </div>

      {user && (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <form action="/api/google/events/sync" method="post">
            <button style={{ padding: "8px 12px", border: "1px solid #000" }}>
              Sync Google Calendar
            </button>
          </form>

          <form action="/api/recall/poll" method="post">
            <button style={{ padding: "8px 12px", border: "1px solid #000" }}>
              Poll Recall now
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
