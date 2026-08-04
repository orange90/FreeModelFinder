import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import Home from '../page';
import { gateway, server } from '../../test/server';
import { I18nProvider } from '../i18n';

function renderInChinese(ui: ReactNode) {
  window.localStorage.setItem('fmf-language', 'zh');
  return render(<I18nProvider>{ui}</I18nProvider>);
}

async function openTester() {
  const user = userEvent.setup();
  await screen.findByText('Fixture Model');
  await user.click(screen.getAllByRole('button', { name: '测试' })[0]!);
  return user;
}

describe('Home', () => {
  it('shows onboarding instead of an empty catalog for a new configuration', async () => {
    server.use(
      http.get(`${gateway}/api/config`, () =>
        HttpResponse.json({
          version: 2,
          port: 11435,
          providers: {
            openrouter: { enabled: false, hasKey: false },
            gemini: { enabled: false, hasKey: false },
          },
        }),
      ),
    );
    renderInChinese(<Home />);
    expect(await screen.findByText('先连接一个免费模型来源')).toBeTruthy();
    expect(screen.queryByText('Fixture Model')).toBeNull();
  });

  it('keeps a persistent setup entry after onboarding is dismissed', async () => {
    server.use(
      http.get(`${gateway}/api/config`, () =>
        HttpResponse.json({
          version: 2,
          port: 11435,
          onboarding: { dismissedAt: 1_700_000_000_000 },
          providers: { openrouter: { enabled: false, hasKey: false } },
        }),
      ),
      http.get(`${gateway}/v1/models`, () =>
        HttpResponse.json({ object: 'list', data: [], fmf: { failed_providers: [] } }),
      ),
    );
    renderInChinese(<Home />);
    expect(await screen.findByRole('button', { name: '连接第一个 Provider' })).toBeTruthy();
  });

  it('returns to onboarding when a newly saved key is still pending verification', async () => {
    server.use(
      http.get(`${gateway}/api/config`, () =>
        HttpResponse.json({
          version: 2,
          port: 11435,
          onboarding: {},
          providers: { openrouter: { enabled: true, hasKey: true } },
        }),
      ),
    );
    renderInChinese(<Home />);
    expect(await screen.findByText('先连接一个免费模型来源')).toBeTruthy();
  });

  it('loads free models and surfaces provider failures', async () => {
    renderInChinese(<Home />);
    expect(await screen.findByText('Fixture Model')).toBeTruthy();
    expect(screen.getByText(/1 个来源本次同步失败/)).toBeTruthy();
    expect(screen.getByText(/temporary provider error/)).toBeTruthy();
  });

  it('applies model changes made outside the dashboard', async () => {
    server.use(
      http.get(`${gateway}/api/desktop/state`, () =>
        HttpResponse.json({
          instanceId: 'fixture-instance',
          revision: 2,
          catalogRevision: 1,
          defaultModel: 'auto',
          selectionValid: true,
          onboardingRequired: false,
        }),
      ),
    );
    renderInChinese(<Home />);
    await openTester();
    await waitFor(() =>
      expect((screen.getByLabelText('当前模型') as HTMLSelectElement).value).toBe('auto'),
    );
  });

  it('keeps the confirmed selection when persistence fails', async () => {
    server.use(
      http.post(`${gateway}/api/default-model`, () =>
        HttpResponse.json({ error: 'cannot save selection' }, { status: 500 }),
      ),
    );
    renderInChinese(<Home />);
    const user = await openTester();
    const selector = screen.getByLabelText('当前模型');
    await user.selectOptions(selector, 'auto');
    expect(await screen.findByText('cannot save selection')).toBeTruthy();
    expect((selector as HTMLSelectElement).value).toBe('openrouter:fixture-model');
  });

  it('keeps the catalog usable when a provider refresh fails', async () => {
    server.use(
      http.post(`${gateway}/v1/models/refresh`, () =>
        HttpResponse.json({ error: 'refresh failed' }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderInChinese(<Home />);
    await screen.findByText('Fixture Model');
    await user.click(screen.getByRole('button', { name: '同步' }));
    expect(await screen.findByText('本地网关没有响应')).toBeTruthy();
  });

  it('renders streamed OpenAI-compatible text', async () => {
    server.use(
      http.post(
        `${gateway}/v1/chat/completions`,
        () =>
          new HttpResponse(
            'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n' +
              'data: {"choices":[{"delta":{"content":"world"}}]}\n\n' +
              'data: [DONE]\n\n',
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      ),
    );
    renderInChinese(<Home />);
    const user = await openTester();
    const input = screen.getByPlaceholderText(/问点什么/);
    await user.type(input, 'hello');
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    expect(await screen.findByText('Hello world')).toBeTruthy();
  });

  it('cancels an in-flight stream', async () => {
    server.use(
      http.post(`${gateway}/v1/chat/completions`, () => {
        const encoder = new TextEncoder();
        return new HttpResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
              );
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }),
    );
    renderInChinese(<Home />);
    const user = await openTester();
    await user.type(screen.getByPlaceholderText(/问点什么/), 'cancel me');
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    const stop = await screen.findByRole('button', { name: '停止生成' });
    await user.click(stop);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '发送消息' })).toBeTruthy();
    });
  });
});
