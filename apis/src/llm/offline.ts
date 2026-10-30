import type { Llm } from "./types";
import { toolRunner } from "./tools";

/** Deterministic stand-in used when no LLM key is configured. Never calls a model. */
export function offlineLlm(): Llm {
  return {
    mode: "offline",
    model: "offline-test-mode",
    async json({ offline, schema }) {
      return schema.parse(await offline());
    },
    async runTools({ tools, offline, maxSteps }) {
      let finished = false;
      let steps = 0;
      const run = toolRunner(tools, () => (finished = true));
      await offline(async (name, input) => {
        if (finished || steps >= maxSteps) throw new Error("Tool loop already finished");
        steps += 1;
        return run(name, input);
      });
      return { steps, finished, mode: "offline" };
    },
  };
}
