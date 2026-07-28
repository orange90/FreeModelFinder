import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { SettingsView } from '../SettingsView';
import { configPayload, gateway, server } from '../../../test/server';

describe('SettingsView', () => {
  it('saves provider and custom-source keys', async () => {
    const writes: Array<Record<string, unknown>> = [];
    server.use(
      http.post(`${gateway}/api/providers`, async ({ request }) => {
        writes.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ ok: true });
      }),
      http.get(`${gateway}/api/config`, () => HttpResponse.json(configPayload)),
    );
    const user = userEvent.setup();
    render(<SettingsView />);

    const providerKey = await screen.findByLabelText('OpenRouter API Key');
    await user.type(providerKey, 'provider-secret');
    const providerControls = providerKey.parentElement?.parentElement;
    expect(providerControls).not.toBeNull();
    await user.click(within(providerControls!).getByRole('button', { name: '保存' }));

    const sourceKey = await screen.findByPlaceholderText(/留空则保持不变/);
    await user.type(sourceKey, 'custom-secret');
    await user.click(screen.getByRole('button', { name: '保存自定义模型' }));

    await waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(2));
    expect(writes[0]).toMatchObject({ provider: 'openrouter', apiKey: 'provider-secret' });
    expect(writes[1]).toMatchObject({ provider: 'custom' });
    expect(JSON.stringify(writes[1])).toContain('custom-secret');
  });

  it('generates and displays a gateway key', async () => {
    let gatewayLoaded = false;
    server.use(
      http.get(`${gateway}/api/gateway`, () => {
        gatewayLoaded = true;
        return HttpResponse.json({
          hasKey: false,
          apiKey: null,
          requireAuth: false,
          port: 11435,
        });
      }),
    );
    const user = userEvent.setup();
    render(<SettingsView />);
    await waitFor(() => expect(gatewayLoaded).toBe(true));
    const generate = await screen.findByRole('button', { name: '生成 API Key' });
    await user.click(generate);
    expect(await screen.findByRole('button', { name: '隐藏 Key' })).toBeTruthy();
    expect(screen.getByText(/重新生成 Key/)).toBeTruthy();
  });

  it('shows the public URL and locks authentication controls in server mode', async () => {
    server.use(
      http.get(`${gateway}/api/gateway`, () =>
        HttpResponse.json({
          mode: 'server',
          hasKey: true,
          apiKey: 'fmf-server-key',
          requireAuth: true,
          authLocked: true,
          adminPort: 11435,
          gatewayPort: 11436,
          publicBaseUrl: 'https://192.0.2.10',
        }),
      ),
    );
    render(<SettingsView />);

    expect((await screen.findAllByText('https://192.0.2.10')).length).toBeGreaterThan(0);
    expect(screen.getByText(/当前管理地址仅供 Tailscale 使用/)).toBeTruthy();
    const auth = screen.getByRole('checkbox', { name: /强制鉴权/ });
    expect((auth as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '撤销' })).toBeNull();
    expect(screen.getByText(/服务器模式已锁定/)).toBeTruthy();
  });
});
