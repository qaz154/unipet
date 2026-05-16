# Universal Desktop Pet Framework (UniPet)

> 支持任意 Agent 接入的下一代桌面宠物框架

---

## 一、现有项目深度对比分析

### 1.1 六大项目优缺点矩阵

| 维度 | clawd-on-desk (2356★) | openpets (283★) | Agentic-Desktop-Pet (278★) | qq-slime-pet | BongoCat (20800★) | yuns-desktop-pet |
|------|----------------------|-----------------|---------------------------|--------------|-------------------|------------------|
| **桌面框架** | Electron | Electron | Godot 4 | Electron | Tauri 2 + Vue 3 | Electron |
| **渲染方式** | SVG/GIF/APNG | Spritesheet | Godot Canvas | CSS Canvas像素 | PixiJS + Live2D | Electron + Live2D |
| **Agent接入** | HTTP Hooks (12种) | MCP协议 | HTTP API | 多模态截屏 | 无 | MCP工具调用 |
| **AI能力** | 无(纯状态监听) | 无(纯状态监听) | LLM对话+工具调用 | 多模态感知 | 无 | 多模型对话 |
| **记忆系统** | 无 | 无 | 无(仅内存列表) | 无 | 无 | 无 |
| **情感系统** | 基础(10状态优先级) | 基础(11反应) | 无(仅声明) | 10种CSS动画状态 | 无 | 无 |
| **主题/皮肤** | 完整(schema+变体+覆盖) | 宠物包(.json+精灵表) | Godot .pck包 | CSS像素网格 | Live2D模型 | Live2D |
| **透明窗口** | Electron BrowserWindow | Electron transparent | Godot mouse_passthrough | setContentProtection | 平台特定插件 | Electron |
| **测试覆盖** | ~160个测试文件 | 零测试 | 零测试 | 零测试 | 零测试 | 零测试 |
| **代码质量** | 高(但文件过大) | 中(巨文件问题) | 低(早期原型) | 高(架构清晰) | 高(跨平台优秀) | 中 |
| **包大小** | ~150MB(Electron) | ~150MB(Electron) | ~50MB(Godot) | ~150MB(Electron) | ~5MB(Tauri) | ~150MB(Electron) |

### 1.2 各项目核心优势（值得集成的）

#### clawd-on-desk — 状态机与主题系统
- **优先级状态机**: error(8) > notification(7) > sweeping(6) > attention(5) > juggling(4) > working(3) > thinking(2) > idle(1) > sleeping(0)
- **多会话状态解析**: 跨多个agent会话的dominant state resolution
- **睡眠序列**: yawning → dozing → collapsing → sleeping (可配置)
- **主题schema**: 完整的JSON schema验证 + 变体补丁 + 用户覆盖 + fallback链
- **SVG安全净化**: 移除script/event handler/javascript: URL
- **工厂函数依赖注入**: `initXxx(ctx)` 模式，测试友好
- **原子配置写入**: write-to-temp + rename 防崩溃损坏

#### openpets — MCP协议与租赁系统
- **MCP Server设计**: 3个工具(status/react/say)，Zod schema验证
- **租赁系统**: TTL + heartbeat，agent进程崩溃自动清理
- **消息净化**: 正则拒绝代码、URL、文件路径、密钥泄露
- **IPC安全**: token认证 + 0o600权限 + 路径遍历防护
- **包分离**: @open-pets/client, @open-pets/mcp, @open-pets/claude 独立发布

#### Agentic-Desktop-Pet — Agent工具框架
- **Toolkit自省**: 从Python函数签名+docstring自动生成OpenAI function schema
- **工具过滤**: `select_tools(include, exclude)` 用于子agent工具作用域
- **SSE流式**: FastAPI → Godot 全链路流式传输
- **主题/mod系统**: Godot .pck资源包运行时加载

#### qq-slime-pet — 渲染引擎与隐私设计
- **逐行像素变形**: 每行独立正弦函数偏移，创造"果冻"效果
- **零外部素材**: 16x16字符网格 + 8色调色板，纯代码绘制
- **setContentProtection**: 宠物对截屏软件不可见（OS级隐私）
- **协议适配器策略模式**: 统一 `send()` 接口，3种AI后端
- **三层移动系统**: AI驱动语义定位 + 自主边缘巡逻 + 离屏窥视夹紧
- **三阶段JSON解析fallback**: parse → regex extract → raw text

