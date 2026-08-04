'use client';

import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n';
import { classNames } from '../lib/utils';

export type SegmentedItem<Key extends string> = {
  key: Key;
  label: string;
  Icon: LucideIcon;
};

export function SegmentedTabs<Key extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: readonly SegmentedItem<Key>[];
  value: Key;
  onChange: (k: Key) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5"
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={classNames(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              active
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <it.Icon size={14} strokeWidth={1.75} />
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function BottomNav<Key extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly SegmentedItem<Key>[];
  value: Key;
  onChange: (k: Key) => void;
}) {
  const { t } = useI18n();
  return (
    <nav
      role="tablist"
      aria-label={t('app.nav.mobileAria')}
      className="grid border-t border-border bg-surface md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={classNames(
              'flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <it.Icon size={18} strokeWidth={1.75} />
            <span className="text-[11px] font-medium">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
