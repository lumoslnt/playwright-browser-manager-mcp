#!/usr/bin/env node

import { loadConfig } from "./infra/config.js";
import { logger } from "./infra/logger.js";
import { startMcpServer } from "./server/mcpServer.js";

async function main(): Promise<void> {
  const config = loadConfig();
  await startMcpServer(config);
}

main().catch((err) => {
  logger.error({ err }, "Server startup failed");
  process.exit(1);
});
