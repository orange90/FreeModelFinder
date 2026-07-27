import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import Home from '../page';
import { gateway, server } from '../../test/server';

async function openTester() {
  const user = userEvent.setup();
  await screen.findByText('Fixture Model');
  await user.click(screen.getAllByRole('button', { name: '测试' })[0]!);
  return user;
}

describe('Home', () => {
  it('loads free models and surfaces provider failures', async () => {
    render(<Home />);
    expect(await screen.findByText('Fixture Model')).toBeTruthy();
    expect(screen.getByText(/1 个来源本次同步失败/)).toBeTruthy();
    expect(screen.getByText(/temporary provider error/)).toBeTruthy();
  });

  it('keeps the catalog usable when a provider refresh fails', async () => {
    server.use(
      http.post(`${gateway}/v1/models/refresh`, () =>
        HttpResponse.json({ error: 'refresh failed' }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    render(<Home />);
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
    render(<Home />);
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
    render(<Home />);
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
