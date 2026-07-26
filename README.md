# FreeModelFinder

FreeModelFinder 把多个提供商的免费大模型汇总到一个本地网关，并提供模型目录、对话测试、设置界面和 CLI。它同时兼容 OpenAI、Anthropic 和 Gemini 的常用请求格式，适合接入 Cursor、Cline、Continue 等本地工具。

## 功能

- 实时模型目录：读取当前账号实际可见的免费模型，不维护容易过期的静态榜单
- 本地多协议网关：OpenAI `/v1/chat/completions`、Anthropic `/v1/messages`、Gemini `/v1beta/...`
- Web UI：浏览模型、查看 provider 拉取失败原因、流式对话和管理密钥
- CLI：管理密钥、切换默认模型、列出模型和终端聊天
- 自动路由：遇到上游限流时，可按模型规格、速度或配额启发式选择备用模型

## 什么会进入“免费模型”目录

`GET /v1/models` 是唯一的运行时数据源。模型必须由已启用的 provider 返回，并被核心层明确标记为 `free: true`，才会出现在 UI 和兼容接口里。

当前采用的判断规则：

| Provider | 判断方式 |
| --- | --- |
| OpenRouter | 只接受 `:free` / free router、输入输出价格均为 0、输出模态为文本的模型；过滤音频和安全工具模型 |
| Google Gemini | 取账号模型接口与当前免费层白名单的交集；已下线或对新账号不可用的旧版本不会列入 |
| SiliconFlow | 取实时模型接口与经过核验的免费型号白名单的交集 |
| Cohere | 只列入 Trial Key 可调用的聊天模型；它们共享开发测试速率限制 |
| Hugging Face | 只接受上游模型接口明确报告零价格的实时推理端点 |
| SenseNova | 只接受输入、输出价格都为 0 的文本模型 |
| DeepSeek / DashScope | 试用赠金不等于免费模型，因此收费型号不会进入目录 |

其他已实现 provider 使用其官方免费开发额度或明确的免费型号列表。免费政策会变化，UI 会同时显示 provider 拉取失败，不会用旧缓存伪装成功。

## 项目结构

```text
packages/
  core/     Provider、协议转换、路由、加密配置
  server/   Fastify 本地网关
  cli/      fmf 命令行
  ui/       Next.js Web UI
apps/
  desktop/  Tauri 菜单栏应用
```

## 快速开始

要求 Node.js 20+ 与 pnpm 9。

```bash
pnpm install
pnpm build
```

添加至少一个 provider：

```bash
pnpm --filter @freemodelfinder/cli dev key add openrouter
# 或
pnpm --filter @freemodelfinder/cli dev key add gemini
```

密钥通过 AES-256-GCM 加密后保存在 `~/.freemodelfinder/config.json`，配置目录和文件权限分别为 `0700`、`0600`。也可以打开 Web UI 的设置页添加密钥。

启动网关和 UI：

```bash
pnpm dev:server
pnpm dev:ui
```

- 网关：`http://127.0.0.1:11435`
- UI：`http://localhost:3000`

列出当前实际可用的免费模型：

```bash
curl http://127.0.0.1:11435/v1/models
```

## 接入 OpenAI 兼容客户端

Base URL：

```text
http://127.0.0.1:11435/v1
```

模型名建议使用完整的 `provider:model`，例如：

```text
openrouter:openrouter/free
gemini:gemini-3.5-flash
```

省略 provider 时，网关会尝试在当前模型目录中解析；`auto` 会交给自动路由器选择。

网关认证默认关闭。若在设置页启用了认证，请把生成的本地 Gateway Key 作为 Bearer Token 传入。Web UI 只会从本机读取这个 Key。

Anthropic 兼容端点为 `POST http://127.0.0.1:11435/v1/messages`。Gemini 兼容 Base URL 为 `http://127.0.0.1:11435/v1beta`。

## CLI

```bash
fmf serve
fmf status
fmf key add
fmf key list
fmf model list
fmf model use
fmf model use gemini:gemini-3.5-flash
fmf chat
```

在 monorepo 开发环境中，可把 `fmf` 换成 `pnpm --filter @freemodelfinder/cli dev --`。

## 安全边界

- 网关只监听 `127.0.0.1`。
- Provider Key 不会由 `/api/config` 返回；接口只暴露是否已配置和解密错误状态。
- 浏览器管理接口的 CORS 只允许本地 UI 与 Tauri origin。
- 可在设置页为兼容协议端点启用 Gateway Key。
- 本地同一用户下的其他进程仍能访问未启用认证的网关；处理敏感数据时应开启 Gateway Key。

## 桌面端

Tauri 桌面端仍处于开发状态。开发模式需要本机同时具备 Node.js、pnpm 和 Rust toolchain：

```bash
cd apps/desktop
pnpm dev
```

发布包目前还需要补齐可靠的 sidecar 打包、正式图标、代码签名和 notarization，不应把当前桌面构建视为可分发版本。

## 尚未完成

- Tool / Function Calling 与多模态协议映射
- 流式请求发生限流后的同请求回退
- 多 Key 轮询
- Ollama fallback
- 可分发的 macOS sidecar、签名与 notarization

## License

MIT
