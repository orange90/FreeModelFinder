# FreeModelFinder

聚合 **OpenRouter / Google Gemini** 等提供商的免费大模型，通过一个跑在本地的**多协议 API 网关**统一暴露 —— 让 Cursor、Cline、Continue、Claude Code 等任何本地 AI 工具都能零改动接入免费模型。

## ✨ 功能

- 🧠 **Chat Web UI** — 选择任意接入的免费模型进行流式对话
- 🌐 **本地 API 网关** — `localhost` 上同时提供 OpenAI / Anthropic / Gemini 三套兼容协议
- ⌨️ **CLI (`fmf`)** — 密钥管理、模型切换、终端聊天，`/model` 指令一键切换
- 🖥️ **macOS 桌面小工具** — 基于 Tauri 的菜单栏 GUI（可选）

## 📊 免费模型清单

数据源：根目录 [`free-models.json`](./free-models.json)。以下表格由 GitHub Action 定期自动更新，请勿手动编辑标记之间的内容。

<!-- FREE_MODELS_TABLE:START -->

> 自动生成，请勿手动编辑；数据源：`free-models.json`。最后更新：2026-07-26

| 提供商 | 模型 | 模态 | 上下文 (K) | 速率限制 | 吞吐 (tps) | 智能水平 | API Base URL |
| --- | --- | --- | ---: | --- | ---: | --- | --- |
| [OpenRouter](https://openrouter.ai) | `meta-llama/llama-3.1-8b-instruct:free` | 文本 | 131 | 20 RPM / 200 RPD | 90 | AA 41 · Elo 1176 | `https://openrouter.ai/api/v1` |
| [OpenRouter](https://openrouter.ai) | `meta-llama/llama-3.3-70b-instruct:free` | 文本 | 131 | 20 RPM / 200 RPD | 40 | AA 68 · Elo 1260 | `https://openrouter.ai/api/v1` |
| [OpenRouter](https://openrouter.ai) | `deepseek/deepseek-r1:free` | 推理 | 163 | 20 RPM / 200 RPD | 25 | AA 89 · Elo 1361 | `https://openrouter.ai/api/v1` |
| [OpenRouter](https://openrouter.ai) | `deepseek/deepseek-chat-v3:free` | 文本 | 163 | 20 RPM / 200 RPD | 35 | AA 80 · Elo 1318 | `https://openrouter.ai/api/v1` |
| [OpenRouter](https://openrouter.ai) | `qwen/qwen-2.5-72b-instruct:free` | 文本 | 32 | 20 RPM / 200 RPD | 30 | AA 72 · Elo 1257 | `https://openrouter.ai/api/v1` |
| [OpenRouter](https://openrouter.ai) | `google/gemma-2-9b-it:free` | 文本 | 8 | 20 RPM / 200 RPD | 80 | AA 40 · Elo 1190 | `https://openrouter.ai/api/v1` |
| [OpenRouter](https://openrouter.ai) | `mistralai/mistral-7b-instruct:free` | 文本 | 32 | 20 RPM / 200 RPD | 90 | AA 30 · Elo 1072 | `https://openrouter.ai/api/v1` |
| [Google Gemini (AI Studio)](https://aistudio.google.com) | `gemini-2.0-flash` | 视觉 | 1,000 | 15 RPM / 1,500 RPD | 200 | AA 73 · Elo 1355 | `https://generativelanguage.googleapis.com/v1beta` |
| [Google Gemini (AI Studio)](https://aistudio.google.com) | `gemini-2.0-flash-lite` | 文本 | 1,000 | 30 RPM / 1,500 RPD | 250 | AA 65 · Elo 1310 | `https://generativelanguage.googleapis.com/v1beta` |
| [Google Gemini (AI Studio)](https://aistudio.google.com) | `gemini-1.5-flash` | 视觉 | 1,000 | 15 RPM / 1,500 RPD | 180 | AA 60 · Elo 1271 | `https://generativelanguage.googleapis.com/v1beta` |
| [Google Gemini (AI Studio)](https://aistudio.google.com) | `gemini-1.5-flash-8b` | 文本 | 1,000 | 15 RPM / 1,500 RPD | 220 | AA 52 · Elo 1211 | `https://generativelanguage.googleapis.com/v1beta` |
| [Google Gemini (AI Studio)](https://aistudio.google.com) | `gemini-1.5-pro` | 视觉 | 2,000 | 2 RPM / 50 RPD | 60 | AA 71 · Elo 1301 | `https://generativelanguage.googleapis.com/v1beta` |
| [硅基流动 SiliconFlow](https://siliconflow.cn) | `Qwen/Qwen2.5-7B-Instruct` | 文本 | 32 | — | 60 | AA 45 · Elo 1180 | `https://api.siliconflow.cn/v1` |
| [硅基流动 SiliconFlow](https://siliconflow.cn) | `Qwen/Qwen3-8B` | 文本 | 32 | — | 60 | AA 55 · Elo 1220 | `https://api.siliconflow.cn/v1` |
| [硅基流动 SiliconFlow](https://siliconflow.cn) | `Qwen/Qwen2.5-Coder-7B-Instruct` | 文本 | 32 | — | 55 | AA 48 · Elo 1190 | `https://api.siliconflow.cn/v1` |
| [硅基流动 SiliconFlow](https://siliconflow.cn) | `THUDM/GLM-4-9B-0414` | 文本 | 32 | — | 55 | AA 52 · Elo 1210 | `https://api.siliconflow.cn/v1` |
| [硅基流动 SiliconFlow](https://siliconflow.cn) | `THUDM/GLM-Z1-9B-0414` | 推理 | 32 | — | 40 | AA 60 · Elo 1240 | `https://api.siliconflow.cn/v1` |
| [硅基流动 SiliconFlow](https://siliconflow.cn) | `THUDM/GLM-4-Flash` | 文本 | 128 | — | 90 | AA 50 · Elo 1205 | `https://api.siliconflow.cn/v1` |
| [硅基流动 SiliconFlow](https://siliconflow.cn) | `tencent/Hunyuan-MT-7B` | 文本 | 32 | — | 60 | AA 42 · Elo 1160 | `https://api.siliconflow.cn/v1` |
| [Cohere](https://cohere.com) | `command-a-reasoning-08-2025` | 推理 | 256 | 20 RPM | 45 | AA 78 · Elo 1305 | `https://api.cohere.ai/compatibility/v1` |
| [Cohere](https://cohere.com) | `command-a-vision-07-2025` | 视觉 | 128 | 20 RPM | 55 | AA 72 · Elo 1280 | `https://api.cohere.ai/compatibility/v1` |
| [Cohere](https://cohere.com) | `command-r-plus-08-2024` | 文本 | 128 | 20 RPM | 50 | AA 65 · Elo 1255 | `https://api.cohere.ai/compatibility/v1` |
| [Cohere](https://cohere.com) | `command-r-08-2024` | 文本 | 128 | 20 RPM | 80 | AA 55 · Elo 1210 | `https://api.cohere.ai/compatibility/v1` |
| [Cohere](https://cohere.com) | `command-r7b-12-2024` | 文本 | 128 | 20 RPM | 120 | AA 42 · Elo 1150 | `https://api.cohere.ai/compatibility/v1` |
| [HuggingFace Router](https://huggingface.co) | `deepseek-ai/DeepSeek-V3-0324` | 文本 | 128 | — | 30 | AA 82 · Elo 1330 | `https://router.huggingface.co/v1` |
| [HuggingFace Router](https://huggingface.co) | `deepseek-ai/DeepSeek-R1-0528` | 推理 | 128 | — | 25 | AA 90 · Elo 1370 | `https://router.huggingface.co/v1` |
| [HuggingFace Router](https://huggingface.co) | `meta-llama/Llama-3.3-70B-Instruct` | 文本 | 128 | — | 40 | AA 68 · Elo 1260 | `https://router.huggingface.co/v1` |
| [HuggingFace Router](https://huggingface.co) | `Qwen/Qwen2.5-72B-Instruct` | 文本 | 32 | — | 35 | AA 72 · Elo 1257 | `https://router.huggingface.co/v1` |
| [HuggingFace Router](https://huggingface.co) | `Qwen/Qwen2.5-Coder-32B-Instruct` | 文本 | 32 | — | 40 | AA 65 · Elo 1230 | `https://router.huggingface.co/v1` |
| [HuggingFace Router](https://huggingface.co) | `zai-org/GLM-4.5` | 文本 | 128 | — | 40 | AA 75 · Elo 1290 | `https://router.huggingface.co/v1` |
| [HuggingFace Router](https://huggingface.co) | `moonshotai/Kimi-K2-Instruct` | 文本 | 128 | — | 45 | AA 70 · Elo 1275 | `https://router.huggingface.co/v1` |
| [HuggingFace Router](https://huggingface.co) | `google/gemma-3-27b-it` | 文本 | 128 | — | 55 | AA 58 · Elo 1230 | `https://router.huggingface.co/v1` |
| [HuggingFace Router](https://huggingface.co) | `MiniMaxAI/MiniMax-M1-80k` | 文本 | 80 | — | 40 | AA 62 · Elo 1240 | `https://router.huggingface.co/v1` |
| [SenseNova (商汤)](https://platform.sensenova.cn) | `sensenova-6.7-flash-lite` | 文本 | 256 | 5 RPM | 40 | AA 68 · Elo 1245 | `https://token.sensenova.cn/v1` |
| [SenseNova (商汤)](https://platform.sensenova.cn) | `deepseek-v4-flash` | 推理 | 1,024 | 5 RPM | 30 | AA 85 · Elo 1340 | `https://token.sensenova.cn/v1` |
| [SenseNova (商汤)](https://platform.sensenova.cn) | `glm-5.2` | 文本 | 1,024 | 5 RPM | 30 | AA 78 · Elo 1305 | `https://token.sensenova.cn/v1` |

### 各提供商免费额度说明

- **OpenRouter** — 免费模型：约 20 req/min、200 req/day；账户余额 > $10 可提升上限 [申请 Key](https://openrouter.ai/keys)
- **Google Gemini (AI Studio)** — Flash 15 RPM / 1500 RPD；Pro 2 RPM / 50 RPD [申请 Key](https://aistudio.google.com/apikey)
- **硅基流动 SiliconFlow** — 免费模型共享公用队列，高峰期可能排队；具体以控制台公告为准 [申请 Key](https://cloud.siliconflow.cn/account/ak)
- **Cohere** — Trial Key 免费 fair-use 约 20 RPM，仅用于开发测试 [申请 Key](https://dashboard.cohere.com/api-keys)
- **HuggingFace Router** — 免费层约 300 requests/hour，跨模型共享 [申请 Key](https://huggingface.co/settings/tokens)
- **SenseNova (商汤)** — 公测免费额度：sensenova-6.7-flash-lite 约 1500 请求 / 5 小时，deepseek-v4-flash 约 500 请求 / 5 小时 [申请 Key](https://platform.sensenova.cn)

<!-- FREE_MODELS_TABLE:END -->

## 📦 结构（Monorepo）

```
packages/
  core/     Provider 抽象 + 三协议转换 + 加密配置
  server/   Fastify 网关 (/v1/chat/completions, /v1/messages, /v1beta/...)
  cli/      `fmf` 命令行
  ui/       Next.js Chat 前端
apps/
  desktop/  Tauri 菜单栏应用
```

## 🚀 快速开始

### 1. 安装依赖

```bash
pnpm install
pnpm build
```

### 2. 配置至少一个 Provider

```bash
pnpm --filter @freemodelfinder/cli dev key add openrouter
# 或
pnpm --filter @freemodelfinder/cli dev key add gemini
```

Provider 密钥获取：
- OpenRouter: <https://openrouter.ai/keys>
- Google Gemini: <https://aistudio.google.com/apikey>

密钥使用 AES-256-GCM 加密，保存在 `~/.freemodelfinder/config.json`。

### 3. 启动网关

```bash
pnpm --filter @freemodelfinder/cli dev serve
# → server listening at http://127.0.0.1:11435
```

### 4. 启动 Chat Web UI（可选）

```bash
pnpm --filter @freemodelfinder/ui dev
# 浏览器打开 http://localhost:3000
```

### 5. 接入本地 AI 工具

将 Cursor / Cline / Continue 的 **OpenAI Base URL** 改为：

```
http://127.0.0.1:11435/v1
```

API Key 随便填（例如 `sk-anything`），本地网关不校验。模型名支持：

- `openrouter:<model>` — 例如 `openrouter:meta-llama/llama-3.1-8b-instruct:free`
- `gemini:<model>` — 例如 `gemini:gemini-2.0-flash`
- 直接写模型名，网关根据启发式路由到合适 Provider

Anthropic 兼容工具（如 Claude Code）Base URL 改为：`http://127.0.0.1:11435`，端点 `POST /v1/messages`。

Gemini 兼容工具 Base URL：`http://127.0.0.1:11435/v1beta`。

## 🧑‍💻 CLI 用法

```bash
fmf serve              # 启动网关（默认端口 11435）
fmf status             # 查看当前配置与已启用 Provider
fmf key add            # 交互式添加 API Key
fmf key list           # 列出 Provider 状态
fmf model list         # 列出所有免费模型
fmf model use          # 交互式选择默认模型
fmf model use gemini:gemini-2.0-flash
fmf chat               # 终端聊天，输入 /model 切换模型，/exit 退出
```

## 🖥️ macOS 桌面端（Tauri）

需要预先安装 Rust toolchain。

```bash
cd apps/desktop
pnpm dev              # 开发模式
pnpm build            # 打包 .dmg
```

菜单栏图标提供：Open FreeModelFinder / Restart Gateway / Quit。

> 图标资源需自行放置到 `apps/desktop/src-tauri/icons/`（`32x32.png`、`128x128.png`、`icon.icns`）后再打包。

## 🔒 安全与隐私

- 所有 Provider API Key 通过 AES-256-GCM 加密后写入 `~/.freemodelfinder/config.json`（`0600` 权限）。
- 派生密钥来自当前操作系统用户信息 + salt，跨机器不通用。
- 网关默认仅监听 `127.0.0.1`。

## 🧭 端口

默认 `11435`（避开 Ollama 的 `11434`）。可通过 `PORT` 环境变量或 `fmf serve --port` 覆盖。

## 🛣️ Roadmap

- [ ] 多 Key 轮询与自动故障切换
- [ ] Tool / Function calling 协议映射
- [ ] 本地 Ollama Provider 作为 fallback
- [ ] Cerebras / Together / SiliconFlow 免费额度接入
- [ ] macOS 代码签名与 notarize

## License

MIT
