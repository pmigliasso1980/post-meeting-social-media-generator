import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Settings</h1>
        <p>You need to sign in to manage your settings.</p>
        <Link href="/api/auth/signin">Sign in</Link>
      </main>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true },
  });

  const accounts = user?.accounts ?? [];
  const googleAccounts = accounts.filter((a) => a.provider === "google");
  const linkedin = accounts.find((a) => a.provider === "linkedin");
  const facebook = accounts.find((a) => a.provider === "facebook");

  return (
    <main style={{ padding: 24 }}>
      <h1>Settings</h1>

      {/* Recall settings */}
      <section style={{ marginTop: 24 }}>
        <h2>Recall notetaker</h2>
        <p style={{ color: "#555", maxWidth: 620 }}>
          Configure how many minutes before a meeting the notetaker should join.
        </p>
        <form action="/api/settings/recall" method="post" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor="minutes"><strong>Join</strong></label>
          <input
            id="minutes"
            name="minutes"
            type="number"
            min={0}
            max={60}
            defaultValue={user?.recallJoinMinutesBefore ?? 5}
            style={{ width: 90, padding: "6px 8px", border: "1px solid #ccc", borderRadius: 4 }}
          />
          <span>minutes before start</span>
          <button type="submit" style={{ padding: "6px 12px", border: "1px solid #000", borderRadius: 4 }}>
            Save
          </button>
        </form>
      </section>

      {/* Connected accounts */}
      <section style={{ marginTop: 32 }}>
        <h2>Connected accounts</h2>

        {/* Google (supports multi-account) */}
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 6 }}>
          <h3 style={{ margin: 0 }}>Google</h3>
          <p style={{ color: "#555" }}>
            You can connect multiple Google accounts. We’ll pull events from all of them.
          </p>

          {googleAccounts.length === 0 ? (
            <p style={{ marginTop: 8, color: "#777" }}>No Google accounts connected.</p>
          ) : (
            <ul style={{ marginTop: 8 }}>
              {googleAccounts.map((a) => (
                <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <code style={{ background: "#f6f6f6", padding: "2px 6px", borderRadius: 4 }}>
                    {a.email || a.providerAccountId}
                  </code>
                  <form action="/api/accounts/unlink" method="post">
                    <input type="hidden" name="accountId" value={a.id} />
                    <button
                      type="submit"
                      style={{ padding: "4px 8px", border: "1px solid #000", borderRadius: 4 }}
                      title="Remove this connected account"
                    >
                      Disconnect
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: 8 }}>
            <a
              href="/api/auth/signin/google?callbackUrl=%2Fsettings"
              style={{ padding: "6px 12px", border: "1px solid #000", borderRadius: 4 }}
            >
              Connect another Google account
            </a>
          </div>
        </div>

        {/* LinkedIn */}
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 6 }}>
          <h3 style={{ margin: 0 }}>LinkedIn</h3>
          {linkedin ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <code style={{ background: "#f6f6f6", padding: "2px 6px", borderRadius: 4 }}>
                {linkedin.name || linkedin.email || linkedin.providerAccountId}
              </code>
              <form action="/api/accounts/unlink" method="post">
                <input type="hidden" name="accountId" value={linkedin.id} />
                <button
                  type="submit"
                  style={{ padding: "4px 8px", border: "1px solid #000", borderRadius: 4 }}
                >
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <a
              href="/api/auth/signin/linkedin?callbackUrl=%2Fsettings"
              style={{ marginTop: 8, display: "inline-block", padding: "6px 12px", border: "1px solid #000", borderRadius: 4 }}
            >
              Connect LinkedIn
            </a>
          )}
        </div>

        {/* Facebook */}
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 6 }}>
          <h3 style={{ margin: 0 }}>Facebook</h3>
          {facebook ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <code style={{ background: "#f6f6f6", padding: "2px 6px", borderRadius: 4 }}>
                {facebook.name || facebook.email || facebook.providerAccountId}
              </code>
              <form action="/api/accounts/unlink" method="post">
                <input type="hidden" name="accountId" value={facebook.id} />
                <button
                  type="submit"
                  style={{ padding: "4px 8px", border: "1px solid #000", borderRadius: 4 }}
                >
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <a
              href="/api/auth/signin/facebook?callbackUrl=%2Fsettings"
              style={{ marginTop: 8, display: "inline-block", padding: "6px 12px", border: "1px solid #000", borderRadius: 4 }}
            >
              Connect Facebook
            </a>
          )}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <Link href="/meetings">← Back to Meetings</Link>
      </section>
    </main>
  );
}
