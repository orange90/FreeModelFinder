'use client';

import { ArrowLeft } from 'lucide-react';
import { SettingsView } from '../components/SettingsView';
import { ThemeToggle } from '../theme';

export default function Settings() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            <span>返回</span>
          </a>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight">设置</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">配置各平台的 API Key</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>
      <div className="flex-1">
        <SettingsView compact />
      </div>
    </main>
  );
}
