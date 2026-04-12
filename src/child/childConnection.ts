import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ConnectedChild {
  client: Client;
  transport: StdioClientTransport;
}

export async function connectChild(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<ConnectedChild> {
  const transport = new StdioClientTransport({ command, args, env });
  const client = new Client({
    name: "playwright-browser-manager-mcp",
    version: "0.1.0",
  });
  await client.connect(transport);
  return { client, transport };
}
