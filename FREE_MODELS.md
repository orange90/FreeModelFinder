# FreeModelFinder 免费模型清单

<!-- 此文件由 scripts/update-readme-audit.mjs 自动生成，请勿手动编辑。 -->

> 最近目录审计：**2026-08-03（Asia/Shanghai）** · **65** 个免费模型入口 · **8/10** 个 Provider 正常。

[返回项目 README](README.md) · [查看本次目录审计报告](reports/provider-free-model-audit-2026-08-03.md)

这份列表每天由 GitHub Actions 通过各 Provider 的模型目录接口刷新，并应用 FreeModelFinder 核心层的免费规则。它不执行真实推理，不代表无限额度、永久免费或生产级可用。同一上游模型通过多个 Provider 提供时会分别计数，因为对应的账号资格、额度和 Gateway 模型 ID 不同。

## 今日变化

与 2026-08-02 相比，成功比较的 8 个 Provider 模型清单没有变化。

## Provider 汇总

| Provider      | 状态    | 免费模型数 | 免费类型              | 免费依据                                                                            |
| ------------- | ------- | ---------: | --------------------- | ----------------------------------------------------------------------------------- |
| OpenRouter    | 🟢 正常 |         14 | 零价格模型            | 实时目录中仅保留 `:free` 或 `openrouter/free`、输入输出价格均为 0、仅输出文本的模型 |
| Google Gemini | 🟢 正常 |          5 | 账号 Free Tier        | 账号实时目录与 Free Tier 白名单取交集，只保留支持 `generateContent` 的型号          |
| Zhipu AI      | 🟢 正常 |          2 | 官方免费型号          | 只列入官方免费 Flash 清单                                                           |
| SiliconFlow   | 🟢 正常 |          5 | 免费白名单            | 平台免费型号白名单与实时模型目录取交集                                              |
| ModelScope    | 🟢 正常 |          7 | 账号免费额度          | API-Inference 免费型号清单与可用目录取交集                                          |
| NVIDIA NIM    | 🟢 正常 |         27 | 免费开发端点          | 只保留审核过的 build.nvidia.com 免费开发端点                                        |
| GitHub Models | 🔴 失败 |   暂不可用 | 原型开发额度          | 目录中的文本输出模型使用账号自带原型开发额度                                        |
| Cohere        | 🔴 失败 |   暂不可用 | 免费 Trial/Production | 只保留 Trial Key 与 Production Key 都明确免费的 `north-mini-code-1-0`               |
| Hugging Face  | 🟢 正常 |          2 | 实时零价端点          | 实时端点明确报告 `is_free`，或输入输出价格均为 0                                    |
| SenseNova     | 🟢 正常 |          3 | 实时零价模型          | 实时目录中输入、输出价格都为 0 的文本模型；接口不可用时使用审核过的免费清单         |

## 完整列表

### OpenRouter

- Provider ID：`openrouter`
- 状态：🟢 正常
- 免费依据：实时目录中仅保留 `:free` 或 `openrouter/free`、输入输出价格均为 0、仅输出文本的模型
- 主要风险：免费账号通常共享日请求额度；上游目录和限额会变

| Gateway 模型 ID                                                 | 显示名称                               | 上下文窗口 |
| --------------------------------------------------------------- | -------------------------------------- | ---------: |
| `openrouter:cohere/north-mini-code:free`                        | Cohere: North Mini Code (free)         |       256K |
| `openrouter:google/gemma-4-26b-a4b-it:free`                     | Google: Gemma 4 26B A4B (free)         |     262.1K |
| `openrouter:google/gemma-4-31b-it:free`                         | Google: Gemma 4 31B (free)             |     262.1K |
| `openrouter:inclusionai/ling-3.0-flash:free`                    | Ling-3.0-flash (free)                  |     262.1K |
| `openrouter:nvidia/nemotron-3-nano-30b-a3b:free`                | NVIDIA: Nemotron 3 Nano 30B A3B (free) |       256K |
| `openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | NVIDIA: Nemotron 3 Nano Omni (free)    |       256K |
| `openrouter:nvidia/nemotron-3-super-120b-a12b:free`             | NVIDIA: Nemotron 3 Super (free)        |     262.1K |
| `openrouter:nvidia/nemotron-3-ultra-550b-a55b:free`             | NVIDIA: Nemotron 3 Ultra (free)        |         1M |
| `openrouter:nvidia/nemotron-nano-12b-v2-vl:free`                | NVIDIA: Nemotron Nano 12B 2 VL (free)  |       128K |
| `openrouter:nvidia/nemotron-nano-9b-v2:free`                    | NVIDIA: Nemotron Nano 9B V2 (free)     |       128K |
| `openrouter:openai/gpt-oss-20b:free`                            | OpenAI: gpt-oss-20b (free)             |     131.1K |
| `openrouter:openrouter/free`                                    | Free Models Router                     |       200K |
| `openrouter:poolside/laguna-s-2.1:free`                         | Poolside: Laguna S 2.1 (free)          |     262.1K |
| `openrouter:poolside/laguna-xs-2.1:free`                        | Poolside: Laguna XS 2.1 (free)         |     262.1K |

### Google Gemini

- Provider ID：`gemini`
- 状态：🟢 正常
- 免费依据：账号实时目录与 Free Tier 白名单取交集，只保留支持 `generateContent` 的型号
- 主要风险：绑定付费项目后可能适用付费层规则；地区和账号资格会影响可用性

| Gateway 模型 ID                | 显示名称              | 上下文窗口 |
| ------------------------------ | --------------------- | ---------: |
| `gemini:gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite |         1M |
| `gemini:gemini-3.5-flash`      | Gemini 3.5 Flash      |         1M |
| `gemini:gemini-3.5-flash-lite` | Gemini 3.5 Flash Lite |         1M |
| `gemini:gemma-4-26b-a4b-it`    | Gemma 4 26B A4B IT    |     262.1K |
| `gemini:gemma-4-31b-it`        | Gemma 4 31B IT        |     262.1K |

