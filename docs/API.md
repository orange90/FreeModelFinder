# FreeModelFinder API 使用说明

FreeModelFinder 默认在 `127.0.0.1:11435` 提供 OpenAI、Anthropic 和 Gemini 三种兼容文本接口。模型建议填写完整的 `provider:model`；填写 `auto` 则交给已启用的自动路由器。

Gateway 认证默认关闭。若在 Dashboard 中启用了 Gateway Key，可以使用以下任一请求头：

```text
Authorization: Bearer <FMF_GATEWAY_KEY>
x-api-key: <FMF_GATEWAY_KEY>
x-goog-api-key: <FMF_GATEWAY_KEY>
```

这里使用的是 FreeModelFinder Gateway Key，不是上游 Provider Key。下面示例均保留了认证请求头；如果没有启用认证，可以删除对应 header。

## OpenAI

Base URL：`http://127.0.0.1:11435/v1`

```bash
curl http://127.0.0.1:11435/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <FMF_GATEWAY_KEY>' \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Say hello in Chinese"}]
  }'
```

流式请求在同一请求体中增加 `"stream": true`，响应为 SSE，并以 `data: [DONE]` 结束。

## Anthropic

Base URL：`http://127.0.0.1:11435`

```bash
curl http://127.0.0.1:11435/v1/messages \
  -H 'content-type: application/json' \
  -H 'x-api-key: <FMF_GATEWAY_KEY>' \
  -d '{
    "model": "auto",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Say hello in Chinese"}]
  }'
```

增加 `"stream": true` 可获得 Anthropic 风格 SSE 事件。

## Gemini

Base URL：`http://127.0.0.1:11435/v1beta`

```bash
curl 'http://127.0.0.1:11435/v1beta/models/auto:generateContent' \
  -H 'content-type: application/json' \
  -H 'x-goog-api-key: <FMF_GATEWAY_KEY>' \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "Say hello in Chinese"}]}]
  }'
```

流式端点把末尾动作改为 `:streamGenerateContent`，响应为 SSE。

## 模型列表与健康检查

OpenAI-compatible 模型目录：

```bash
curl http://127.0.0.1:11435/v1/models
```

健康检查不需要认证：

```bash
curl http://127.0.0.1:11435/healthz
```

返回值包含 `ok`、`service`、`version` 和时间戳。桌面运行时还会包含实例与控制协议相关字段。

## 当前协议范围

v0.1 支持常用文本聊天字段和流式文本增量，但不是三家 SDK 的完整替代实现。目前不支持 Tool / Function Calling、图片或音频输入输出，也不会在流式响应中途失败后于同一次请求内无缝回退。
