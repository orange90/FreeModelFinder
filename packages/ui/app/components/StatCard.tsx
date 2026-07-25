import type { ReactNode } from 'react';
import { Dot } from './Badge';
import { classNames } from '../lib/utils';

export function StatCard({
  label,
  value,
  hint,
  tone = 'muted',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'ok' | 'warn' | 'muted' | 'danger';
  icon?: ReactNode;
  className?: string;
}) {
  const dotTone =
    tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : tone === 'danger' ? 'danger' : 'neutral';
  return (
    <div
      className={classNames(
        'rounded-lg border border-border bg-surface p-3.5 transition hover:border-border-strong',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Dot tone={dotTone} />
          {label}
        </span>
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
      </div>
      <div className="mt-1.5 truncate text-base font-semibold text-foreground" title={typeof value === 'string' ? value : undefined}>
        {value}
      </div>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
