import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function extractJsonText(result: any): any {
  const text = result?.content?.find((c: any) => c?.type === "text")?.text;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
  });

  const client = new Client({ name: "smoke-test", version: "0.1.0" });
  await client.connect(transport);

  try {
    const tools = await client.listTools();
    const names = (tools.tools ?? []).map((t) => t.name);
    console.log("tool count:", names.length);
    console.log("has create_session:", names.includes("create_session"));
    console.log("has browser_navigate:", names.includes("browser_navigate"));

    if (!names.includes("create_session")) {
      throw new Error("create_session tool not discovered");
    }
    if (!names.includes("browser_navigate")) {
      throw new Error("browser_navigate tool not discovered");
    }

    const createResult = await client.callTool({
      name: "create_session",
      arguments: {
        name: `smoke-${Date.now()}`,
        browserType: "chrome",
        headless: true,
        profile: `smoke-profile-${Date.now()}`,
      },
    });

    const created = extractJsonText(createResult);
    const sessionId = created.sessionId as string;
    if (!sessionId) {
      throw new Error(`No sessionId returned from create_session: ${JSON.stringify(created)}`);
    }
    console.log("created session:", sessionId);

    const navResult = await client.callTool({
      name: "browser_navigate",
      arguments: {
        sessionId,
        url: "https://example.com",
      },
    });
    console.log("navigate result:", JSON.stringify(navResult).slice(0, 200));

    const snapResult = await client.callTool({
      name: "browser_snapshot",
      arguments: {
        sessionId,
      },
    });
    console.log("snapshot result exists:", Array.isArray((snapResult as any)?.content));

    const missingSessionResult = await client.callTool({
      name: "browser_navigate",
      arguments: {
        url: "https://example.com",
      },
    });
    console.log("missing sessionId response:", JSON.stringify(missingSessionResult).slice(0, 200));

    const closeResult = await client.callTool({
      name: "close_session",
      arguments: { sessionId },
    });
    console.log("close session result:", JSON.stringify(closeResult).slice(0, 200));

    console.log("SMOKE TEST PASSED");
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED");
  console.error(err);
  process.exit(1);
});
