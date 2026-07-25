'use client';

import { AlertTriangle } from 'lucide-react';
import type { QuotaExceededKind, QuotaInfo } from '../lib/usage';

export function QuotaExceededModal({
  kind,
  quota,
  limit,
  onConfirm,
  onClose,
}: {
  kind: QuotaExceededKind;
  quota: QuotaInfo;
  limit: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const scopeText = kind === 'day' ? '今日' : '本分钟内';
  const unitText = kind === 'day' ? '次/天' : '次/分钟';
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
            <AlertTriangle size={18} strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              调用量已达上限
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">
              {scopeText}模型{' '}
              <code className="font-mono text-xs text-foreground">{quota.modelName}</code>{' '}
              的调用额度已用完（限额 {limit} {unitText}，平台：{quota.providerLabel}）。
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              请前往「设置」页切换到其他模型或更换 API Key 后继续使用。
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
          >
            前往设置
          </button>
        </div>
      </div>
    </div>
  );
}
