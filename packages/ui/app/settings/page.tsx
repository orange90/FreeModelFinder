'use client';

import { ArrowLeft } from 'lucide-react';
import { SettingsView } from '../components/SettingsView';
import { ThemeToggle } from '../theme';
import { LanguageToggle, useI18n } from '../i18n';

export default function Settings() {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            <span>{t('settingsPage.back')}</span>
          </a>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight">{t('settingsPage.title')}</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {t('settingsPage.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </header>
      <div className="flex-1">
        <SettingsView compact />
      </div>
    </main>
  );
}
