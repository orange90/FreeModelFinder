export const SETTINGS_PROVIDERS = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    link: 'https://openrouter.ai/keys',
    guide: 'https://openrouter.ai/docs/api-reference/authentication',
    hint: '实时读取 :free / free router，并排除收费、音频和安全工具模型',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    link: 'https://aistudio.google.com/apikey',
    guide: 'https://ai.google.dev/gemini-api/docs/api-key',
    hint: '只显示当前免费层支持的 Flash / Flash-Lite 与 Gemma 型号',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    link: 'https://cloud.siliconflow.cn/account/ak',
    guide: 'https://docs.siliconflow.cn/cn/userguide/quickstart',
    hint: '只显示平台明确提供的免费模型，试用赠金模型不会混入',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    link: 'https://dashboard.cohere.com/api-keys',
    guide: 'https://docs.cohere.com/reference/about',
    hint: '只显示 Trial / Production Key 都明确免费的 North Mini Code',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    link: 'https://huggingface.co/settings/tokens',
    guide: 'https://huggingface.co/docs/inference-providers',
    hint: '只显示上游标记为零价格的实时端点，普通按量模型会被排除',
  },
  {
    id: 'sensenova',
    label: 'SenseNova 商汤',
    link: 'https://platform.sensenova.cn',
    guide: 'https://platform.sensenova.cn',
    hint: '实时读取模型价格，只保留输入和输出价格都为零的文本模型',
  },
  {
    id: 'modelscope',
    label: 'ModelScope 魔搭',
    link: 'https://modelscope.cn/my/myaccesstoken',
    guide: 'https://modelscope.cn/docs/model-service/API-Inference/intro',
    hint: '免费调用受账号与平台配额限制，以模型服务接口返回为准',
  },
  {
    id: 'zhipu',
    label: '智谱 AI',
    link: 'https://open.bigmodel.cn/usercenter/apikeys',
    guide: 'https://open.bigmodel.cn/dev/howuse/introduction',
    hint: '只列入平台明确标记为免费的 Flash 型号',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    link: 'https://build.nvidia.com/settings/api-keys',
    guide: 'https://docs.api.nvidia.com/nim/reference/getting-started',
    hint: '使用 build.nvidia.com 开发者 API 的限速免费访问',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    link: 'https://github.com/settings/tokens',
    guide: 'https://docs.github.com/en/github-models/prototyping-with-ai-models',
    hint: '所有账号都有用于原型开发的限速免费用量，付费使用需另行启用',
  },
] as const;

export function providerLabelKey(id: string): string | undefined {
  const map: Record<string, string> = {
    siliconflow: 'platforms.siliconflow.label',
    sensenova: 'platforms.sensenova.label',
    modelscope: 'platforms.modelscope.label',
    zhipu: 'platforms.zhipu.label',
  };
  return map[id];
}

export function providerHintKey(id: string): string {
  return `platforms.${id}.hint`;
}
