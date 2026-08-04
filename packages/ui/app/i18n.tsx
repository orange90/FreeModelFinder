'use client';

import { Languages } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Language = 'zh' | 'en';

type Dict = Record<string, string>;

const STORAGE_KEY = 'fmf-language';

const zh: Dict = {
  'app.subtitle': 'Local model gateway',
  'app.tab.finder': '模型',
  'app.tab.tester': '测试',
  'app.tab.settings': '设置',
  'app.nav.aria': '主导航',
  'app.nav.mobileAria': '移动端导航',
  'app.page.finder.title': '免费模型',
  'app.page.finder.desc': '实时发现与筛选',
  'app.page.tester.title': '对话测试',
  'app.page.tester.desc': '直接比较模型表现',
  'app.page.settings.title': '本地设置',
  'app.page.settings.desc': '来源、路由与接口',
  'app.status.connecting': '正在连接',
  'app.status.online': '网关在线',
  'app.status.offline': '网关离线',
  'app.status.connected': '已连接',
  'app.status.disconnected': '未连接',
  'app.status.modelsCount': '{count} 个免费模型',
  'app.loading.gateway': '正在连接本地网关…',
  'app.header.syncTitle': '同步模型',
  'app.selection.invalid': '当前模型不可用：{model}。请选择 auto 或其他可用模型。',
  'lang.toggle': '语言切换',
  'lang.zh': '中文',
  'lang.en': 'English',

  'finder.eyebrow': 'Live catalog',
  'finder.title': '只看真正能免费调用的模型',
  'finder.subtitle':
    '列表来自已配置 provider 的实时接口，并经过零价格、官方免费层白名单和文本生成能力三重筛选。试用赠金或明确收费的模型不会出现在这里。',
  'finder.metric.free': '免费模型',
  'finder.metric.sources': '可用来源',
  'finder.metric.ctx': '最大上下文',
  'finder.notice.error.title': '本地网关没有响应',
  'finder.notice.error.body': '请先启动 fmf serve。当前地址：{gateway}',
  'finder.notice.error.action': '打开设置',
  'finder.notice.empty.title': '还没有可用的免费模型',
  'finder.notice.empty.body': '添加至少一个 provider key；如果已经添加，请检查下方的连接错误。',
  'finder.notice.empty.actionConnect': '连接第一个 Provider',
  'finder.notice.empty.actionSettings': '配置来源',
  'finder.failures.title': '{count} 个来源本次同步失败，已保留上次结果',
  'finder.search.placeholder': '搜索模型、来源或用途',
  'finder.search.label': '搜索模型',
  'finder.filter.all': '全部来源',
  'finder.filter.label': '按来源筛选',
  'finder.sort.label': '排序方式',
  'finder.sort.provider': '按来源排序',
  'finder.sort.capability': '能力优先',
  'finder.sort.context': '上下文优先',
  'finder.sort.name': '按名称排序',
  'finder.sync': '同步',
  'finder.counter': '显示 {visible} / {total} 个模型',
  'finder.footer': '最近一次请求结果 · 不展示推测价格',
  'finder.card.free': '免费',
  'finder.card.desc.default': '已通过该来源的免费模型规则，可用于文本对话。',
  'finder.card.useToTest': '用它测试',
  'finder.card.continueTest': '继续测试',
  'finder.empty.title': '没有匹配的模型',
  'finder.empty.body': '换一个关键词或来源试试。',
  'finder.quota.untested': '未检测',
  'finder.quota.available': '可用',
  'finder.quota.limited': '已限流',
  'finder.quota.error': '检测失败',
  'finder.quota.probe': '检测额度',
  'finder.quota.probing': '检测中',
  'finder.quota.sessionUsed': '本地会话已用',
  'finder.quota.tokens': 'tokens',
  'finder.quota.requestsSuffix': '次',
  'finder.quota.lastReset': '最近额度重置：{time}',
  'finder.quota.remaining': '剩余 {value}',
  'finder.quota.remainingUnknown': '剩余额度未知',
  'finder.quota.resetSuffix': '重置',
  'finder.quota.noWindows':
    '上游尚未返回精确的 RPM / RPH / RPD 信息；点击检测可读取响应头。',
  'finder.quota.upstream': '上游',
  'finder.quota.local': '本地估算',
  'finder.quota.shared': '共享',
  'finder.quota.model': '模型',
  'finder.quota.resource.requests': '请求',
  'finder.quota.resource.tokens': 'Token',
  'finder.quota.resource.neurons': 'Neuron',
  'finder.quota.win.perSecond': '每秒{resource}',
  'finder.quota.win.perMinute': '每分钟{resource}',
  'finder.quota.win.perHour': '每小时{resource}',
  'finder.quota.win.perDay': '每天{resource}',
  'finder.quota.win.perMonth': '每月{resource}',
  'finder.quota.win.perHours': '每 {n} 小时{resource}',
  'finder.quota.win.perMinutes': '每 {n} 分钟{resource}',
  'finder.quota.win.perSeconds': '{n} 秒{resource}',
  'finder.quota.win.generic': '{resource}额度',
  'finder.reset.unknown': '未知',

  'models.ctx.unknown': '上下文未知',
  'models.ctx.suffix': '上下文',
  'models.ctx.tokens': 'tokens',

  'tester.currentModel': '当前模型',
  'tester.noModels': '暂无可用模型',
  'tester.unavailable': '不可用 · {model}',
  'tester.auto': '自动选择 · auto',
  'tester.freeVerified': '免费规则已验证',
  'tester.clear': '清空',
  'tester.empty.title': '还没有可测试的模型',
  'tester.empty.body': '在设置里添加 provider key，系统只会把符合免费规则的模型带到这里。',
  'tester.quick.eyebrow': 'Quick test',
  'tester.quick.title': '用同一个问题，试出模型差异',
  'tester.quick.subtitle':
    '先选一个模板，也可以直接在下方输入。对话只会发往你当前选择的 provider。',
  'tester.prompt1.eyebrow': '解释',
  'tester.prompt1.title': '把复杂概念讲清楚',
  'tester.prompt1.prompt':
    '用一个生活中的例子解释向量数据库，并说明它与传统关系型数据库的区别。',
  'tester.prompt2.eyebrow': '代码',
  'tester.prompt2.title': '写一个可靠的工具函数',
  'tester.prompt2.prompt':
    '请用 TypeScript 实现一个带 cancel 方法的 debounce，并补充边界情况测试。',
  'tester.prompt3.eyebrow': '比较',
  'tester.prompt3.title': '给出有条件的判断',
  'tester.prompt3.prompt':
    '比较 REST API 和 GraphQL。不要只列优缺点，请按团队规模和产品阶段给出选择建议。',
  'tester.input.placeholder': '问点什么…  Enter 发送，Shift + Enter 换行',
  'tester.input.needProvider': '请先配置 provider',
  'tester.send.stopAria': '停止生成',
  'tester.send.sendAria': '发送消息',
  'tester.hint.disclaimer': '回答可能不准确，请核对重要信息。',
  'tester.hint.generating': '正在生成',
  'tester.msg.you': '你',
  'tester.msg.copy': '复制',
  'tester.msg.copied': '已复制',
  'tester.msg.waiting': '等待模型响应',

  'settings.title': '设置',
  'settings.subtitle': '配置各平台的 API Key，Key 只在本机加密存储，不会上传。',
  'settings.gatewayError': '未能连接到本地网关，请先运行 `fmf serve`。',
  'settings.stat.gateway': '网关状态',
  'settings.stat.gateway.port': '端口 {port}',
  'settings.stat.gateway.unavailable': '未连接',
  'settings.stat.gateway.hint.running': '本地网关运行中',
  'settings.stat.gateway.hint.waiting': '等待网关…',
  'settings.stat.configured': '已配置平台',
  'settings.stat.configured.hasAny': '至少启用了一个',
  'settings.stat.configured.none': '尚未配置任何 Key',
  'settings.stat.default': '默认模型',
  'settings.stat.default.unset': '未设置',
  'settings.stat.default.hint.saved': '来自最近一次保存',
  'settings.stat.default.hint.autofill': '保存 Key 后自动生成',

  'settings.section.currentModel': '当前模型',
  'settings.section.currentModel.count': '{n} 个可选',
  'settings.section.currentModel.empty': '暂无可用模型',
  'settings.section.currentModel.selectEmpty': '暂无模型 — 请先在下方配置 API Key',
  'settings.section.currentModel.help': '选择后将用于"测试模型"页面的对话请求。',
  'settings.ping.test': '测试连通性',
  'settings.ping.testing': '测试中…',
  'settings.ping.ok': '连接正常',
  'settings.ping.retest': '重新测试',
  'settings.ping.selectFirst': '请先选择一个模型',
  'settings.ping.reply': '· 回复：',
  'settings.ping.errFallback': '请求失败',

  'settings.section.autoRoute': '智能路由',
  'settings.section.autoRoute.desc': '请求限制自动切换 · 解除后自动切换回',
  'settings.autoRoute.enableTitle': '启用自动路由',
  'settings.autoRoute.enableDesc': '达到 RPM/配额时自动切换到备用模型；限制解除后再切换回来。',
  'settings.autoRoute.enabled': '已启用',
  'settings.autoRoute.disabled': '未启用',
  'settings.autoRoute.strategy': '切换策略',
  'settings.autoRoute.strategy.capability': '规格优先',
  'settings.autoRoute.strategy.capabilityDesc': '按模型规模与上下文估算',
  'settings.autoRoute.strategy.speed': '速度优先',
  'settings.autoRoute.strategy.speedDesc': '优先低延迟 Provider',
  'settings.autoRoute.strategy.rateLimit': '请求限制优先',
  'settings.autoRoute.strategy.rateLimitDesc': '优先高 RPM 配额',
  'settings.autoRoute.cooldown.title': '正在冷却中的模型',
  'settings.autoRoute.cooldown.clear': '清除全部',
  'settings.autoRoute.cooldown.reset': '重置：',
  'settings.autoRoute.remembered':
    '原偏好模型：{model}（限制解除后将自动切回）',
  'settings.autoRoute.recent.title': '最近路由动作',
  'settings.autoRoute.saved': '智能路由配置已更新',

  'settings.section.gateway': '对外接口',
  'settings.section.gateway.desc.server':
    '公网地址用于调用，当前管理地址仅供 Tailscale 使用',
  'settings.section.gateway.desc.local': '让其他工具通过 OpenAI 兼容协议调用本地网关',
  'settings.gateway.baseUrl': 'Base URL',
  'settings.gateway.baseUrlHint': '兼容 OpenAI 的接口路径为 /v1/*。',
  'settings.gateway.modelHint':
    '推荐使用 auto，网关会自动选择当前的默认模型；也可传入具体的 provider:model。',
  'settings.gateway.apiKey': 'API Key',
  'settings.gateway.requireAuth': '强制鉴权',
  'settings.gateway.locked': '（服务器模式已锁定）',
  'settings.gateway.noKey':
    '尚未生成对外 API Key。生成后，其他应用需要在请求头中携带 Authorization: Bearer <key> 才能访问网关（开启"强制鉴权"后生效）。',
  'settings.gateway.regen': '重新生成 Key',
  'settings.gateway.gen': '生成 API Key',
  'settings.gateway.revoke': '撤销',
  'settings.gateway.storedLocally': 'Key 仅保存在本机加密存储',
  'settings.gateway.curlExample': 'curl 示例',
  'settings.gateway.curlPlaceholder':
    '示例中的 YOUR_API_KEY 将在生成 Key 后自动替换为实际值。',
  'settings.gateway.generated': '已生成新的对外接口 API Key',
  'settings.gateway.revoked': '已撤销对外接口 API Key',
  'settings.gateway.opFailed': '对外接口操作失败：{err}',

  'settings.section.sources': '来源设置',
  'settings.section.sources.count': '{n} / {total} 已配置',
  'settings.sources.encrypted': '仅保存在本机加密存储',
  'settings.sources.added': '已添加',
  'settings.sources.notAdded': '未添加',
  'settings.sources.count': '{n} 个',
  'settings.sources.emptyAdded': '暂无已添加的来源，保存下方任一 API Key 即可启用',
  'settings.sources.emptyNotAdded': '所有来源都已添加 🎉',
  'settings.sources.configured': '已配置',
  'settings.sources.notConfigured': '未配置',
  'settings.sources.getKey': '获取 API Key',
  'settings.sources.guide': '获取方法',
  'settings.sources.credentialError': '本地凭据无法解密，请重新保存这个 Key。',
  'settings.sources.pastePlaceholder': '粘贴 API Key',
  'settings.sources.pasteExisting': '••••••••••（覆盖以更新）',
  'settings.sources.save': '保存',
  'settings.sources.saving': '保存中…',
  'settings.sources.saved': '已保存',
  'settings.sources.retry': '重试',
  'settings.sources.savedToast': '已保存 {provider} 的 API Key',
  'settings.sources.savedNoModels':
    '已保存 {provider}，但暂未拉到模型列表（可能网络不通或 Key 无效）',
  'settings.sources.saveFailed': '保存 {provider} 失败{detail}',

  'settings.section.custom': '自定义模型',
  'settings.custom.summary': '{sources} 个源 · {models} 个模型',
  'settings.custom.desc': '通过 OpenAI 兼容协议接入你自己的模型（支持多源）',
  'settings.custom.empty':
    '尚未添加自定义源。可以为每个 Base URL 单独配置 API Key 和模型列表。',
  'settings.custom.sourceName': '源名称',
  'settings.custom.remove': '删除源',
  'settings.custom.baseUrl': 'Base URL',
  'settings.custom.apiKey': 'API Key',
  'settings.custom.apiKeyExisting': '••••••••••（留空则保持不变）',
  'settings.custom.apiKeyPlaceholder': '粘贴 API Key（本地无鉴权可留空）',
  'settings.custom.modelList': '模型列表',
  'settings.custom.noModel': '尚未添加模型，请在下方输入模型 ID 后点击「添加」',
  'settings.custom.modelIdPh': '模型 ID，例如 gpt-4o-mini',
  'settings.custom.displayNamePh': '显示名称（可选）',
  'settings.custom.ctxPh': '上下文 (tokens)',
  'settings.custom.addModel': '添加',
  'settings.custom.newSourcePh': '新源名称（例如 "本地 Ollama"、"公司内网"）',
  'settings.custom.addSource': '添加源',
  'settings.custom.saveAll': '保存自定义模型',
  'settings.custom.clearAll': '清除全部',
  'settings.custom.enabled': '已启用',
  'settings.custom.errorNoSource': '请至少添加一个自定义源',
  'settings.custom.errorNoBase': '源「{name}」缺少 Base URL',
  'settings.custom.errorNoModel': '源「{name}」至少需要一个模型',
  'settings.custom.errorNameRequired': '请填写源名称',
  'settings.custom.duplicateModel': '{source} 已存在模型 {id}',
  'settings.custom.saved': '自定义模型已保存',
  'settings.custom.cleared': '已清除自定义模型配置',
  'settings.custom.saveFailed': '保存自定义模型失败：{msg}',
  'settings.custom.clearFailed': '清除失败：{msg}',

  'settings.section.inspect': '模型巡检',
  'settings.section.inspect.desc': '自动发现新增或下架的免费模型',
  'settings.gatewayHint': '网关地址：',
  'settings.copyFailed': '复制失败，请手动选中复制',

  'settings.aria.overview': '状态总览',
  'settings.aria.currentModel': '当前模型',
  'settings.aria.autoRoute': '智能路由',
  'settings.aria.gateway': '对外接口',
  'settings.aria.sources': '来源设置',
  'settings.aria.custom': '自定义模型',
  'settings.aria.inspect': '模型巡检',
  'settings.hideKey': '隐藏 Key',
  'settings.showKey': '显示 Key',
  'settings.copy.baseUrl': '复制 Base URL',
  'settings.copy.model': '复制 model',
  'settings.copy.apiKey': '复制 API Key',
  'settings.copy.curl': '复制 curl 示例',
  'settings.ping.authHint': '（API Key 可能无效或未生效，请重新粘贴保存后再试）',
  'settings.custom.sourceNameAria': '源 {id} 名称',
  'settings.custom.removeSourceAria': '删除源 {id}',
  'settings.custom.removeModelAria': '删除 {id}',
  'settings.custom.baseUrlPh': 'https://api.example.com/v1',
  'settings.custom.storedLocally': 'Key 仅在本机加密存储',
  'settings.providerApiKeyAria': '{provider} API Key',

  'inspect.title': '模型上下架巡检',
  'inspect.intervalMinutes': '· 每 {n} 分钟自动检查',
  'inspect.lastRun': '· 最近一次：{when}',
  'inspect.total': '· 当前 {n} 个模型',
  'inspect.now': '立即巡检',
  'inspect.running': '巡检中',
  'inspect.markRead': '标记已读',
  'inspect.errorLoad': '获取模型变动失败：{err}',
  'inspect.lastRunError': '上一次巡检出错：{err}',
  'inspect.nothing': '未发现新增或下架的免费模型。',
  'inspect.added': '新增模型',
  'inspect.removed': '下架模型',
  'inspect.emptyCol': '暂无',
  'inspect.moreHidden': '还有 {n} 个未显示…',
  'inspect.notInspected': '尚未巡检',
  'inspect.justNow': '刚刚',
  'inspect.minutesAgo': '{n} 分钟前',
  'inspect.hoursAgo': '{n} 小时前',
  'inspect.daysAgo': '{n} 天前',

  'theme.light': '切换到亮色模式',
  'theme.dark': '切换到暗色模式',

  'platforms.openrouter.hint': '实时读取 :free / free router，并排除收费、音频和安全工具模型',
  'platforms.gemini.hint': '只显示当前免费层支持的 Flash / Flash-Lite 与 Gemma 型号',
  'platforms.siliconflow.hint': '只显示平台明确提供的免费模型，试用赠金模型不会混入',
  'platforms.siliconflow.label': '硅基流动 SiliconFlow',
  'platforms.cohere.hint': '只显示 Trial / Production Key 都明确免费的 North Mini Code',
  'platforms.huggingface.hint': '只显示上游标记为零价格的实时端点，普通按量模型会被排除',
  'platforms.sensenova.hint': '实时读取模型价格，只保留输入和输出价格都为零的文本模型',
  'platforms.sensenova.label': 'SenseNova 商汤',
  'platforms.modelscope.hint': '免费调用受账号与平台配额限制，以模型服务接口返回为准',
  'platforms.modelscope.label': 'ModelScope 魔搭',
  'platforms.zhipu.hint': '只列入平台明确标记为免费的 Flash 型号',
  'platforms.zhipu.label': '智谱 AI',
  'platforms.nvidia.hint': '使用 build.nvidia.com 开发者 API 的限速免费访问',
  'platforms.github.hint': '所有账号都有用于原型开发的限速免费用量，付费使用需另行启用',

  'settingsPage.back': '返回',
  'settingsPage.title': '设置',
  'settingsPage.subtitle': '配置各平台的 API Key',
  'drawer.close': '关闭',
};

