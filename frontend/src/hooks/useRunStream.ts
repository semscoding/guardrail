"use client";

// One interface for both the mock replay (today) and the real SSE stream (GET /api/runs/:id/stream).
// Every event is parsed with the shared contract before it reaches the UI.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RunEvent } from "@guardrail/apis/contracts";
import { mockRunEvents } from "@guardrail/apis/mocks";

import { EMPTY_RUN_VIEW, foldRunEvents, type RunView } from "@/lib/runView";

type Handlers = { onEvent: (event: RunEvent) => void; onError: (message: string) => void };

/** Starts streaming a run and returns a function that stops it. */
export type RunSource = (runId: string, handlers: Handlers) => () => void;

/** Replays the recorded mock events for a run, one every `intervalMs`. */
export function mockRunSource(intervalMs = 700): RunSource {
  return (runId, { onEvent, onError }) => {
    const events = mockRunEvents[runId];
    if (!events) {
      onError(`No recorded run "${runId}".`);
      return () => {};
    }
    const timers = events.map((raw, index) =>
      setTimeout(() => {
        const parsed = RunEvent.safeParse(raw);
        if (parsed.success) onEvent(parsed.data);
        else onError("A run event did not match the contract.");
      }, (index + 1) * intervalMs),
    );
    return () => timers.forEach(clearTimeout);
  };
}

/** The real stream. The server replays stored events first, so reconnecting is safe. */
export const sseRunSource: RunSource = (runId, { onEvent, onError }) => {
  const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);
  source.onmessage = (message) => {
    let data: unknown;
    try {
      data = JSON.parse(message.data);
    } catch {
      onError("The run stream sent something that is not JSON.");
      return;
    }
    const parsed = RunEvent.safeParse(data);
    if (!parsed.success) {
      onError("A run event did not match the contract.");
      return;
    }
    onEvent(parsed.data);
    if (parsed.data.type === "done") source.close();
  };
  source.onerror = () => {
    // EventSource reconnects by itself while the connection is merely interrupted.
    if (source.readyState === EventSource.CLOSED) onError("Lost the connection to the run stream.");
  };
  return () => source.close();
};

export type RunStreamState = "idle" | "streaming" | "done" | "error";

export function useRunStream(source: RunSource) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [state, setState] = useState<RunStreamState>("idle");
  const [streamError, setStreamError] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const reset = useCallback(() => {
    stopRef.current();
    setEvents([]);
    setState("idle");
    setStreamError(null);
  }, []);

  const start = useCallback(
    (runId: string) => {
      stopRef.current();
      setEvents([]);
      setStreamError(null);
      setState("streaming");
      stopRef.current = source(runId, {
        onEvent: (event) => {
          setEvents((prev) => (prev.some((e) => e.seq === event.seq) ? prev : [...prev, event]));
          if (event.type === "done") setState("done");
        },
        onError: (message) => {
          setStreamError(message);
          setState("error");
        },
      });
    },
    [source],
  );

  useEffect(() => () => stopRef.current(), []);

  const view: RunView = useMemo(() => (events.length ? foldRunEvents(events) : EMPTY_RUN_VIEW), [events]);

  return { view, state, streamError, start, reset };
}