#### BongoCat — 跨平台窗口管理
- **NSPanel转换**: macOS nonactivating_panel + Dock level + 跨Space跟随
- **Windows TOPMOST轮询**: SetWindowPos 16ms循环（虽hack但有效）
- **rdev全局输入**: OS级键盘/鼠标钩子，任何应用都能响应
- **指数阻尼光标平滑**: `alpha = 1 - 0.75^(deltaMS/16.67)`
- **Tauri插件抽象**: 一个插件3个平台实现，统一命令接口

### 1.3 各项目核心缺陷（需要避免的）

| 项目 | 关键缺陷 |
|------|---------|
| clawd-on-desk | 无TypeScript；main.js 1800行；CommonJS；无AI能力 |
| openpets | windows.ts 98KB；preload.cjs 60KB；精灵表布局硬编码；零测试 |
| Agentic-Desktop-Pet | README与代码严重不符；内存无界追加；单全局agent实例；零测试 |
| qq-slime-pet | postJson重复3次；无对话历史；单显示器限制；无流式 |
| BongoCat | CSP禁用；权限过度；Windows轮询hack；游戏手柄紧密循环 |

---

## 二、UniPet 框架设计

### 2.1 设计原则

1. **Agent无关**: 任何AI agent（Claude Code、Codex、Cursor、自定义LLM、MCP agent）都能接入
2. **渲染器可插拔**: CSS像素、SVG、Live2D、Godot、PixiJS都可作为渲染后端
3. **Electron**: 成熟的桌面框架，完整的透明窗口和系统托盘支持
4. **安全第一**: IPC token认证、消息净化、SVG消毒、路径遍历防护
5. **测试驱动**: 核心模块100%可测试，不依赖Electron/Tauri运行时

### 2.2 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UniPet Desktop App                           │
│  (Electron 36 + Vue 3 + TypeScript)                                  │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │  Rendering   │  │  Pet State   │  │     Agent Adapters         │ │
│  │  Engine      │←─│  Manager     │←─│  ┌──────┐ ┌─────┐ ┌─────┐│ │
│  │  (Pluggable) │  │  (Priority)  │  │  │ MCP  │ │Hook │ │感知 ││ │
│  └─────────────┘  └──────────────┘  │  │Server│ │适配 │ │适配 ││ │
│         ↑                            │  └──┬───┘ └──┬──┘ └──┬──┘│ │
│  ┌──────┴──────┐                    │     │        │       │    │ │
│  │  Renderer   │                    │  ┌──┴────────┴───────┴──┐ │ │
│  │  Plugins:   │                    │  │  Unified Event Bus   │ │ │
│  │  • CSS Pixel│                    │  │  (PetEvent interface) │ │ │
│  │  • SVG      │                    │  └──────────────────────┘ │ │
│  │  • Sprite   │                    └────────────────────────────┘ │
│  └─────────────┘  ┌──────────────┐  ┌────────────────────────────┐ │
│                   │  Emotion     │  │     Theme System            │ │
│                   │  Engine      │  │  (schema + variants +       │ │
│                   │  (PAD Model)  │  │   user overrides + cache)   │ │
│                   └──────────────┘  └────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Platform Layer (Electron)                     │  │
│  │  • 透明窗口 (BrowserWindow transparent)                       │  │
│  │  • 双窗口架构 (render + hit)                                  │  │
│  │  • 系统托盘 (Tray + i18n)                                     │  │
│  │  • HTTP Server (localhost:23333)                              │  │
│  │  • 配置持久化 (~/.unipet/settings.json)                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         ↑              ↑               ↑              ↑
    ┌────┴───┐    ┌─────┴────┐   ┌──────┴─────┐  ┌────┴──────┐
    │Claude  │    │Codex CLI │   │Custom LLM  │  │MCP-capable│
    │Code    │    │Cursor    │   │Agent       │  │Agent      │
    └────────┘    └──────────┘   └────────────┘  └───────────┘
```

### 2.3 核心模块设计

#### 模块 1: Unified Event Bus (统一事件总线)

从 clawd-on-desk 的状态机 + openpets 的反应系统 + qq-slime-pet 的AI驱动 合并而来。

```typescript
// packages/core/src/events.ts

