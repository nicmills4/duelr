/**
 * Persistent SSE stream for real-time lobby notifications.
 *
 * Unlike /api/queue/stream (which closes after a match), this stream
 * stays open and delivers multiple typed events:
 *   { type: "challenge", ... }          — incoming challenge
 *   { type: "challenge_accepted", ... } — challenger accepted
 *   { type: "challenge_declined", ... } — challenger declined
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createSubscriberClient, notificationChannel, redis } from "@/lib/redis";
import { leaveLobby, lobbyKey } from "@/lib/lobby";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId  = session.userId;
  const channel = notificationChannel(userId);

  // If the user is already in the lobby (e.g. page refresh), compute remaining
  // TTL so the server can clean them up even if the client tab goes dead.
  const existingTtl = await redis.ttl(lobbyKey(userId));

  let doCleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const sub = createSubscriberClient();
      let cleanedUp = false;
      let expiryTimer: ReturnType<typeof setTimeout> | null = null;

      const send = (data: string) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        } catch {
          cleanup();
        }
      };

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
        } catch {
          cleanup();
        }
      }, 25_000);

      function cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
        clearInterval(heartbeat);
        sub.unsubscribe(channel).catch(() => {});
        sub.quit().catch(() => {});
        try { controller.close(); } catch {}
      }

      doCleanup = cleanup;

      // Server-side expiry backup: fires when the lobby Redis key would expire.
      // Handles page-refresh / dead-tab cases where the client timer is lost.
      // For a fresh session (existingTtl <= 0) the client-side timer takes over.
      if (existingTtl > 0) {
        expiryTimer = setTimeout(async () => {
          expiryTimer = null;
          await leaveLobby(userId).catch(() => {});
          // Publish so the SSE sends the event to the client if still connected
          send(JSON.stringify({ type: "session_expired" }));
          cleanup();
        }, existingTtl * 1000);
      }

      sub.subscribe(channel, (err) => {
        if (err) { send(JSON.stringify({ error: "subscription failed" })); cleanup(); }
      });

      sub.on("message", (_ch: string, message: string) => {
        send(message);
        // Close after terminal events so the connection doesn't linger
        try {
          const parsed = JSON.parse(message);
          if (parsed.type === "challenge_accepted" || parsed.type === "session_expired") cleanup();
        } catch {}
      });

      sub.on("error", cleanup);
    },

    cancel() {
      doCleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection:      "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
