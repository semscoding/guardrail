// The SSE body for GET /api/runs/:id/stream: stored events first (replay from seq 1), then live events
// from the in-process bus, a heartbeat comment every 15 s, and close once the run is done.

import type { RunEvent } from "@guardrail/apis/contracts";
import { listRunEvents } from "@guardrail/database";

import { subscribeRunEvents } from "./runs";

const encoder = new TextEncoder();
const frame = (event: RunEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

export function runEventStream(
  runId: string,
  options: { signal?: AbortSignal; heartbeatMs?: number } = {},
): ReadableStream<Uint8Array> {
  let cleanup = () => {};

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastSeq = 0;
      let replaying = true;
      const buffered: RunEvent[] = [];

      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };

      const send = (event: RunEvent) => {
        if (closed || event.seq <= lastSeq) return;
        lastSeq = event.seq;
        controller.enqueue(frame(event));
      };

      // Subscribe before reading the store so no event falls between replay and live.
      const unsubscribe = subscribeRunEvents(runId, (event) => {
        if (replaying) buffered.push(event);
        else {
          send(event);
          if (event.type === "done") close();
        }
      });
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, options.heartbeatMs ?? 15_000);
      const onAbort = () => close();
      options.signal?.addEventListener("abort", onAbort);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
        options.signal?.removeEventListener("abort", onAbort);
      };

      try {
        const stored = await listRunEvents(runId);
        for (const event of stored) send(event);
        for (const event of buffered.sort((a, b) => a.seq - b.seq)) send(event);
        replaying = false;
        // A finished run (its latest event is `done`) replays and closes.
        const latest = [...stored, ...buffered].sort((a, b) => b.seq - a.seq)[0];
        if (latest?.type === "done") close();
      } catch (err) {
        cleanup();
        controller.error(err);
      }
    },
    cancel() {
      cleanup();
    },
  });
}