/** 所有可能的宠物状态 — 唯一真相来源 */
export const PET_STATES = [
  // 基础状态 (来自 clawd-on-desk)
  'sleeping', 'idle', 'thinking', 'working', 'juggling',
  'attention', 'sweeping', 'notification', 'error',
  // Agent交互状态 (来自 openpets)
  'waving', 'editing', 'testing', 'waiting', 'celebrating',
  // AI感知状态 (来自 qq-slime-pet)
  'walking', 'crawling', 'shocked', 'happy', 'angry', 'love',
  // 功能状态
  'dragging', 'peeking', 'talking',
] as const;

export type PetState = typeof PET_STATES[number];

/** 优先级映射 — 高优先级状态覆盖低优先级 */
export const STATE_PRIORITY: Record<PetState, number> = {
  error: 10, notification: 9, shocked: 8,
  sweeping: 7, attention: 7, celebrating: 7,
  juggling: 6, testing: 6,
  working: 5, editing: 5, talking: 5,
  thinking: 4, waiting: 4,
  happy: 3, love: 3, angry: 3,
  waving: 2, walking: 2, crawling: 2,
  idle: 1,
  sleeping: 0, dragging: 0, peeking: 0,
};

/** 统一事件接口 — 所有适配器输出此格式 */
export interface PetEvent {
  type: 'state_change' | 'speech' | 'emotion' | 'move' | 'command';
  source: string;           // 'claude-code' | 'codex' | 'mcp' | 'ai-perception' | 'user'
  state?: PetState;
  message?: string;         // 140字符限制，已净化
  emotion?: EmotionVector;
  move?: MoveTarget;
  command?: string;
  meta?: Record<string, unknown>;
  timestamp: number;
}

/** 情感向量 — 多维情感模型 (借鉴 Agentic-Desktop-Pet 设计) */
export interface EmotionVector {
  valence: number;    // -1 (消极) to +1 (积极)
  arousal: number;    // 0 (平静) to 1 (兴奋)
  dominance: number;  // 0 (被动) to 1 (主动)
}

/** 移动目标 */
export type MoveTarget =
  | 'stay' | 'center'
  | 'edge-left' | 'edge-right' | 'edge-top' | 'edge-bottom'
  | 'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br';
```

#### 模块 2: Agent Adapter Layer (Agent适配层)

融合 clawd-on-desk 的多agent注册 + openpets 的MCP协议 + qq-slime-pet 的多模态感知。

```typescript
// packages/core/src/adapters/adapter.ts

export interface AgentAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: AgentCapabilities;

  /** 启动适配器（注册hooks、启动MCP server等） */
  start(ctx: AdapterContext): Promise<void>;

  /** 停止适配器 */
  stop(): Promise<void>;

  /** 检查此agent是否已安装/可用 */
  detect(): Promise<boolean>;

  /** 一键安装集成（写入agent配置文件） */
  install(): Promise<void>;

  /** 卸载集成 */
  uninstall(): Promise<void>;

  /** 健康检查 */
  health(): Promise<HealthStatus>;
}

export interface AgentCapabilities {
  /** 支持状态推送（hooks/plugin） */
  pushStates: boolean;
  /** 支持MCP工具调用 */
  mcpTools: boolean;
  /** 支持权限气泡（阻塞式hook） */
  permissionBubbles: boolean;
  /** 支持子agent检测 */
  subagentDetection: boolean;
  /** 支持会话结束通知 */
  sessionEnd: boolean;
}

export interface AdapterContext {
  /** 发送事件到统一事件总线 */
  emit(event: PetEvent): void;
  /** 获取配置 */
  getConfig(): AdapterConfig;
  /** HTTP服务器端口（用于hook回调） */
  httpPort: number;
  /** 日志 */
  log: Logger;
}
```

**内置适配器:**

| 适配器 | 来源 | 接入方式 |
|--------|------|---------|
| `ClaudeCodeAdapter` | clawd-on-desk | Command hooks + HTTP blocking hooks |
| `CodexAdapter` | clawd-on-desk | Official hooks + JSONL polling |
| `CursorAdapter` | clawd-on-desk | Cursor hooks.json |
| `GeminiAdapter` | clawd-on-desk | Gemini settings.json hooks |
| `CopilotAdapter` | clawd-on-desk | Copilot hooks.json |
| `MCPAdapter` | openpets | MCP Server (stdio transport) |
| `HTTPAdapter` | Agentic-Desktop-Pet | REST API + SSE |
| `AIPerceptionAdapter` | qq-slime-pet | 定时截屏 + 多模态LLM |
| `GitAdapter` | 新设计 | Git状态监听(push/merge/conflict) |
| `CustomAdapter` | 新设计 | 用户自定义webhook/脚本 |

#### 模块 3: Rendering Engine (渲染引擎)

融合 BongoCat 的跨平台窗口 + qq-slime-pet 的像素渲染 + clawd-on-desk 的SVG系统。

```typescript
// packages/core/src/renderer/renderer.ts

