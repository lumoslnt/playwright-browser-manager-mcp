# Playwright Browser Manager MCP

English | [简体中文](#简体中文)

A multi-session Playwright browser manager MCP server for multi-agent and multi-session browser automation.

## What problem does it solve?

Plain `@playwright/mcp` works well for simple single-session workflows, but starts to hurt when multiple agents, threads, or sessions need browsers at the same time.

Common problems:

- shared browser profiles conflict (`Browser is already in use`)
- a browser gets closed and the session is left with stale page/context handles (`Target page, context or browser has been closed`)
- callers have to manually manage persistent vs isolated browser state
- reconnect/restart logic leaks into the agent or application layer
- safely reusing already-authenticated browser state is awkward

This MCP solves that by adding a browser-management layer on top of Playwright MCP:

- explicit browser sessions via `sessionId`
- profile isolation policies
- profile modes (`persistent`, `isolated`, `fallback-isolated`)
- lazy browser launch
- managed session lifecycle
- auto-healing recovery for safe read-only browser calls
- session forking from existing managed sessions

## Use this when

Use this MCP if:

- you run multiple agents or sessions that need their own browser state
- you want some sessions to keep login state while others stay isolated
- you hit profile lock errors with plain Playwright MCP
- you want fewer manual reconnect / restart steps after a browser closes unexpectedly
- you want to bootstrap a new session from an existing logged-in managed session

## Quick Start

### 1) Run the MCP server

#### Option A: run with `npx`

```bash
npx -y @linatang/playwright-browser-manager-mcp@latest
```

#### Option B: install globally

```bash
npm install -g @linatang/playwright-browser-manager-mcp@latest
playwright-browser-manager-mcp
```

---

### 2) Add it to your MCP client

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

If installed globally:

```json
{
  "mcpServers": {
    "playwright-browser-manager": {
      "command": "playwright-browser-manager-mcp"
    }
  }
}
```

---

### 3) Minimal usage flow

1. Call `create_session`
2. Save the returned `sessionId`
3. Call any routed browser tool with that `sessionId`

Example flow:

- `create_session(name="work", profileMode="persistent")`
- `browser_navigate(sessionId="...", url="https://example.com")`
- `browser_snapshot(sessionId="...")`

## How it works

This server starts and manages one Playwright MCP child process per browser session.

Each managed session has:

- a stable `sessionId`
- a profile policy (`persistent`, `isolated`, or `fallback-isolated`)
- an optional bootstrap source (`managed-empty` or `session`)
- lifecycle state (`idle`, `ready`, `recovering`, `broken`, etc.)
- a routed tool surface that forwards Playwright browser calls to the right session

In other words:

- **without this MCP**: the caller has to think about browser lifecycle, profile collisions, and state reuse
- **with this MCP**: the caller mainly thinks in terms of `sessionId` and browser tasks

## Key Features

- **Explicit `sessionId` routing**  
  Deterministic multi-session automation with no session bleed.

- **Profile modes**  
  Choose the right browser-state policy per session.

- **Session forking**  
  Log in once in a managed session, then fork it to create independent copies with the same state.

- **Lazy launch**  
  Browser child process starts only when a browser tool is first used.

- **Auto-healing recovery**  
  If the browser closes unexpectedly during a safe read-only tool call, the manager tears down the stale child, relaunches, and retries once.

- **Managed session lifecycle**  
  Create, list, close, restart, and fork sessions explicitly.

- **Startup tool discovery**  
  Child Playwright MCP tools are discovered at startup and registered as routed tools.

## Profile Modes

| Mode | Best for | Behavior |
|---|---|---|
| `persistent` | login state, long-lived browser sessions | Reuses a named local profile directory |
| `isolated` | parallel tasks, sandboxed runs, throwaway sessions | Creates a fresh temporary profile for the session |
| `fallback-isolated` | prefer persistent state, but avoid hard failure on lock conflicts | Tries the normal profile first, then falls back to a fresh isolated profile if the profile is locked |

## Getting Auth State into a Managed Session

The recommended approach is to log in directly inside a managed session, then reuse or fork it:

1. Create a persistent managed session
2. Navigate to your site and log in normally
3. Reuse that session for authenticated tasks, or fork it for parallel work

```json
{ "name": "auth-session", "profileMode": "persistent" }
```

### Forking: share auth state across parallel sessions

Use `fork_session` when you have a managed session with useful browser state (for example, an authenticated session) and want to create independent copies of it.

```json
{
  "sourceSessionId": "session-123",
  "name": "work-agent-2",
  "profileMode": "isolated"
}
```

### Seeding from an existing managed session

You can also initialize a new session from an existing managed session using `profileSource`:

```json
{
  "name": "new-session",
  "profileMode": "persistent",
  "profileSource": { "type": "session", "sessionId": "session-123" }
}
```

## Auto-Healing and Safe Retry

When a safe read-only browser call fails because the underlying browser/page/context has already closed, the manager will:

1. detect the browser-closed error
2. tear down the stale child connection
3. relaunch the browser session
4. retry the failed tool call once

This automatic retry is intentionally limited to safer read-only tools to avoid accidentally double-running mutations.

Currently safe-retry tools include:

- `browser_navigate`
- `browser_snapshot`
- `browser_take_screenshot`
- `browser_console_messages`
- `browser_network_requests`
- `browser_wait_for`

Mutating tools such as click, typing, upload, drag-and-drop, and submit-like interactions are **not** transparently retried.

## Session Lifecycle Tools

This MCP exposes these manager-level tools:

- `create_session`
- `fork_session`
- `list_sessions`
- `close_session`
- `restart_session`
- `list_local_profiles`

All routed Playwright browser tools require a `sessionId`.

## Session Status Reference

| Status | Meaning |
|---|---|
| `idle` | Session exists but browser has not started yet |
| `launching` | Browser is starting |
| `ready` | Browser is available and tools can run |
| `recovering` | Browser/session is being relaunched after failure |
| `closing` | Session is shutting down |
| `closed` | Session is stopped and will relaunch on next use |
| `error` | Last launch failed; manager will retry on next use |
| `broken` | Session could not be recovered automatically |
| `profile_locked` | Browser profile is locked by another process |

## Requirements

- Node.js 20+
- npm
- Network access for `npx @playwright/mcp@latest` unless already cached locally

## Installation

### Global install

```bash
npm install -g @linatang/playwright-browser-manager-mcp@latest
```

### Local development

```bash
npm install
npm run dev
```

### Build and run compiled output

```bash
npm run build
npm start
```

### Run tests

```bash
npm test
```

## Environment Variables

- `PSMCP_PROFILE_ROOT` — root directory for browser profiles and session metadata
- `PSMCP_DEFAULT_BROWSER` — `chrome` | `msedge` | `chromium`
- `PSMCP_LOG_LEVEL` — log verbosity
- `PSMCP_HEADLESS_DEFAULT` — `true` | `false`
- `PSMCP_BROWSER_EXECUTABLE` — explicit browser executable path
- `PSMCP_PLAYWRIGHT_MCP_COMMAND` — override child MCP command
- `PSMCP_PLAYWRIGHT_MCP_ARGS` — override child MCP args

## Troubleshooting

### Startup fails at probe discovery

- make sure `npx` is available
- verify `@playwright/mcp` can run on this machine
- check outbound network access if you rely on `npx @playwright/mcp@latest`

### Browser launch fails

- check profile directory permissions
- try a different `PSMCP_PROFILE_ROOT`
- set `PSMCP_BROWSER_EXECUTABLE` if browser auto-detection is wrong

### Session is `broken`

Use `restart_session` to force-close and relaunch the session.

### Session is `profile_locked`

Another process may already be using the same browser profile. Create a session with `profileMode: "fallback-isolated"` if you want automatic fallback behavior.

## License

MIT

---

# 简体中文

一个面向多 agent / 多 session 浏览器自动化场景的 Playwright Browser Manager MCP 服务。

## 这个 MCP 解决了什么问题？

原生 `@playwright/mcp` 在**单会话**场景下很好用，但一旦你有多个 agent、多个 thread、多个 session 同时需要浏览器，问题就会开始出现。

典型痛点包括：

- 共享浏览器 profile 发生冲突（`Browser is already in use`）
- 浏览器被关掉后，session 里还握着失效的 page/context 句柄（`Target page, context or browser has been closed`）
- 调用方需要自己管理 persistent / isolated 两类浏览器状态
- reconnect / restart 逻辑泄漏到 agent 或业务代码里
- 想安全地复用已登录浏览器状态并不顺手

这个 MCP 在 Playwright MCP 之上增加了一层 **浏览器管理能力**，核心包括：

- 用 `sessionId` 显式管理浏览器会话
- 用 profile policy 管理浏览器状态隔离
- 支持 `persistent`、`isolated`、`fallback-isolated` 三种 profile 模式
- 按需启动浏览器（lazy launch）
- 管理 session 生命周期
- 对安全的只读调用提供自动恢复（auto-healing）
- 支持从已有 managed session fork 新 session

## 什么时候该用它？

如果你有这些需求，就很适合用这个 MCP：

- 多个 agent / session 需要各自独立的浏览器状态
- 有的 session 需要保留登录态，有的 session 需要隔离运行
- 你经常遇到 Playwright profile 锁冲突
- 你希望浏览器异常关闭后，尽量少手动 reconnect / restart
- 你希望从已登录的 managed session fork 出新 session

## 快速开始

### 1）运行 MCP 服务

#### 方式 A：直接用 `npx`

```bash
npx -y @linatang/playwright-browser-manager-mcp@latest
```

#### 方式 B：全局安装

```bash
npm install -g @linatang/playwright-browser-manager-mcp@latest
playwright-browser-manager-mcp
```

---

### 2）在 MCP client 里配置它

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

如果是全局安装：

```json
{
  "mcpServers": {
    "playwright-browser-manager": {
      "command": "playwright-browser-manager-mcp"
    }
  }
}
```

---

### 3）最小使用流程

1. 调用 `create_session`
2. 保存返回的 `sessionId`
3. 后续所有浏览器工具都带上这个 `sessionId`

示例流程：

- `create_session(name="work", profileMode="persistent")`
- `browser_navigate(sessionId="...", url="https://example.com")`
- `browser_snapshot(sessionId="...")`

## 它是怎么工作的？

这个服务会为每个浏览器 session 启动并管理一个 Playwright MCP 子进程。

每个受管 session 都有：

- 一个稳定的 `sessionId`
- 一个 profile 策略（`persistent`、`isolated`、`fallback-isolated`）
- 一个可选的 bootstrap source（`managed-empty`、`session`）
- 一套生命周期状态（`idle`、`ready`、`recovering`、`broken` 等）
- 一组路由后的 Playwright browser tools

可以简单理解成：

- **没有这个 MCP**：调用方要自己处理浏览器生命周期、profile 冲突和状态复用
- **有了这个 MCP**：调用方主要只需要围绕 `sessionId` 和浏览器任务来思考

## 核心特性

- **显式 `sessionId` 路由**
  多 session 调用更确定，不容易串会话。

- **Profile 模式**
  每个 session 可以选择适合自己的浏览器状态策略。

- **Session Fork**
  在一个 managed session 里登录一次，然后 fork 出多个独立的子 session。

- **Lazy launch**
  创建 session 时不立即启动浏览器，第一次真正调用浏览器工具时才启动。

- **自动恢复（Auto-healing）**
  如果浏览器在安全的只读调用过程中意外关闭，manager 会清理失效连接、重新拉起浏览器，并自动重试一次。

- **受管 session 生命周期**
  支持显式创建、列出、关闭、重启、fork session。

- **启动时自动发现子工具**
  底层 Playwright MCP 暴露的 browser tools 会在启动时被发现并注册成路由工具。

## Profile 模式说明

| 模式 | 适合场景 | 行为 |
|---|---|---|
| `persistent` | 需要保留登录态、cookie、缓存 | 复用本地命名 profile 目录 |
| `isolated` | 并行任务、沙盒任务、一次性会话 | 为当前 session 创建全新的临时 profile |
| `fallback-isolated` | 希望优先使用 persistent，但 profile 被占用时不要直接失败 | 先尝试原 profile，若锁冲突则自动回退到新的 isolated profile |

## 如何把登录态带入 Managed Session

推荐做法是直接在 managed session 里登录，然后复用或 fork 它：

1. 创建一个 `persistent` managed session
2. 在里面打开网站，正常登录
3. 复用这个 session 执行需要认证的任务，或者 fork 出多个并行 session

```json
{ "name": "auth-session", "profileMode": "persistent" }
```

### Fork：在多个并行 session 间共享登录态

当你已经有一个包含有用浏览器状态的 managed session（例如已经登录好的 session），希望再开一个新的独立 session 时，使用 `fork_session`：

```json
{
  "sourceSessionId": "session-123",
  "name": "work-agent-2",
  "profileMode": "isolated"
}
```

### 从已有 managed session 初始化

也可以用 `profileSource` 从已有 managed session 初始化一个新 session：

```json
{
  "name": "new-session",
  "profileMode": "persistent",
  "profileSource": { "type": "session", "sessionId": "session-123" }
}
```

## 自动恢复与安全重试

当安全的只读浏览器调用因为底层 browser/page/context 已关闭而失败时，manager 会：

1. 识别浏览器已关闭的错误
2. 清理失效的子进程连接
3. 重新拉起浏览器 session
4. 对失败的工具调用自动重试一次

这个自动重试**只**适用于更安全的只读工具，避免对带副作用的操作重复执行。

当前支持安全重试的工具包括：

- `browser_navigate`
- `browser_snapshot`
- `browser_take_screenshot`
- `browser_console_messages`
- `browser_network_requests`
- `browser_wait_for`

像点击、输入、上传、拖拽、提交一类可能产生副作用的工具，**不会**被透明自动重试。

## Session 管理工具

这个 MCP 额外提供这些 manager 级工具：

- `create_session`
- `fork_session`
- `list_sessions`
- `close_session`
- `restart_session`
- `list_local_profiles`

所有被路由的 Playwright browser tools 都要求传入 `sessionId`。

## Session 状态说明

| 状态 | 含义 |
|---|---|
| `idle` | session 已创建，但浏览器还没启动 |
| `launching` | 浏览器正在启动 |
| `ready` | 浏览器可用，可以执行工具调用 |
| `recovering` | 浏览器异常后，manager 正在恢复 |
| `closing` | session 正在关闭 |
| `closed` | session 已停止，下次使用时会重新拉起 |
| `error` | 上次启动失败，下次使用时 manager 会再试一次 |
| `broken` | 自动恢复失败，需要人工干预 |
| `profile_locked` | profile 被其他进程占用 |

## 运行要求

- Node.js 20+
- npm
- 如果依赖 `npx @playwright/mcp@latest`，需要机器可以联网

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

### 构建并运行编译产物

```bash
npm run build
npm start
```

### 运行测试

```bash
npm test
```

## 环境变量

- `PSMCP_PROFILE_ROOT` — 浏览器 profile 和 session 元数据根目录
- `PSMCP_DEFAULT_BROWSER` — `chrome` | `msedge` | `chromium`
- `PSMCP_LOG_LEVEL` — 日志级别
- `PSMCP_HEADLESS_DEFAULT` — `true` | `false`
- `PSMCP_BROWSER_EXECUTABLE` — 指定浏览器可执行文件路径
- `PSMCP_PLAYWRIGHT_MCP_COMMAND` — 覆盖底层 child MCP 命令
- `PSMCP_PLAYWRIGHT_MCP_ARGS` — 覆盖底层 child MCP 参数

## 故障排查

### 启动阶段 probe discovery 失败

- 确认机器上有 `npx`
- 确认 `@playwright/mcp` 可以正常运行
- 如果依赖 `npx @playwright/mcp@latest`，检查网络访问是否正常

### 浏览器启动失败

- 检查 profile 目录权限
- 尝试修改 `PSMCP_PROFILE_ROOT`
- 如果浏览器自动探测不对，显式设置 `PSMCP_BROWSER_EXECUTABLE`

### Session 处于 `broken`

使用 `restart_session` 强制关闭并重新拉起 session。

### Session 处于 `profile_locked`

说明同一个 profile 正被别的进程占用。如果你希望自动回退，可以创建一个 `profileMode: "fallback-isolated"` 的 session。

## License

MIT
