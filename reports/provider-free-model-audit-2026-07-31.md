# FreeModelFinder Provider 与免费模型审计报告

- 审计时间：2026-07-31（Asia/Shanghai）
- 审计对象：10 个内置 provider
- 审计方法：GitHub Actions 每日调度，通过核心层 `ProviderRegistry.listModels()` 抓取各 provider 实时目录并套用 `free === true` 过滤；本次未执行真实推理测试。
- 生成脚本：`scripts/audit-free-models.mjs`

## 结论

- 8/10 个 provider 目录接口在本次运行中成功返回。
- 命中免费过滤的模型合计 **65** 个。
- 未配置密钥的 provider 会在下表中标记为“跳过”，不会阻塞审计。

## Provider 汇总

| Provider | 免费模型数 | 免费依据 | 目录连接 | 主要计费与可用性风险 |
|---|---:|---|---|---|
| OpenRouter | 14 | 实时目录中仅保留 `:free` 或 `openrouter/free`、输入输出价格均为 0、仅输出文本的模型 | 成功 | 免费账号通常共享日请求额度；上游目录和限额会变 |
| Google Gemini | 5 | 账号实时目录与 Free Tier 白名单取交集，只保留支持 `generateContent` 的型号 | 成功 | 绑定付费项目后可能适用付费层规则；地区和账号资格会影响可用性 |
| Zhipu AI | 2 | 只列入官方免费 Flash 清单 | 成功 | 免费型号也可能拥塞或限流，静态清单需要随官方政策复审 |
| SiliconFlow | 5 | 平台免费型号白名单与实时模型目录取交集 | 成功 | 赠金或试用模型不视为零价；上游目录异常时会报告失败而非伪造空目录 |
| ModelScope | 7 | API-Inference 免费型号清单与可用目录取交集 | 成功 | 受账号日配额、单模型配额和账号绑定状态限制 |
| NVIDIA NIM | 27 | 只保留审核过的 build.nvidia.com 免费开发端点 | 成功 | 面向学习、开发和原型，限速且不代表生产环境永久免费 |
| GitHub Models | - | 目录中的文本输出模型使用账号自带原型开发额度 | 失败 | 若主动启用 paid usage，免费额度后可能计费；非聊天模型已排除 |
| Cohere | - | 只保留 Trial Key 与 Production Key 都明确免费的 `north-mini-code-1-0` | 失败 | 有速率限制；其他 Command 模型不再被标记为免费 |
| Hugging Face | 2 | 实时端点明确报告 `is_free`，或输入输出价格均为 0 | 成功 | 普通 Router 模型可能消耗 credits 或按量收费，因此不会混入 |
| SenseNova | 3 | 实时目录中输入、输出价格都为 0 的文本模型；接口不可用时使用审核过的免费清单 | 成功 | 免费配额和型号可能变化；当前网关只处理文本，即使模型本身支持多模态 |

## 逐 provider 明细

### OpenRouter (openrouter)

