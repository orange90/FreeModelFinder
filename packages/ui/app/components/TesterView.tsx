'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUp, Check, Copy, Cpu, Gauge, Loader2, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { classNames, formatK, GATEWAY } from '../lib/utils';
import { PLATFORMS, lookupCapabilityScore } from '../lib/platforms';
import type { QuotaInfo, UsageRecord } from '../lib/usage';

export type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

const EXAMPLE_PROMPTS: { title: string; prompt: string; Icon: LucideIcon }[] = [
  {
    title: '解释一个概念',
    prompt: '用通俗易懂的语言解释「向量数据库」是什么，以及它和传统数据库的区别。',
    Icon: Sparkles,
  },
  {
    title: '生成代码',
    prompt: '请用 TypeScript 写一个防抖函数 debounce，支持传入等待时间和立即执行选项。',
    Icon: Cpu,
  },
  {
    title: '总结与比较',
    prompt: '比较 REST API 和 GraphQL 的核心差异，各给出 3 个适用场景。',
    Icon: Gauge,
  },
];

export function TesterView({
  messages,
  streaming,
  input,
  model,
  setInput,
  send,
  hasModels,
  quota,
  usage,
}: {
  messages: Msg[];
  streaming: boolean;
  input: string;
  model: string;
  setInput: (v: string) => void;
  send: () => void;
  hasModels: boolean;
  quota: QuotaInfo | null;
  usage: UsageRecord | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  const modelInfo = model
    ? (() => {
        const sep = model.indexOf(':');
        if (sep < 0) return null;
        const providerId = model.slice(0, sep);
        const modelName = model.slice(sep + 1);
        const platform = PLATFORMS.find((p) => p.id === providerId);
        const meta = platform?.models.find((m) => m.name === modelName);
        const score = lookupCapabilityScore({ name: modelName, family: meta?.family });
        return { providerId, modelName, platform, meta, score };
      })()
    : null;

  const dayUsagePct =
    quota?.reqPerDay != null && usage
      ? Math.min(100, Math.round((usage.dayCount / quota.reqPerDay) * 100))
      : null;

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      {model && quota && modelInfo && (
        <div className="border-b border-border bg-surface px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{quota.providerLabel}</span>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-foreground">
                  {modelInfo.meta?.note ?? modelInfo.modelName}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs text-foreground">{quota.modelName}</code>
                {modelInfo.score.intelligenceIndex != null && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-foreground">
                    <Sparkles size={11} strokeWidth={1.75} className="text-primary" />
                    能力 {modelInfo.score.intelligenceIndex}
                  </span>
                )}
                {modelInfo.meta?.contextK != null && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-foreground">
                    上下文 {formatK(modelInfo.meta.contextK)}
                  </span>
                )}
                {modelInfo.meta?.throughputTps != null && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-foreground">
                    <Gauge size={11} strokeWidth={1.75} className="text-muted-foreground" />
                    {modelInfo.meta.throughputTps} tokens/s
                  </span>
                )}
              </div>
            </div>
            {usage && (
              <div className="min-w-[180px] text-right">
                <div className="text-xs text-muted-foreground">调用额度</div>
                <div className="mt-1 flex items-center justify-end gap-2 font-mono text-xs tabular-nums text-foreground">
                  <span>
                    {usage.dayCount}
                    {quota.reqPerDay != null ? ` / ${quota.reqPerDay}` : ''}{' '}
                    <span className="text-muted-foreground">今日</span>
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                  <span>
                    {usage.minuteCount}
                    {quota.reqPerMin != null ? ` / ${quota.reqPerMin}` : ''}{' '}
                    <span className="text-muted-foreground">/分钟</span>
                  </span>
                </div>
                {dayUsagePct != null && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={classNames(
                        'h-full rounded-full',
                        dayUsagePct >= 90 ? 'bg-warning' : 'bg-primary',
                      )}
                      style={{ width: `${dayUsagePct}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-section-b" ref={scrollRef}>
        <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
          {!hasModels && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-5 text-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <AlertTriangle size={16} strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">先配置一个模型再开始对话</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    你还没有配置任何模型。按下面 3 步开始：
                  </p>
                  <ol className="mt-3 space-y-1 text-sm text-foreground/90">
                    <li>1. 切到「免费模型寻找」找一个合适的免费模型</li>
                    <li>
                      2. 打开{' '}
                      <a href="/settings" className="text-primary underline underline-offset-2">
                        设置页
                      </a>{' '}
                      粘贴 API Key
                    </li>
                    <li>3. 回到本页开始对话</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {hasModels && messages.length === 0 && (
            <div className="space-y-4 pt-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">开始测试模型</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  选择一个示例开始，或直接在下方输入你的问题。
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p.title}
                    type="button"
                    onClick={() => setInput(p.prompt)}
                    className="group flex flex-col items-start gap-1.5 rounded-lg border border-border bg-surface p-3 text-left transition hover:border-border-strong hover:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p.Icon
                      size={14}
                      strokeWidth={1.75}
                      className="text-muted-foreground group-hover:text-primary"
                    />
                    <div className="text-sm font-medium text-foreground">{p.title}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{p.prompt}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                网关：<code className="font-mono text-xs">{GATEWAY}</code>
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              isStreamingLast={streaming && i === messages.length - 1 && m.role === 'assistant'}
            />
          ))}
        </div>
      </div>

      <form
        className="border-t border-border bg-surface px-3 py-3 md:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <div className="relative flex items-end gap-2 rounded-lg border border-input bg-surface shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
            <textarea
              ref={textareaRef}
              rows={1}
              className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder={hasModels ? '输入消息，Enter 发送 · Shift+Enter 换行' : '请先在设置中配置 API Key'}
              value={input}
              disabled={streaming || !hasModels}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="p-1.5">
              <button
                type="submit"
                aria-label="发送"
                title="发送 (Enter)"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={streaming || !input.trim() || !model}
              >
                {streaming ? (
                  <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                ) : (
                  <ArrowUp size={14} strokeWidth={2} />
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <kbd className="rounded border border-border bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
                Enter
              </kbd>{' '}
              发送 ·{' '}
              <kbd className="rounded border border-border bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
                Shift+Enter
              </kbd>{' '}
              换行
            </span>
            {streaming && (
              <span className="inline-flex items-center gap-1.5 text-primary">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                模型正在生成…
              </span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  isStreamingLast,
}: {
  message: Msg;
  isStreamingLast: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  async function onCopy() {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={classNames('group flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div className="text-xs font-medium text-muted-foreground">
        {isUser ? '你' : '模型'}
      </div>
      <div
        className={classNames(
          'max-w-[92%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-surface text-foreground',
        )}
      >
        {message.content ||
          (isStreamingLast ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 size={12} strokeWidth={2} className="animate-spin" />
              思考中…
            </span>
          ) : (
            ''
          ))}
      </div>
      {!isUser && message.content && (
        <button
          type="button"
          onClick={onCopy}
          className="mt-0.5 inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition hover:border-border hover:bg-surface hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="复制回答"
        >
          {copied ? (
            <>
              <Check size={12} strokeWidth={2} />
              已复制
            </>
          ) : (
            <>
              <Copy size={12} strokeWidth={1.75} />
              复制回答
            </>
          )}
        </button>
      )}
    </div>
  );
}