export interface RendererPlugin {
  readonly id: string;
  readonly name: string;
  readonly supportedFormats: string[];  // 'pixel' | 'svg' | 'gif' | 'apng' | 'live2d' | 'spritesheet'

  /** 初始化渲染器（创建canvas/WebGL上下文等） */
  init(container: HTMLElement, config: RendererConfig): Promise<void>;

  /** 切换状态动画 */
  setState(state: PetState, options?: TransitionOptions): Promise<void>;

  /** 显示/隐藏 */
  setVisible(visible: boolean): void;

  /** 设置缩放 */
  setScale(scale: number): void;

  /** 更新（每帧调用，用于自定义动画） */
  update(dt: number): void;

  /** 销毁 */
  destroy(): void;
}

/** 内置渲染器 */
export const BUILTIN_RENDERERS = {
  'css-pixel': CSSPixelRenderer,     // qq-slime-pet 的逐行像素变形
  'svg': SVGRenderer,                // clawd-on-desk 的SVG/GIF/APNG
  'spritesheet': SpriteRenderer,     // openpets 的精灵表动画
  'live2d': Live2DRenderer,          // BongoCat 的PixiJS+Live2D
} as const;
```

#### 模块 4: Theme System (主题系统)

融合 clawd-on-desk 的完整schema + openpets 的宠物包格式。

```typescript
// packages/core/src/theme/theme-schema.ts

export interface ThemeDefinition {
  schemaVersion: 1;
  id: string;                         // /^[a-z0-9][a-z0-9_-]{0,63}$/
  displayName: string;
  description: string;
  author: string;
  renderer: 'css-pixel' | 'svg' | 'spritesheet' | 'live2d';
  license: string;

  /** 渲染器特定配置 */
  rendererConfig: CSSPixelConfig | SVGConfig | SpriteConfig | Live2DConfig;

  /** 状态 → 视觉资源映射 */
  states: Record<PetState, StateDefinition>;

  /** 变体（部分覆盖） */
  variants?: Record<string, ThemeVariant>;

  /** 时间参数 */
  timings: ThemeTimings;

  /** 碰撞盒（可点击区域） */
  hitBoxes?: Record<string, HitBox>;

  /** 音效 */
  sounds?: Record<string, string>;

  /** 睡眠序列 */
  sleepSequence?: 'full' | 'direct';

  /** 空闲动画列表 */
  idleAnimations?: string[];
}

/** CSS像素渲染器配置 (来自 qq-slime-pet) */
export interface CSSPixelConfig {
  gridSize: number;          // 16 (16x16像素网格)
  upscale: number;           // 8 (放大倍数)
  palette: Record<string, string>;  // 字符→颜色映射
  body: string[];            // 16行字符网格
  faces: Record<string, FacePatch>;
  wiggleProfiles: Record<string, WiggleProfile>;
}

/** 精灵表渲染器配置 (来自 openpets) */
export interface SpriteConfig {
  spritesheet: string;       // 图片文件名
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frameRate?: number;
}

/** SVG渲染器配置 (来自 clawd-on-desk) */
export interface SVGConfig {
  viewBox: string;
  rendering: 'auto' | 'object';
  eyeTracking?: EyeTrackingConfig;
  trustedRuntime?: boolean;
}

/** Live2D渲染器配置 (来自 BongoCat) */
export interface Live2DConfig {
  modelFile: string;         // .moc3 文件
  modelConfig: string;       // .model3.json 文件
  parameterMap: Record<PetState, ParameterMapping[]>;
}
```

#### 模块 5: Emotion Engine (情感引擎)

融合 clawd-on-desk 的状态优先级 + qq-slime-pet 的动画驱动 + 新设计的情感向量。

```typescript
// packages/core/src/emotion/emotion.ts

export class EmotionEngine {
  private current: EmotionVector = { valence: 0, arousal: 0.1, dominance: 0.5 };
  private decayTimer: number = 0;

