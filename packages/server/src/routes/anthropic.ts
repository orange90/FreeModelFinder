import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  anthropicToChatRequest,
  chatResponseToAnthropic,
  parseRateLimitError,
  type AnthropicMessagesRequest,
  type ChatRequest,
  type ChatResponse,
  type ProviderId,
  type ProviderRegistry,
  type SwitchNotice,
} from '@freemodelfinder/core';

async function dispatchWithAutoRoute(
  reg: ProviderRegistry,
  chatReq: ChatRequest,
): Promise<{ response: ChatResponse; notices: SwitchNotice[]; finalModel: string }> {
  const router = reg.getAutoRouter();
  const notices: SwitchNotice[] = [];
  const originalRequested = chatReq.model;

  const pre = await router.preflight(chatReq.model);
  if (pre.switched) {
    chatReq.model = pre.model.id;
    notices.push(pre.notice);
  }

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { provider, modelId: realModelId } = reg.resolveModel(chatReq.model);
    const dispatchReq: ChatRequest = { ...chatReq, model: realModelId };
    try {
      const res = await provider.chat(dispatchReq);
      const back = await router.maybeSwitchBack(chatReq.model);
      if (back) notices.push(back);
      return {
        response: res,
        notices,
        finalModel: `${provider.id}:${realModelId}`,
      };
    } catch (err) {
      const parsed = parseRateLimitError(err);
      if (parsed.isRateLimit && router.isEnabled() && attempt === 0) {
        router.markRateLimited(chatReq.model, provider.id as ProviderId, parsed);
        const fallback = await router.pickFallback(chatReq.model);
        if (fallback) {
          router.rememberPreference(originalRequested);
          const notice: SwitchNotice = {
            type: 'switch-away',
            from: chatReq.model,
            to: `${fallback.provider}:${fallback.id}`,
            strategy: router.getStrategy(),
            reason: router.buildSwitchAwayMessage(
              {
                model: chatReq.model,
                provider: provider.id,
                hitAt: Date.now(),
                resetAt: parsed.resetAt ?? Date.now() + 60_000,
                message: parsed.message,
              },
              fallback,
            ),
            resetAt: parsed.resetAt,
          };
          router.notify(notice);
          notices.push(notice);
          chatReq.model = `${fallback.provider}:${fallback.id}`;
          attempt++;
          continue;
        }
      }
      throw err;
    }
  }
}

export function registerAnthropicRoutes(app: FastifyInstance, getRegistry: () => ProviderRegistry) {
  app.post(
    '/v1/messages',
    async (req: FastifyRequest<{ Body: AnthropicMessagesRequest }>, reply) => {
      const body = req.body;
      if (!body?.model || !Array.isArray(body?.messages)) {
        return reply.code(400).send({ error: 'model and messages are required' });
      }
      const reg = getRegistry();
      const chatReq = anthropicToChatRequest(body);

      if (!chatReq.stream) {
        try {
          const { response, notices, finalModel } = await dispatchWithAutoRoute(reg, chatReq);
          const payload = chatResponseToAnthropic(response) as Record<string, unknown>;
          payload.model = finalModel;
          if (notices.length > 0) payload.fmf_route_notices = notices;
          return reply.send(payload);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.code(502).send({ error: { message: msg, type: 'upstream_error' } });
        }
      }

      const router = reg.getAutoRouter();
      const originalRequested = chatReq.model;
      const preNotices: SwitchNotice[] = [];
      const pre = await router.preflight(chatReq.model);
      if (pre.switched) {
        chatReq.model = pre.model.id;
        preNotices.push(pre.notice);
      }

      const { provider, modelId } = reg.resolveModel(chatReq.model);
      const dispatchReq: ChatRequest = { ...chatReq, model: modelId };

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      });

      const msgId = `msg_${Date.now()}`;
      const write = (event: string, data: unknown) =>
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      write('message_start', {
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          model: `${provider.id}:${modelId}`,
          content: [],
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });
      for (const notice of preNotices) {
        write('fmf_route_notice', notice);
      }
      write('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      try {
        for await (const chunk of provider.stream(dispatchReq)) {
          if (chunk.delta) {
            write('content_block_delta', {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: chunk.delta },
            });
          }
        }
        write('content_block_stop', { type: 'content_block_stop', index: 0 });
        write('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 0 },
        });
        const back = await router.maybeSwitchBack(chatReq.model);
        if (back) write('fmf_route_notice', back);
        write('message_stop', { type: 'message_stop' });
      } catch (err) {
        const parsed = parseRateLimitError(err);
        if (parsed.isRateLimit && router.isEnabled()) {
          router.markRateLimited(chatReq.model, provider.id as ProviderId, parsed);
          router.rememberPreference(originalRequested);
        }
        const msg = err instanceof Error ? err.message : String(err);
        write('error', { type: 'error', error: { type: 'api_error', message: msg } });
      } finally {
        reply.raw.end();
      }
    },
  );
}
