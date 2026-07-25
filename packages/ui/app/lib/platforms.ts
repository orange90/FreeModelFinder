export type Modality = 'text' | 'vision' | 'reasoning';

export type FreeModel = {
  name: string;
  note?: string;
  contextK?: number;
  reqPerMin?: number;
  reqPerDay?: number;
  throughputTps?: number;
  modality?: Modality;
  family?: string;
  intelligenceIndex?: number;
  arenaElo?: number;
};

export type Platform = {
  id: string;
  label: string;
  homepage: string;
  registerUrl: string;
  keyUrl: string;
  summary: string;
  requirements: string[];
  registerSteps: string[];
  models: FreeModel[];
  limits?: string;
};

export const PLATFORMS: Platform[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    homepage: 'https://openrouter.ai',
    registerUrl: 'https://openrouter.ai/sign-up',
    keyUrl: 'https://openrouter.ai/keys',
    summary:
      'OpenRouter 是一个多模型聚合网关，提供多种带 :free 后缀的模型可以免费调用，覆盖 Meta Llama、DeepSeek、Qwen、Mistral 等开源模型。',
    requirements: [
      '一个可用的邮箱（推荐）或 Google/GitHub 账号',
      '注册后在控制台生成一个 API Key（以 sk-or-v1- 开头）',
      '国内访问需要网络代理',
    ],
    registerSteps: [
      '打开 https://openrouter.ai 点击右上角 Sign Up',
      '使用 Google / GitHub / 邮箱注册并完成邮箱验证',
      '进入 https://openrouter.ai/keys 点击 Create Key 生成新的 API Key',
      '复制 API Key，在本应用「设置」页 OpenRouter 一栏粘贴保存',
    ],
    models: [
      {
        name: 'meta-llama/llama-3.1-8b-instruct:free',
        note: 'Llama 3.1 8B，通用对话',
        contextK: 131,
        reqPerMin: 20,
        reqPerDay: 200,
        throughputTps: 90,
        modality: 'text',
        family: 'Llama',
      },
      {
        name: 'meta-llama/llama-3.3-70b-instruct:free',
        note: 'Llama 3.3 70B，能力较强',
        contextK: 131,
        reqPerMin: 20,
        reqPerDay: 200,
        throughputTps: 40,
        modality: 'text',
        family: 'Llama',
      },
      {
        name: 'deepseek/deepseek-r1:free',
        note: 'DeepSeek R1 推理模型',
        contextK: 163,
        reqPerMin: 20,
        reqPerDay: 200,
        throughputTps: 25,
        modality: 'reasoning',
        family: 'DeepSeek',
      },
      {
        name: 'deepseek/deepseek-chat-v3:free',
        note: 'DeepSeek V3 通用对话',
        contextK: 163,
        reqPerMin: 20,
        reqPerDay: 200,
        throughputTps: 35,
        modality: 'text',
        family: 'DeepSeek',
      },
      {
        name: 'qwen/qwen-2.5-72b-instruct:free',
        note: '通义千问 2.5 72B',
        contextK: 32,
        reqPerMin: 20,
        reqPerDay: 200,
        throughputTps: 30,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'google/gemma-2-9b-it:free',
        note: 'Google Gemma 2 9B',
        contextK: 8,
        reqPerMin: 20,
        reqPerDay: 200,
        throughputTps: 80,
        modality: 'text',
        family: 'Gemma',
      },
      {
        name: 'mistralai/mistral-7b-instruct:free',
        note: 'Mistral 7B',
        contextK: 32,
        reqPerMin: 20,
        reqPerDay: 200,
        throughputTps: 90,
        modality: 'text',
        family: 'Mistral',
      },
    ],
    limits:
      '免费模型有速率限制（通常 20 req/min、200 req/day 左右），账户余额 > $10 可提升到更高上限。',
  },
  {
    id: 'gemini',
    label: 'Google Gemini（AI Studio）',
    homepage: 'https://aistudio.google.com',
    registerUrl: 'https://aistudio.google.com',
    keyUrl: 'https://aistudio.google.com/apikey',
    summary:
      'Google AI Studio 提供 Gemini 系列模型的免费 API 调用，是目前最强的免费大模型之一，支持长上下文、多模态。',
    requirements: [
      '一个 Google 账号',
      '可访问 Google 服务的网络环境（国内需要代理）',
      '生成的 API Key（以 AIza 开头）',
    ],
    registerSteps: [
      '打开 https://aistudio.google.com 使用 Google 账号登录',
      '同意服务条款后进入首页',
      '打开 https://aistudio.google.com/apikey 点击 Create API Key',
      '选择或新建一个 Google Cloud 项目并生成 Key，复制保存',
      '在本应用「设置」页 Gemini 一栏粘贴保存',
    ],
    models: [
      {
        name: 'gemini-2.0-flash',
        note: '最新 Flash 模型，速度快，免费额度高',
        contextK: 1000,
        reqPerMin: 15,
        reqPerDay: 1500,
        throughputTps: 200,
        modality: 'vision',
        family: 'Gemini',
      },
      {
        name: 'gemini-2.0-flash-lite',
        note: 'Flash Lite，更轻量',
        contextK: 1000,
        reqPerMin: 30,
        reqPerDay: 1500,
        throughputTps: 250,
        modality: 'text',
        family: 'Gemini',
      },
      {
        name: 'gemini-1.5-flash',
        note: 'Gemini 1.5 Flash，1M 上下文',
        contextK: 1000,
        reqPerMin: 15,
        reqPerDay: 1500,
        throughputTps: 180,
        modality: 'vision',
        family: 'Gemini',
      },
      {
        name: 'gemini-1.5-flash-8b',
        note: '更小的 8B 版本',
        contextK: 1000,
        reqPerMin: 15,
        reqPerDay: 1500,
        throughputTps: 220,
        modality: 'text',
        family: 'Gemini',
      },
      {
        name: 'gemini-1.5-pro',
        note: 'Gemini 1.5 Pro，2M 上下文（有额度限制）',
        contextK: 2000,
        reqPerMin: 2,
        reqPerDay: 50,
        throughputTps: 60,
        modality: 'vision',
        family: 'Gemini',
      },
    ],
    limits:
      '免费额度示例：Flash 15 req/min、1M tokens/min、1500 req/day；Pro 2 req/min、32k tokens/min、50 req/day。',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    homepage: 'https://siliconflow.cn',
    registerUrl: 'https://cloud.siliconflow.cn/i/register',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    summary:
      '硅基流动（SiliconFlow）是国内 OpenAI 兼容大模型 API 网关，聚合了 Qwen、GLM、Hunyuan 等主流开源模型，多个 7B-9B 规模模型永久免费，国内直连、无需代理。',
    requirements: [
      '一个国内可用的手机号（首次注册需要短信验证）',
      '注册后在控制台生成一个 API Key（以 sk- 开头）',
      '国内可直接访问，无需代理',
    ],
    registerSteps: [
      '打开 https://cloud.siliconflow.cn/i/register 使用手机号或邮箱注册',
      '登录后进入 https://cloud.siliconflow.cn/account/ak',
      '点击「新建 API 密钥」，命名并生成 Key，复制保存',
      '在本应用「设置」页「硅基流动」一栏粘贴保存',
      '在「Finder」页面按平台筛选 SiliconFlow 即可查看可用免费模型',
    ],
    models: [
      {
        name: 'Qwen/Qwen2.5-7B-Instruct',
        note: '通义千问 2.5 7B，中文通用对话',
        contextK: 32,
        throughputTps: 60,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen3-8B',
        note: 'Qwen3 8B，新一代通用模型',
        contextK: 32,
        throughputTps: 60,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen2.5-Coder-7B-Instruct',
        note: 'Qwen2.5 Coder 7B，代码生成',
        contextK: 32,
        throughputTps: 55,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'THUDM/GLM-4-9B-0414',
        note: '智谱 GLM-4 9B，中文表现出色',
        contextK: 32,
        throughputTps: 55,
        modality: 'text',
        family: 'GLM',
      },
      {
        name: 'THUDM/GLM-Z1-9B-0414',
        note: 'GLM-Z1 9B，带推理能力',
        contextK: 32,
        throughputTps: 40,
        modality: 'reasoning',
        family: 'GLM',
      },
      {
        name: 'THUDM/GLM-4-Flash',
        note: 'GLM-4 Flash，极速轻量对话',
        contextK: 128,
        throughputTps: 90,
        modality: 'text',
        family: 'GLM',
      },
      {
        name: 'tencent/Hunyuan-MT-7B',
        note: '腾讯混元翻译 7B，翻译专用',
        contextK: 32,
        throughputTps: 60,
        modality: 'text',
        family: 'Hunyuan',
      },
    ],
    limits:
      '免费模型无月度额度限制，但共享公用队列，高峰期可能排队；实际速率以硅基流动控制台公告为准。',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    homepage: 'https://cohere.com',
    registerUrl: 'https://dashboard.cohere.com/welcome/register',
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    summary:
      'Cohere 提供 Command 系列模型的 Trial Key 免费额度，通过 OpenAI 兼容端点即可调用，覆盖推理、视觉与通用对话模型。',
    requirements: [
      '一个可用的邮箱账号（推荐 Google 登录）',
      '生成的 Trial API Key（在 Dashboard 中创建）',
      '国内访问需要网络代理',
    ],
    registerSteps: [
      '打开 https://dashboard.cohere.com/welcome/register 使用邮箱或 Google 注册',
      '完成邮箱验证并登录 Dashboard',
      '进入 https://dashboard.cohere.com/api-keys 点击 New Trial Key',
      '命名并生成 Key，复制保存',
      '在本应用「设置」页 Cohere 一栏粘贴保存',
    ],
    models: [
      {
        name: 'command-a-reasoning-08-2025',
        note: 'Command A 推理版本，思维链更强',
        contextK: 256,
        reqPerMin: 20,
        throughputTps: 45,
        modality: 'reasoning',
        family: 'Command',
      },
      {
        name: 'command-a-vision-07-2025',
        note: 'Command A 视觉版本，多模态输入',
        contextK: 128,
        reqPerMin: 20,
        throughputTps: 55,
        modality: 'vision',
        family: 'Command',
      },
      {
        name: 'command-r-plus-08-2024',
        note: 'Command R+，综合能力最强',
        contextK: 128,
        reqPerMin: 20,
        throughputTps: 50,
        modality: 'text',
        family: 'Command',
      },
      {
        name: 'command-r-08-2024',
        note: 'Command R，通用高性价比',
        contextK: 128,
        reqPerMin: 20,
        throughputTps: 80,
        modality: 'text',
        family: 'Command',
      },
      {
        name: 'command-r7b-12-2024',
        note: 'Command R 7B，轻量快速',
        contextK: 128,
        reqPerMin: 20,
        throughputTps: 120,
        modality: 'text',
        family: 'Command',
      },
    ],
    limits:
      'Trial Key 免费额度共享 fair-use 限速，约 20 RPM，仅用于开发测试；生产使用需要升级到 Production Key。',
  },
  {
    id: 'huggingface',
    label: 'HuggingFace Router',
    homepage: 'https://huggingface.co',
    registerUrl: 'https://huggingface.co/join',
    keyUrl: 'https://huggingface.co/settings/tokens',
    summary:
      'HuggingFace Inference Router 是一个 OpenAI 兼容的推理网关，聚合了众多开源模型（DeepSeek、Llama、Qwen、GLM、Kimi 等），可通过 hf_ Token 免费调用。',
    requirements: [
      '一个 HuggingFace 账号',
      '生成的 Access Token（以 hf_ 开头，权限选 Read 即可）',
      '国内访问需要网络代理',
    ],
    registerSteps: [
      '打开 https://huggingface.co/join 注册账号',
      '登录后进入 https://huggingface.co/settings/tokens',
      '点击 Create new token，选择 Read 权限并生成',
      '复制 Token（以 hf_ 开头）',
      '在本应用「设置」页 HuggingFace Router 一栏粘贴保存',
    ],
    models: [
      {
        name: 'deepseek-ai/DeepSeek-V3-0324',
        note: 'DeepSeek V3，综合能力顶尖',
        contextK: 128,
        throughputTps: 30,
        modality: 'text',
        family: 'DeepSeek',
      },
      {
        name: 'deepseek-ai/DeepSeek-R1-0528',
        note: 'DeepSeek R1，推理模型',
        contextK: 128,
        throughputTps: 25,
        modality: 'reasoning',
        family: 'DeepSeek',
      },
      {
        name: 'meta-llama/Llama-3.3-70B-Instruct',
        note: 'Llama 3.3 70B，通用对话',
        contextK: 128,
        throughputTps: 40,
        modality: 'text',
        family: 'Llama',
      },
      {
        name: 'Qwen/Qwen2.5-72B-Instruct',
        note: '通义千问 2.5 72B',
        contextK: 32,
        throughputTps: 35,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        note: 'Qwen2.5 Coder 32B，代码专用',
        contextK: 32,
        throughputTps: 40,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'zai-org/GLM-4.5',
        note: 'GLM 4.5，智谱新一代模型',
        contextK: 128,
        throughputTps: 40,
        modality: 'text',
        family: 'GLM',
      },
      {
        name: 'moonshotai/Kimi-K2-Instruct',
        note: 'Kimi K2，月之暗面长上下文',
        contextK: 128,
        throughputTps: 45,
        modality: 'text',
        family: 'Kimi',
      },
      {
        name: 'google/gemma-3-27b-it',
        note: 'Gemma 3 27B',
        contextK: 128,
        throughputTps: 55,
        modality: 'text',
        family: 'Gemma',
      },
      {
        name: 'MiniMaxAI/MiniMax-M1-80k',
        note: 'MiniMax M1，80K 上下文',
        contextK: 80,
        throughputTps: 40,
        modality: 'text',
        family: 'MiniMax',
      },
    ],
    limits: '免费层约 300 requests/hour，跨模型共享；具体额度以 HuggingFace 官方公告为准。',
  },
  {
    id: 'sensenova',
    label: 'SenseNova (商汤)',
    homepage: 'https://platform.sensenova.cn',
    registerUrl: 'https://platform.sensenova.cn',
    keyUrl: 'https://platform.sensenova.cn',
    summary:
      '商汤日日新（SenseNova）大模型开放平台公测版，通过 OpenAI 兼容端点 token.sensenova.cn/v1 提供 SenseNova 6.7 / DeepSeek V4 / GLM-5.2 等模型的免费额度，国内直连。',
    requirements: [
      '一个国内可用的手机号',
      '在 platform.sensenova.cn 生成 API Key（以 sk- 开头）',
      '国内可直接访问，无需代理',
    ],
    registerSteps: [
      '打开 https://platform.sensenova.cn 使用手机号注册并登录',
      '进入控制台的 API Keys 页面',
      '点击「新建 API Key」，命名并生成',
      '复制 API Key（sk- 开头）',
      '在本应用「设置」页 SenseNova 一栏粘贴保存',
    ],
    models: [
      {
        name: 'sensenova-6.7-flash-lite',
        note: 'SenseNova 6.7 Flash-Lite，轻量多模态 Agent 模型',
        contextK: 256,
        reqPerMin: 5,
        throughputTps: 40,
        modality: 'text',
        family: 'SenseNova',
      },
      {
        name: 'deepseek-v4-flash',
        note: '商汤托管的 DeepSeek V4 Flash，支持思考模式',
        contextK: 1024,
        reqPerMin: 5,
        throughputTps: 30,
        modality: 'reasoning',
        family: 'DeepSeek',
      },
      {
        name: 'glm-5.2',
        note: 'GLM-5.2 长上下文旗舰，长任务执行更稳定',
        contextK: 1024,
        reqPerMin: 5,
        throughputTps: 30,
        modality: 'text',
        family: 'GLM',
      },
    ],
    limits: '公测免费额度：sensenova-6.7-flash-lite 约 1500 请求 / 5 小时，deepseek-v4-flash 约 500 请求 / 5 小时。',
  },
  {
    id: 'modelscope',
    label: 'ModelScope (魔搭)',
    homepage: 'https://modelscope.cn',
    registerUrl: 'https://modelscope.cn/register',
    keyUrl: 'https://modelscope.cn/my/myaccesstoken',
    summary:
      '阿里达摩院开源模型社区（魔搭）推出的免费推理 API，OpenAI 兼容端点 api-inference.modelscope.cn/v1，聚合 Qwen3、DeepSeek-V3.1/R1、GLM-4.6、Kimi-K2、MiniMax-M2 等主流开源模型，国内直连、注册即送每日 2000 次调用。',
    requirements: [
      '一个国内可用的手机号（首次注册需要短信验证）',
      '绑定阿里云账号并完成实名认证',
      '在 https://modelscope.cn/my/myaccesstoken 生成 SDK Token（以 ms- 开头）',
      '国内可直接访问，无需代理',
    ],
    registerSteps: [
      '打开 https://modelscope.cn 使用手机号 / 支付宝 / GitHub 登录并注册',
      '按提示绑定阿里云账号，完成实名认证（免费）',
      '进入 https://modelscope.cn/my/myaccesstoken 点击「新建 SDK Token」',
      '命名并生成 Token，复制保存（ms- 开头）',
      '在本应用「设置」页 ModelScope 一栏粘贴保存',
    ],
    models: [
      {
        name: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
        note: 'Qwen3 旗舰 MoE 235B（激活 22B），综合能力顶尖',
        contextK: 262,
        reqPerDay: 500,
        throughputTps: 35,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
        note: 'Qwen3 235B 推理版本，带思维链',
        contextK: 262,
        reqPerDay: 500,
        throughputTps: 25,
        modality: 'reasoning',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
        note: 'Qwen3-Next 80B MoE（激活 3B），高性价比',
        contextK: 262,
        reqPerDay: 500,
        throughputTps: 55,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen3-Next-80B-A3B-Thinking',
        note: 'Qwen3-Next 80B 推理版',
        contextK: 262,
        reqPerDay: 500,
        throughputTps: 45,
        modality: 'reasoning',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
        note: 'Qwen3-Coder 旗舰 480B（激活 35B），代码智能体首选',
        contextK: 262,
        reqPerDay: 500,
        throughputTps: 30,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
        note: 'Qwen3-Coder 30B 轻量代码模型，速度快',
        contextK: 262,
        reqPerDay: 500,
        throughputTps: 65,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
        note: 'Qwen3-VL 视觉旗舰 235B，多模态理解',
        contextK: 131,
        reqPerDay: 500,
        throughputTps: 30,
        modality: 'vision',
        family: 'Qwen',
      },
      {
        name: 'Qwen/Qwen3-32B',
        note: 'Qwen3 32B Dense，通用对话',
        contextK: 131,
        reqPerDay: 500,
        throughputTps: 45,
        modality: 'text',
        family: 'Qwen',
      },
      {
        name: 'deepseek-ai/DeepSeek-V3.1',
        note: 'DeepSeek V3.1，最新旗舰通用模型',
        contextK: 131,
        reqPerDay: 500,
        throughputTps: 30,
        modality: 'text',
        family: 'DeepSeek',
      },
      {
        name: 'deepseek-ai/DeepSeek-V3',
        note: 'DeepSeek V3，综合能力顶尖',
        contextK: 65,
        reqPerDay: 500,
        throughputTps: 30,
        modality: 'text',
        family: 'DeepSeek',
      },
      {
        name: 'deepseek-ai/DeepSeek-R1',
        note: 'DeepSeek R1，深度推理模型',
        contextK: 65,
        reqPerDay: 500,
        throughputTps: 22,
        modality: 'reasoning',
        family: 'DeepSeek',
      },
      {
        name: 'ZhipuAI/GLM-4.6',
        note: 'GLM-4.6，智谱新一代长上下文旗舰',
        contextK: 200,
        reqPerDay: 500,
        throughputTps: 40,
        modality: 'text',
        family: 'GLM',
      },
      {
        name: 'ZhipuAI/GLM-4.5',
        note: 'GLM-4.5，综合能力平衡',
        contextK: 131,
        reqPerDay: 500,
        throughputTps: 45,
        modality: 'text',
        family: 'GLM',
      },
      {
        name: 'moonshotai/Kimi-K2-Instruct',
        note: 'Kimi K2，月之暗面长上下文旗舰',
        contextK: 131,
        reqPerDay: 500,
        throughputTps: 45,
        modality: 'text',
        family: 'Kimi',
      },
      {
        name: 'MiniMax/MiniMax-M2',
        note: 'MiniMax M2，超长上下文',
        contextK: 204,
        reqPerDay: 500,
        throughputTps: 35,
        modality: 'text',
        family: 'MiniMax',
      },
      {
        name: 'stepfun-ai/step3',
        note: 'Step-3，阶跃星辰通用大模型',
        contextK: 65,
        reqPerDay: 500,
        throughputTps: 40,
        modality: 'text',
        family: 'Step',
      },
    ],
    limits:
      '免费额度：每账号每日 2000 次总请求，单模型 ≤ 500 次（动态限流）；使用前需绑定阿里云账号并完成实名认证。',
  },
];