  /** 接收事件并更新情感状态 */
  processEvent(event: PetEvent): EmotionVector {
    if (event.emotion) {
      // 外部提供的情感向量（来自AI感知或MCP）
      this.blend(event.emotion, 0.6);
    } else if (event.state) {
      // 从状态推断情感
      const inferred = STATE_EMOTION_MAP[event.state];
      this.blend(inferred, 0.4);
    }
    return { ...this.current };
  }

  /** 时间衰减 — 情感随时间回归中性 */
  update(dt: number): EmotionVector {
    const decayRate = 0.02; // 每秒衰减2%
    this.current.valence *= (1 - decayRate * dt);
    this.current.arousal *= (1 - decayRate * dt * 0.5);
    this.current.dominance += (0.5 - this.current.dominance) * decayRate * dt;
    return { ...this.current };
  }

  /** 混合新情感 */
  private blend(incoming: EmotionVector, weight: number): void {
    this.current.valence = lerp(this.current.valence, incoming.valence, weight);
    this.current.arousal = lerp(this.current.arousal, incoming.arousal, weight);
    this.current.dominance = lerp(this.current.dominance, incoming.dominance, weight);
  }

  /** 从情感向量推断最佳宠物状态 */
  inferState(): PetState {
    const { valence, arousal } = this.current;
    if (arousal > 0.7 && valence > 0.3) return 'happy';
    if (arousal > 0.7 && valence < -0.3) return 'angry';
    if (arousal < 0.2 && valence > 0.5) return 'love';
    if (arousal < 0.15) return 'idle';
    return 'idle';
  }
}

const STATE_EMOTION_MAP: Record<string, EmotionVector> = {
  error:       { valence: -0.8, arousal: 0.9, dominance: 0.3 },
  notification:{ valence: 0.0,  arousal: 0.7, dominance: 0.4 },
  attention:   { valence: 0.8,  arousal: 0.6, dominance: 0.7 },
  working:     { valence: 0.1,  arousal: 0.5, dominance: 0.6 },
  thinking:    { valence: 0.0,  arousal: 0.3, dominance: 0.4 },
  idle:        { valence: 0.1,  arousal: 0.1, dominance: 0.5 },
  sleeping:    { valence: 0.0,  arousal: 0.0, dominance: 0.2 },
  celebrating: { valence: 0.9,  arousal: 0.8, dominance: 0.8 },
  shocked:     { valence: -0.3, arousal: 0.95, dominance: 0.2 },
  happy:       { valence: 0.7,  arousal: 0.5, dominance: 0.6 },
  angry:       { valence: -0.6, arousal: 0.8, dominance: 0.7 },
  love:        { valence: 0.9,  arousal: 0.3, dominance: 0.4 },
};
```

#### 模块 6: Platform Layer (平台层)

基于 Electron 的跨平台窗口管理与系统集成。

```typescript
// apps/desktop/electron/main.ts

// 统一平台接口 — Electron BrowserWindow API
export interface PlatformLayer {
  /** 显示宠物窗口 */
  showWindow(): void;

  /** 隐藏宠物窗口 */
  hideWindow(): void;

  /** 设置窗口置顶 */
  setAlwaysOnTop(enabled: boolean): void;

  /** 设置鼠标穿透 */
  setClickThrough(enabled: boolean): void;

  /** 设置截屏不可见 (setContentProtection) */
  setContentProtection(enabled: boolean): void;
}

// 平台实现:
// Windows: BrowserWindow transparent + setAlwaysOnTop + setIgnoreMouseEvents
// macOS:   BrowserWindow transparent + NSPanel-like behavior via Electron API
// Linux:   BrowserWindow transparent + compositor hints
```

#### 模块 7: Plugin System (插件系统) — 设计提案，未实现

> **注意**: 此模块为设计提案，当前尚未实现。以下为接口设计参考。

```typescript
// packages/core/src/plugins/plugin.ts

export interface PetPlugin {
  id: string;
  name: string;
  version: string;

  /** 插件激活时调用 */
  activate(context: PluginContext): Promise<void>;

  /** 插件停用时调用 */
  deactivate(): Promise<void>;
}

export interface PluginContext {
  /** 注册自定义agent适配器 */
  registerAdapter(adapter: AgentAdapter): void;

  /** 注册自定义渲染器 */
  registerRenderer(renderer: RendererPlugin): void;

