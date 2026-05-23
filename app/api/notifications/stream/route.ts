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
import { createSubscriberClient, notificationChannel } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const channel = notificationChannel(session.userId);
  let doCleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const sub = createSubscriberClient();
      let cleanedUp = false;

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
        clearInterval(heartbeat);
        sub.unsubscribe(channel).catch(() => {});
        sub.quit().catch(() => {});
        try { controller.close(); } catch {}
      }

      doCleanup = cleanup;

      sub.subscribe(channel, (err) => {
        if (err) { send(JSON.stringify({ error: "subscription failed" })); cleanup(); }
      });

      sub.on("message", (_ch: string, message: string) => {
        send(message);
        // Close after a terminal event so the connection doesn't linger
        try {
          const parsed = JSON.parse(message);
          if (parsed.type === "challenge_accepted") cleanup();
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
