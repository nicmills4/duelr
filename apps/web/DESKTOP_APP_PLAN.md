# Duelr Desktop App — Implementation Plan

A native desktop companion that does everything the website does, plus deep integration
with the League of Legends client (LCU API) and Discord. No separate backend — the app
talks to the same Duelr API the website uses.

---

## Why a Desktop App?

| Pain point on web | Desktop solution |
|---|---|
| Manually select champion in lobby form | Auto-read from champ select in real time |
| Copy opponent's Riot ID, add them manually | One-click friend request via LCU |
| Follow instructions to create custom game | One-click custom lobby + invite via LCU |
| Self-report match result | Auto-detect win/loss from LCU end-of-game event |
| Click a link to join Discord voice channel | Auto-join the channel when match is found |
| Browser notifications miss the user in-game | Native OS toast + system tray alerts |
| No presence info visible to friends | Discord Rich Presence ("Looking for 1v1 · Lobby") |

---

## Tech Stack

### Framework: Electron + React
Electron is the right call here for three reasons:
1. The entire frontend (components, hooks, styles) is reusable as-is
2. The Duelr backend API stays unchanged — the app is just a different client
3. Electron has mature packages for both LCU (HTTP/WebSocket) and Discord RPC

Alternative considered: **Tauri** (Rust backend, smaller binary). Rejected because
the LCU integration would need to be written in Rust rather than reusing existing
TypeScript knowledge, and the benefits (smaller bundle) aren't worth the rewrite cost.

### Core packages

| Package | Purpose |
|---|---|
| `electron` | App shell, native OS access |
| `electron-builder` | Packaging — NSIS installer for Windows, DMG for macOS |
| `electron-updater` | Auto-update via GitHub Releases |
| `discord-rpc` | Discord Rich Presence over local IPC |
| `electron-store` | Persistent local config (auth token, preferences) |
| `node-fetch` / built-in `fetch` | LCU API calls (need `rejectUnauthorized: false` for self-signed cert) |
| `ws` | WebSocket connection to LCU event stream |
| `chokidar` | Watch the lockfile for League launch/exit |

Reuse as-is from the web app: all React components, Tailwind config, lib utilities
that don't touch Next.js server APIs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                  │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  LCU Manager │  │ Discord RPC  │  │  Tray / Notif │  │
│  │              │  │  Manager     │  │  Manager      │  │
│  │ lockfile watch│  │              │  │               │  │
│  │ HTTP + WS    │  │ Rich Presence│  │ OS toasts     │  │
│  │ to League    │  │ auto-join VC │  │ minimize to   │  │
│  │ client       │  │              │  │ tray          │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │           │
│         └────────────┬────┘                   │           │
│                      │  IPC (contextBridge)   │           │
└──────────────────────┼────────────────────────┼───────────┘
                       │                        │