- `cohere/north-mini-code:free` — Cohere: North Mini Code (free)
- `google/gemma-4-26b-a4b-it:free` — Google: Gemma 4 26B A4B  (free)
- `google/gemma-4-31b-it:free` — Google: Gemma 4 31B (free)
- `inclusionai/ling-3.0-flash:free` — Ling-3.0-flash (free)
- `nvidia/nemotron-3-nano-30b-a3b:free` — NVIDIA: Nemotron 3 Nano 30B A3B (free)
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` — NVIDIA: Nemotron 3 Nano Omni (free)
- `nvidia/nemotron-3-super-120b-a12b:free` — NVIDIA: Nemotron 3 Super (free)
- `nvidia/nemotron-3-ultra-550b-a55b:free` — NVIDIA: Nemotron 3 Ultra (free)
- `nvidia/nemotron-nano-12b-v2-vl:free` — NVIDIA: Nemotron Nano 12B 2 VL (free)
- `nvidia/nemotron-nano-9b-v2:free` — NVIDIA: Nemotron Nano 9B V2 (free)
- `openai/gpt-oss-20b:free` — OpenAI: gpt-oss-20b (free)
- `openrouter/free` — Free Models Router
- `poolside/laguna-s-2.1:free` — Poolside: Laguna S 2.1 (free)
- `poolside/laguna-xs-2.1:free` — Poolside: Laguna XS 2.1 (free)

### Google Gemini (gemini)

- `gemini-3.1-flash-lite` — Gemini 3.1 Flash Lite
- `gemini-3.5-flash` — Gemini 3.5 Flash
- `gemini-3.5-flash-lite` — Gemini 3.5 Flash Lite
- `gemma-4-26b-a4b-it` — Gemma 4 26B A4B IT
- `gemma-4-31b-it` — Gemma 4 31B IT

### Zhipu AI (zhipu)

- `glm-4-flash` — GLM-4-Flash
- `glm-4.7-flash` — GLM-4.7-Flash

### SiliconFlow (siliconflow)

- `Qwen/Qwen2.5-7B-Instruct`
- `Qwen/Qwen3-8B`
- `tencent/Hunyuan-MT-7B`
- `THUDM/GLM-4-9B-0414`
- `THUDM/GLM-Z1-9B-0414`

### ModelScope (modelscope)

- `Qwen/Qwen3-235B-A22B-Instruct-2507` — Qwen3-235B-A22B-Instruct-2507
- `Qwen/Qwen3-235B-A22B-Thinking-2507` — Qwen3-235B-A22B-Thinking-2507
- `Qwen/Qwen3-32B` — Qwen3-32B
- `Qwen/Qwen3-Coder-30B-A3B-Instruct` — Qwen3-Coder-30B-A3B-Instruct
- `Qwen/Qwen3-Next-80B-A3B-Instruct` — Qwen3-Next-80B-A3B-Instruct
- `Qwen/Qwen3-Next-80B-A3B-Thinking` — Qwen3-Next-80B-A3B-Thinking
- `Qwen/Qwen3-VL-235B-A22B-Instruct` — Qwen3-VL-235B-A22B-Instruct

### NVIDIA NIM (nvidia)

- `deepseek-ai/deepseek-v4-flash`
- `google/diffusiongemma-26b-a4b-it`
- `google/gemma-4-31b-it`
- `meta/llama-3.1-70b-instruct`
- `meta/llama-3.1-8b-instruct`
- `meta/llama-3.2-11b-vision-instruct`
- `meta/llama-3.2-1b-instruct`
- `meta/llama-3.2-3b-instruct`
- `meta/llama-3.2-90b-vision-instruct`
- `minimaxai/minimax-m3`
- `mistralai/mistral-medium-3.5-128b`
- `mistralai/mistral-nemotron`
- `nvidia/ising-calibration-1.5-31b`
- `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`
- `nvidia/llama-3.3-nemotron-super-49b-v1`
- `nvidia/llama-3.3-nemotron-super-49b-v1.5`
- `nvidia/nemotron-3-nano-30b-a3b`
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
- `nvidia/nemotron-3-super-120b-a12b`
- `nvidia/nemotron-3-ultra-550b-a55b`
- `nvidia/nemotron-mini-4b-instruct`
- `nvidia/nemotron-nano-12b-v2-vl`
- `nvidia/nvidia-nemotron-nano-9b-v2`
- `nvidia/riva-translate-4b-instruct-v1.1`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `stepfun-ai/step-3.7-flash`

### GitHub Models (github)

- 目录接口失败：`github models list failed: 410`

### Cohere (cohere)

- 目录接口失败：`cohere list models failed: 429`

### Hugging Face (huggingface)

- `prism-ml/Ternary-Bonsai-27B-AWQ-4bit`
- `prism-ml/Ternary-Bonsai-27B-gguf`

### SenseNova (sensenova)

- `deepseek-v4-flash`
- `glm-5.2`
- `sensenova-6.7-flash-lite`

## 备注

- 本审计不再运行 `ProviderRegistry.probeModel()` 的真实推理调用，所以不会消耗 provider 的 token 或请求额度，超出目录接口 quota 除外。
- 想要"目录抓取 + 轻量推理"的完整报告，仍需在发版前手动执行 [docs/RELEASING.md](../docs/RELEASING.md) 中的验收流程。
