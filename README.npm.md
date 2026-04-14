# Playwright Browser Manager MCP

English | [简体中文](#简体中文)

A Playwright MCP browser manager for multi-session browser automation.

It adds a browser-management layer on top of `@playwright/mcp` for cases where multiple agents, threads, or workflows need separate browser state.

## What problem does it solve?

Plain `@playwright/mcp` works well for simple single-session workflows, but starts to hurt when multiple agents or sessions need browsers at the same time.

Common problems:

- browser profile conflicts (`Browser is already in use`)
- stale browser/page/context handles after browser closure (`Target page, context or browser has been closed`)
- manual management of persistent vs isolated browser state
- reconnect / restart logic leaking into the caller
- difficulty reusing already-authenticated browser state safely

This package solves that by adding:

- explicit browser sessions via `sessionId`
- profile modes: `persistent`, `isolated`, `fallback-isolated`
- lazy browser launch
- managed session lifecycle
- auto-healing retry for safe read-only browser calls
- session/profile seeding from external browser profiles or existing managed sessions

## When to use it

Use this package if:

- multiple agents, threads, or sessions need separate browser state
- some sessions should keep login state while others should stay isolated
- you want fewer manual reconnect / restart steps after browser crashes
- plain Playwright MCP becomes awkward in multi-session workflows
- you want to bootstrap a new session from an existing browser profile or an already-logged-in managed session

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
- **Session/profile seeding** — create a session from a cloned external browser profile or fork an existing managed session
- **Lazy launch** — start browser only when needed
- **Auto-healing recovery** — relaunch and retry once for safe read-only browser calls after browser closure
- **Managed session lifecycle** — create, list, close, restart, and fork sessions

## Profile Modes

| Mode | Best for |
|---|---|
| `persistent` | keep login state, cookies, cache |
| `isolated` | sandboxed or parallel browser tasks |
| `fallback-isolated` | prefer persistent state, but fall back if the profile is locked |

## Bootstrap a Session from Existing Browser State

This package supports initializing a new managed session from:

1. a fresh empty managed profile
2. a cloned external browser profile
3. an existing managed session

### `create_session` with `profileSource`

Supported `profileSource` forms:

- `{ "type": "managed-empty" }`
- `{ "type": "external-profile", "path": "..." }`
- `{ "type": "external-profile", "browser": "chrome", "profile": "default" }`
- `{ "type": "external-profile", "browser": "msedge", "profileName": "Profile 1" }`
- `{ "type": "session", "sessionId": "..." }`

### Example: clone the default Chrome profile

```json
{
  "name": "work-from-default-chrome",
  "profileMode": "persistent",
  "profileSource": {
    "type": "external-profile",
    "browser": "chrome",
    "profile": "default"
  }
}
```

### Example: clone a named Edge profile

```json
{
  "name": "work-from-edge-profile-1",
  "profileMode": "persistent",
  "profileSource": {
    "type": "external-profile",
    "browser": "msedge",
    "profileName": "Profile 1"
  }
}
```

### Example: fork an existing managed session

Use `fork_session` when you already have a logged-in managed session and want a new independent session with the same initial browser state.

```json
{
  "sourceSessionId": "session-123",
  "name": "work-agent-2",
  "profileMode": "isolated"
}
```

## Security Model for Seeding

This package intentionally **does not support external-direct profile mounting**.

In other words:

- it will **not** run a managed session directly on the user's live browser profile
- external browser profiles are always **cloned into a new managed profile directory** first
- forked sessions are also materialized into a new managed profile

This keeps the model safer and more stable for multi-session automation:

- avoids live profile lock conflicts
- avoids directly mutating the user's original profile
- keeps all managed sessions on manager-owned profile directories

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
- `fork_session`
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
- **profile seeding fails** — verify the source profile exists and is readable by the current OS user

## License

MIT

---

# 简体中文

一个面向多 session 浏览器自动化的 Playwright MCP browser manager。

它在 `@playwright/mcp` 之上增加了一层浏览器管理能力，适合多个 agent、thread 或 workflow 同时需要各自独立浏览器状态的场景。

## 它解决什么问题？

原生 `@playwright/mcp` 在单 session 场景下很好用，但一旦多个 agent 或 session 同时需要浏览器，就会开始变得别扭。

常见问题包括：

- 浏览器 profile 冲突（`Browser is already in use`）
- 浏览器关闭后，page/context 句柄失效（`Target page, context or browser has been closed`）
- 调用方需要自己管理 persistent / isolated 浏览器状态
- reconnect / restart 逻辑泄漏到业务层
- 想复用已登录浏览器状态时不够安全也不够顺手

这个包补上的能力包括：

- 用 `sessionId` 显式管理浏览器 session
- 支持 `persistent`、`isolated`、`fallback-isolated` 三种 profile 模式
- 按需启动浏览器（lazy launch）
- 受管 session 生命周期
- 对安全只读浏览器调用提供自动恢复重试
- 支持从外部浏览器 profile 或现有 managed session 做 session/profile seeding

## 什么时候适合用

如果你有这些需求，就适合用这个包：

- 多个 agent、thread 或 session 需要各自独立的浏览器状态
- 有些 session 要保留登录态，有些要保持隔离
- 你希望浏览器崩掉之后尽量少手动 reconnect / restart
- 原生 Playwright MCP 在多 session 场景下已经开始不顺手
- 你希望从已有浏览器 profile 或一个已登录的 managed session 快速启动新 session

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
- **Session/profile seeding** — 支持从外部浏览器 profile clone，或从已有 managed session fork
- **Lazy launch** — 需要时才启动浏览器
- **自动恢复** — 浏览器意外关闭后，对安全只读调用自动重试一次
- **受管生命周期** — 显式创建、列出、关闭、重启、fork session

## Profile 模式

| 模式 | 适合场景 |
|---|---|
| `persistent` | 保留登录态、cookie、缓存 |
| `isolated` | 沙盒任务、并行任务、一次性浏览器会话 |
| `fallback-isolated` | 优先使用 persistent，但 profile 被占用时自动回退 |

## 从已有浏览器状态初始化新 session

这个包支持用以下来源初始化一个新的 managed session：

1. 全新空白 managed profile
2. clone 外部浏览器 profile
3. 从已有 managed session fork

### `create_session` 的 `profileSource`

支持以下形式：

- `{ "type": "managed-empty" }`
- `{ "type": "external-profile", "path": "..." }`
- `{ "type": "external-profile", "browser": "chrome", "profile": "default" }`
- `{ "type": "external-profile", "browser": "msedge", "profileName": "Profile 1" }`
- `{ "type": "session", "sessionId": "..." }`

### 示例：clone 默认 Chrome profile

```json
{
  "name": "work-from-default-chrome",
  "profileMode": "persistent",
  "profileSource": {
    "type": "external-profile",
    "browser": "chrome",
    "profile": "default"
  }
}
```

### 示例：clone 一个命名的 Edge profile

```json
{
  "name": "work-from-edge-profile-1",
  "profileMode": "persistent",
  "profileSource": {
    "type": "external-profile",
    "browser": "msedge",
    "profileName": "Profile 1"
  }
}
```

### 示例：fork 一个已有的 managed session

当你已经有一个登录好的 managed session，希望基于它再开一个新的独立 session 时，使用 `fork_session`：

```json
{
  "sourceSessionId": "session-123",
  "name": "work-agent-2",
  "profileMode": "isolated"
}
```

## Seeding 的安全模型

这个包**明确不支持 external-direct profile mounting**。

也就是说：

- 不会让 managed session 直接跑在用户正在使用的 live browser profile 上
- 外部浏览器 profile 一律会先 clone 到新的 managed profile 目录
- fork 出来的 session 也同样会 materialize 成新的 managed profile

这样做的好处是：

- 避免 live profile 锁冲突
- 避免直接污染用户原 profile
- 保证所有 managed session 都运行在 manager 自己拥有的 profile 目录上

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
- `fork_session`
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
- **profile seeding 失败** — 检查 source profile 是否存在，且当前系统用户可读

## License

MIT