  /** 注册自定义宠物状态 */
  registerState(state: string, priority: number): void;

  /** 监听事件 */
  on(event: string, handler: (data: unknown) => void): void;

  /** 发送事件 */
  emit(event: PetEvent): void;

  /** 获取/设置配置 */
  config: ConfigStore;
}
```

### 2.4 数据流

```
┌──────────────────────────────────────────────────────────────┐
│ 完整事件流                                                    │
│                                                              │
│  Agent Event                                                 │
│    │                                                         │
│    ▼                                                         │
│  Agent Adapter (Hook/MCP/HTTP/截屏)                          │
│    │ 统一转换为 PetEvent                                      │
│    ▼                                                         │
│  Event Bus (发布/订阅)                                        │
│    ├─→ State Manager (优先级状态机)                            │
│    │     ├─→ 检查多会话dominant state                         │
│    │     ├─→ 睡眠序列管理                                     │
│    │     └─→ 输出: resolved state                             │
│    ├─→ Emotion Engine (情感向量更新)                           │
│    │     ├─→ 时间衰减                                         │
│    │     └─→ 输出: emotion vector                             │
│    └─→ Speech Bubble Manager                                 │
│          ├─→ 消息净化 (140字符, 无代码/URL/路径)               │
│          └─→ 输出: bubble text                                │
│                                                              │
│  Rendering Pipeline                                          │
│    │                                                         │
│    ▼                                                         │
│  Renderer Plugin (CSS-Pixel/SVG/Sprite/Live2D)               │
│    ├─→ 状态→动画映射                                          │
│    ├─→ 情感→视觉效果 (色彩/粒子/表情)                          │
│    ├─→ 逐帧更新 (60fps)                                      │
│    └─→ 低功耗空闲暂停 (5秒无变化后)                            │
│                                                              │
│  Platform Layer (Electron/TypeScript)                          │
│    ├─→ 透明窗口管理                                           │
│    ├─→ 窗口定位 (移动/边缘吸附/巡逻)                           │
│    ├─→ ContentProtection (截屏不可见)                         │
│    └─→ 系统托盘                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、技术栈选型

### 3.1 核心技术栈

| 层 | 选择 | 来源 | 理由 |
|----|------|------|------|
| **桌面框架** | Electron 36 | clawd-on-desk | ~150MB包大小，成熟生态，透明窗口+系统托盘 |
| **前端框架** | Vue 3 + TypeScript | BongoCat | 组合式API适合桌面宠物，类型安全 |
| **状态管理** | 自定义优先级状态机 | clawd-on-desk | 24状态优先级解析，多会话支持 |
| **渲染引擎** | 可插拔 | 综合 | CSS-Pixel + SVG + Sprite + Live2D |
| **动画库** | Canvas 2D + CSS | qq-slime-pet + BongoCat | 高性能像素渲染 + SVG/CSS过渡 |
| **MCP实现** | @modelcontextprotocol/sdk | openpets | 官方SDK，标准协议 |
| **配置存储** | 原子JSON文件写入 | clawd-on-desk | write-to-temp + rename 防崩溃 |
| **构建** | pnpm workspaces + Turborepo | openpets | monorepo管理 |
| **测试** | Vitest + Playwright | 新选择 | 快速单元测试 + E2E |

### 3.2 Monorepo结构