const en: Dict = {
  'app.subtitle': 'Local model gateway',
  'app.tab.finder': 'Models',
  'app.tab.tester': 'Test',
  'app.tab.settings': 'Settings',
  'app.nav.aria': 'Primary navigation',
  'app.nav.mobileAria': 'Mobile navigation',
  'app.page.finder.title': 'Free models',
  'app.page.finder.desc': 'Live discovery & filtering',
  'app.page.tester.title': 'Chat test',
  'app.page.tester.desc': 'Compare models directly',
  'app.page.settings.title': 'Local settings',
  'app.page.settings.desc': 'Sources, routing & API',
  'app.status.connecting': 'Connecting',
  'app.status.online': 'Gateway online',
  'app.status.offline': 'Gateway offline',
  'app.status.connected': 'Connected',
  'app.status.disconnected': 'Disconnected',
  'app.status.modelsCount': '{count} free models',
  'app.loading.gateway': 'Connecting to local gateway…',
  'app.header.syncTitle': 'Sync models',
  'app.selection.invalid':
    'Current model is unavailable: {model}. Please switch to auto or another available model.',
  'lang.toggle': 'Change language',
  'lang.zh': '中文',
  'lang.en': 'English',

  'finder.eyebrow': 'Live catalog',
  'finder.title': 'Only truly free models, verified in real time',
  'finder.subtitle':
    'The list comes from live provider APIs and is filtered by zero price, official free-tier allowlists, and text generation capability. Trial credits and paid models never show up here.',
  'finder.metric.free': 'Free models',
  'finder.metric.sources': 'Sources',
  'finder.metric.ctx': 'Max context',
  'finder.notice.error.title': 'Local gateway is not responding',
  'finder.notice.error.body': 'Please start `fmf serve` first. Current address: {gateway}',
  'finder.notice.error.action': 'Open settings',
  'finder.notice.empty.title': 'No free models available yet',
  'finder.notice.empty.body':
    'Add at least one provider key; if you already did, check the connection errors below.',
  'finder.notice.empty.actionConnect': 'Connect first provider',
  'finder.notice.empty.actionSettings': 'Configure sources',
  'finder.failures.title':
    '{count} sources failed to sync this time; previous results are kept',
  'finder.search.placeholder': 'Search models, sources or use cases',
  'finder.search.label': 'Search models',
  'finder.filter.all': 'All sources',
  'finder.filter.label': 'Filter by source',
  'finder.sort.label': 'Sort by',
  'finder.sort.provider': 'Sort by source',
  'finder.sort.capability': 'Capability first',
  'finder.sort.context': 'Context first',
  'finder.sort.name': 'Sort by name',
  'finder.sync': 'Sync',
  'finder.counter': 'Showing {visible} / {total} models',
  'finder.footer': 'Latest request result · No inferred pricing shown',
  'finder.card.free': 'Free',
  'finder.card.desc.default':
    "Passes this provider's free-model rules and is ready for text chat.",
  'finder.card.useToTest': 'Test with it',
  'finder.card.continueTest': 'Continue testing',
  'finder.empty.title': 'No matching models',
  'finder.empty.body': 'Try a different keyword or source.',
  'finder.quota.untested': 'Untested',
  'finder.quota.available': 'Available',
  'finder.quota.limited': 'Rate-limited',
  'finder.quota.error': 'Probe failed',
  'finder.quota.probe': 'Probe quota',
  'finder.quota.probing': 'Probing',
  'finder.quota.sessionUsed': 'Local session used',
  'finder.quota.tokens': 'tokens',
  'finder.quota.requestsSuffix': 'requests',
  'finder.quota.lastReset': 'Last reset: {time}',
  'finder.quota.remaining': '{value} left',
  'finder.quota.remainingUnknown': 'Remaining quota unknown',
  'finder.quota.resetSuffix': 'reset',
  'finder.quota.noWindows':
    'Upstream did not return exact RPM / RPH / RPD info yet; click probe to read response headers.',
  'finder.quota.upstream': 'Upstream',
  'finder.quota.local': 'Local estimate',
  'finder.quota.shared': 'Shared',
  'finder.quota.model': 'Model',
  'finder.quota.resource.requests': 'requests',
  'finder.quota.resource.tokens': 'tokens',
  'finder.quota.resource.neurons': 'neurons',
  'finder.quota.win.perSecond': '{resource} / second',
  'finder.quota.win.perMinute': '{resource} / minute',
  'finder.quota.win.perHour': '{resource} / hour',
  'finder.quota.win.perDay': '{resource} / day',
  'finder.quota.win.perMonth': '{resource} / month',
  'finder.quota.win.perHours': '{resource} / {n} hours',
  'finder.quota.win.perMinutes': '{resource} / {n} minutes',
  'finder.quota.win.perSeconds': '{resource} / {n} seconds',
  'finder.quota.win.generic': '{resource} quota',
  'finder.reset.unknown': 'unknown',

  'models.ctx.unknown': 'Context unknown',
  'models.ctx.suffix': 'context',
  'models.ctx.tokens': 'tokens',

  'tester.currentModel': 'Current model',
  'tester.noModels': 'No models available',
  'tester.unavailable': 'Unavailable · {model}',
  'tester.auto': 'Auto select · auto',
  'tester.freeVerified': 'Free-tier rules verified',
  'tester.clear': 'Clear',
  'tester.empty.title': 'No models to test yet',
  'tester.empty.body':
    'Add a provider key in Settings; only models that match the free rules will appear here.',
  'tester.quick.eyebrow': 'Quick test',
  'tester.quick.title': 'Ask one question, see how models differ',
  'tester.quick.subtitle':
    'Pick a template or type directly below. Requests only go to the provider you have selected.',
  'tester.prompt1.eyebrow': 'Explain',
  'tester.prompt1.title': 'Make a complex concept clear',
  'tester.prompt1.prompt':
    'Use a real-life example to explain a vector database, and describe how it differs from a traditional relational database.',
  'tester.prompt2.eyebrow': 'Code',
  'tester.prompt2.title': 'Write a reliable utility function',
  'tester.prompt2.prompt':
    'Implement a debounce function in TypeScript with a cancel method, and include edge-case tests.',
  'tester.prompt3.eyebrow': 'Compare',
  'tester.prompt3.title': 'Give a conditional recommendation',
  'tester.prompt3.prompt':
    'Compare REST API and GraphQL. Do not just list pros and cons; give a recommendation based on team size and product stage.',
  'tester.input.placeholder': 'Ask something…  Enter to send, Shift + Enter for new line',
  'tester.input.needProvider': 'Configure a provider first',
  'tester.send.stopAria': 'Stop generation',
  'tester.send.sendAria': 'Send message',
  'tester.hint.disclaimer': 'Answers can be inaccurate; double-check important info.',
  'tester.hint.generating': 'Generating',
  'tester.msg.you': 'You',
  'tester.msg.copy': 'Copy',
  'tester.msg.copied': 'Copied',
  'tester.msg.waiting': 'Waiting for model response',

  'settings.title': 'Settings',
  'settings.subtitle':
    'Configure API keys for each provider. Keys are stored encrypted on this machine only, and never uploaded.',
  'settings.gatewayError': 'Unable to connect to local gateway. Please run `fmf serve` first.',
  'settings.stat.gateway': 'Gateway status',
  'settings.stat.gateway.port': 'Port {port}',
  'settings.stat.gateway.unavailable': 'Disconnected',
  'settings.stat.gateway.hint.running': 'Local gateway is running',
  'settings.stat.gateway.hint.waiting': 'Waiting for gateway…',
  'settings.stat.configured': 'Configured providers',
  'settings.stat.configured.hasAny': 'At least one enabled',
  'settings.stat.configured.none': 'No keys configured yet',
  'settings.stat.default': 'Default model',
  'settings.stat.default.unset': 'Not set',
  'settings.stat.default.hint.saved': 'From the last save',
  'settings.stat.default.hint.autofill': 'Auto-generated after a key is saved',

  'settings.section.currentModel': 'Current model',
  'settings.section.currentModel.count': '{n} available',
  'settings.section.currentModel.empty': 'No models available',
  'settings.section.currentModel.selectEmpty':
    'No models — please configure an API key below first',
  'settings.section.currentModel.help':
    'Selection is used for the "Chat test" page requests.',
  'settings.ping.test': 'Test connectivity',
  'settings.ping.testing': 'Testing…',
  'settings.ping.ok': 'Connection OK',
  'settings.ping.retest': 'Retest',
  'settings.ping.selectFirst': 'Please pick a model first',
  'settings.ping.reply': '· Reply: ',
  'settings.ping.errFallback': 'Request failed',

  'settings.section.autoRoute': 'Smart routing',
  'settings.section.autoRoute.desc':
    'Auto-switch on rate limit · Switches back once quota recovers',
  'settings.autoRoute.enableTitle': 'Enable auto routing',
  'settings.autoRoute.enableDesc':
    'When hitting RPM / quota limits, switch to a fallback model, then back once the limit clears.',
  'settings.autoRoute.enabled': 'Enabled',
  'settings.autoRoute.disabled': 'Disabled',
  'settings.autoRoute.strategy': 'Switch strategy',
  'settings.autoRoute.strategy.capability': 'Capability first',
  'settings.autoRoute.strategy.capabilityDesc': 'Estimated by model size & context',
  'settings.autoRoute.strategy.speed': 'Speed first',
  'settings.autoRoute.strategy.speedDesc': 'Prefer low-latency providers',
  'settings.autoRoute.strategy.rateLimit': 'Rate-limit first',
  'settings.autoRoute.strategy.rateLimitDesc': 'Prefer higher RPM quota',
  'settings.autoRoute.cooldown.title': 'Models on cooldown',
  'settings.autoRoute.cooldown.clear': 'Clear all',
  'settings.autoRoute.cooldown.reset': 'Reset: ',
  'settings.autoRoute.remembered':
    'Preferred model: {model} (will auto switch back after limit clears)',
  'settings.autoRoute.recent.title': 'Recent routing actions',
  'settings.autoRoute.saved': 'Smart routing configuration updated',

  'settings.section.gateway': 'External API',
  'settings.section.gateway.desc.server':
    'Public URL is for calls; the admin URL is only for Tailscale',
  'settings.section.gateway.desc.local':
    'Let other tools call the local gateway via the OpenAI-compatible protocol',
  'settings.gateway.baseUrl': 'Base URL',
  'settings.gateway.baseUrlHint': 'OpenAI-compatible endpoints live under /v1/*.',
  'settings.gateway.modelHint':
    "Prefer 'auto' — the gateway auto-selects the current default model; you can also pass a specific provider:model.",
  'settings.gateway.apiKey': 'API Key',
  'settings.gateway.requireAuth': 'Require authentication',
  'settings.gateway.locked': ' (locked in server mode)',
  'settings.gateway.noKey':
    'No external API key generated yet. Once generated, other apps must send Authorization: Bearer <key> to access the gateway (effective when "Require authentication" is on).',
  'settings.gateway.regen': 'Regenerate key',
  'settings.gateway.gen': 'Generate API key',
  'settings.gateway.revoke': 'Revoke',
  'settings.gateway.storedLocally': 'Key is stored encrypted on this machine only',
  'settings.gateway.curlExample': 'curl example',
  'settings.gateway.curlPlaceholder':
    'YOUR_API_KEY in the example will be replaced by the real key once generated.',
  'settings.gateway.generated': 'A new external API key has been generated',
  'settings.gateway.revoked': 'External API key revoked',
  'settings.gateway.opFailed': 'External API operation failed: {err}',

  'settings.section.sources': 'Provider settings',
  'settings.section.sources.count': '{n} / {total} configured',
  'settings.sources.encrypted': 'Stored encrypted on this machine only',
  'settings.sources.added': 'Added',
  'settings.sources.notAdded': 'Not added',
  'settings.sources.count': '{n}',
  'settings.sources.emptyAdded':
    'No sources added yet. Save any API key below to enable it.',
  'settings.sources.emptyNotAdded': 'All providers are added 🎉',
  'settings.sources.configured': 'Configured',
  'settings.sources.notConfigured': 'Not configured',
  'settings.sources.getKey': 'Get API key',
  'settings.sources.guide': 'How-to',
  'settings.sources.credentialError':
    'Local credentials cannot be decrypted. Please save this key again.',
  'settings.sources.pastePlaceholder': 'Paste API key',
  'settings.sources.pasteExisting': '••••••••••  (override to update)',
  'settings.sources.save': 'Save',
  'settings.sources.saving': 'Saving…',
  'settings.sources.saved': 'Saved',
  'settings.sources.retry': 'Retry',
  'settings.sources.savedToast': 'Saved the API key for {provider}',
  'settings.sources.savedNoModels':
    'Saved {provider}, but no models were returned (network issue or invalid key).',
  'settings.sources.saveFailed': 'Failed to save {provider}{detail}',

  'settings.section.custom': 'Custom models',
  'settings.custom.summary': '{sources} sources · {models} models',
  'settings.custom.desc':
    'Bring your own models via the OpenAI-compatible protocol (multi-source supported)',
  'settings.custom.empty':
    'No custom sources yet. Each Base URL can have its own API key and model list.',
  'settings.custom.sourceName': 'Source name',
  'settings.custom.remove': 'Remove source',
  'settings.custom.baseUrl': 'Base URL',
  'settings.custom.apiKey': 'API Key',
  'settings.custom.apiKeyExisting': '••••••••••  (leave empty to keep unchanged)',
  'settings.custom.apiKeyPlaceholder': 'Paste API key (leave empty for local unauthenticated)',
  'settings.custom.modelList': 'Model list',
  'settings.custom.noModel':
    'No models yet. Enter a model ID below and click "Add".',
  'settings.custom.modelIdPh': 'Model ID, e.g. gpt-4o-mini',
  'settings.custom.displayNamePh': 'Display name (optional)',
  'settings.custom.ctxPh': 'Context (tokens)',
  'settings.custom.addModel': 'Add',
  'settings.custom.newSourcePh': 'New source name (e.g. "Local Ollama", "Corp intranet")',
  'settings.custom.addSource': 'Add source',
  'settings.custom.saveAll': 'Save custom models',
  'settings.custom.clearAll': 'Clear all',
  'settings.custom.enabled': 'Enabled',
  'settings.custom.errorNoSource': 'Please add at least one custom source',
  'settings.custom.errorNoBase': 'Source "{name}" is missing a Base URL',
  'settings.custom.errorNoModel': 'Source "{name}" needs at least one model',
  'settings.custom.errorNameRequired': 'Please enter a source name',
  'settings.custom.duplicateModel': '{source} already has model {id}',
  'settings.custom.saved': 'Custom models saved',
  'settings.custom.cleared': 'Custom model configuration cleared',
  'settings.custom.saveFailed': 'Failed to save custom models: {msg}',
  'settings.custom.clearFailed': 'Clear failed: {msg}',

  'settings.section.inspect': 'Model inspection',
  'settings.section.inspect.desc':
    'Automatically discover newly added or delisted free models',
  'settings.gatewayHint': 'Gateway URL: ',
  'settings.copyFailed': 'Copy failed. Please select and copy manually.',

  'settings.aria.overview': 'Status overview',
  'settings.aria.currentModel': 'Current model',
  'settings.aria.autoRoute': 'Smart routing',
  'settings.aria.gateway': 'External API',
  'settings.aria.sources': 'Provider settings',
  'settings.aria.custom': 'Custom models',
  'settings.aria.inspect': 'Model inspection',
  'settings.hideKey': 'Hide key',
  'settings.showKey': 'Show key',
  'settings.copy.baseUrl': 'Copy Base URL',
  'settings.copy.model': 'Copy model',
  'settings.copy.apiKey': 'Copy API key',
  'settings.copy.curl': 'Copy curl example',
  'settings.ping.authHint':
    ' (API key may be invalid or not yet in effect; please paste and save it again.)',
  'settings.custom.sourceNameAria': 'Source {id} name',
  'settings.custom.removeSourceAria': 'Remove source {id}',
  'settings.custom.removeModelAria': 'Remove {id}',
  'settings.custom.baseUrlPh': 'https://api.example.com/v1',
  'settings.custom.storedLocally': 'Keys are stored encrypted on this machine only',
  'settings.providerApiKeyAria': '{provider} API Key',

  'inspect.title': 'Model inspection',
  'inspect.intervalMinutes': '· Checks every {n} minutes',
  'inspect.lastRun': '· Last run: {when}',
  'inspect.total': '· {n} models currently',
  'inspect.now': 'Run now',
  'inspect.running': 'Running',
  'inspect.markRead': 'Mark as read',
  'inspect.errorLoad': 'Failed to load model changes: {err}',
  'inspect.lastRunError': 'Previous inspection error: {err}',
  'inspect.nothing': 'No newly added or delisted free models.',
  'inspect.added': 'New models',
  'inspect.removed': 'Delisted models',
  'inspect.emptyCol': 'None',
  'inspect.moreHidden': '{n} more not shown…',
  'inspect.notInspected': 'Not inspected yet',
  'inspect.justNow': 'just now',
  'inspect.minutesAgo': '{n} minutes ago',
  'inspect.hoursAgo': '{n} hours ago',
  'inspect.daysAgo': '{n} days ago',

  'theme.light': 'Switch to light mode',
  'theme.dark': 'Switch to dark mode',

  'platforms.openrouter.hint':
    'Reads :free / free router live and excludes paid, audio, and safety-tool models',
  'platforms.gemini.hint':
    'Only shows Flash / Flash-Lite and Gemma models currently in the free tier',
  'platforms.siliconflow.hint':
    'Only shows models the platform marks as free; trial-credit models are excluded',
  'platforms.siliconflow.label': 'SiliconFlow',
  'platforms.cohere.hint':
    'Only shows North Mini Code which is explicitly free on both Trial and Production keys',
  'platforms.huggingface.hint':
    'Only shows endpoints upstream marks as zero-priced; usual pay-per-use models are excluded',
  'platforms.sensenova.hint':
    'Reads model pricing live and keeps only text models with both input and output priced at zero',
  'platforms.sensenova.label': 'SenseNova',
  'platforms.modelscope.hint':
    'Free usage is bounded by your account and platform quotas, as returned by the model service API',
  'platforms.modelscope.label': 'ModelScope',
  'platforms.zhipu.hint':
    'Only lists Flash models that the platform explicitly marks as free',
  'platforms.zhipu.label': 'Zhipu AI',
  'platforms.nvidia.hint':
    'Uses the rate-limited free access on the build.nvidia.com developer API',
  'platforms.github.hint':
    'All accounts have rate-limited free usage for prototyping; paid usage requires opt-in',

  'settingsPage.back': 'Back',
  'settingsPage.title': 'Settings',
  'settingsPage.subtitle': 'Configure API keys for each provider',
  'drawer.close': 'Close',
};

const DICTS: Record<Language, Dict> = { zh, en };

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'zh';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    /* ignore */
  }
  const nav = navigator.language?.toLowerCase() ?? '';
  return nav.startsWith('zh') ? 'zh' : 'en';
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('zh');

  useEffect(() => {
    setLanguageState(detectInitialLanguage());
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    }
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const dict = DICTS[language] ?? DICTS.zh;
      const template = dict[key] ?? DICTS.zh[key] ?? key;
      return interpolate(template, params);
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      language: 'zh',
      setLanguage: () => undefined,
      t: (key, params) => interpolate(DICTS.zh[key] ?? key, params),
    };
  }
  return ctx;
}

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  const nextLabel = language === 'zh' ? t('lang.en') : t('lang.zh');
  return (
    <button
      type="button"
      aria-label={t('lang.toggle')}
      title={t('lang.toggle')}
      onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
      className={
        className ??
        'inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/10'
      }
    >
      <Languages size={14} />
      <span>{nextLabel}</span>
    </button>
  );
}
