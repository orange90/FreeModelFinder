# FreeModelFinder Provider 与免费模型审计报告

- 审计时间：2026-09-20（Asia/Shanghai）
- 审计对象：10 个内置 provider
- 审计方法：GitHub Actions 每日调度，通过核心层 `ProviderRegistry.listModels()` 抓取各 provider 实时目录并套用 `free === true` 过滤；本次未执行真实推理测试。
- 生成脚本：`scripts/audit-free-models.mjs`

## 结论

- 9/10 个 provider 目录接口在本次运行中成功返回。
- 命中免费过滤的模型合计 **72** 个。
- 未配置密钥的 provider 会在下表中标记为“跳过”，不会阻塞审计。

## Provider 汇总

| Provider | 免费模型数 | 免费依据 | 目录连接 | 主要计费与可用性风险 |
|---|---:|---|---|---|
| OpenRouter | 22 | 实时目录中仅保留 `:free` 或 `openrouter/free`、输入输出价格均为 0、仅输出文本的模型 | 成功 | 免费账号通常共享日请求额度；上游目录和限额会变 |
| Google Gemini | 5 | 账号实时目录与 Free Tier 白名单取交集，只保留支持 `generateContent` 的型号 | 成功 | 绑定付费项目后可能适用付费层规则；地区和账号资格会影响可用性 |
| Zhipu AI | 2 | 只列入官方免费 Flash 清单 | 成功 | 免费型号也可能拥塞或限流，静态清单需要随官方政策复审 |
| SiliconFlow | 5 | 平台免费型号白名单与实时模型目录取交集 | 成功 | 赠金或试用模型不视为零价；上游目录异常时会报告失败而非伪造空目录 |
| ModelScope | 16 | API-Inference 免费型号清单与可用目录取交集 | 成功 | 受账号日配额、单模型配额和账号绑定状态限制 |
| NVIDIA NIM | 11 | 只保留审核过的 build.nvidia.com 免费开发端点 | 成功 | 面向学习、开发和原型，限速且不代表生产环境永久免费 |
| GitHub Models | - | 目录中的文本输出模型使用账号自带原型开发额度 | 失败 | 若主动启用 paid usage，免费额度后可能计费；非聊天模型已排除 |
| Cohere | 1 | 只保留 Trial Key 与 Production Key 都明确免费的 `north-mini-code-1-0` | 成功 | 有速率限制；其他 Command 模型不再被标记为免费 |
| Hugging Face | 4 | 实时端点明确报告 `is_free`，或输入输出价格均为 0 | 成功 | 普通 Router 模型可能消耗 credits 或按量收费，因此不会混入 |
| SenseNova | 6 | 实时目录中输入、输出价格都为 0 的文本模型；接口不可用时使用审核过的免费清单 | 成功 | 免费配额和型号可能变化；当前网关只处理文本，即使模型本身支持多模态 |

## 逐 provider 明细

### OpenRouter (openrouter)

