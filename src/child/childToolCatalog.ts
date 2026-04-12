import type { ChildToolInfo } from "../sessions/sessionTypes.js";

export function toChildToolCatalog(tools: Array<any>): ChildToolInfo[] {
  return tools.map((tool) => ({
    name: String(tool.name),
    description: typeof tool.description === "string" ? tool.description : undefined,
    inputSchema:
      tool.inputSchema && typeof tool.inputSchema === "object"
        ? (tool.inputSchema as Record<string, unknown>)
        : undefined,
  }));
}