```
unipet/
├── apps/
│   └── desktop/                    # Electron 36 桌面应用
│       ├── electron/               # Electron 主进程
│       │   ├── main.ts             # 双窗口架构 + 系统托盘 + IPC
│       │   ├── preload.ts          # contextBridge 预加载
│       │   └── http-server.ts      # localhost HTTP Server
│       ├── src/                    # Vue 3 渲染进程
│       │   ├── App.vue
│       │   ├── main.ts
│       │   ├── router/
│       │   ├── pages/
│       │   │   ├── pet/            # 主宠物窗口
│       │   │   └── settings/       # 设置窗口
│       │   ├── stores/             # Pinia stores (pet, settings)
│       │   ├── composables/        # useElectron, useI18n, useTheme
│       │   └── lib/                # adapters, pet-characters
│       └── tests/e2e/              # Playwright E2E 测试
│
├── packages/
│   ├── core/                       # 核心逻辑（无平台依赖）
│   │   └── src/
│   │       ├── events.ts           # PetEvent 接口 + 状态定义
│   │       ├── constants.ts        # 常量定义
│   │       ├── state-manager.ts    # 优先级状态机
│   │       ├── emotion-engine.ts   # PAD情感向量引擎
│   │       ├── event-bus.ts        # 发布/订阅事件总线
│   │       ├── bubble-manager.ts   # 气泡消息管理
│   │       ├── logger.ts           # 结构化日志
│   │       └── config.ts           # 配置schema
│   │
│   ├── adapters/                   # Agent 适配器
│   │   └── src/
│   │       ├── adapter.ts          # 基础接口
│   │       ├── registry.ts         # 适配器注册中心
│   │       ├── agents.ts           # 12 内置 agent 定义
│   │       ├── claude-code/        # Claude Code hooks 适配器
│   │       ├── mcp/                # MCP 适配器 + 工具定义
│   │       ├── http/               # HTTP REST + SSE 适配器
│   │       └── git/                # Git 状态轮询适配器
│   │
│   ├── renderers/                  # 渲染器插件
│   │   └── src/
│   │       ├── renderer.ts         # 基础接口
│   │       ├── css-pixel/          # 16x16 Canvas 像素渲染
│   │       ├── svg/                # SVG 文件交换 + 眼球追踪
│   │       └── sprite/             # 精灵表帧动画
│   │
│   ├── themes/                     # 主题系统
│   │   └── src/
│   │       ├── schema.ts           # 主题JSON schema + 验证
│   │       ├── loader.ts           # 主题发现/加载/验证
│   │       └── sanitizer.ts        # SVG安全净化
│   │
│   ├── mcp-server/                 # 独立 MCP Server
│   │   └── src/
│   │       ├── index.ts            # CLI入口
│   │       ├── server.ts           # MCP Server + 4工具
│   │       └── ipc-client.ts       # IPC客户端 (发现文件)
│   │
│   └── cli/                        # CLI 工具
│       └── src/
│           └── index.ts            # mcp/status/react/say 命令
│
├── themes/                         # 内置主题
│   ├── pixel-cat/                  # 像素猫（CSS-Pixel）
│   ├── pixel-slime/                # 像素史莱姆（CSS-Pixel）
│   ├── pixel-crab/                 # 像素螃蟹（CSS-Pixel）
│   └── svg-cat/                    # SVG猫（SVG）
│
├── hooks/                          # Agent hook 脚本
│   ├── claude-hook.js              # Claude Code hooks
│   ├── codex-hook.js               # Codex CLI hooks
│   ├── cursor-hook.js              # Cursor hooks
│   ├── gemini-hook.js              # Gemini CLI hooks
│   ├── copilot-hook.js             # GitHub Copilot hooks
│   ├── codebuddy-hook.js           # CodeBuddy hooks
│   ├── kiro-hook.js                # Kiro hooks
│   ├── kimi-hook.js                # Kimi hooks
│   ├── shared.mjs                  # 共享工具函数
│   └── install-hooks.js            # 一键安装脚本
│
├── ARCHITECTURE.md
├── README.md
├── progress.txt
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── package.json
```

---

## 四、实施路线图

### Phase 1: 核心骨架 ✅ 已完成
- [x] Monorepo搭建 (pnpm + Turborepo + tsconfig)
- [x] `@unipet/core` — PetEvent, EventBus, StateManager
- [x] `@unipet/renderers/css-pixel` — 移植 qq-slime-pet 的渲染引擎
- [x] Electron 桌面应用骨架 — 透明窗口 + 系统托盘
- [x] 基础状态机 — idle/thinking/working/error/sleeping

### Phase 2: Agent接入 ✅ 已完成
- [x] `@unipet/adapters` — 适配器接口 + 注册中心
- [x] Claude Code 适配器 — 移植 clawd-on-desk 的hooks
- [x] MCP Server 适配器 — 移植 openpets 的MCP server
- [x] HTTP/SSE 适配器 — 移植 Agentic-Desktop-Pet 的API
- [x] `@unipet/mcp-server` — 独立MCP server包

### Phase 3: 主题与渲染 ✅ 已完成
- [x] `@unipet/themes` — 主题schema + 加载器 + 验证
- [x] SVG渲染器 — 移植 clawd-on-desk 的SVG系统
- [x] Spritesheet渲染器 — 移植 openpets 的精灵表
- [x] 主题变体 + 用户覆盖系统
- [x] SVG安全净化器

