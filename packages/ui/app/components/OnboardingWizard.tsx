'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
  Loader2,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { GATEWAY, classNames, withUiHeaders } from '../lib/utils';
import { useI18n } from '../i18n';

type Provider = 'openrouter' | 'gemini';
type Role = 'primary' | 'fallback';
type Language = 'zh' | 'en';
type Step = 'provider' | 'credential' | 'connecting' | 'success';

type EnvironmentKeyStatus = {
  provider: string;
  variable: string;
  present: boolean;
};

export type OnboardingResult = {
  saved: boolean;
  provider: Provider;
  modelsFound: number;
  selectedModel?: string;
  primaryModel?: string;
  test: {
    status: 'success' | 'failed' | 'skipped';
    latencyMs?: number;
    reply?: string;
    error?: string;
  };
  onboardingComplete: boolean;
  autoRoute: {
    enabled: boolean;
    strategy: 'capability' | 'speed' | 'rate-limit';
  };
};

const PROVIDERS: Record<
  Provider,
  { name: string; keyUrl: string; recommended: boolean; variable: string }
> = {
  openrouter: {
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    recommended: true,
    variable: 'OPENROUTER_API_KEY',
  },
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    recommended: false,
    variable: 'GEMINI_API_KEY',
  },
};

const COPY = {
  zh: {
    eyebrow: '两分钟快速开始',
    title: '先连接一个免费模型来源',
    subtitle: 'Key 只在本机加密保存。连接后会自动找模型、选择默认项并发送一次真实测试。',
    choose: '选择平台',
    key: '连接密钥',
    test: '验证模型',
    done: '完成',
    recommended: '推荐',
    openrouterDescription: '模型数量最多，最适合快速体验 FreeModelFinder。',
    geminiDescription: '免费额度规则相对清晰，适合作为稳定来源或备用平台。',
    useProvider: '使用此平台',
    other: '使用其他平台',
    later: '稍后配置',
    back: '返回选择',
    getKey: '前往获取 Key',
    keyLabel: 'API Key',
    keyPlaceholder: '粘贴 API Key',
    localOnly: 'Key 不会发送给 FreeModelFinder 作者，只会发往你选择的平台。',
    connect: '连接并测试',
    envFound: '发现当前进程已有环境变量',
    importEnv: '导入并测试',
    connectingTitle: '正在建立第一条可用连接',
    fallbackTitle: '正在验证备用平台',
    saving: '加密保存 Key',
    syncing: '同步免费模型目录',
    testing: '发送最小测试请求',
    successTitle: '第一条连接已经可用',
    fallbackSuccessTitle: '自动接力已经开启',
    saved: 'Key 已加密保存',
    found: '找到 {count} 个免费模型',
    testPassed: '测试请求成功',
    primaryModel: '当前默认模型',
    fallbackModel: '已验证备用模型',
    startChat: '开始对话',
    addFallback: '添加第二个平台，开启自动接力',
    routeReady: '额度用完后将按请求限制优先策略自动切换。',
    gateway: '外部客户端配置',
    retry: '重试连接',
    savedButFailed: 'Key 已保存，但模型验证尚未成功：',
    languageToggle: '切换语言',
    progressAria: '引导进度',
    showApiKey: '显示 API Key',
    hideApiKey: '隐藏 API Key',
    testFailed: '平台测试未成功。',
  },
  en: {
    eyebrow: 'Two-minute quick start',
    title: 'Connect your first free model provider',
    subtitle:
      'Your key stays encrypted on this machine. We will find a model, select it, and run one real test.',
    choose: 'Provider',
    key: 'API key',
    test: 'Verify',
    done: 'Done',
    recommended: 'Recommended',
    openrouterDescription: 'The largest catalog and the fastest way to try FreeModelFinder.',
    geminiDescription: 'Clearer free-tier rules and a useful primary or fallback provider.',
    useProvider: 'Use this provider',
    other: 'Use another provider',
    later: 'Set up later',
    back: 'Back to providers',
    getKey: 'Get an API key',
    keyLabel: 'API key',
    keyPlaceholder: 'Paste API key',
    localOnly: 'The key is sent only to the provider you choose and is encrypted locally.',
    connect: 'Connect and test',
    envFound: 'Found an environment variable in this process',
    importEnv: 'Import and test',
    connectingTitle: 'Creating your first working connection',
    fallbackTitle: 'Verifying the fallback provider',
    saving: 'Encrypting the API key',
    syncing: 'Syncing verified free models',
    testing: 'Sending a minimal test request',
    successTitle: 'Your first connection is ready',
    fallbackSuccessTitle: 'Automatic failover is ready',
    saved: 'API key encrypted locally',
    found: 'Found {count} free models',
    testPassed: 'Test request succeeded',
    primaryModel: 'Current default model',
    fallbackModel: 'Verified fallback model',
    startChat: 'Start chatting',
    addFallback: 'Add a second provider for automatic failover',
    routeReady: 'Requests will switch using the rate-limit-first strategy when quota runs out.',
    gateway: 'External client settings',
    retry: 'Retry connection',
    savedButFailed: 'The key was saved, but model verification did not succeed:',
    languageToggle: 'Switch language',
    progressAria: 'Onboarding progress',
    showApiKey: 'Show API key',
    hideApiKey: 'Hide API key',
    testFailed: 'The provider test did not succeed.',
  },
} as const;

