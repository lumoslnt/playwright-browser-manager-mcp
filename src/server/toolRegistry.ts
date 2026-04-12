import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<any>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>();

  constructor(private readonly server: Server) {}

  upsert(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  list() {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async notifyChanged(): Promise<void> {
    const anyServer = this.server as any;
    if (typeof anyServer.sendToolListChanged === "function") {
      try {
        await anyServer.sendToolListChanged();
      } catch {
        // It is valid to register tools before stdio transport is connected.
      }
    }
  }
}