### Zhipu AI

- Provider ID：`zhipu`
- 状态：🟢 正常
- 免费依据：只列入官方免费 Flash 清单
- 主要风险：免费型号也可能拥塞或限流，静态清单需要随官方政策复审

| Gateway 模型 ID       | 显示名称      | 上下文窗口 |
| --------------------- | ------------- | ---------: |
| `zhipu:glm-4-flash`   | GLM-4-Flash   |       128K |
| `zhipu:glm-4.7-flash` | GLM-4.7-Flash |       200K |

### SiliconFlow

- Provider ID：`siliconflow`
- 状态：🟢 正常
- 免费依据：平台免费型号白名单与实时模型目录取交集
- 主要风险：赠金或试用模型不视为零价；上游目录异常时会报告失败而非伪造空目录

| Gateway 模型 ID                        | 显示名称                 | 上下文窗口 |
| -------------------------------------- | ------------------------ | ---------: |
| `siliconflow:Qwen/Qwen2.5-7B-Instruct` | Qwen/Qwen2.5-7B-Instruct |          — |
| `siliconflow:Qwen/Qwen3-8B`            | Qwen/Qwen3-8B            |          — |
| `siliconflow:tencent/Hunyuan-MT-7B`    | tencent/Hunyuan-MT-7B    |          — |
| `siliconflow:THUDM/GLM-4-9B-0414`      | THUDM/GLM-4-9B-0414      |          — |
| `siliconflow:THUDM/GLM-Z1-9B-0414`     | THUDM/GLM-Z1-9B-0414     |          — |

### ModelScope

- Provider ID：`modelscope`
- 状态：🟢 正常
- 免费依据：API-Inference 免费型号清单与可用目录取交集
- 主要风险：受账号日配额、单模型配额和账号绑定状态限制

| Gateway 模型 ID                                 | 显示名称                      | 上下文窗口 |
| ----------------------------------------------- | ----------------------------- | ---------: |
| `modelscope:Qwen/Qwen3-235B-A22B-Instruct-2507` | Qwen3-235B-A22B-Instruct-2507 |     262.1K |
| `modelscope:Qwen/Qwen3-235B-A22B-Thinking-2507` | Qwen3-235B-A22B-Thinking-2507 |     262.1K |
| `modelscope:Qwen/Qwen3-32B`                     | Qwen3-32B                     |     131.1K |
| `modelscope:Qwen/Qwen3-Coder-30B-A3B-Instruct`  | Qwen3-Coder-30B-A3B-Instruct  |     262.1K |
| `modelscope:Qwen/Qwen3-Next-80B-A3B-Instruct`   | Qwen3-Next-80B-A3B-Instruct   |     262.1K |
| `modelscope:Qwen/Qwen3-Next-80B-A3B-Thinking`   | Qwen3-Next-80B-A3B-Thinking   |     262.1K |
| `modelscope:Qwen/Qwen3-VL-235B-A22B-Instruct`   | Qwen3-VL-235B-A22B-Instruct   |     131.1K |

### NVIDIA NIM

- Provider ID：`nvidia`
- 状态：🟢 正常
- 免费依据：只保留审核过的 build.nvidia.com 免费开发端点
- 主要风险：面向学习、开发和原型，限速且不代表生产环境永久免费

