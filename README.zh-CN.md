# UniPet

**一个桌面宠物，帮你盯着 AI 编程助手 —— 从此你不用亲自动手。**

English · [简体中文](README.zh-CN.md)

[![CI](https://github.com/qaz154/unipet/actions/workflows/ci.yml/badge.svg)](https://github.com/qaz154/unipet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)

UniPet 常驻在你的桌面上，实时感知你的 AI 助手正在做什么 —— 思考、编码、测试、等待审批、庆祝成功，或者在出错时惊慌失措。

支持 **Claude Code、Codex、Cursor、Gemini CLI、Copilot、Kiro、Kimi** 以及任何兼容 MCP 的智能体。

```
  ╭──────────╮
  │  ◕    ◕  │   "测试通过！159/159 ✓"
  │   ╰──╯   │
  ╰──────────╯
```

## 下载

从 [**Releases**](https://github.com/qaz154/unipet/releases/latest) 获取最新构建版本：

| 平台 | 文件 |
|----------|------|
| **Windows** | `UniPet.Setup.0.1.9.exe` |
| **macOS** | `UniPet-0.1.9-arm64.dmg` |
| **Linux** | `UniPet-0.1.9.AppImage` |

> macOS 首次启动时可能会弹出安全警告。右键点击 -> 打开，或运行：
> ```
> xattr -dr com.apple.quarantine /Applications/UniPet.app
> ```
>
> 当前 Windows 是主要已验证桌面目标。macOS DMG 与 Linux AppImage 会发布构建产物，但透明窗口行为仍需更多真实设备验证。

## 快速开始

### 1. 安装并启动

从 [Releases](https://github.com/qaz154/unipet/releases/latest) 下载并打开应用。你会在桌面上看到一个像素宠物和一个托盘图标。

### 2. 连接你的智能体

```bash
# 自动检测已安装的智能体并注册钩子
node hooks/install-hooks.js

# 或仅为指定智能体安装
node hooks/install-hooks.js --agent claude-code
node hooks/install-hooks.js --agent codex
node hooks/install-hooks.js --agent cursor
```

### 3. 开始编码

宠物会在你的智能体开始工作时自动做出反应。无需任何配置。

## 支持的智能体

| 智能体 | 集成方式 |
|-------|-------------------|
| **Claude Code** | Hooks（自动） |
| **Codex CLI** | Hooks（自动） |
| **Cursor** | Hooks（自动） |
| **Gemini CLI** | Hooks（自动） |
| **Copilot CLI** | Hooks（自动） |
| **Kiro CLI** | Hooks（自动） |
| **Kimi CLI** | Hooks（自动） |
| **OpenCode** | 插件（自动安装） |
| **OpenClaw** | 插件（自动安装） |
| **Hermes** | 插件（自动安装） |
| **任意 MCP 智能体** | MCP Server |

## 功能状态

| 状态 | 功能 | 说明 |
|---------|---------|-------------|
| 稳定 | **24 种视觉状态** | 待机、思考、工作、编辑、测试、出错、开心、喜欢、睡觉…… |
| 稳定 | **多智能体追踪** | 跨会话的优先级状态解析 |
| 稳定 | **权限气泡** | 允许 / 拒绝 / 仅一次 按钮 —— 钩子会阻塞直到你做出决定 |
| 稳定 | **消息气泡** | 智能体消息，自动脱敏密钥 / URL / 路径 |
| 稳定 | **情感引擎** | PAD 三维情感向量，带自然时间衰减 |
| 稳定 | **眼神追踪** | 宠物眼睛跟随鼠标光标 |
| 稳定 | **投掷物理** | 拖拽并甩出宠物 —— 旋转 + 弹跳 |
| 稳定 | **全局快捷键** | `Ctrl+Shift+Y` = 允许，`Ctrl+Shift+N` = 拒绝 |
| 稳定 | **迷你模式** | 拖到屏幕边缘 -> 宠物隐藏，悬停时探头 |
| 稳定 | **入睡序列** | 闲置超时后：打哈欠 -> 打盹 -> 睡着 |
| 稳定 | **渲染器** | CSS 像素风、SVG、精灵图 |
| 稳定 | **主题系统** | JSON schema + 变体 + 导入 / 导出 |
| 稳定 | **音效** | 芯片音风格的状态变化反馈 |
| 稳定 | **MCP Server** | `npx @unipet/mcp` —— 4 个工具供任意 MCP 智能体使用 |
| 稳定 | **国际化** | English、简体中文、繁體中文、日本語、한국어 |
| 稳定 | **隐私保护** | `setContentProtection` 在屏幕共享 / 录屏时隐藏宠物 |
| 稳定 | **会话面板** | 查看活跃智能体会话、事件历史、跳转到终端 |
| 稳定 | **免打扰模式** | 自动静音、抑制权限气泡 |
| 稳定 | **自动注册 Hooks** | 应用启动时自动安装 hooks（尽力而为） |
| 稳定 | **CLI** | `unipet install/doctor/theme/react/say` 命令界面 |
| 稳定 | **主题工具** | `create-theme.mjs` 脚手架 + `unipet theme validate` 验证器 |
| 实验性 | **主题市场** | 本地和远程市场来源；远程行为仍在演进 |
| 实验性 | **Live2D SDK 接缝** | 自带 SDK adapter，否则使用内置 Canvas 回落 |
| 实验性 | **AI 感知** | 截图 → 多模态 LLM → 宠物状态的 adapter API；需要外部采集和配置 |
| 实验性 | **宠物进化** | Git 行为分析映射到主题变体 |
| 实验性 | **情感音景** | Web Audio 环境音乐，由 PAD 情感向量驱动 |
| 实验性 | **语音伴侣** | 语音识别 + 合成命令界面 |
| 实验性 | **桌面镜像** | 系统监控 → 宠物情感 |
| 实验性 | **宠物网格** | 带中继支持的 WebSocket 跨设备宠物网络 |
| 路线图 | **插件系统** | 公开插件加载、信任模型和管理 UI |
| 稳定 | **文档** | 完整文档见 [docs/](docs/) |

## MCP 集成

任何兼容 MCP 的智能体都可以控制宠物：

```json
{
  "mcpServers": {
    "unipet": {
      "command": "npx",
      "args": ["-y", "@unipet/mcp"]
    }
  }
}
```

可用工具：`unipet_status`、`unipet_react`、`unipet_say`、`unipet_move`

## HTTP API

任何智能体都可以通过 HTTP 与宠物通信：

```bash
# 设置状态
curl -X POST http://localhost:23333/api/state -d '{"state":"working"}'

# 显示消息气泡
curl -X POST http://localhost:23333/api/speech -d '{"message":"Hello!"}'

# 桌面通知
curl -X POST http://localhost:23333/api/notify -d '{"title":"Done","message":"Build passed"}'

# 权限请求（阻塞直到用户响应）
curl -X POST http://localhost:23333/api/permission \
  -d '{"permissionId":"p1","toolName":"Bash","message":"Allow rm?"}'

# SSE 事件流
curl http://localhost:23333/api/events
```

远程智能体使用 `Authorization: Bearer <token>`，token 存放在 `~/.unipet/auth-token`。

## 架构

```
┌──────────────────────────────────────────────┐
│             Electron 桌面应用                  │
│                                              │
│  Renderer ←─ StateManager ←─ AgentAdapters   │
│  (Canvas)    (24-state        (Hook/MCP/     │
│               priority)        HTTP/Git)     │
│     ↑            ↑                ↑          │
│  Emotion    BubbleManager    HTTP Server     │
│  Engine     (sanitized)      (:23333)        │
│                                              │
│  Platform: Electron + Vue 3 + TypeScript     │
└──────────────────────────────────────────────┘
```

Monorepo 包：`@unipet/core` · `@unipet/adapters` · `@unipet/renderers` · `@unipet/themes` · `@unipet/mcp-server` · `@unipet/cli` · `@unipet/desktop`

## 开发

```bash
# 环境要求：Node.js >= 22, pnpm >= 10
git clone https://github.com/qaz154/unipet.git
cd unipet
pnpm start              # 一键：安装 + 构建 + 启动开发
# 或者分步执行：
pnpm install
pnpm build
pnpm test              # 162+ 个测试
pnpm --filter @unipet/desktop dev  # 开发模式，支持热重载
```

## 创建主题

```json
{
  "schemaVersion": 1,
  "id": "my-pet",
  "renderer": "css-pixel",
  "rendererConfig": {
    "gridSize": 16, "upscale": 8,
    "palette": { ".": "transparent", "#": "#000", "W": "#fff" },
    "body": ["..####..", ".#WWWW#.", "#WWWWWW#", ".#WWWW#.", "..####.."],
    "faces": { "idle": { "eyes": ["W.W"], "eyePos": { "row": 2, "col": 2 } } }
  },
  "states": { "idle": { "files": ["idle"] }, "working": { "files": ["working"] } }
}
```

完整的主题 schema 参考请见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 参与贡献

欢迎提交 PR。请添加测试，遵循现有代码风格，`pnpm test` 必须通过。

## 许可证

[MIT](LICENSE)
