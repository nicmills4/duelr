import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createSubscriberClient, matchChannel } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.userId;
  const channel = matchChannel(userId);

  // SSE stream — kept alive until client disconnects or match is found
  const stream = new ReadableStream({
    start(controller) {
      const sub = createSubscriberClient();

      const send = (data: string) => {
        controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
      };

      // Heartbeat every 25s to keep the connection alive through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
        } catch {
          cleanup();
        }
      }, 25_000);

      function cleanup() {
        clearInterval(heartbeat);
        sub.unsubscribe(channel).catch(() => {});
        sub.quit().catch(() => {});
        try { controller.close(); } catch {}
      }

      sub.subscribe(channel, (err) => {
        if (err) {
          send(JSON.stringify({ error: "subscription failed" }));
          cleanup();
        }
      });

      sub.on("message", (_ch: string, message: string) => {
        send(message);
        cleanup();
      });

      sub.on("error", cleanup);
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
