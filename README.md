# Post‑meeting Social Media Content Generator

A GitHub‑ready starter for the paid challenge. Stack:
- **Next.js (App Router, TypeScript)**
- **NextAuth** (Google sign‑in, custom LinkedIn & Facebook OAuth)
- **Prisma + Postgres** (works great with Supabase)
- **Google Calendar** sync (multiple Google accounts via NextAuth Account rows)
- **Recall.ai** bot orchestration (join N minutes early; polling endpoint)
- **OpenAI** for follow‑up emails and social post drafts

## Quickstart

```bash
pnpm i # or npm install
docker compose up -d
cp .env.example .env
# Fill out secrets
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Open http://localhost:3000

- Sign in at `/api/auth/signin` (Google).
- Hit `POST /api/google/events/sync` to pull upcoming events.
- Toggle notetaker per event at `/upcoming`.
- Ensure/schedule a Recall bot for an event: `POST /api/recall/ensure-bot` with `{ "eventId": "<id>" }`.
- Poll for media when needed: `POST /api/recall/poll` (wire to a cron).
- Past meetings at `/meetings`; meeting details at `/meetings/[id]` with "Copy" & "Post" actions.

## OAuth Notes

- **Google**: request Calendar scope (`https://www.googleapis.com/auth/calendar.readonly`). Add `webshookeng@gmail.com` as a test user.
- **LinkedIn**: requires `w_member_social` scope to post on behalf of the member.
- **Facebook**: for posting, you typically need a Page access token and the `pages_manage_posts` scope. This starter stores a generic SocialAccount and posts via a placeholder. Swap with Graph API calls.

## Recall.ai

- Uses `/join` to create a bot (stores `recallBotId` on the event).
- **Polling**: `POST /api/recall/poll` checks known bot IDs and updates `Meeting` records with media URLs.
- Do **not** use `/bots` listing per challenge rules.

## Data Model Highlights

- `Account` (NextAuth) supports **multiple Google accounts** per user.
- `CalendarEvent` stores platform/link detection and `notetakerEnabled` toggle.
- `Meeting` holds transcript/audio/video URLs after polling.
- `Automation` lets you define per‑provider templates for generating social drafts.
- `SocialPost` stores drafts and posting metadata.

## Where to Extend

- Real LinkedIn/Facebook posting (replace placeholders in `/api/social/post`).
- Auto‑generate drafts once transcript is ready (server action or cron calling OpenAI and creating `SocialPost` rows for each enabled `Automation`).
- UI polish and proper auth‑guarding of pages.
- Google multi‑calendar & attendee listing UI.

