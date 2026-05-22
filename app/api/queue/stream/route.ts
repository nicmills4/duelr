import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createSubscriberClient, matchChannel } from "@/lib/redis";
import { leaveQueue } from "@/lib/matchmaking";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.userId;
  const channel = matchChannel(userId);

  // Hoisted so the ReadableStream cancel handler can reach it
  // even if called before start() finishes setting it up.
  let doCleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const sub = createSubscriberClient();
      let matched = false;
      let cleanedUp = false;

      const send = (data: string) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        } catch {}
      };

      // Heartbeat every 25s — keeps the connection alive through proxies,
      // and detects a dead client when enqueue throws.
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

        // If the client disconnected without receiving a match, pull them
        // out of the Redis queue so they don't become a ghost entry.
        if (!matched) {
          leaveQueue(userId).catch(() => {});
        }

        try { controller.close(); } catch {}
      }

      doCleanup = cleanup;

      sub.subscribe(channel, (err) => {
        if (err) {
          send(JSON.stringify({ error: "subscription failed" }));
          cleanup();
        }
      });

      sub.on("message", (_ch: string, message: string) => {
        matched = true;
        send(message);
        cleanup();
      });

      sub.on("error", cleanup);
    },

    // Called immediately when the client closes the connection —
    // far faster than waiting for the next heartbeat to fail.
    cancel() {
      doCleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
