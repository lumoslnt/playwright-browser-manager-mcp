import pino from "pino";

export const logger = pino({
  name: "playwright-browser-manager-mcp",
  level: process.env.PSMCP_LOG_LEVEL ?? "info",
});