- `cohere/north-mini-code:free` — Cohere: North Mini Code (free)
- `deepseek/deepseek-v4-flash-0731:free` — DeepSeek: DeepSeek V4 Flash 0731 (free)
- `dots-studio/dots-3-note-preview:free` — Dots Studio: Dots3-Note Preview (free)
- `google/gemma-4-26b-a4b-it:free` — Google: Gemma 4 26B A4B  (free)
- `google/gemma-4-31b-it:free` — Google: Gemma 4 31B (free)
- `inclusionai/ling-3.0-flash-fin:free` — inclusionAI: Ling 3.0 Flash Fin (free)
- `inclusionai/ling-3.0-flash-sante:free` — inclusionAI: Ling 3.0 Flash Sante (free)
- `inclusionai/ling-3.0-flash-vl:free` — inclusionAI: Ling 3.0 Flash VL (free)
- `liquid/lfm-2.5-2.6b:free` — LiquidAI: LFM2.5-2.6B (free)
- `nex-agi/nex-n2.5-mini:free` — Nex AGI: Nex-N2.5-Mini (free)
- `nex-agi/nex-n2.5-pro:free` — Nex AGI: Nex-N2.5-Pro (free)
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` — NVIDIA: Nemotron 3 Nano Omni (free)
- `nvidia/nemotron-3-super-120b-a12b:free` — NVIDIA: Nemotron 3 Super (free)
- `nvidia/nemotron-3-ultra-550b-a55b:free` — NVIDIA: Nemotron 3 Ultra (free)
- `nvidia/nemotron-3.5-lightning:free` — NVIDIA: Nemotron 3.5 Lightning (free)
- `openrouter/free` — Free Models Router
- `poolside/laguna-s-2.1:free` — Poolside: Laguna S 2.1 (free)
- `poolside/laguna-xs-2.1:free` — Poolside: Laguna XS 2.1 (free)
- `qwen/qwen3.8-27b:free` — Qwen: Qwen3.8 27B (free)
- `thinkingmachines/inkling-small:free` — Thinking Machines: Inkling Small (free)
- `thinkingmachines/inkling:free` — Thinking Machines: Inkling (free)
- `z-ai/glm-5.2:free` — Z.ai: GLM 5.2 (free)

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

- `deepseek-ai/DeepSeek-R1` — DeepSeek-R1
- `deepseek-ai/DeepSeek-V3` — DeepSeek-V3
- `deepseek-ai/DeepSeek-V3.1` — DeepSeek-V3.1
- `MiniMax/MiniMax-M2` — MiniMax-M2
- `moonshotai/Kimi-K2-Instruct` — Kimi-K2-Instruct
- `Qwen/Qwen3-235B-A22B-Instruct-2507` — Qwen3-235B-A22B-Instruct-2507
- `Qwen/Qwen3-235B-A22B-Thinking-2507` — Qwen3-235B-A22B-Thinking-2507
- `Qwen/Qwen3-32B` — Qwen3-32B
- `Qwen/Qwen3-Coder-30B-A3B-Instruct` — Qwen3-Coder-30B-A3B-Instruct
- `Qwen/Qwen3-Coder-480B-A35B-Instruct` — Qwen3-Coder-480B-A35B-Instruct
- `Qwen/Qwen3-Next-80B-A3B-Instruct` — Qwen3-Next-80B-A3B-Instruct
- `Qwen/Qwen3-Next-80B-A3B-Thinking` — Qwen3-Next-80B-A3B-Thinking
- `Qwen/Qwen3-VL-235B-A22B-Instruct` — Qwen3-VL-235B-A22B-Instruct
- `stepfun-ai/step3` — Step-3
- `ZhipuAI/GLM-4.5` — GLM-4.5
- `ZhipuAI/GLM-4.6` — GLM-4.6

### NVIDIA NIM (nvidia)

- `google/diffusiongemma-26b-a4b-it`
- `google/gemma-4-31b-it`
- `meta/llama-3.2-11b-vision-instruct`
- `meta/llama-3.2-90b-vision-instruct`
- `mistralai/mistral-nemotron`
- `nvidia/ising-calibration-1.5-31b`
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
- `nvidia/nemotron-3-super-120b-a12b`
- `nvidia/nemotron-3-ultra-550b-a55b`
- `nvidia/riva-translate-4b-instruct-v1.1`
- `openai/gpt-oss-20b`

### GitHub Models (github)

- 目录接口失败：`github models list failed: 410`

### Cohere (cohere)

- `north-mini-code-1-0`

### Hugging Face (huggingface)

- `inclusionAI/Ling-3.0-flash-Fin`
- `inclusionAI/Ling-3.0-flash-VL`
- `prism-ml/Ternary-Bonsai-27B-AWQ-4bit`
- `prism-ml/Ternary-Bonsai-27B-gguf`

### SenseNova (sensenova)

- `deepseek-v4-flash`
- `deepseek-v4-pro`
- `glm-5.2`
- `kimi-k3`
- `sensenova-6.7-flash-lite`
- `sensenova-6.8-flash-lite`

## 备注

- 本审计不再运行 `ProviderRegistry.probeModel()` 的真实推理调用，所以不会消耗 provider 的 token 或请求额度，超出目录接口 quota 除外。
- 想要"目录抓取 + 轻量推理"的完整报告，仍需在发版前手动执行 [docs/RELEASING.md](../docs/RELEASING.md) 中的验收流程。
