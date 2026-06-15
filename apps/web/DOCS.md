# Duelr — Project Documentation

> 1v1 League of Legends matchmaking, partner-finding, and coaching platform.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Environment Variables](#4-environment-variables)
5. [Database Schema](#5-database-schema)
6. [Authentication](#6-authentication)
7. [API Reference](#7-api-reference)
   - [Auth](#71-auth)
   - [Lobby](#72-lobby)
   - [Coaching](#74-coaching)
   - [Partners](#75-partners)
   - [Admin](#76-admin)
   - [Stripe Webhook](#77-stripe-webhook)
   - [Misc](#78-misc)
8. [Coaching System](#8-coaching-system)
9. [Matchmaking & Lobby](#9-matchmaking--lobby)
10. [Premium Subscriptions](#10-premium-subscriptions)
11. [Discord Integration](#11-discord-integration)
12. [Email System](#12-email-system)
13. [Admin Panel](#13-admin-panel)
14. [Frontend Components](#14-frontend-components)
15. [Testing](#15-testing)
16. [Development Setup](#16-development-setup)
17. [Deployment](#17-deployment)

---

## 1. Overview

Duelr is a full-stack web application for League of Legends players who want to:

- **1v1 Open Lobby** — post yourself as available and challenge any other player in real time
- **2v2 Bot Lane Lobby** — form a duo and fill a 4-player group for a 2v2 practice game
- **Partner Finder** — async board for players seeking a consistent duo partner
- **Coaching Marketplace** — hire a verified Masters+ coach for paid 1-on-1 sessions

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL (Railway) via Prisma ORM |
| Cache / Pub-Sub | Redis (ioredis) |
| Payments | Stripe (one-time + subscription checkout) |
| Email | Resend |
| Auth tokens | JWT (jose) — `HS256`, 12 h admin / 7 d user sessions |
| Riot API | DDragon (static assets) + Riot Account API (PUUID lookup) |
| Discord | REST API v10 (bot — creates temporary voice channels) |
| Styling | Tailwind CSS v3 |
| Icons | lucide-react |
| Images | next/image |
| Testing | Custom Node.js runner (`tests/runner.mjs`) |
| Hosting | Railway (app + PostgreSQL + Redis) |

---

## 3. Architecture

```
app/
  api/                  Next.js Route Handlers (server-only)
    admin/              Admin-protected endpoints
    auth/               Registration, login, email verification
    coaching/           Public coach list, booking, session detail
    lobby/              Open-lobby presence + challenge flow
    partners/           Partner-finder posts
    stripe/webhook/     Stripe event handler
    ...
  admin/                Admin dashboard page (client component)
  coaching/             Coach listing page
  ...

components/             Shared React client components
lib/                    Server-side utilities
  admin-auth.ts         JWT admin sessions (cookie-based)
  discord.ts            Discord bot helpers (voice channel creation)
  email.ts              Resend email templates
  lobby.ts              Redis lobby state management
  prisma.ts             Prisma singleton
  redis.ts              ioredis singleton
  session.ts            User session management
  stripe.ts             Stripe client + pricing helpers
prisma/
  schema.prisma         Database schema
tests/
  runner.mjs            Test orchestrator
  suites/               Individual test suites (01–09)
  helpers/              assert.mjs, http.mjs
```

**Data flow for real-time features:**  
Redis stores lobby presence and pending challenges. Server-Sent Events (SSE) push updates to the browser. No WebSockets are used.

---

## 4. Environment Variables

### Required for all features

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SESSION_SECRET` | 32+ char random string — signs user JWTs |
| `NEXT_PUBLIC_APP_URL` | Full origin URL, e.g. `https://playduelr.gg` |

### Auth & Riot API

| Variable | Description |
|---|---|
| `RIOT_API_KEY` | Riot developer API key (`RGAPI-…`) |
| `ADMIN_PASSWORD` | Plain-text password for the `/admin` panel |

### Email (Resend)

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | API key from resend.com |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `Duelr <noreply@playduelr.gg>` |

### Stripe

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` or `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from the Stripe dashboard webhook endpoint |
| `NEXT_PUBLIC_STRIPE_PRICE_ID` | Price ID (`price_…`) for the premium subscription product |

### Discord Bot

| Variable | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from discord.com/developers |
| `DISCORD_GUILD_ID` | Server ID (right-click server → Copy Server ID) |
| `DISCORD_MATCH_CATEGORY_ID` | *(optional)* Category channel ID — voice channels are created here |

### Optional

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | Google AdSense publisher ID (`ca-pub-…`) |

---

## 5. Database Schema

### User

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `riotId` | `String` unique | `GameName#TAG` |
| `puuid` | `String` unique | From Riot API; admin-added users get a fake PUUID |
| `region` | `String` | e.g. `na1`, `euw1` |
| `accountType` | `String` | `"guest"` (Riot ID only) \| `"full"` (email + password) |
| `email` | `String?` unique | Full accounts only |
| `passwordHash` | `String?` | bcrypt hash |
| `emailVerified` | `Boolean` | Must be true to use paid features |
| `isPremium` | `Boolean` | Stripe subscription active |
| `stripeCustomerId` | `String?` | Stripe customer reference |
| `stripeSubscriptionId` | `String?` | Active subscription ID |

### CoachProfile

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `userId` | `String` unique | FK → User |
| `displayCode` | `String` unique | 4-char code shown before payment, e.g. `A7F2` |
| `verifiedTier` | `String` | `MASTER` \| `GRANDMASTER` \| `CHALLENGER` |
| `champions` | `String` | JSON `string[]` — champion pool |
| `specialties` | `String` | JSON `string[]` — legacy, kept for DB compat |
| `roles` | `String` | JSON `string[]` — `Top\|Jungle\|Mid\|Bot\|Support` |
| `hourlyRate` | `Int` | Cents (e.g. `3000` = $30/hr) |
| `bio` | `String?` | Max 500 chars |
| `availability` | `String` | JSON `string[]` — time slot IDs |
| `discordHandle` | `String?` | Shown to student after confirmed payment |
| `contactEmail` | `String?` | Receives booking notification emails (falls back to `user.email`) |
| `isActive` | `Boolean` | Whether the coach appears on the public listing |
| `isApproved` | `Boolean` | Must be `true` for the coach to appear publicly |

### CoachingSession

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key; used in Stripe metadata and success URL |
| `coachProfileId` | `String` | FK → CoachProfile |
| `studentId` | `String` | FK → User |
| `durationMinutes` | `Int` | `30` \| `60` \| `90` |
| `rateAtBooking` | `Int` | Hourly rate in cents at time of purchase |
| `totalCharged` | `Int` | Gross amount charged to student (cents) |
| `platformFee` | `Int` | 20% platform cut (cents) |
| `stripeSessionId` | `String?` | Stripe Checkout Session ID — set by webhook |
| `status` | `String` | `pending_payment` → `confirmed` (set by webhook) |

### PartnerPost

Async "looking for duo" board post. One post per user.

### Match

Outcome record created when two players are matched. Both players self-report win/loss; if reports agree the outcome is confirmed, otherwise `DISPUTED`.

---

## 6. Authentication

### Guest Session (Riot ID only)

1. `POST /api/auth/login` with `{ riotId, region }`
2. Server calls Riot API to verify the `riotId` and fetch the PUUID
3. Upserts a `User` record with `accountType: "guest"`
4. Sets an `HttpOnly` session cookie (`duelr_session`)

Guest accounts can use the lobby. They **cannot** pay for coaching.

### Full Account (email + password)

1. `POST /api/auth/register` with `{ riotId, region, email, password }`
2. Riot API verification + bcrypt hash stored
3. Verification email sent via Resend; account locked until email is confirmed
4. `POST /api/auth/login-email` — email + password login

Full accounts can use all features including coaching purchases and premium subscriptions.

### Admin Session

A separate JWT cookie (`duelr_admin`) signed with `SESSION_SECRET + { admin: true }`. 12-hour TTL.

Login via `POST /api/admin/auth` with `{ password: ADMIN_PASSWORD }`.

---

## 7. API Reference

All API routes are under `/api/`. Routes marked 🔒 require a user session; 🛡 require an admin session.

### 7.1 Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Guest login via Riot ID |
| `POST` | `/api/auth/register` | — | Full account registration |
| `POST` | `/api/auth/login-email` | — | Full account login |
| `POST` | `/api/auth/logout` | 🔒 | Clear session cookie |
| `GET` | `/api/auth/verify-email` | — | Consume email verification token |
| `POST` | `/api/auth/resend-verification` | — | Re-send verification email |

### 7.2 Lobby

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/lobby/public` | — | List all currently available players |
| `POST` | `/api/lobby/available` | 🔒 | Mark yourself available (refreshes TTL). Body: `myChampion`, `champName`, `champImage`, `eloBracket`, optional `acceptsType` (`"any"` \| `"melee"` \| `"ranged"`, default `"any"`), optional `vsChampions` (`string[]`, max 5 — preferred opponents) |
| `POST` | `/api/lobby/leave` | 🔒 | Remove yourself from the lobby |
| `POST` | `/api/lobby/challenge` | 🔒 | Challenge another player |
| `POST` | `/api/lobby/respond` | 🔒 | Accept or decline a challenge |
| `GET` | `/api/lobby/status` | 🔒 | Poll pending challenge / match state |
| `GET` | `/api/lobby/pending-match` | 🔒 | Get the user's current pending match |
| `POST` | `/api/lobby/group/create` | 🔒 | Create a 2v2 group |
| `POST` | `/api/lobby/group/join` | 🔒 | Join a 2v2 group |
| `POST` | `/api/lobby/group/leave` | 🔒 | Leave a 2v2 group |
| `GET` | `/api/lobby/players` | — | Internal player list (for SSE) |

**Match acceptance flow:**  
When both players accept, `respond` route creates a `Match` record and (if `DISCORD_BOT_TOKEN` is set) creates a temporary Discord voice channel. The invite URL is returned to both players.

### 7.4 Coaching

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/coaching/coaches` | — | Public list of approved, active coaches |
| `POST` | `/api/coaching/book` | 🔒 Full | Create a Stripe Checkout session for a coaching booking |
| `GET` | `/api/coaching/session/[id]` | 🔒 | Session details post-payment — returns coach Discord handle |
| `GET` | `/api/coaching/profile` | 🔒 | Caller's own coach profile (if any) |

**`POST /api/coaching/book` body:**
```json
{ "coachProfileId": "cm...", "durationMinutes": 60 }
```

**`GET /api/coaching/session/[id]` response:**
```json
{
  "session": {
    "id": "cm...",
    "status": "confirmed",
    "durationMinutes": 60,
    "totalCharged": 3000,
    "coachRiotId": "Faker#KR1",
    "coachDiscord": "faker#0001"
  }
}
```
`coachDiscord` is `null` if the coach has not set a Discord handle.  
Only the student who made the purchase can access this endpoint (403 otherwise).

### 7.5 Partners

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/partners` | — | List all active partner posts |
| `POST` | `/api/partners` | 🔒 | Create or replace the caller's post |
| `DELETE` | `/api/partners` | 🔒 | Delete the caller's post |

### 7.6 Admin

All admin routes require an active `duelr_admin` session cookie. 🛡

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/admin/auth` | Login — sets `duelr_admin` cookie |
| `DELETE` | `/api/admin/auth` | Logout |
| `GET` | `/api/admin/coaches` | List all coach profiles |
| `POST` | `/api/admin/coaches` | Create / upsert a coach profile |
| `PATCH` | `/api/admin/coaches/[id]` | Update coach fields |
| `DELETE` | `/api/admin/coaches/[id]` | Delete a coach profile |
| `GET` | `/api/admin/users` | List users (supports `?q=` search) |
| `PATCH` | `/api/admin/users` | Change a user's `accountType` |
| `POST` | `/api/admin/seed-test-user` | Dev-only: create a user without Riot API |

**`POST /api/admin/coaches` body:**
```json
{
  "riotId":            "Faker#KR1",
  "region":            "kr",
  "verifiedTier":      "CHALLENGER",
  "hourlyRateDollars": 50,
  "champions":         ["Zed", "Ahri"],
  "roles":             ["Mid"],
  "discordHandle":     "faker#0001",
  "contactEmail":      "coach@example.com",
  "bio":               "World champion. Will review your replays.",
  "availability":      ["weekday-evenings", "weekends"],
  "isApproved":        true
}
```

**`PATCH /api/admin/coaches/[id]` — any subset of:**
```json
{
  "isApproved":        true,
  "isActive":          true,
  "verifiedTier":      "GRANDMASTER",
  "hourlyRateDollars": 40,
  "champions":         ["Zed"],
  "roles":             ["Top", "Mid"],
  "discordHandle":     "coach#1234",
  "contactEmail":      "new@example.com",
  "bio":               "Updated bio"
}
```

### 7.7 Stripe Webhook

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/stripe/webhook` | Stripe signature | Handles Stripe events |

**Events handled:**

| Event | Action |
|---|---|
| `checkout.session.completed` (subscription) | Sets `user.isPremium = true`, stores `stripeSubscriptionId` |
| `checkout.session.completed` (payment) | Updates `CoachingSession.status → confirmed`; sends booking email to coach |
| `customer.subscription.deleted` | Sets `user.isPremium = false` |
| `invoice.payment_failed` | Sets `user.isPremium = false` |

The raw request body is verified against `STRIPE_WEBHOOK_SECRET` before any processing.

### 7.8 Misc

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/leaderboard` | — | Top players by win count |
| `POST` | `/api/match/[id]/report` | 🔒 | Self-report win/loss for a match |
| `GET` | `/api/me/rank` | 🔒 | Caller's rank / record |
| `GET` | `/api/champions` | — | Champion list from DDragon |
| `GET` | `/api/notifications/stream` | 🔒 | SSE — general notifications |
| `PATCH` | `/api/settings` | 🔒 | Update account settings |
| `GET` | `/api/riot/validate` | — | Validate a Riot ID via the Riot API |

---

## 8. Coaching System

### How it works

1. **Discovery** — `GET /api/coaching/coaches` returns all coaches with `isActive: true` and `isApproved: true`. Only public-safe fields are returned — `discordHandle` and `contactEmail` are **never** exposed here.

2. **Booking** — authenticated full-account user opens the `BookModal`, selects a duration (30 / 60 / 90 min), and clicks Pay. A `CoachingSession` record is created with `status: "pending_payment"` and the user is redirected to Stripe Checkout.

3. **Payment confirmation** — Stripe fires `checkout.session.completed` to `/api/stripe/webhook`. The webhook:
   - Updates `CoachingSession.status → "confirmed"`
   - Emails the coach at `contactEmail` (or `user.email` as fallback) with session details and their net payout

4. **Post-payment** — Stripe redirects the student to `/coaching?booked=<sessionId>`. `CoachBoard` fetches `GET /api/coaching/session/<id>` and displays the coach's Discord handle in a banner.

### Pricing

- Sessions are priced by `(hourlyRate × durationMinutes) / 60`
- Platform takes a flat **20%** cut; the rest is the coach's payout
- All amounts are stored and calculated in **cents**

### Adding a coach

Coaches are admin-managed only. Use the Admin Panel or `POST /api/admin/coaches`. The coach's `riotId` does not need a real Riot account — a fake PUUID is generated for admin-added coaches.

**Required fields:** `riotId`, `region`, `verifiedTier`, `hourlyRateDollars`  
**Optional:** `champions`, `roles`, `discordHandle`, `contactEmail`, `bio`, `availability`

Set `discordHandle` so students can contact the coach after payment. Set `contactEmail` for booking notification emails (if not set, the notification falls back to the coach user's login email, which may not exist for admin-added coaches).

---

## 9. Matchmaking & Lobby

### Open Lobby

Players broadcast themselves as available with a champion, ELO bracket, and two optional preference fields. Any other player can challenge them directly.

**Lobby entry fields:**
- `myChampion` — champion the user wants to play (required)
- `eloBracket` — one of `low | mid | high | elite | apex` (required)
- `acceptsType` — `"any"` | `"melee"` | `"ranged"` — what kind of opponent they'll accept (default `"any"`)
- `vsChampions` — up to 5 champion names the user *prefers* to face (optional; shown as "Preferred Matchups" on their card)

These two preference fields are independent — a player can have both `acceptsType: "melee"` and a list of preferred opponents at the same time.

**Real-time mechanics:**
- Presence is stored in Redis with a 1-hour TTL; players auto-expire if they close the tab
- Challenges are stored as Redis keys; both players get updates via SSE
- On mutual accept: a `Match` DB record is created and a Discord voice channel is provisioned
- **Public by default** — the lobby list (`GET /api/lobby/public` and `GET /api/lobby/players`) is readable without authentication, so visitors can see active lobbies as social proof. Posting or challenging requires a session.
- **Preferred matchups** — when posting a lobby, a player can list the champions they most want to face (`vsChampions`). These are shown on their lobby card to help opponents pick the practice they want; free accounts can list up to 5, Premium up to 50.

### 2v2 Mode

One player creates a group (ADC + Support slots); a second pair joins. Same matching logic but creates 4-player voice channels.

### ELO Brackets

| Key | Range |
|---|---|
| `low` | Iron – Gold |
| `mid` | Platinum – Emerald |
| `high` | Diamond |
| `elite` | Master – Grandmaster |
| `apex` | Challenger |

---

## 10. Premium Subscriptions

- Handled entirely by Stripe Checkout in `subscription` mode
- The `NEXT_PUBLIC_STRIPE_PRICE_ID` must be a **Price ID** (`price_…`), not a Product ID
- On successful payment: `user.isPremium = true` via webhook
- Premium users see no ad banner
- On subscription cancellation or payment failure: `isPremium` is set back to `false`

---

## 11. Discord Integration

**`lib/discord.ts`** exposes `createMatchVoiceChannel(name, userLimit)`:

1. Creates a GUILD_VOICE channel under `DISCORD_MATCH_CATEGORY_ID` (if set)
2. Grants `@everyone` VIEW_CHANNEL + CONNECT permissions so the invite works even in restricted categories
3. Creates an invite valid for 1 hour
4. Schedules automatic deletion of the channel after 1 hour via `setTimeout`
5. Returns `{ url, channelId }` or `null` if the bot is not configured

The bot needs **Manage Channels** permission in your server.

---

## 12. Email System

**`lib/email.ts`** provides two functions:

### `sendVerificationEmail(toEmail, token)`

Sends a branded HTML email with a 24-hour verification link. Required for full account activation.

### `sendCoachBookingEmail(opts)`

Sent to the coach when a student's payment is confirmed by the Stripe webhook.

**Includes:**
- Student Riot ID
- Session duration
- Gross payment, platform fee (20%), and **net payout** (highlighted)
- Reminder to keep Discord DMs open

Both functions return `false` silently if `RESEND_API_KEY` is not configured (so missing email config doesn't break the booking flow).

---

## 13. Admin Panel

Located at `/admin`. Protected by the `ADMIN_PASSWORD` environment variable.

### Coaches Tab

- List all coach profiles with status indicators (approved ●, active ●)
- Expand any row to see all fields including Discord handle, contact email, and bio
- Inline approve/deactivate toggles
- **Add Coach** modal — all fields including `discordHandle` and `contactEmail`
- **Edit Coach** modal — same fields, pre-populated
- Delete coach (irreversible)

### Users Tab

- Search by Riot ID or email
- Toggle `accountType` between `guest` and `full`
- See whether a user has a coach profile and its approval status

---

## 14. Frontend Components

### `CoachBoard`

Client component rendered on `/coaching`. Props:
- `userId: string | null` — used to decide whether clicking "Book" goes to checkout or login
- `bookedSessionId: string | null` — present in the URL after a Stripe redirect; triggers session detail fetch

**Post-payment banner** — fetches `GET /api/coaching/session/<id>` and displays:
- Session summary (duration, coach Riot ID)
- Coach's Discord handle in a styled block (if set), or falls back to "add in-client" message

### `CoachCard`

Displays one coach in the grid. Shows:
- Riot ID + verified tier badge
- Hourly rate
- Champion portraits (DDragon images, 36×36)
- Role badges with PNG icons
- Availability slots
- Bio

Does **not** expose `discordHandle` — that is only shown post-payment.

### `BookModal`

Inline modal for selecting session duration and confirming price before redirecting to Stripe.

### `LobbyBrowser`

Real-time lobby view. Publicly readable — no login required.

Props: `riotId: string | null`, `userId: string | null`

**When `userId` is null (guest):**
- The full player list is visible
- Player cards show a "Log in to play" CTA instead of a challenge button
- The "go available" form is replaced with a login prompt

**Lobby form (authenticated users):**
- **"I'll play against"** — 3-button toggle: Any / Any Melee / Any Ranged (`acceptsType`)
- **"Preferred Matchups"** — champion multi-select, up to 5 champions (`vsChampions`)
- These are independent; users can and should fill in both
- LocalStorage preserves selections across page loads

**Player cards** show the champion portrait, acceptsType label, and (if set) a "Preferred Matchups" row with up to 5 champion portrait circles.

Features copy-to-clipboard on all Riot IDs shown in match results.

---

## 15. Testing

### Running tests

```bash
# Ensure the dev server is running (or the runner will start it)
npm test
```

The runner reads env vars from `.env` and auto-starts `next dev` if needed.

### Environment variables for tests

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Enables all admin suite tests |
| `TEST_EMAIL` + `TEST_PASSWORD` | Enables full-account coaching and booking tests |
| `TEST_RIOT_ID` + `TEST_RIOT_REGION` | Enables guest-session tests |
| `TEST_URL` | Override base URL (default: `http://localhost:3000`) |

### Test suites

| File | Suite | What it tests |
|---|---|---|
| `01-validation.mjs` | Input Validation & Auth Guards | Bad inputs, missing fields, unauthenticated access to every protected endpoint |
| `02-admin.mjs` | Admin Panel | Auth, coach CRUD (including `discordHandle`/`contactEmail`), user management |
| `03-leaderboard.mjs` | Leaderboard | Public leaderboard shape |
| `04-partners.mjs` | Partner Finder | List, create, delete posts |
| `05-lobby.mjs` | Open Lobby | Availability, public list (no auth), leave, challenge, vsChampions accepted/truncated, player entry shape |
| `07-settings.mjs` | Settings | Account settings update guards |
| `08-coaching.mjs` | Coaching | Public list shape + privacy, booking guards, session detail endpoint |
| `09-email-verification.mjs` | Email Verification | Verification token flow |

### Test output

Results are printed to stdout and written to `test-results.txt` in the project root.

### Skip vs Fail

Tests that require external credentials or a live Stripe/Riot API key use `skip()` rather than failing. This keeps CI green even without full secrets configured.

---

## 16. Development Setup

```bash
# 1. Clone and install
git clone https://github.com/nicmills4/duelr.git
cd duelr
npm install

# 2. Set up environment
cp .env .env.local
# Edit .env.local with your DATABASE_URL, REDIS_URL, SESSION_SECRET, etc.

# 3. Sync DB schema
npx prisma db push

# 4. Start dev server
npm run dev
```

> **Important:** Always use `npx prisma db push` (not `--skip-generate`) in development so the Prisma client stays in sync with your schema. The production build runs `prisma generate && next build` automatically.

### Local services

- **PostgreSQL**: install locally or point `DATABASE_URL` at Railway
- **Redis**: `redis-server` or Docker — `docker run -p 6379:6379 redis`
- **Stripe CLI** (optional, for webhook testing): `stripe listen --forward-to localhost:3000/api/stripe/webhook`

---

## 17. Deployment

Duelr deploys automatically to **Railway** on every push to `main`.

### Build command

```
prisma generate && next build
```

`prisma generate` runs first so the Prisma client always matches `schema.prisma` before Next.js compiles.

### Schema migrations

Railway does **not** auto-run `prisma db push`. After adding columns to `schema.prisma`:

```bash
# Push schema changes to the production database
DATABASE_URL="<railway-url>" npx prisma db push --skip-generate
```

Or inline on Windows PowerShell:
```powershell
$env:DATABASE_URL="postgresql://...@kodama.proxy.rlwy.net:42663/railway"
npx prisma db push --skip-generate
```

> **Never** use `prisma migrate reset` against the production database — it drops all data.

### Required Railway environment variables

Set all variables from [Section 4](#4-environment-variables) in the Railway service's Variables tab. At minimum:

```
DATABASE_URL
REDIS_URL
SESSION_SECRET
NEXT_PUBLIC_APP_URL
ADMIN_PASSWORD
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
```

### Stripe webhook endpoint

Register `https://playduelr.gg/api/stripe/webhook` in the Stripe dashboard with these events:

- `checkout.session.completed`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