┌──────────────────────▼────────────────────────▼───────────┐
│                 Electron Renderer Process                   │
│              (React app — reused from web)                  │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│  │ LobbyBrowser│  │  CoachBoard │  │  LCU Status Bar    │ │
│  │             │  │             │  │  "● League Connected│ │
│  │ champion    │  │             │  │   Zed · Gold II"   │ │
│  │ auto-fill   │  │             │  └────────────────────┘ │
│  └─────────────┘  └─────────────┘                          │
│                                                             │
│  All existing components work unchanged.                    │
│  New: window.duelr.lcu.* and window.duelr.discord.* APIs   │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼ HTTPS
        ┌──────────────────────────────┐
        │    Duelr API (unchanged)     │
        │    playduelr.gg/api/*        │
        │                              │
        │  Same endpoints the web      │
        │  app uses. No backend work   │
        │  needed to support desktop.  │
        └──────────────────────────────┘
```

---

## LCU Integration Deep Dive

### How the LCU API works

The League client runs a local HTTPS server on a random port. Credentials are written
to a **lockfile** at:
- Windows: `%LOCALAPPDATA%\Riot Games\League of Legends\lockfile`
- macOS: `~/Library/Application Support/Riot Games/League of Legends/lockfile`

Lockfile format (colon-delimited):
```
LeagueClient:{pid}:{port}:{password}:{protocol}
```

All requests use HTTP Basic Auth: username `riot`, password from lockfile.
The cert is self-signed — set `rejectUnauthorized: false`.

### Event stream

Connect to `wss://127.0.0.1:{port}/` with the same Basic Auth credentials.
Subscribe to events by sending:
```json
[5, "OnJsonApiEvent"]
```
Events arrive as:
```json
[8, "OnJsonApiEvent", { "eventType": "Update", "uri": "/lol-gameflow/v1/gameflow-phase", "data": "ChampSelect" }]
```

### Key LCU endpoints used

| Endpoint | What we use it for |
|---|---|
| `GET /lol-summoner/v1/current-summoner` | Auto-populate Riot ID + PUUID on login |
| `GET /lol-ranked/v1/current-ranked-stats` | Read current rank → suggest ELO bracket |
| `GET /lol-gameflow/v1/gameflow-phase` | Detect lobby / champ-select / in-game / end-of-game |
| `GET /lol-champ-select/v1/session` | Read locked-in champion in champ select → auto-fill lobby form |
| `POST /lol-chat/v1/friend-requests` | Send friend request to opponent after match found |
| `POST /lol-lobby/v1/lobby` | Create a custom 1v1 or 2v2 lobby |
| `POST /lol-lobby/v1/lobby/invitations` | Invite opponent to the custom lobby |
| `GET /lol-end-of-game/v1/eog-stats-block` | Read win/loss after game ends → auto-report result |

### Game phase state machine

```
None → Lobby → ChampSelect → InProgress → EndOfGame → None
              ↑ auto-fill champion                ↑ auto-report result
```

---

## Discord Integration Deep Dive

### Rich Presence
Use the `discord-rpc` package to connect to the Discord desktop app via local IPC.
Requires creating a Discord application and getting a client ID.

States to show:

| Duelr state | Discord status |
|---|---|
| App open, no lobby | "Browsing Duelr" |
| Marked available in lobby | "Looking for 1v1 — {champName}" · timer |
| Challenge sent/received | "Waiting on challenge..." |
| Match accepted, in lobby | "Setting up custom game vs {opponent}" |
| In-game (detected via LCU) | "In a 1v1 — {champName} vs {vsChamp}" · timer |
| Match ended | "GG — reviewing results" |

Include two optional buttons on the Rich Presence card:
- **"Find a Match"** → opens playduelr.gg/lobby
- **"Join Lobby"** → deep link if the user is currently available (links to their profile)

### Voice channel auto-join
When the Duelr backend creates a Discord voice channel and returns the invite URL,
the desktop app opens it via Discord's protocol handler:
```
discord://-/channels/{guildId}/{channelId}
```
This opens Discord (which is already running since we have RPC connected) and
auto-joins the voice channel — no browser needed, no link to click.

---

## Implementation Phases

### Phase 0 — Project Setup (Week 1)
- [ ] Scaffold Electron + React project, import existing components
- [ ] Set up `electron-builder` for Windows (primary target) + macOS
- [ ] Configure `contextBridge` with a `window.duelr` API surface
- [ ] Auth flow: reuse existing login/register UI, store session token in `electron-store`
- [ ] Verify all existing pages render and API calls work through Electron
- [ ] System tray icon with "Open" / "Quit" menu items
- [ ] Auto-launch on system startup toggle in settings

### Phase 1 — LCU Connection (Week 2)
- [ ] Lockfile watcher: detect League launch and exit
- [ ] LCU HTTP client with Basic Auth + `rejectUnauthorized: false`
- [ ] WebSocket event listener for `OnJsonApiEvent`
- [ ] Status bar component: `● League Connected — {summonerName} · {rank}` or `○ League Not Running`
- [ ] Expose current summoner + rank to renderer via IPC
- [ ] Auto-suggest ELO bracket based on current rank on lobby form load

### Phase 2 — Lobby LCU Features (Week 3)
- [ ] Listen for `ChampSelect` phase → read locked champion → auto-fill "I'm playing" field
- [ ] After match accepted: "Add Friend" button → calls `POST /lol-chat/v1/friend-requests`
- [ ] After match accepted: "Create Custom Lobby" button → `POST /lol-lobby/v1/lobby` + send invite
- [ ] Show in-app confirmation when invite is sent vs waiting for opponent to accept

### Phase 3 — Auto Match Reporting (Week 4)
- [ ] Listen for `EndOfGame` phase event
- [ ] Fetch `/lol-end-of-game/v1/eog-stats-block` → determine win/loss
- [ ] Cross-reference active Duelr match record → auto-call `POST /api/match/{id}/report`
- [ ] Show "Result reported automatically" toast to user
- [ ] Fallback: if auto-report fails or no active match, fall back to manual report flow

### Phase 4 — Discord Integration (Week 5)
- [ ] Register Discord application, get client ID
- [ ] Connect `discord-rpc` on app start; reconnect gracefully if Discord not running
- [ ] Implement Rich Presence state machine (tied to lobby/match state)
- [ ] Voice channel auto-join via `discord://` protocol handler on match accepted
- [ ] Settings toggle: enable/disable Rich Presence, enable/disable auto-join

### Phase 5 — Notifications + Polish (Week 6)
- [ ] Native OS notifications (replace browser Notification API calls) via `new Notification` in main process
- [ ] Tray badge / icon state: default, "available", "challenge incoming" (blinking or different icon)
- [ ] Minimize to tray on close (with preference to quit instead)
- [ ] Keyboard shortcut to bring window to foreground from in-game (configurable, default `Ctrl+Shift+D`)
- [ ] App settings page: startup behavior, notification preferences, Discord RPC toggle

### Phase 6 — Distribution (Week 7)
- [ ] Windows: NSIS installer via `electron-builder`; code-sign with EV certificate to avoid SmartScreen warnings
- [ ] macOS: DMG + notarization (Apple requires this for Gatekeeper)
- [ ] Auto-update via `electron-updater` pointed at GitHub Releases
- [ ] GitHub Actions CI: build + draft release on tag push
- [ ] Download page on playduelr.gg with Windows/macOS badges

---

## Key Technical Challenges

### 1. Riot's Third-Party App Policy
The LCU API is **not officially supported** for distributed apps without Riot approval.
- Personal use tools are generally tolerated
- Distributing commercially or at scale requires going through the [Riot Games Third-Party App Policy](https://www.riotgames.com/en/news/policy-update-third-party-apps-and-services)
- Riot's Overwolf program is an alternative: approved overlay apps
- **Recommendation:** Apply for the Riot developer program early; self-distribute in beta while approval is pending

### 2. LCU API Stability
The LCU API changes with patches and is not versioned. Breaking changes happen.
- Subscribe to community trackers (e.g. loldevs Discord, Rift Explorer)
- Wrap LCU calls in try/catch with graceful degradation — all LCU features should be "nice to have", not required
- Log failed LCU calls to a local file for debugging

### 3. Self-Signed Certificate
LCU uses a self-signed HTTPS cert. Setting `rejectUnauthorized: false` works but is
a security smell. Mitigation: trust only `127.0.0.1`; validate that the port comes
from the lockfile; never send this client to any external host.

### 4. Windows SmartScreen
Unsigned executables trigger a SmartScreen warning. An **EV (Extended Validation)
code-signing certificate** ($200-400/yr) bypasses this immediately. Standard OV certs
require reputation build-up (months of installs).

### 5. Anti-cheat (Vanguard)
Riot's Vanguard anti-cheat runs at kernel level but does **not** interfere with the
LCU local HTTP/WebSocket API. This is a common concern but not an issue in practice —
the LCU is a documented local interface, and dozens of approved tools use it.

### 6. macOS LCU Path
The lockfile path differs on macOS. Abstract the path detection behind an OS check:
```ts
const lockfilePath = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA!, 'Riot Games', 'League of Legends', 'lockfile')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Riot Games', 'League of Legends', 'lockfile');
```
Note: League client behavior on macOS has historically lagged behind Windows.

---

## What Changes in the Backend (Duelr API)

**Almost nothing.** The desktop app is a client, not a server.

The only additions worth considering:
1. `GET /api/me/pending-match` already exists — the desktop app polls this to know when to trigger auto-reporting
2. Optionally add a `source: "desktop"` field to lobby/available POST so analytics can distinguish desktop vs web traffic
3. If we want to support "auto-join Discord voice" server-side, the match respond endpoint already returns `voiceChannelUrl` — desktop just handles it differently (protocol handler vs browser link)

---

## Prioritized MVP Scope (First Release)

If the goal is to ship something fast, cut scope to this:

1. **Electron shell** with all existing web pages working (Phase 0)
2. **LCU champion auto-fill** — single biggest UX win (Phase 2 partial)
3. **Native OS notifications** — challenges and match found without browser focus (Phase 5 partial)
4. **Discord auto-join voice** — removes the biggest friction point post-match (Phase 4 partial)

Everything else (auto-reporting, friend requests, Rich Presence) can ship in v1.1.

---

## File Structure (New Repo)

```
duelr-desktop/
  electron/
    main.ts              Entry point, BrowserWindow setup
    preload.ts           contextBridge — exposes window.duelr.*
    lcu/
      lockfile.ts        Lockfile watcher + parser
      client.ts          LCU HTTP client (node-fetch, ignore SSL)
      events.ts          WebSocket event subscriber
      gameflow.ts        Game phase state machine
      champ-select.ts    Champion read from champ-select session
      friend-request.ts  Send friend request
      lobby.ts           Create custom lobby + invite
      end-of-game.ts     Read EOG stats block
    discord/
      rpc.ts             discord-rpc connection + Rich Presence
      voice.ts           Auto-join via discord:// protocol
    tray.ts              System tray icon + menu
    updater.ts           electron-updater setup
    notifications.ts     Native OS notification wrappers
  renderer/              (symlink or copy of web app src)
    components/          All existing React components
    app/                 Adapted Next.js pages (or React Router equivalent)
    lib/                 All existing lib utilities
  package.json
  electron-builder.yml
```

---

## Timeline Summary

| Phase | Focus | Duration |
|---|---|---|
| 0 | Electron shell + auth + web app embedded | Week 1 |
| 1 | LCU connection, status bar, rank detection | Week 2 |
| 2 | Champion auto-fill, friend request, custom lobby | Week 3 |
| 3 | Auto match result reporting from EOG event | Week 4 |
| 4 | Discord RPC + voice channel auto-join | Week 5 |
| 5 | Native notifications, tray behavior, polish | Week 6 |
| 6 | Installers, code signing, auto-update, CI | Week 7 |

**MVP (Phases 0 + 2 partial + 4 partial + 5 partial):** ~3 weeks to something shippable.
