# FreeModelFinder

FreeModelFinder 把多个提供商当前可用的免费文本模型汇总到一个只监听本机的网关，并提供内置 Web UI、CLI，以及 OpenAI、Anthropic、Gemini 三种兼容接口。

> v0.1 需要 Node.js 22.14 或更高版本。项目不会替你申请第三方 API Key，也不能保证第三方免费政策长期不变。

## 安装与启动

全局安装：

```bash
npm install -g freemodelfinder
fmf serve --open
```

也可以不安装，直接运行：

```bash
npx freemodelfinder serve --open
```

浏览器会打开 <http://127.0.0.1:11435>。模型页面、设置页面和 API Gateway 都由同一个 `fmf serve` 进程提供，不需要另外启动 Next.js。

最短上手流程：

1. 打开“设置”，为至少一个 Provider 填入 API Key 并启用。
2. 回到“模型”，刷新当前账号实际可见的免费模型。
3. 在“测试”中对话，或把下面的兼容 Base URL 填入其他客户端。

CLI 也可以管理常用操作：

```bash
fmf status
fmf key add openrouter
fmf key list
fmf model list
fmf model use openrouter:openrouter/free
fmf chat
fmf serve --port 11435
```

## “免费”的含义

FreeModelFinder 只把核心层明确标记为 `free: true` 的文本聊天模型放进目录。这里的“免费”可能是模型单价为零，也可能是账号自带的受限开发额度；它不等于无限量、永久免费或适合生产使用。启用付费、绑定计费项目或越过赠送额度，都可能改变实际账单。

下表是 2026-07-26 的审计基线。完整实测记录见 [Provider 审计报告](reports/provider-free-model-audit-2026-07-26.md)。

| 内置 Provider | 免费判定                                                                            | 主要计费与可用性风险                                               |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| OpenRouter    | 实时目录中仅保留 `:free` 或 `openrouter/free`、输入输出价格均为 0、仅输出文本的模型 | 免费账号通常共享日请求额度；上游目录和限额会变                     |
| Google Gemini | 账号实时目录与 Free Tier 白名单取交集，只保留支持 `generateContent` 的型号          | 绑定付费项目后可能适用付费层规则；地区和账号资格会影响可用性       |
| Zhipu AI      | 只列入官方免费 Flash 清单                                                           | 免费型号也可能拥塞或限流，静态清单需要随官方政策复审               |
| SiliconFlow   | 平台免费型号白名单与实时模型目录取交集                                              | 赠金或试用模型不视为零价；上游目录异常时会报告失败而非伪造空目录   |
| ModelScope    | API-Inference 免费型号清单与可用目录取交集                                          | 受账号日配额、单模型配额和账号绑定状态限制                         |
| NVIDIA NIM    | 只保留审核过的 build.nvidia.com 免费开发端点                                        | 面向学习、开发和原型，限速且不代表生产环境永久免费                 |
| GitHub Models | 目录中的文本输出模型使用账号自带原型开发额度                                        | 若主动启用 paid usage，免费额度后可能计费；非聊天模型已排除        |
| Cohere        | 只保留 Trial Key 与 Production Key 都明确免费的 `north-mini-code-1-0`               | 有速率限制；其他 Command 模型不再被标记为免费                      |
| Hugging Face  | 实时端点明确报告 `is_free`，或输入输出价格均为 0                                    | 普通 Router 模型可能消耗 credits 或按量收费，因此不会混入          |
| SenseNova     | 实时目录中输入、输出价格都为 0 的文本模型；接口不可用时使用审核过的免费清单         | 免费配额和型号可能变化；当前网关只处理文本，即使模型本身支持多模态 |

`Custom` 是用户自行配置的 OpenAI-compatible 来源，不属于上述十个内置 Provider。它的价格和安全性完全由用户确认。Cloudflare 已从 v0.1 Provider 清单移除。

## 兼容 API

模型 ID 建议写成完整的 `provider:model`，例如 `openrouter:openrouter/free`。裸模型名会尝试在当前目录解析；`auto` 会交给已启用的自动路由器。

Gateway 认证默认关闭。若在设置页启用了 Gateway Key，在请求中加入 `Authorization: Bearer <FMF_GATEWAY_KEY>`。也支持 `x-api-key` 和 `x-goog-api-key`。这里使用的是 FreeModelFinder 的 Gateway Key，不是上游 Provider Key。

### OpenAI

Base URL：`http://127.0.0.1:11435/v1`

```bash
curl http://127.0.0.1:11435/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <FMF_GATEWAY_KEY>' \
  -d '{
    "model": "openrouter:openrouter/free",
    "messages": [{"role": "user", "content": "Say hello in Chinese"}]
  }'
```

流式请求在同一请求体中增加 `"stream": true`，响应为 SSE，并以 `data: [DONE]` 结束。

### Anthropic

Base URL：`http://127.0.0.1:11435`

```bash
curl http://127.0.0.1:11435/v1/messages \
  -H 'content-type: application/json' \
  -H 'x-api-key: <FMF_GATEWAY_KEY>' \
  -d '{
    "model": "gemini:gemini-3.5-flash",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Say hello in Chinese"}]
  }'
```