export function OnboardingWizard({
  onReady,
  onDismiss,
  onOpenSettings,
}: {
  onReady: (result: OnboardingResult) => void;
  onDismiss: () => void;
  onOpenSettings: () => void;
}) {
  const { language: globalLanguage, setLanguage: setGlobalLanguage } = useI18n();
  const language: Language = globalLanguage === 'en' ? 'en' : 'zh';
  const setLanguage = (next: Language) => setGlobalLanguage(next);
  const [step, setStep] = useState<Step>('provider');
  const [provider, setProvider] = useState<Provider>('openrouter');
  const [role, setRole] = useState<Role>('primary');
  const [primaryProvider, setPrimaryProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [environment, setEnvironment] = useState<EnvironmentKeyStatus[]>([]);
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState(GATEWAY.replace(/\/$/, ''));
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [error, setError] = useState('');
  const copy = COPY[language];

  useEffect(() => {
    fetch(`${GATEWAY}/api/onboarding/environment`, withUiHeaders())
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((payload: { data?: EnvironmentKeyStatus[] }) => setEnvironment(payload.data ?? []))
      .catch(() => setEnvironment([]));
    fetch(`${GATEWAY}/api/gateway`, withUiHeaders())
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((payload: { publicBaseUrl?: string | null }) =>
        setGatewayBaseUrl((payload.publicBaseUrl || GATEWAY).replace(/\/$/, '')),
      )
      .catch(() => undefined);
  }, []);

  const detectedVariable = useMemo(
    () => environment.find((item) => item.provider === provider && item.present)?.variable,
    [environment, provider],
  );

  async function dismiss(openSettings = false) {
    await fetch(
      `${GATEWAY}/api/onboarding/dismiss`,
      withUiHeaders({ method: 'POST', headers: { 'content-type': 'application/json' } }),
    ).catch(() => undefined);
    if (openSettings) onOpenSettings();
    else onDismiss();
  }

  async function connect(
    credential: { type: 'input'; apiKey: string } | { type: 'env'; variable: string },
  ) {
    setError('');
    setResult(null);
    setStep('connecting');
    try {
      const response = await fetch(
        `${GATEWAY}/api/onboarding/connect`,
        withUiHeaders({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider, role, credential }),
        }),
      );
      const payload = (await response.json()) as OnboardingResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || `request failed ${response.status}`);
      if (payload.test?.status !== 'success') {
        setResult(payload);
        setError(payload.test?.error || copy.testFailed);
        setStep('credential');
        return;
      }
      setResult(payload);
      if (role === 'primary') setPrimaryProvider(provider);
      setApiKey('');
      setStep('success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStep('credential');
    }
  }

  function chooseProvider(next: Provider) {
    setProvider(next);
    setError('');
    setApiKey('');
    setStep('credential');
  }

  function addFallback() {
    const next: Provider = primaryProvider === 'gemini' ? 'openrouter' : 'gemini';
    setRole('fallback');
    setProvider(next);
    setResult(null);
    setError('');
    setApiKey('');
    setStep('credential');
  }

  const steps = [copy.choose, copy.key, copy.test, copy.done];
  const activeStep =
    step === 'provider' ? 0 : step === 'credential' ? 1 : step === 'connecting' ? 2 : 3;

  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-background px-4 py-6 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-xs font-bold text-background">
              FM
            </span>
            <div>
              <div className="text-sm font-semibold">FreeModelFinder</div>
              <div className="text-[11px] text-muted-foreground">
                Free LLMs · One local endpoint
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            aria-label={copy.languageToggle}
          >
            <Languages size={14} /> {language === 'zh' ? 'English' : '中文'}
          </button>
        </header>

        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label={copy.progressAria}>
          {steps.map((label, index) => (
            <li key={label} className="min-w-0">
              <div
                className={classNames(
                  'h-1 rounded-full',
                  index <= activeStep ? 'bg-primary' : 'bg-surface-muted',
                )}
              />
              <span
                className={classNames(
                  'mt-2 block truncate text-[10px] sm:text-xs',
                  index <= activeStep ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>

        <section className="mt-8 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-8">
          {step === 'provider' && (
            <>
              <div className="max-w-2xl">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {copy.eyebrow}
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                  {copy.title}
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
              </div>

              <div className="mt-7 grid gap-3 md:grid-cols-2">
                {(Object.keys(PROVIDERS) as Provider[]).map((id) => {
                  const item = PROVIDERS[id];
                  const description =
                    id === 'openrouter' ? copy.openrouterDescription : copy.geminiDescription;
                  return (
                    <article
                      key={id}
                      className={classNames(
                        'relative flex flex-col rounded-2xl border p-5',
                        item.recommended
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-background',
                      )}
                    >
                      {item.recommended && (
                        <span className="absolute right-4 top-4 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
                          {copy.recommended}
                        </span>
                      )}
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted text-primary">
                        <Sparkles size={18} />
                      </div>
                      <h2 className="mt-4 text-base font-semibold">{item.name}</h2>
                      <p className="mt-2 flex-1 text-xs leading-5 text-muted-foreground">
                        {description}
                      </p>
                      <button
                        type="button"
                        onClick={() => chooseProvider(id)}
                        className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
                      >
                        {copy.useProvider} <ArrowRight size={15} />
                      </button>
                    </article>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <button
                  type="button"
                  onClick={() => void dismiss(true)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {copy.other}
                </button>
                <button
                  type="button"
                  onClick={() => void dismiss(false)}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {copy.later}
                </button>
              </div>
            </>
          )}

          {step === 'credential' && (
            <div className="mx-auto max-w-xl">
              {role === 'primary' && (
                <button
                  type="button"
                  onClick={() => setStep('provider')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft size={14} /> {copy.back}
                </button>
              )}
              <div className="mt-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <KeyRound size={19} />
                </span>
                <div>
                  <h1 className="text-xl font-semibold">{PROVIDERS[provider].name}</h1>
                  <a
                    href={PROVIDERS[provider].keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {copy.getKey} <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {detectedVariable && (
                <div className="mt-6 rounded-2xl border border-success/25 bg-success/5 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 text-success" size={17} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{copy.envFound}</p>
                      <code className="mt-1 block truncate text-xs text-muted-foreground">
                        {detectedVariable}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => void connect({ type: 'env', variable: detectedVariable })}
                      className="shrink-0 rounded-xl bg-success px-3 py-2 text-xs font-semibold text-primary-foreground"
                    >
                      {copy.importEnv}
                    </button>
                  </div>
                </div>
              )}

              <form
                className="mt-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (apiKey.trim()) void connect({ type: 'input', apiKey });
                }}
              >
                <div className="flex items-center justify-between">
                  <label htmlFor="onboarding-api-key" className="text-sm font-medium">
                    {copy.keyLabel}
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    {PROVIDERS[provider].variable}
                  </span>
                </div>
                <div className="relative mt-2">
                  <input
                    id="onboarding-api-key"
                    type={keyVisible ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={copy.keyPlaceholder}
                    autoComplete="off"
                    className="h-12 w-full rounded-xl border border-input bg-background px-3 pr-11 text-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/10"
                  />
                  <button
                    type="button"
                    onClick={() => setKeyVisible((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                    aria-label={keyVisible ? copy.hideApiKey : copy.showApiKey}
                  >
                    {keyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 shrink-0" size={13} /> {copy.localOnly}
                </p>

                {error && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs leading-5 text-destructive"
                  >
                    {result?.saved && <strong>{copy.savedButFailed} </strong>}
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!apiKey.trim()}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {error ? copy.retry : copy.connect} <ArrowRight size={15} />
                </button>
              </form>
            </div>
          )}

          {step === 'connecting' && (
            <div className="mx-auto max-w-lg py-8 text-center" aria-live="polite">
              <Loader2 className="mx-auto animate-spin text-primary" size={34} />
              <h1 className="mt-5 text-xl font-semibold">
                {role === 'primary' ? copy.connectingTitle : copy.fallbackTitle}
              </h1>
              <div className="mx-auto mt-6 max-w-sm space-y-3 text-left">
                {[copy.saving, copy.syncing, copy.testing].map((label) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl bg-background px-4 py-3 text-sm"
                  >
                    <Loader2 className="animate-spin text-primary" size={14} /> {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'success' && result && (
            <div className="mx-auto max-w-xl py-3 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
                {result.autoRoute.enabled ? (
                  <Route size={25} />
                ) : (
                  <Check size={26} strokeWidth={2.5} />
                )}
              </span>
              <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
                {result.autoRoute.enabled ? copy.fallbackSuccessTitle : copy.successTitle}
              </h1>
              {result.autoRoute.enabled && (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.routeReady}</p>
              )}

              <div className="mt-6 space-y-2 text-left">
                {[
                  copy.saved,
                  copy.found.replace('{count}', String(result.modelsFound)),
                  copy.testPassed,
                ].map((label) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <Check className="text-success" size={15} strokeWidth={2.5} /> {label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-surface-muted/60 p-4 text-left">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {copy.primaryModel}
                </div>
                <code className="mt-1 block break-all text-xs text-foreground">
                  {result.primaryModel ?? result.selectedModel}
                </code>
                {result.autoRoute.enabled &&
                  result.selectedModel &&
                  result.selectedModel !== result.primaryModel && (
                    <>
                      <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {copy.fallbackModel}
                      </div>
                      <code className="mt-1 block break-all text-xs text-foreground">
                        {result.selectedModel}
                      </code>
                    </>
                  )}
                <div className="mt-2 text-xs text-muted-foreground">
                  {result.test.latencyMs != null ? `${result.test.latencyMs} ms` : ''}
                  {result.test.reply ? ` · ${result.test.reply}` : ''}
                </div>
              </div>

              {result.autoRoute.enabled && (
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-left">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary">
                    {copy.gateway}
                  </div>
                  <code className="mt-2 block text-xs">{gatewayBaseUrl}/v1</code>
                  <code className="mt-1 block text-xs">model: auto</code>
                </div>
              )}

              <button
                type="button"
                onClick={() => onReady(result)}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background"
              >
                {copy.startChat} <ArrowRight size={15} />
              </button>
              {!result.autoRoute.enabled && role === 'primary' && (
                <button
                  type="button"
                  onClick={addFallback}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-surface-muted"
                >
                  <Route size={15} /> {copy.addFallback}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
