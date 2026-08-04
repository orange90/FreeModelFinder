import type { ReactNode } from 'react';
import './globals.css';
import { I18nProvider } from './i18n';

export const metadata = {
  title: 'FreeModelFinder',
  description: 'Discover, verify and unify access to truly free AI models',
};

const themeInitScript = `
(function(){
  try {
    var stored = localStorage.getItem('fmf-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="font-sans antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
