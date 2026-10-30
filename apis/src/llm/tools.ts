import type { Tool, ToolRunner } from "./types";

/** Validates input with the tool's schema and runs it; shared by both modes. */
export function toolRunner(tools: Tool<never>[], onTerminal: () => void): ToolRunner {
  const byName = new Map(tools.map((t) => [t.name, t as unknown as Tool<unknown>]));
  return async (name, input) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`Unknown tool "${name}"`);
    const parsed = tool.input.safeParse(input);
    if (!parsed.success) {
      return { error: "Invalid input for this tool.", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    }
    const result = await tool.execute(parsed.data);
    if (tool.terminal) onTerminal();
    return result;
  };
}