export const MODALITY_LABEL: Record<Modality, string> = {
  text: '文本',
  vision: '视觉',
  reasoning: '推理',
};

export const SETTINGS_PROVIDERS = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    link: 'https://openrouter.ai/keys',
    guide: 'https://openrouter.ai/docs/api-reference/authentication',
    hint: 'Key 通常以 sk-or-v1- 开头',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    link: 'https://aistudio.google.com/apikey',
    guide: 'https://ai.google.dev/gemini-api/docs/api-key',
    hint: 'Key 通常以 AIza 开头',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    link: 'https://cloud.siliconflow.cn/account/ak',
    guide: 'https://docs.siliconflow.cn/cn/userguide/quickstart',
    hint: 'Key 通常以 sk- 开头，国内直连',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    link: 'https://dashboard.cohere.com/api-keys',
    guide: 'https://docs.cohere.com/reference/about',
    hint: 'Trial Key 免费，20 RPM；使用 OpenAI 兼容端点',
  },
  {
    id: 'huggingface',
    label: 'HuggingFace Router',
    link: 'https://huggingface.co/settings/tokens',
    guide: 'https://huggingface.co/settings/tokens',
    hint: 'Token 以 hf_ 开头，300 RPH 免费额度',
  },
  {
    id: 'sensenova',
    label: 'SenseNova (商汤)',
    link: 'https://platform.sensenova.cn',
    guide: 'https://platform.sensenova.cn',
    hint: 'Key 以 sk- 开头，免费额度 1500 请求 / 5 小时',
  },
  {
    id: 'modelscope',
    label: 'ModelScope (魔搭)',
    link: 'https://modelscope.cn/my/myaccesstoken',
    guide: 'https://modelscope.cn/docs/model-service/API-Inference/intro',
    hint: 'Token 以 ms- 开头，需绑定阿里云账号；每日 2000 次免费调用',
  },
  {
    id: 'zhipu',
    label: '智谱 AI (BigModel)',
    link: 'https://open.bigmodel.cn/usercenter/apikeys',
    guide: 'https://open.bigmodel.cn/dev/howuse/introduction',
    hint: 'GLM-4-Flash / GLM-4.7-Flash 永久免费，国内直连',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    link: 'https://platform.deepseek.com/api_keys',
    guide: 'https://api-docs.deepseek.com',
    hint: 'Key 以 sk- 开头，新用户注册赠送试用额度',
  },
  {
    id: 'dashscope',
    label: '阿里百炼 DashScope',
    link: 'https://bailian.console.aliyun.com/?apiKey=1',
    guide: 'https://help.aliyun.com/zh/model-studio/developer-reference/get-api-key',
    hint: 'Key 以 sk- 开头，Qwen 系列每模型 1M tokens / 3 个月免费',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    link: 'https://cloud.cerebras.ai/platform/keys',
    guide: 'https://inference-docs.cerebras.ai/quickstart',
    hint: 'Key 以 csk- 开头，免费额度约 1M tokens/天，2000+ tok/s 极速推理',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    link: 'https://build.nvidia.com/settings/api-keys',
    guide: 'https://docs.api.nvidia.com/nim/reference/getting-started',
    hint: 'Key 以 nvapi- 开头，永久免费 40 RPM，无日 token 上限',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    link: 'https://console.mistral.ai/api-keys',
    guide: 'https://docs.mistral.ai/getting-started/quickstart/',
    hint: 'Experiment 免费层每月约 1B tokens，1 req/s，GDPR 合规',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    link: 'https://dash.cloudflare.com/profile/api-tokens',
    guide: 'https://developers.cloudflare.com/workers-ai/get-started/rest-api/',
    hint: '需 API Token + Account ID（在 extra.accountId 中配置），每日 10000 神经元免费额度',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    link: 'https://github.com/settings/tokens',
    guide: 'https://docs.github.com/en/github-models/prototyping-with-ai-models',
    hint: 'GitHub PAT（ghp_ 开头）即可调用；免费额度 50-150 请求/天',
  },
];

