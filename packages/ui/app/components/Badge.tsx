import type { ReactNode } from 'react';
import { classNames } from '../lib/utils';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'sky';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-muted text-muted-foreground',
  primary: 'border-primary/25 bg-primary/10 text-primary',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-destructive/25 bg-destructive/10 text-destructive',
  purple: 'border-purple-500/25 bg-purple-500/10 text-purple-600 dark:text-purple-300',
  sky: 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = 'neutral' }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary' }) {
  const cls =
    tone === 'success'
      ? 'bg-success'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'danger'
          ? 'bg-destructive'
          : tone === 'primary'
            ? 'bg-primary'
            : 'bg-muted-foreground/60';
  return <span className={classNames('inline-block h-1.5 w-1.5 rounded-full', cls)} />;
}
