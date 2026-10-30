import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { createLlm, defineTool } from "../src/llm";

test("without a key the LLM is the labelled offline mode", () => {
  const llm = createLlm({ model: "claude-sonnet-5-5" });
  assert.equal(llm.mode, "offline");
});

test("offline json() validates the deterministic answer", async () => {
  const llm = createLlm({ model: "x" });
  const out = await llm.json({ system: "", prompt: "", schema: z.object({ n: z.number() }), offline: () => ({ n: 1 }) });
  assert.deepEqual(out, { n: 1 });
  await assert.rejects(llm.json({ system: "", prompt: "", schema: z.object({ n: z.number() }), offline: () => ({ n: "x" }) as never }));
});

test("offline runTools runs tools with validation and stops at a terminal tool", async () => {
  const llm = createLlm({ model: "x" });
  const seen: string[] = [];
  const tools = [
    defineTool({ name: "search", description: "", input: z.object({ q: z.string() }), execute: async (i) => (seen.push(`search:${i.q}`), ["a"]) }),
    defineTool({ name: "propose", description: "", input: z.object({ id: z.string() }), terminal: true, execute: async (i) => (seen.push(`propose:${i.id}`), "ok") }),
  ];
  const result = await llm.runTools({
    system: "",
    prompt: "",
    tools,
    maxSteps: 5,
    offline: async (run) => {
      assert.deepEqual(await run("search", { q: 1 }), { error: "Invalid input for this tool.", issues: ["q: Invalid input: expected string, received number"] });
      await run("search", { q: "balls" });
      await run("propose", { id: "a" });
      await assert.rejects(run("search", { q: "more" }));
    },
  });
  assert.deepEqual(seen, ["search:balls", "propose:a"]);
  assert.equal(result.finished, true);
  assert.equal(result.mode, "offline");
});
