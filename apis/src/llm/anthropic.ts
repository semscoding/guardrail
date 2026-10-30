import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { Llm } from "./types";
import { toolRunner } from "./tools";

const inputSchema = (schema: z.ZodType) => {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Messages.Tool.InputSchema;
};

/** Claude via the Messages API. Predictability comes from tight prompts, schemas and server-side checks. */
export function anthropicLlm(apiKey: string, model: string): Llm {
  const client = new Anthropic({ apiKey });

  return {
    mode: "anthropic",
    model,

    async json({ system, prompt, schema, maxTokens = 1500 }) {
      // Forcing a single "answer" tool gives structured output that we then validate ourselves.
      const answerTool: Anthropic.Messages.Tool = {
        name: "answer",
        description: "Give your answer in this exact structure.",
        input_schema: inputSchema(schema),
      };
      const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages,
          tools: [answerTool],
          tool_choice: { type: "tool", name: "answer" },
        });
        const call = res.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
        const parsed = schema.safeParse(call?.input);
        if (parsed.success) return parsed.data;
        if (!call) break;
        messages.push(
          { role: "assistant", content: res.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: call.id,
                is_error: true,
                content: `Invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Try again.`,
              },
            ],
          },
        );
      }
      throw new Error("The model did not return a valid structured answer.");
    },

    async runTools({ system, prompt, tools, maxSteps }) {
      let finished = false;
      let steps = 0;
      const run = toolRunner(tools, () => (finished = true));
      const specs: Anthropic.Messages.Tool[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: inputSchema(t.input as z.ZodType),
      }));
      const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];

      while (!finished && steps < maxSteps) {
        const res = await client.messages.create({
          model,
          max_tokens: 1500,
          system,
          messages,
          tools: specs,
        });
        const calls = res.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
        if (calls.length === 0) break;
        messages.push({ role: "assistant", content: res.content });
        const results: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const call of calls) {
          if (finished || steps >= maxSteps) break;
          steps += 1;
          try {
            const output = await run(call.name, call.input);
            results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(output) });
          } catch (err) {
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              is_error: true,
              content: err instanceof Error ? err.message : "Tool failed",
            });
          }
        }
        messages.push({ role: "user", content: results });
      }
      return { steps, finished, mode: "anthropic" };
    },
  };
}
