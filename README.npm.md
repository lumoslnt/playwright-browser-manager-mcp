# Playwright Browser Manager MCP

English | [简体中文](#简体中文)

A Playwright MCP browser manager for multi-session browser automation.

It solves the common pain points of using Playwright in multi-agent or multi-session environments:

- browser profile conflicts (`Browser is already in use`)
- stale browser/page/context handles after browser closure (`Target page, context or browser has been closed`)
- manual management of persistent vs isolated browser state
- reconnect/restart logic leaking into the caller

This package adds a management layer on top of `@playwright/mcp` with:

- explicit browser sessions via `sessionId`
- profile modes: `persistent`, `isolated`, `fallback-isolated`
- lazy browser launch
- managed session lifecycle
- auto-healing retry for safe read-only browser calls

## When to use it

Use this package if:

- multiple agents, threads, or sessions need separate browser state
- some sessions should keep login state while others should stay isolated
- you want fewer manual reconnect / restart steps after browser crashes
- plain Playwright MCP becomes awkward in multi-session workflows

## Quick Start

### Run the server

```bash
npx -y @linatang/playwright-browser-manager-mcp@latest
```

### Add it to your MCP client

```json
{
  "mcpServers": {
    "playwright-browser-manager": {
      "command": "npx",
      "args": ["-y", "@linatang/playwright-browser-manager-mcp@latest"]
    }
  }
}
```

### Minimal flow

1. Call `create_session`
2. Save the returned `sessionId`
3. Call any routed browser tool with that `sessionId`

Example:

- `create_session(name="work", profileMode="persistent")`
- `browser_navigate(sessionId="...", url="https://example.com")`
- `browser_snapshot(sessionId="...")`

## Key Features

- **Explicit `sessionId` routing** — deterministic multi-session automation
- **Profile modes** — persistent, isolated, or fallback-isolated browser state
- **Lazy launch** — start browser only when needed
- **Auto-healing recovery** — relaunch and retry once for safe read-only browser calls after browser closure
- **Managed session lifecycle** — create, list, close, and restart sessions

## Profile Modes

| Mode | Best for |
|---|---|
| `persistent` | keep login state, cookies, cache |
| `isolated` | sandboxed or parallel browser tasks |
| `fallback-isolated` | prefer persistent state, but fall back if the profile is locked |

## Safe Auto-Retry

Automatic recovery currently applies to these safer read-only tools:

- `browser_navigate`
- `browser_snapshot`
- `browser_take_screenshot`
- `browser_console_messages`
- `browser_network_requests`
- `browser_wait_for`

Mutating tools such as click, type, upload, drag, and submit-like interactions are not transparently retried.

## Manager Tools

- `create_session`
- `list_sessions`
- `close_session`
- `restart_session`
- `list_local_profiles`

All routed Playwright browser tools require `sessionId`.

## Install

### Global install

```bash
npm install -g @linatang/playwright-browser-manager-mcp@latest
```

### Local development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Environment Variables

- `PSMCP_PROFILE_ROOT`
- `PSMCP_DEFAULT_BROWSER`
- `PSMCP_LOG_LEVEL`
- `PSMCP_HEADLESS_DEFAULT`
- `PSMCP_BROWSER_EXECUTABLE`
- `PSMCP_PLAYWRIGHT_MCP_COMMAND`
- `PSMCP_PLAYWRIGHT_MCP_ARGS`

## Troubleshooting

- **`broken` session** — call `restart_session`
- **`profile_locked` session** — use `profileMode: "fallback-isolated"`
- **startup probe failure** — verify `npx` and `@playwright/mcp` are available
- **browser launch failure** — check profile permissions or set `PSMCP_BROWSER_EXECUTABLE`

## License

MIT

---

# 简体中文

一个面向多 session 浏览器自动化的 Playwright MCP browser manager。

它主要解决在多 agent / 多 session 场景下使用 Playwright 时最常见的几个问题：

- 浏览器 profile 冲突（`Browser is already in use`）
- 浏览器关闭后，page/context 句柄失效（`Target page, context or browser has been closed`）
- 调用方需要自己管理 persistent / isolated 浏览器状态
- reconnect / restart 逻辑泄漏到 agent 或业务层

这个包在 `@playwright/mcp` 之上增加了一层管理能力，包括：

- 用 `sessionId` 显式管理浏览器 session
- 支持 `persistent`、`isolated`、`fallback-isolated` 三种 profile 模式
- 按需启动浏览器（lazy launch）
- 受管 session 生命周期
- 对安全只读浏览器调用提供自动恢复重试

## 什么时候该用它

如果你有这些需求，就适合用这个包：

- 多个 agent、thread 或 session 需要各自独立的浏览器状态
- 有些 session 要保留登录态，有些要保持隔离
- 你希望浏览器崩掉之后尽量少手动 reconnect / restart
- 原生 Playwright MCP 在多 session 场景下已经开始变得别扭

## 快速开始

### 启动服务

```bash
npx -y @linatang/playwright-browser-manager-mcp@latest
```

### 在 MCP client 中配置

```json
{
  "mcpServers": {
    "playwright-browser-manager": {
      "command": "npx",
      "args": ["-y", "@linatang/playwright-browser-manager-mcp@latest"]
    }
  }
}
```

### 最小使用流程

1. 调用 `create_session`
2. 保存返回的 `sessionId`
3. 所有浏览器工具调用都带上这个 `sessionId`

示例：

- `create_session(name="work", profileMode="persistent")`
- `browser_navigate(sessionId="...", url="https://example.com")`
- `browser_snapshot(sessionId="...")`

## 核心特性

- **显式 `sessionId` 路由** — 多 session 自动化更确定
- **Profile 模式** — 支持 persistent / isolated / fallback-isolated
- **Lazy launch** — 需要时才启动浏览器
- **自动恢复** — 浏览器意外关闭后，对安全只读调用自动重试一次
- **受管生命周期** — 显式创建、列出、关闭、重启 session

## Profile 模式

| 模式 | 适合场景 |
|---|---|
| `persistent` | 保留登录态、cookie、缓存 |
| `isolated` | 沙盒任务、并行任务、一次性浏览器会话 |
| `fallback-isolated` | 优先使用 persistent，但 profile 被占用时自动回退 |

## 自动恢复的安全重试范围

目前自动恢复只适用于更安全的只读工具：

- `browser_navigate`
- `browser_snapshot`
- `browser_take_screenshot`
- `browser_console_messages`
- `browser_network_requests`
- `browser_wait_for`

像点击、输入、上传、拖拽、提交等可能产生副作用的工具，不会被透明自动重试。

## Manager 级工具

- `create_session`
- `list_sessions`
- `close_session`
- `restart_session`
- `list_local_profiles`

所有被路由的 Playwright browser tools 都需要传入 `sessionId`。

## 安装

### 全局安装

```bash
npm install -g @linatang/playwright-browser-manager-mcp@latest
```

### 本地开发

```bash
npm install
npm run dev
```

### 构建

```bash
npm run build
```

### 测试

```bash
npm test
```

## 环境变量

- `PSMCP_PROFILE_ROOT`
- `PSMCP_DEFAULT_BROWSER`
- `PSMCP_LOG_LEVEL`
- `PSMCP_HEADLESS_DEFAULT`
- `PSMCP_BROWSER_EXECUTABLE`
- `PSMCP_PLAYWRIGHT_MCP_COMMAND`
- `PSMCP_PLAYWRIGHT_MCP_ARGS`

## 故障排查

- **session 处于 `broken`** — 调用 `restart_session`
- **session 处于 `profile_locked`** — 使用 `profileMode: "fallback-isolated"`
- **启动 probe 失败** — 检查 `npx` 和 `@playwright/mcp`
- **浏览器启动失败** — 检查 profile 权限或显式设置 `PSMCP_BROWSER_EXECUTABLE`

## License

MIT
