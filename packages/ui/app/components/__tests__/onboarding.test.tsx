import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from '../OnboardingWizard';
import { gateway, server } from '../../../test/server';
import { I18nProvider } from '../../i18n';

function renderInEnglish(ui: ReactNode) {
  window.localStorage.setItem('fmf-language', 'en');
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function success(provider: 'openrouter' | 'gemini', autoRoute = false) {
  return {
    saved: true,
    provider,
    modelsFound: provider === 'openrouter' ? 26 : 8,
    selectedModel:
      provider === 'openrouter' ? 'openrouter:openrouter/free' : 'gemini:gemini-2.5-flash',
    primaryModel: autoRoute ? 'openrouter:openrouter/free' : undefined,
    test: { status: 'success', latencyMs: 120, reply: 'OK' },
    onboardingComplete: true,
    autoRoute: {
      enabled: autoRoute,
      strategy: autoRoute ? 'rate-limit' : 'capability',
    },
  };
}

describe('OnboardingWizard', () => {
  it('imports a detected environment key only after explicit confirmation', async () => {
    const writes: Array<Record<string, unknown>> = [];
    server.use(
      http.get(`${gateway}/api/onboarding/environment`, () =>
        HttpResponse.json({
          data: [{ provider: 'openrouter', variable: 'OPENROUTER_API_KEY', present: true }],
        }),
      ),
      http.post(`${gateway}/api/onboarding/connect`, async ({ request }) => {
        writes.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(success('openrouter'));
      }),
    );
    const onReady = vi.fn();
    const user = userEvent.setup();
    renderInEnglish(<OnboardingWizard onReady={onReady} onDismiss={vi.fn()} onOpenSettings={vi.fn()} />);

    const openRouter = await screen.findByText('OpenRouter');
    await user.click(
      within(openRouter.closest('article')!).getByRole('button', { name: /Use this provider/ }),
    );
    expect((await screen.findAllByText('OPENROUTER_API_KEY')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Import and test/ }));

    expect(await screen.findByText('Your first connection is ready')).toBeTruthy();
    expect(writes[0]).toMatchObject({
      provider: 'openrouter',
      role: 'primary',
      credential: { type: 'env', variable: 'OPENROUTER_API_KEY' },
    });
    expect(JSON.stringify(writes[0])).not.toContain('environment-secret');
    await user.click(screen.getByRole('button', { name: /Start chatting/ }));
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('adds a second provider through the explicit fallback flow', async () => {
    const writes: Array<Record<string, unknown>> = [];
    server.use(
      http.get(`${gateway}/api/gateway`, () =>
        HttpResponse.json({ publicBaseUrl: 'https://fmf.example.test' }),
      ),
      http.post(`${gateway}/api/onboarding/connect`, async ({ request }) => {
        const body = (await request.json()) as { provider: 'openrouter' | 'gemini'; role: string };
        writes.push(body as unknown as Record<string, unknown>);
        return HttpResponse.json(success(body.provider, body.role === 'fallback'));
      }),
    );
    const user = userEvent.setup();
    renderInEnglish(<OnboardingWizard onReady={vi.fn()} onDismiss={vi.fn()} onOpenSettings={vi.fn()} />);

    const openRouter = await screen.findByText('OpenRouter');
    await user.click(
      within(openRouter.closest('article')!).getByRole('button', { name: /Use this provider/ }),
    );
    await user.type(screen.getByLabelText('API key'), 'primary-secret');
    await user.click(screen.getByRole('button', { name: /Connect and test/ }));
    await user.click(await screen.findByRole('button', { name: /Add a second provider/ }));

    expect(await screen.findByText('Google Gemini')).toBeTruthy();
    await user.type(screen.getByLabelText('API key'), 'fallback-secret');
    await user.click(screen.getByRole('button', { name: /Connect and test/ }));
    expect(await screen.findByText('Automatic failover is ready')).toBeTruthy();
    expect(screen.getByText('model: auto')).toBeTruthy();
    expect(screen.getByText('https://fmf.example.test/v1')).toBeTruthy();
    expect(writes[1]).toMatchObject({ provider: 'gemini', role: 'fallback' });
  });

  it('returns to the credential step when a saved key fails verification', async () => {
    server.use(
      http.post(`${gateway}/api/onboarding/connect`, () =>
        HttpResponse.json({
          ...success('openrouter'),
          test: { status: 'failed', error: 'upstream rejected the credential' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderInEnglish(<OnboardingWizard onReady={vi.fn()} onDismiss={vi.fn()} onOpenSettings={vi.fn()} />);

    const openRouter = await screen.findByText('OpenRouter');
    await user.click(
      within(openRouter.closest('article')!).getByRole('button', { name: /Use this provider/ }),
    );
    await user.type(screen.getByLabelText('API key'), 'bad-secret');
    await user.click(screen.getByRole('button', { name: /Connect and test/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/key was saved/i);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry connection/ })).toBeTruthy(),
    );
  });
});
