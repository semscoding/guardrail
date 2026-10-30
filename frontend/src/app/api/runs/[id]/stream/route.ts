// SSE can't go through route() (that wraps JSON); errors before the stream starts use the same envelope.

import { log, statusOf, toAppError } from "@guardrail/backend";
import { getRunById, runEventStream } from "@guardrail/services/agent";

export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]/stream">) {
  const { id } = await ctx.params;
  try {
    const run = await getRunById(id);
    if (!run) {
      return Response.json({ error: { code: "NOT_FOUND", message: `No run "${id}".` } }, { status: 404 });
    }
    return new Response(runEventStream(id, { signal: request.signal }), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const error = toAppError(err);
    log.error("runs.stream", { runId: id, code: error.code, cause: err instanceof Error ? err.message : undefined });
    return Response.json({ error }, { status: statusOf(error) });
  }
}