增加 `"stream": true` 可获得 Anthropic 风格 SSE 事件。

### Gemini

Base URL：`http://127.0.0.1:11435/v1beta`

```bash
curl 'http://127.0.0.1:11435/v1beta/models/gemini:gemini-3.5-flash:generateContent' \
  -H 'content-type: application/json' \
  -H 'x-goog-api-key: <FMF_GATEWAY_KEY>' \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "Say hello in Chinese"}]}]
  }'
```

流式端点把末尾动作改为 `:streamGenerateContent`，响应为 SSE。

如果没有启用 Gateway 认证，可以删除以上认证 header。健康检查无需认证：

```bash
curl http://127.0.0.1:11435/healthz
```

返回值包含 `ok`、`service`、`version` 和时间戳。

## 配置、代理和排障

默认配置目录是 `~/.freemodelfinder`：

```text
~/.freemodelfinder/config.json   # version 2 配置；密文格式 v3
~/.freemodelfinder/master.key    # 本机随机主密钥
```

如果默认目录不可写，macOS 沙箱开发环境会退回 `~/Library/Caches/FreeModelFinder`。通过 `FREEMODELFINDER_HOME` 可以显式指定目录；测试和多实例运行时尤其有用：

```bash
FREEMODELFINDER_HOME=/path/to/fmf-home fmf serve
```

出站 Provider 请求读取 `HTTPS_PROXY`、`HTTP_PROXY`、`ALL_PROXY` 及对应小写变量，只支持 HTTP/HTTPS 代理。`LOG_LEVEL` 控制 Fastify 输出级别，例如 `LOG_LEVEL=debug fmf serve`；日志写到当前终端，不会默认创建日志文件。

常见问题：

- 端口被占用：停止已有进程，或运行 `fmf serve --port 11436`。服务始终绑定 `127.0.0.1`，没有远程监听参数。
- 浏览器没有自动打开：复制终端显示的 Web UI 地址手动打开；服务本身仍会继续运行。
- Provider 没有模型：在设置页查看该 Provider 的错误信息，确认 Key、账号资格、地区和免费额度。
- 重置配置：先停止 `fmf serve`，再删除整个配置目录。Unix 可运行 `rm -rf ~/.freemodelfinder`；PowerShell 可运行 `Remove-Item -Recurse -Force "$HOME/.freemodelfinder"`。此操作不可恢复，会删除所有 Key 和设置。
- 卸载 CLI：运行 `npm uninstall -g freemodelfinder`。如需同时清除数据，再手动删除配置目录。

## 安全边界

- HTTP 服务固定监听 loopback；v0.1 不支持远程网络部署。
- `/api/*` 管理接口只接受来自 loopback 且带本地 UI Origin/Referer 的请求；兼容协议端点可由 Gateway Key 保护。
- Provider Key、Custom Source Key 和 Gateway Key 使用随机本地主密钥与 AES-256-GCM v3 密文保存。旧 v1/v2 密文在成功读取后会原子迁移。
- 在支持 POSIX 权限的系统上，配置目录使用 `0700`，配置文件和主密钥使用 `0600`；Windows 仍以当前用户 ACL 为准。
- 这只是本地文件保护，不是 macOS Keychain、Windows Credential Manager 或其他系统密钥库。同一操作系统账户下的其他进程属于信任边界，能够读取主密钥和配置文件时也能够解密凭据。
- 免费目录和本地配额估算不能替代 Provider 控制台的账单、配额或使用条款。

## 当前协议范围与限制

v0.1 只承诺常用文本聊天字段与流式文本增量，不是三家 SDK 的完整替代实现。目前不支持：

- Tool / Function Calling
- 图片、音频等多模态输入输出
- 流式响应中途失败后在同一次请求内无缝回退
- 同一 Provider 的多 Key 轮询
- Ollama fallback
- Docker、Homebrew、自动更新器或远程部署

## 从源码开发

仓库使用 pnpm workspace，要求 Node.js 22.14+ 和 pnpm 11：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm test:pack
```

开发模式下，UI 和 Gateway 可以分别启动：

```bash
pnpm dev:server
pnpm dev:ui
```

此时 UI 位于 `http://localhost:3000`，默认连接 `http://127.0.0.1:11435`。正式 npm 包则始终使用同源 UI。

目录结构：

```text
packages/
  core/     Provider、协议转换、路由、加密配置
  server/   Fastify 本地网关与内置静态 UI
  cli/      发布为 freemodelfinder 的 fmf 命令
  ui/       Next.js 静态导出 Web UI
apps/
  desktop/  实验性 Tauri 源码
```

### 实验性桌面源码

`apps/desktop` 仅保留为实验项目。v0.1 不提供 macOS 或其他原生安装包，不承诺其构建、功能完整性或支持周期；桌面依赖、签名和打包状态不会阻断 npm CLI 发布。

## 发布与安全

变更记录见 [CHANGELOG.md](CHANGELOG.md)，安全问题报告方式见 [SECURITY.md](SECURITY.md)。本项目采用 [MIT License](LICENSE)。