### Phase 4: 高级功能 ✅ 已完成
- [x] EmotionEngine — PAD情感向量 + 时间衰减
- [x] 气泡系统 — 通知/权限/语音气泡
- [x] 睡眠序列 — yawning → dozing → collapsing → sleeping
- [x] 多会话状态解析
- [x] 边缘吸附 + 巡逻 + 窥视

### Phase 5: 跨平台打磨 (Electron 已覆盖基础)
- [x] Windows: BrowserWindow + setAlwaysOnTop + setIgnoreMouseEvents
- [ ] macOS: NSPanel 原生面板 (待验证)
- [ ] Linux: Wayland/X11 透明窗口适配 (待测试)
- [ ] ContentProtection — setContentProtection API
- [ ] 全局输入捕获 — 待集成

### Phase 6: 生态与发布 (进行中)
- [x] CLI工具 — 基础命令 (mcp/status/react/say)
- [ ] `unipet install` / `unipet doctor` / `unipet theme`
- [ ] 主题市场 — 远程目录 + 本地发现
- [ ] Live2D渲染器（可选）
- [ ] AI感知适配器 — 截屏 + 多模态LLM
- [ ] 文档站

---

## 五、与现有项目的差异化

| 维度 | clawd-on-desk | openpets | UniPet |
|------|--------------|----------|--------|
| 桌面框架 | Electron (~150MB) | Electron (~150MB) | **Electron 36 (~150MB)** |
| Agent支持 | 12种(每种单独适配) | MCP为主 | **统一适配层 + 10种适配器** |
| AI能力 | 无 | 无 | **可选LLM对话 + 多模态感知(计划中)** |
| 情感系统 | 10状态优先级 | 11反应 | **多维情感向量(PAD) + 时间衰减** |
| 渲染方式 | SVG/GIF/APNG | 精灵表 | **可插拔(3种渲染器)** |
| 主题系统 | 完整但SVG-only | 精灵表only | **统一schema支持所有渲染器** |
| 测试 | ~160个 | 0个 | **核心75+测试** |
| 语言 | JavaScript(CJS) | TypeScript | **TypeScript** |
| 插件系统 | 无 | 无 | **完整插件API** |

---

## 六、关键技术决策

### 决策1: 为什么选Electron而非Tauri?

| 因素 | Electron | Tauri 2 |
|------|----------|---------|
| 包大小 | ~150MB (捆绑Chromium) | ~5MB (使用系统WebView) |
| 内存占用 | ~200MB+ | ~30MB |
| 透明窗口 | BrowserWindow transparent | 需要平台特定插件 |
| 生态成熟度 | 非常成熟 | 成长中 |
| 开发速度 | 快（JS全栈） | 需要Rust知识 |
| NPM包兼容 | 完全兼容 | 有限 |

项目选择 Electron 是因为：快速原型开发、成熟的透明窗口支持、完善的系统托盘 API。未来可考虑迁移到 Tauri 以优化包大小。

### 决策2: 为什么用自定义状态机而非 XState?

项目最终选择了自定义优先级状态机而非 XState，原因如下：
- 桌面宠物的状态模型是扁平优先级结构（非层级状态图），XState 的状态图抽象过于复杂
- 自定义实现更轻量，无额外依赖
- 优先级解析逻辑（高优先级覆盖低优先级）更直观
- 多会话 dominant state 解析是领域特定逻辑，通用状态机库无直接支持
- 24 个状态 + 优先级映射 + 睡眠序列，用简单 TypeScript 即可清晰表达

### 决策3: 为什么情感系统用向量而非离散状态?

离散状态（happy/sad/angry）的问题：
- 状态之间没有平滑过渡
- 无法表达混合情感（既兴奋又紧张）
- 新增状态需要修改所有映射

三维向量（valence/arousal/dominance）的优势：
- 连续空间，自然衰减
- 可以映射到任意渲染器的视觉效果
- 心理学有理论基础（PAD情感模型）
- 新渲染器只需定义向量→视觉的映射

### 决策4: 为什么MCP Server是独立包?

从openpets学到的教训：MCP server应该是独立的npm包，通过IPC与桌面应用通信。
- Agent可以 `npx @unipet/mcp` 启动，无需桌面应用预运行
- 但桌面应用未运行时，MCP tools返回graceful error
- 独立版本发布周期
- 可以被其他项目复用
