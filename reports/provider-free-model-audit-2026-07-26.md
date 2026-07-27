# FreeModelFinder Provider 与免费模型审计报告

- 审计时间：2026-07-26（Asia/Shanghai）
- 审计对象：当前配置并启用的 10 个 provider
- 审计方法：官方价格/免费层文档、带当前密钥的实时模型目录、每个 provider 一次最多 8 tokens 的轻量推理测试

## 结论

1. 10 个 provider 都存在可免费使用的模型或免费开发额度。
2. 清理前，运行时目录共显示 125 个模型。源码另有一个 `glm-4-plus` 收费条目，但被核心层的 `free === true` 过滤器挡住，没有出现在 UI/API。
3. Cohere 原先显示的 7 个 Command 模型只在 Trial Key 下免费；Production Key 下可能计费。现已全部移除，改为仅保留官方明确说明对 Trial/Production Key 都免费的 `north-mini-code-1-0`。
4. GitHub 目录另有 2 个免费 embedding 模型，但它们不能使用聊天接口，已从本项目的聊天模型清单排除。
5. 清理后实时目录为 117 个模型，未发现明确收费模型或非聊天模型。
6. 10 个 provider 的目录接口均连接成功。轻量推理测试中 9 个 provider 可用；ModelScope 因账号未绑定阿里云而返回 401，目前不可用。智谱 provider 可用，但 `glm-4.7-flash` 当时返回 429 拥塞，`glm-4-flash` 实测成功。

## Provider 汇总

| Provider | 清理后模型数 | 免费依据 | 目录连接 | 轻量推理 | 结论 |
|---|---:|---|---|---|---|
| OpenRouter | 15 | 仅接受 `:free`、`openrouter/free` 且输入/输出价格为 0 | 成功 | `openrouter/free` 成功，21.36s | 可用 |
| Google Gemini | 5 | Gemini API Free Tier 白名单与账号实时目录取交集 | 成功 | `gemini-3.5-flash` HTTP 成功，7.74s | 可用；需确保 API key 所属项目仍在 Free Tier |
| Zhipu | 2 | 官方免费模型：`glm-4-flash`、`glm-4.7-flash` | 静态免费清单 | `glm-4-flash` 成功；`glm-4.7-flash` 429 拥塞 | Provider 可用，4.7 暂时拥塞 |
| SiliconFlow | 5 | 官方价格页明确标记免费，且与实时目录取交集 | 成功 | `Qwen/Qwen3-8B` 成功，7.21s | 可用 |
| ModelScope | 7 | API-Inference 官方免费服务，实时目录交集 | 成功 | 401：需绑定阿里云账号 | 当前不可用，需完成账号绑定 |
| NVIDIA NIM | 42 | NVIDIA Developer Program 提供原型开发免费 API | 成功 | `meta/llama-3.1-8b-instruct` 成功，0.64s | 可用；仅限开发/原型场景 |
| GitHub Models | 35 | 所有账号包含受限的免费目录用量；排除 embedding 输出 | 成功 | `openai/gpt-4.1-mini` 成功，1.93s | 可用；建议关闭 paid usage，避免超额后计费 |
| Cohere | 1 | North Mini Code 对 Trial/Production Key 均免费 | 成功 | `north-mini-code-1-0` 成功，0.75s | 可用 |
| Hugging Face | 2 | 实时目录只接受 provider 报告 `is_free` 或输入/输出价格为 0 的端点 | 成功 | `prism-ml/Ternary-Bonsai-27B-AWQ-4bit` 成功，0.74s | 可用；普通 HF 路由模型仍是额度/按量计费，未列入 |
| SenseNova | 3 | 实时 `/models` 返回输入、输出价格均为 0 | 成功 | `deepseek-v4-flash` 成功，1.17s | 可用 |

## 清理内容

- 删除 Zhipu 源清单中的收费模型 `glm-4-plus`。
- 从 Cohere 免费清单中删除 7 个只在 Trial Key 下免费的 Command 模型。
- 修正 Cohere 免费模型 ID：`north-mini-code` → `north-mini-code-1-0`。
- 排除 GitHub 的 2 个 embedding 模型，避免把非聊天端点展示为可聊天模型。
- 增加回归测试，确保 Zhipu 不再发布收费模型、Cohere 只保留对 Production Key 也免费的型号、GitHub 不混入 embedding 模型。

## 计费边界

本项目中的“免费”包括两类：模型单价为 0，以及账号自带的免费开发额度。后者不是“永久零价且无限量”。尤其要注意：

- Gemini：同一个模型在 Free Tier 免费，但绑定付费项目后会按付费层规则计费。
- GitHub Models：账号有免费用量；若主动开启 paid usage，免费额度之后可能继续计费。
- NVIDIA：免费托管端点面向学习、开发和原型，不等于生产免费服务。
- Hugging Face：普通路由模型通常消耗月度 credits，额度后可能收费；当前实现仅展示上游实时报告为零价的端点。

## 官方依据

- OpenRouter Free Router：https://openrouter.ai/docs/guides/routing/routers/free-router
- Gemini API Pricing：https://ai.google.dev/gemini-api/docs/pricing
- Zhipu 免费模型：https://docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash
- SiliconFlow Pricing：https://www2.siliconflow.cn/pricing
- ModelScope API-Inference Limits：https://modelscope.cn/docs/model-service/API-Inference/limits
- NVIDIA NIM：https://docs.api.nvidia.com/nim/docs/run-anywhere
- GitHub Models Billing：https://docs.github.com/en/billing/concepts/product-billing/github-models
- Cohere Rate Limits：https://docs.cohere.com/v2/docs/rate-limits
- Cohere North Mini Code：https://docs.cohere.com/docs/north-mini-code-1.0
- Hugging Face Pricing：https://huggingface.co/docs/inference-providers/en/pricing
- SenseNova Pricing：https://platform.sensenova.cn/product/APIService/pricing/
