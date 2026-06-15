# Duelr — Setup Guide

## Prerequisites

- Node.js 18+ (installed)
- PostgreSQL (running locally or hosted, e.g. Supabase / Railway)
- Redis (running locally or hosted, e.g. Upstash / Railway)

---

## 1. Configure Environment

Edit `.env.local` with your real values:

```env
RIOT_API_KEY=RGAPI-xxxx          # Your Riot dev key (expires every 24h)
DATABASE_URL=postgresql://...    # Postgres connection string
REDIS_URL=redis://...            # Redis URL
SESSION_SECRET=<random-32-chars> # Any strong secret string
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Dev API Key:** Riot dev keys expire every 24 hours. Get/renew yours at
https://developer.riotgames.com — paste it into RIOT_API_KEY.

---

## 2. Set Up the Database

```bash
# Push the Prisma schema to your database
npx prisma db push

# (Optional) Open Prisma Studio to inspect data
npx prisma studio
```

---

## 3. Install Redis (Windows)

Option A — Docker:
```bash
docker run -d -p 6379:6379 redis:alpine
```

Option B — Windows binary from https://github.com/tporadowski/redis/releases
(download the .msi and install, then `redis-server` runs as a service)

---

## 4. Run the App

```bash
npm run dev
```

Open http://localhost:3000

---

## How It Works

1. **Login** — Enter your Riot ID (`GameName#TAG`) and region. We validate it
   against the Riot API and create a session. The lobby is viewable by guests
   without logging in (social proof), but posting or challenging requires a session.

2. **Open Lobby** — Mark yourself available at `/lobby`. Choose:
   - The champion you want to **play**
   - Who you'll play against: **Any / Any Melee / Any Ranged**
   - Optionally, up to 5 **Preferred Matchup** champions (shown on your card)
   - Your ELO bracket (Low / Mid / High / Elite / Apex)

3. **Challenge** — Browse available players and send a direct challenge.
   Both players must accept. You're notified in real-time via SSE.

4. **Match Found** — A Discord voice channel is created automatically. You see
   their Riot ID — add them in the League client and start the custom game.

---

## Architecture

```
app/
  page.tsx              → Landing + Login
  lobby/page.tsx        → Open Lobby (publicly readable; post/challenge requires auth)
  coaching/page.tsx     → Coaching marketplace
  partners/page.tsx     → Partner finder board
  api/
    auth/login          → Guest login via Riot ID
    auth/login-email    → Full account login
    auth/logout         → Destroy session + leave lobby
    riot/validate       → Validate a Riot ID without logging in
    champions           → Champion list from Data Dragon (cached 24h)
    lobby/available     → Mark yourself available (acceptsType + vsChampions)
    lobby/leave         → Remove yourself from the lobby
    lobby/challenge     → Challenge another player
    lobby/respond       → Accept or decline a challenge
    lobby/players       → Real-time player list (public, no auth required)
    lobby/count         → Live count of available players

lib/
  prisma.ts             → Prisma client singleton
  redis.ts              → ioredis client + key helpers
  session.ts            → JWT session (cookie-based)
  lobby.ts              → Redis lobby presence helpers
  lobby-types.ts        → Shared types: LobbyEntry, AcceptsType, etc.
  stats.ts              → Per-user 1v1 stats (Premium profile)
  constants.ts          → ELO_BRACKETS (browser-safe, no Node deps)
  feature-flags.ts      → Toggle flags (SHOW_ADBLOCK_MODAL, etc.)

components/
  LobbyBrowser.tsx      → Real-time open lobby (public read + auth post/challenge)
  ChampionSelector.tsx  → Searchable champion dropdown with icons
  LogoutButton.tsx      → Client-side logout button
  NavLinks.tsx          → Responsive nav (hamburger on mobile, full on desktop)
```

---

## Riot API Key Note

This app uses a **personal development key** which:
- Expires every 24 hours
- Is rate-limited to 20 requests/second (100/2min)
- Does NOT have access to friend-request APIs (no public endpoint exists)

For production, apply for a **production key** at the Riot Developer Portal.
Friend requests would require a private agreement with Riot.
