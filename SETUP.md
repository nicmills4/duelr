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
   against the Riot API and create a session.

2. **Queue** — Choose:
   - The champion you want to **play**
   - The champion you want to **face**
   - Your elo bracket (Low / Mid / High / Elite)

3. **Matchmaking** — We look for a player with the mirror setup
   (they want to play your "vsChampion" against your "myChampion").
   You're notified in real-time via SSE.

4. **Match Found** — You see their Riot ID. Add them as a friend in the
   League client and set up a custom game.

---

## Architecture

```
app/
  page.tsx              → Landing + Login (redirects to /queue if logged in)
  queue/page.tsx        → Queue page (protected)
  api/
    auth/login          → Validate Riot ID + create session
    auth/logout         → Destroy session + leave queue
    riot/validate       → Validate a Riot ID without logging in
    champions           → Champion list from Data Dragon (cached 24h)
    queue/join          → Join matchmaking queue
    queue/leave         → Leave queue
    queue/stream        → SSE endpoint — notifies when matched

lib/
  prisma.ts             → Prisma client singleton
  redis.ts              → ioredis client + key helpers
  riot.ts               → Riot API helpers
  session.ts            → JWT session (cookie-based)
  matchmaking.ts        → Queue join/leave + matching logic
  constants.ts          → ELO_BRACKETS (browser-safe, no Node deps)

components/
  LoginForm.tsx         → Riot ID + region form
  QueueForm.tsx         → Champion selector + queue UI + SSE listener
  ChampionSelector.tsx  → Searchable champion dropdown with icons
  LogoutButton.tsx      → Client-side logout button
```

---

## Riot API Key Note

This app uses a **personal development key** which:
- Expires every 24 hours
- Is rate-limited to 20 requests/second (100/2min)
- Does NOT have access to friend-request APIs (no public endpoint exists)

For production, apply for a **production key** at the Riot Developer Portal.
Friend requests would require a private agreement with Riot.