type CapabilityScore = {
  intelligenceIndex?: number;
  arenaElo?: number;
};

const SCORE_MAP: Record<string, CapabilityScore> = {
  'meta-llama/llama-3.1-8b-instruct:free': { intelligenceIndex: 41, arenaElo: 1176 },
  'meta-llama/llama-3.3-70b-instruct:free': { intelligenceIndex: 68, arenaElo: 1260 },
  'deepseek/deepseek-r1:free': { intelligenceIndex: 89, arenaElo: 1361 },
  'deepseek/deepseek-chat-v3:free': { intelligenceIndex: 80, arenaElo: 1318 },
  'qwen/qwen-2.5-72b-instruct:free': { intelligenceIndex: 72, arenaElo: 1257 },
  'google/gemma-2-9b-it:free': { intelligenceIndex: 40, arenaElo: 1190 },
  'mistralai/mistral-7b-instruct:free': { intelligenceIndex: 30, arenaElo: 1072 },
  'gemini-2.0-flash': { intelligenceIndex: 73, arenaElo: 1355 },
  'gemini-2.0-flash-lite': { intelligenceIndex: 65, arenaElo: 1310 },
  'gemini-1.5-flash': { intelligenceIndex: 60, arenaElo: 1271 },
  'gemini-1.5-flash-8b': { intelligenceIndex: 52, arenaElo: 1211 },
  'gemini-1.5-pro': { intelligenceIndex: 71, arenaElo: 1301 },
  'llama-3.3-70b-versatile': { intelligenceIndex: 68, arenaElo: 1260 },
  'llama-3.1-8b-instant': { intelligenceIndex: 41, arenaElo: 1176 },
  'llama-3.2-90b-vision-preview': { intelligenceIndex: 66, arenaElo: 1247 },
  'mixtral-8x7b-32768': { intelligenceIndex: 45, arenaElo: 1114 },
  'gemma2-9b-it': { intelligenceIndex: 40, arenaElo: 1190 },
  'deepseek-r1-distill-llama-70b': { intelligenceIndex: 72, arenaElo: 1300 },
  'Qwen/Qwen2.5-7B-Instruct': { intelligenceIndex: 45, arenaElo: 1180 },
  'Qwen/Qwen3-8B': { intelligenceIndex: 55, arenaElo: 1220 },
  'Qwen/Qwen2.5-Coder-7B-Instruct': { intelligenceIndex: 48, arenaElo: 1190 },
  'THUDM/GLM-4-9B-0414': { intelligenceIndex: 52, arenaElo: 1210 },
  'THUDM/GLM-Z1-9B-0414': { intelligenceIndex: 60, arenaElo: 1240 },
  'THUDM/GLM-4-Flash': { intelligenceIndex: 50, arenaElo: 1205 },
  'tencent/Hunyuan-MT-7B': { intelligenceIndex: 42, arenaElo: 1160 },
  'command-a-reasoning-08-2025': { intelligenceIndex: 78, arenaElo: 1305 },
  'command-a-vision-07-2025': { intelligenceIndex: 72, arenaElo: 1280 },
  'command-r-plus-08-2024': { intelligenceIndex: 65, arenaElo: 1255 },
  'command-r-08-2024': { intelligenceIndex: 55, arenaElo: 1210 },
  'command-r7b-12-2024': { intelligenceIndex: 42, arenaElo: 1150 },
  'deepseek-ai/DeepSeek-V3-0324': { intelligenceIndex: 82, arenaElo: 1330 },
  'deepseek-ai/DeepSeek-R1-0528': { intelligenceIndex: 90, arenaElo: 1370 },
  'meta-llama/Llama-3.3-70B-Instruct': { intelligenceIndex: 68, arenaElo: 1260 },
  'Qwen/Qwen2.5-72B-Instruct': { intelligenceIndex: 72, arenaElo: 1257 },
  'Qwen/Qwen2.5-Coder-32B-Instruct': { intelligenceIndex: 65, arenaElo: 1230 },
  'zai-org/GLM-4.5': { intelligenceIndex: 75, arenaElo: 1290 },
  'moonshotai/Kimi-K2-Instruct': { intelligenceIndex: 70, arenaElo: 1275 },
  'google/gemma-3-27b-it': { intelligenceIndex: 58, arenaElo: 1230 },
  'MiniMaxAI/MiniMax-M1-80k': { intelligenceIndex: 62, arenaElo: 1240 },
  'gpt-4o-mini': { intelligenceIndex: 71, arenaElo: 1273 },
  'gpt-4.1-mini': { intelligenceIndex: 73, arenaElo: 1285 },
  'deepseek-r1': { intelligenceIndex: 89, arenaElo: 1361 },
  'llama-3.3-70b': { intelligenceIndex: 68, arenaElo: 1260 },
  'SenseChat-5': { intelligenceIndex: 65, arenaElo: 1240 },
  'SenseChat-Turbo': { intelligenceIndex: 50, arenaElo: 1190 },
  'DeepSeek-V3': { intelligenceIndex: 80, arenaElo: 1318 },
  'sensenova-6.7-flash-lite': { intelligenceIndex: 68, arenaElo: 1245 },
  'deepseek-v4-flash': { intelligenceIndex: 85, arenaElo: 1340 },
  'glm-5.2': { intelligenceIndex: 78, arenaElo: 1305 },
  'Qwen/Qwen3-235B-A22B-Instruct-2507': { intelligenceIndex: 82, arenaElo: 1332 },
  'Qwen/Qwen3-235B-A22B-Thinking-2507': { intelligenceIndex: 88, arenaElo: 1355 },
  'Qwen/Qwen3-Next-80B-A3B-Instruct': { intelligenceIndex: 74, arenaElo: 1295 },
  'Qwen/Qwen3-Next-80B-A3B-Thinking': { intelligenceIndex: 80, arenaElo: 1320 },
  'Qwen/Qwen3-Coder-480B-A35B-Instruct': { intelligenceIndex: 84, arenaElo: 1340 },
  'Qwen/Qwen3-Coder-30B-A3B-Instruct': { intelligenceIndex: 68, arenaElo: 1265 },
  'Qwen/Qwen3-VL-235B-A22B-Instruct': { intelligenceIndex: 78, arenaElo: 1310 },
  'Qwen/Qwen3-32B': { intelligenceIndex: 68, arenaElo: 1260 },
  'deepseek-ai/DeepSeek-V3.1': { intelligenceIndex: 86, arenaElo: 1345 },
  'deepseek-ai/DeepSeek-V3': { intelligenceIndex: 80, arenaElo: 1318 },
  'deepseek-ai/DeepSeek-R1': { intelligenceIndex: 90, arenaElo: 1370 },
  'ZhipuAI/GLM-4.6': { intelligenceIndex: 76, arenaElo: 1298 },
  'ZhipuAI/GLM-4.5': { intelligenceIndex: 72, arenaElo: 1280 },
  'MiniMax/MiniMax-M2': { intelligenceIndex: 68, arenaElo: 1265 },
  'stepfun-ai/step3': { intelligenceIndex: 66, arenaElo: 1252 },
};

