// src/lib/google.ts
import { google } from "googleapis";
import { prisma } from "./prisma";

/**
 * Best-effort detection of the meeting platform and its join link.
 * Searches across location, description and conferencing link.
 */
export function detectPlatformAndLink(ev: {
  location?: string | null;
  description?: string | null;
  conferencingLink?: string | null;
}) {
  const str = [ev.location, ev.description, ev.conferencingLink]
    .filter(Boolean)
    .join(" ");

  const re = {
    zoom: /(https?:\/\/[a-z0-9.-]*zoom\.us\/j\/\d+)/i,
    meet: /(https?:\/\/meet\.google\.com\/[a-z0-9-]+)/i,
    teams: /(https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]+)/i,
  };

  for (const [platform, regex] of Object.entries(re)) {
    const m = str.match(regex);
    if (m) return { platform, link: m[1] };
  }

  return { platform: "unknown", link: undefined };
}

/**
 * Build an OAuth2 client using tokens stored in the Account row.
 * We construct it via `google.auth.OAuth2()` (from `googleapis`) to avoid
 * version/type mismatches with `google-auth-library`.
 */
export async function getGoogleOAuthClientFromAccount(accountId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !account.access_token) {
    throw new Error("Google account not found or no access token");
  }

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    // redirect URI is not required for API calls here
  );

  oAuth2Client.setCredentials({
    access_token: account.access_token || undefined,
    refresh_token: account.refresh_token || undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // If expired, googleapis will refresh automatically when making a request
  return oAuth2Client;
}

/**
 * Convenience helper: returns a ready-to-use Google Calendar client
 * for the first Google account linked to the given user.
 */
export async function getGoogleClientForUser(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    orderBy: { createdAt: "asc" },
  });

  if (!account) {
    throw new Error("User has no linked Google account");
  }

  const auth = await getGoogleOAuthClientFromAccount(account.id);
  const calendar = google.calendar({ version: "v3", auth });
  return { auth, calendar, accountId: account.id };
}

/**
 * Pull upcoming events for ALL Google accounts the user has connected.
 * - Merges events by (provider, providerEventId) using Prisma upsert.
 * - Tries to detect platform and the join link (Zoom/Meet/Teams).
 */
export async function syncGoogleCalendarEvents(userId: string) {
  const googleAccounts = await prisma.account.findMany({
    where: { userId, provider: "google" },
  });

  for (const acc of googleAccounts) {
    if (!acc.access_token) continue;

    const auth = await getGoogleOAuthClientFromAccount(acc.id);
    const calendar = google.calendar({ version: "v3", auth });

    const nowIso = new Date().toISOString();
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: nowIso,
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
    });

    for (const ev of res.data.items || []) {
      const start = ev.start?.dateTime || ev.start?.date;
      const end = ev.end?.dateTime || ev.end?.date;
      if (!start || !end || !ev.id || !ev.summary) continue;

      const { platform, link } = detectPlatformAndLink({
        location: ev.location || undefined,
        description: ev.description || undefined,
        conferencingLink: (ev as any).hangoutLink || undefined,
      });

      await prisma.calendarEvent.upsert({
        where: {
          provider_providerEventId: {
            provider: "google",
            providerEventId: ev.id,
          },
        },
        create: {
          userId,
          provider: "google",
          providerEventId: ev.id,
          title: ev.summary,
          description: ev.description || null,
          startTime: new Date(start),
          endTime: new Date(end),
          attendeesJson: (ev.attendees as any) ?? ({} as any),
          location: ev.location || null,
          conferencingLink: link || (ev as any).hangoutLink || null,
          platform,
          accountId: acc.id,
          accountEmail: acc.email || null,
        },
        update: {
          title: ev.summary,
          description: ev.description || null,
          startTime: new Date(start),
          endTime: new Date(end),
          attendeesJson: (ev.attendees as any) ?? ({} as any),
          location: ev.location || null,
          conferencingLink: link || (ev as any).hangoutLink || null,
          platform,
          accountId: acc.id,
          accountEmail: acc.email || null,
        },
      });
    }
  }
}
