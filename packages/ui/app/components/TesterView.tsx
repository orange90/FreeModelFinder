'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Braces,
  Check,
  Copy,
  Eraser,
  Loader2,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatContext, modelValue, type ModelItem } from '../lib/models';
import { classNames } from '../lib/utils';

export type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

const EXAMPLE_PROMPTS: Array<{
  eyebrow: string;
  title: string;
  prompt: string;
  Icon: LucideIcon;
}> = [
  {
    eyebrow: '解释',
    title: '把复杂概念讲清楚',
    prompt: '用一个生活中的例子解释向量数据库，并说明它与传统关系型数据库的区别。',
    Icon: Sparkles,
  },
  {
    eyebrow: '代码',
    title: '写一个可靠的工具函数',
    prompt: '请用 TypeScript 实现一个带 cancel 方法的 debounce，并补充边界情况测试。',
    Icon: Braces,
  },
  {
    eyebrow: '比较',
    title: '给出有条件的判断',
    prompt: '比较 REST API 和 GraphQL。不要只列优缺点，请按团队规模和产品阶段给出选择建议。',
    Icon: MessageSquareText,
  },
];

export function TesterView({
  messages,
  streaming,
  input,
  model,
  models,
  setInput,
  send,
  onModelChange,
  onClear,
}: {
  messages: Msg[];
  streaming: boolean;
  input: string;
  model: string;
  models: ModelItem[];
  setInput: (value: string) => void;
  send: () => void;
  onModelChange: (value: string) => void;
  onClear: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selected = models.find((item) => modelValue(item) === model);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: messages.length > 2 ? 'smooth' : 'auto',
    });
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border bg-background px-5 py-4 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="tester-model"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground"
            >
              当前模型
            </label>
            <select
              id="tester-model"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={models.length === 0 || streaming}
              className="h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm font-medium text-foreground shadow-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {models.length === 0 && <option value="">暂无可用模型</option>}
              {models.map((item) => (
                <option key={modelValue(item)} value={modelValue(item)}>
                  {item.provider} · {item.display_name ?? item.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 sm:pt-5">
            {selected && (
              <div className="hidden min-w-[130px] sm:block">
                <p className="text-xs font-medium text-foreground">
                  {formatContext(selected.context_window)}
                </p>
                <p className="mt-0.5 text-[11px] text-success">免费规则已验证</p>
              </div>
            )}
            <button
              type="button"
              onClick={onClear}
              disabled={messages.length === 0 || streaming}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-medium text-muted-foreground shadow-sm transition hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser size={14} />
              清空
            </button>
          </div>
        </div>

      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-4xl flex-col px-5 py-7 md:px-8">
          {models.length === 0 ? (
            <div className="my-auto py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface">
                <MessageSquareText className="text-muted-foreground" size={20} />
              </div>
              <h2 className="mt-4 text-base font-semibold text-foreground">还没有可测试的模型</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                在设置里添加 provider key，系统只会把符合免费规则的模型带到这里。
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="my-auto py-8">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Quick test
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-foreground">
                用同一个问题，试出模型差异
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                先选一个模板，也可以直接在下方输入。对话只会发往你当前选择的 provider。
              </p>

              <div className="mt-7 grid gap-3 md:grid-cols-3">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example.title}
                    type="button"
                    onClick={() => {
                      setInput(example.prompt);
                      textareaRef.current?.focus();
                    }}
                    className="group rounded-2xl border border-border bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/10"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {example.eyebrow}
                      </span>
                      <example.Icon
                        size={15}
                        className="text-muted-foreground transition group-hover:text-primary"
                      />
                    </div>
                    <p className="mt-6 text-sm font-semibold leading-5 text-foreground">
                      {example.title}
                    </p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {example.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-7 pb-4">
              {messages.map((message, index) => (
                <MessageRow
                  key={`${message.role}-${index}`}
                  message={message}
                  isStreamingLast={
                    streaming &&
                    index === messages.length - 1 &&
                    message.role === 'assistant'
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <form
        className="border-t border-border bg-background px-5 py-4 md:px-8"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="mx-auto max-w-4xl">
          <div className="flex items-end gap-2 rounded-2xl border border-input bg-surface p-2 shadow-sm transition focus-within:border-ring focus-within:shadow-[0_0_0_4px_hsl(var(--ring)/0.08)]">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              disabled={streaming || models.length === 0}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={
                models.length > 0
                  ? '问点什么…  Enter 发送，Shift + Enter 换行'
                  : '请先配置 provider'
              }
              className="max-h-[180px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/65 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              aria-label="发送消息"
              disabled={streaming || !model || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {streaming ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <ArrowUp size={17} strokeWidth={2.2} />
              )}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>回答可能不准确，请核对重要信息。</span>
            {streaming && <span className="text-primary">正在生成</span>}
          </div>
        </div>
      </form>
    </div>
  );
}

function MessageRow({
  message,
  isStreamingLast,
}: {
  message: Msg;
  isStreamingLast: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isError = message.content.startsWith('[error]');

  async function copy() {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be unavailable inside hardened desktop webviews.
    }
  }

  return (
    <article className={classNames('group flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={classNames(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          isUser
            ? 'bg-foreground text-background'
            : 'border border-border bg-surface text-muted-foreground',
        )}
      >
        {isUser ? '你' : 'FM'}
      </div>
      <div className={classNames('min-w-0 max-w-[86%]', isUser && 'text-right')}>
        <div
          className={classNames(
            'inline-block whitespace-pre-wrap rounded-2xl px-4 py-3 text-left text-sm leading-7',
            isUser
              ? 'rounded-tr-sm bg-foreground text-background'
              : isError
                ? 'rounded-tl-sm border border-destructive/25 bg-destructive/5 text-destructive'
                : 'rounded-tl-sm border border-border bg-surface text-foreground',
          )}
        >
          {message.content ? (
            isError ? (
              message.content.replace(/^\[error\]\s*/, '')
            ) : (
              message.content
            )
          ) : isStreamingLast ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="animate-spin" size={14} />
              等待模型响应
            </span>
          ) : null}
        </div>
        {!isUser && message.content && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition hover:bg-surface-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