const FAMILY_FALLBACK_SCORE: Record<string, CapabilityScore> = {
  Llama: { intelligenceIndex: 55, arenaElo: 1200 },
  DeepSeek: { intelligenceIndex: 78, arenaElo: 1310 },
  Qwen: { intelligenceIndex: 70, arenaElo: 1250 },
  Gemini: { intelligenceIndex: 68, arenaElo: 1290 },
  Gemma: { intelligenceIndex: 40, arenaElo: 1190 },
  Mistral: { intelligenceIndex: 42, arenaElo: 1100 },
  Mixtral: { intelligenceIndex: 45, arenaElo: 1114 },
  GLM: { intelligenceIndex: 55, arenaElo: 1215 },
  Hunyuan: { intelligenceIndex: 42, arenaElo: 1160 },
  Command: { intelligenceIndex: 60, arenaElo: 1230 },
  Kimi: { intelligenceIndex: 70, arenaElo: 1275 },
  MiniMax: { intelligenceIndex: 62, arenaElo: 1240 },
  GPT: { intelligenceIndex: 72, arenaElo: 1280 },
  SenseChat: { intelligenceIndex: 55, arenaElo: 1215 },
  SenseNova: { intelligenceIndex: 68, arenaElo: 1245 },
  Step: { intelligenceIndex: 62, arenaElo: 1240 },
};

export function lookupCapabilityScore(model: { name: string; family?: string }): CapabilityScore {
  const exact = SCORE_MAP[model.name];
  if (exact) return exact;
  if (model.family) {
    const fallback = FAMILY_FALLBACK_SCORE[model.family];
    if (fallback) return fallback;
  }
  return {};
}

export function applyScores(model: FreeModel): FreeModel {
  const score = lookupCapabilityScore(model);
  return {
    ...model,
    intelligenceIndex: score.intelligenceIndex ?? model.intelligenceIndex,
    arenaElo: score.arenaElo ?? model.arenaElo,
  };
}

export type EnrichedModel = FreeModel & {
  providerId: string;
  providerLabel: string;
};

export function getAllEnrichedRows(): EnrichedModel[] {
  return PLATFORMS.flatMap((p) =>
    p.models.map((m) => ({
      ...applyScores(m),
      providerId: p.id,
      providerLabel: p.label,
    })),
  );
}
