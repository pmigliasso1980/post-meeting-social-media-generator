import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function MeetingDetail({
  params,
}: {
  params: { id: string };
}) {
  const id = params?.id;
  if (!id) return notFound();

  // Make sure that in your schema Meeting.id is a String (or cast if it is Int)
  const meeting = await prisma.meeting.findUnique({
    where: { id }, // <- KEY: we use the id from the route
    include: {
      socialPosts: true,
      event: true,
      user: {
        select: { id: true },
      },
    },
  });

  if (!meeting) return notFound();

  return (
    <main style={{ padding: 24 }}>
      <h1>Meeting detail</h1>

      <div className="card">
        <p>
          <strong>Start:</strong>{" "}
          {new Date(meeting.startedAt).toLocaleString()}
        </p>
        <p>
          <strong>Platform:</strong> {meeting.platform}
        </p>
        <p>
          <strong>Transcript URL:</strong>{" "}
          {meeting.transcriptUrl ? (
            <a href={meeting.transcriptUrl} target="_blank">
              Open
            </a>
          ) : (
            "pending"
          )}
        </p>
      </div>

      <div className="card">
        <h3>AI-generated follow-up email</h3>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {meeting.aiFollowupEmail || "Generate after transcript is ready."}
        </pre>
      </div>

      <div className="card">
        <h3>Draft social posts</h3>
        {meeting.socialPosts.length === 0 && <p>No drafts yet.</p>}
        {meeting.socialPosts.map((sp) => (
          <div key={sp.id} style={{ marginBottom: 12 }}>
            <p>
              <strong>Provider:</strong> {sp.provider}
            </p>
            <textarea
              readOnly
              value={sp.draftText}
              style={{ width: "100%", minHeight: 120 }}
            />
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => navigator.clipboard.writeText(sp.draftText)}
              >
                Copy
              </button>{" "}
              <form
                action={`/api/social/post`}
                method="post"
                style={{ display: "inline" }}
              >
                <input type="hidden" name="socialPostId" value={sp.id} />
                <button type="submit">
                  {sp.postedAt ? "Repost" : "Post"}
                </button>
              </form>
              {sp.postedAt && (
                <span className="badge">
                  posted {new Date(sp.postedAt).toLocaleString()}
                </span>
              )}
              {sp.postUrl && (
                <a className="badge" href={sp.postUrl} target="_blank">
                  view
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