| Gateway 模型 ID                                        | 显示名称                                      | 上下文窗口 |
| ------------------------------------------------------ | --------------------------------------------- | ---------: |
| `nvidia:deepseek-ai/deepseek-v4-flash`                 | deepseek-ai/deepseek-v4-flash                 |          — |
| `nvidia:google/diffusiongemma-26b-a4b-it`              | google/diffusiongemma-26b-a4b-it              |          — |
| `nvidia:google/gemma-4-31b-it`                         | google/gemma-4-31b-it                         |          — |
| `nvidia:meta/llama-3.1-70b-instruct`                   | meta/llama-3.1-70b-instruct                   |          — |
| `nvidia:meta/llama-3.1-8b-instruct`                    | meta/llama-3.1-8b-instruct                    |          — |
| `nvidia:meta/llama-3.2-11b-vision-instruct`            | meta/llama-3.2-11b-vision-instruct            |          — |
| `nvidia:meta/llama-3.2-1b-instruct`                    | meta/llama-3.2-1b-instruct                    |          — |
| `nvidia:meta/llama-3.2-3b-instruct`                    | meta/llama-3.2-3b-instruct                    |          — |
| `nvidia:meta/llama-3.2-90b-vision-instruct`            | meta/llama-3.2-90b-vision-instruct            |          — |
| `nvidia:minimaxai/minimax-m3`                          | minimaxai/minimax-m3                          |          — |
| `nvidia:mistralai/mistral-medium-3.5-128b`             | mistralai/mistral-medium-3.5-128b             |          — |
| `nvidia:mistralai/mistral-nemotron`                    | mistralai/mistral-nemotron                    |          — |
| `nvidia:nvidia/ising-calibration-1.5-31b`              | nvidia/ising-calibration-1.5-31b              |          — |
| `nvidia:nvidia/llama-3.1-nemotron-nano-vl-8b-v1`       | nvidia/llama-3.1-nemotron-nano-vl-8b-v1       |          — |
| `nvidia:nvidia/llama-3.3-nemotron-super-49b-v1`        | nvidia/llama-3.3-nemotron-super-49b-v1        |          — |
| `nvidia:nvidia/llama-3.3-nemotron-super-49b-v1.5`      | nvidia/llama-3.3-nemotron-super-49b-v1.5      |          — |
| `nvidia:nvidia/nemotron-3-nano-30b-a3b`                | nvidia/nemotron-3-nano-30b-a3b                |          — |
| `nvidia:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | nvidia/nemotron-3-nano-omni-30b-a3b-reasoning |          — |
| `nvidia:nvidia/nemotron-3-super-120b-a12b`             | nvidia/nemotron-3-super-120b-a12b             |          — |
| `nvidia:nvidia/nemotron-3-ultra-550b-a55b`             | nvidia/nemotron-3-ultra-550b-a55b             |          — |
| `nvidia:nvidia/nemotron-mini-4b-instruct`              | nvidia/nemotron-mini-4b-instruct              |          — |
| `nvidia:nvidia/nemotron-nano-12b-v2-vl`                | nvidia/nemotron-nano-12b-v2-vl                |          — |
| `nvidia:nvidia/nvidia-nemotron-nano-9b-v2`             | nvidia/nvidia-nemotron-nano-9b-v2             |          — |
| `nvidia:nvidia/riva-translate-4b-instruct-v1.1`        | nvidia/riva-translate-4b-instruct-v1.1        |          — |
| `nvidia:openai/gpt-oss-120b`                           | openai/gpt-oss-120b                           |          — |
| `nvidia:openai/gpt-oss-20b`                            | openai/gpt-oss-20b                            |          — |
| `nvidia:stepfun-ai/step-3.7-flash`                     | stepfun-ai/step-3.7-flash                     |          — |

### GitHub Models

- Provider ID：`github`
- 状态：🔴 失败
- 免费依据：目录中的文本输出模型使用账号自带原型开发额度
- 主要风险：若主动启用 paid usage，免费额度后可能计费；非聊天模型已排除

本次没有可展示的模型清单。

### Cohere

- Provider ID：`cohere`
- 状态：🔴 失败
- 免费依据：只保留 Trial Key 与 Production Key 都明确免费的 `north-mini-code-1-0`
- 主要风险：有速率限制；其他 Command 模型不再被标记为免费

本次没有可展示的模型清单。

### Hugging Face

- Provider ID：`huggingface`
- 状态：🟢 正常
- 免费依据：实时端点明确报告 `is_free`，或输入输出价格均为 0
- 主要风险：普通 Router 模型可能消耗 credits 或按量收费，因此不会混入

| Gateway 模型 ID                                    | 显示名称                             | 上下文窗口 |
| -------------------------------------------------- | ------------------------------------ | ---------: |
| `huggingface:prism-ml/Ternary-Bonsai-27B-AWQ-4bit` | prism-ml/Ternary-Bonsai-27B-AWQ-4bit |     262.1K |
| `huggingface:prism-ml/Ternary-Bonsai-27B-gguf`     | prism-ml/Ternary-Bonsai-27B-gguf     |     262.1K |

### SenseNova

- Provider ID：`sensenova`
- 状态：🟢 正常
- 免费依据：实时目录中输入、输出价格都为 0 的文本模型；接口不可用时使用审核过的免费清单
- 主要风险：免费配额和型号可能变化；当前网关只处理文本，即使模型本身支持多模态

| Gateway 模型 ID                      | 显示名称                 | 上下文窗口 |
| ------------------------------------ | ------------------------ | ---------: |
| `sensenova:deepseek-v4-flash`        | deepseek-v4-flash        |          — |
| `sensenova:glm-5.2`                  | glm-5.2                  |          — |
| `sensenova:sensenova-6.7-flash-lite` | sensenova-6.7-flash-lite |          — |
