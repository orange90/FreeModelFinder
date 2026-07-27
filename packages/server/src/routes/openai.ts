import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  chatResponseToOpenAI,
  openAIToChatRequest,
  parseRateLimitError,
  scoreModel,
  streamChunkToOpenAI,
  type ChatRequest,
  type ChatResponse,
  type OpenAIChatCompletionRequest,
  type ProviderId,
  type ProviderRegistry,
  type SwitchNotice,
} from '@freemodelfinder/core';

function extractProviderIdFromError(chatReq: ChatRequest, reg: ProviderRegistry): string {
  try {
    const { provider } = reg.resolveModel(chatReq.model);
    return provider.id;
  } catch {
    return 'unknown';
  }
}

async function dispatchWithAutoRoute(
  reg: ProviderRegistry,
  chatReq: ChatRequest,
): Promise<{
  finalModel: string;
  finalProviderId: string;
  response: ChatResponse;
  notices: SwitchNotice[];
}> {
  const router = reg.getAutoRouter();
  const notices: SwitchNotice[] = [];
  const originalRequested = chatReq.model;

  // 1. Pre-flight: honor existing cooldowns before we even try upstream.
  const pre = await router.preflight(chatReq.model);
  if (pre.switched) {
    chatReq.model = pre.model.id;
    notices.push(pre.notice);
  }

  // 2. Resolve provider & dispatch. On rate-limit failure, fall back exactly
  //    ONCE (we intentionally do not interrupt a live stream elsewhere).
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resolved = reg.resolveModel(chatReq.model);
    const provider = resolved.provider;
    const realModelId = resolved.modelId;
    const dispatchReq: ChatRequest = { ...chatReq, model: realModelId };

    try {
      const res = await provider.chat(dispatchReq);
      const switchBack = await router.maybeSwitchBack(chatReq.model);
      if (switchBack) notices.push(switchBack);
      return {
        finalModel: `${provider.id}:${realModelId}`,
        finalProviderId: provider.id,
        response: res,
        notices,
      };
    } catch (err) {
      const parsed = parseRateLimitError(err);
      if (parsed.isRateLimit && router.isEnabled() && attempt === 0) {
        router.markRateLimited(chatReq.model, provider.id, parsed);
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

export function registerOpenAIRoutes(app: FastifyInstance, getRegistry: () => ProviderRegistry) {
  app.get('/v1/models', async (_req, reply) => {
    const reg = getRegistry();
    const { models, succeededProviders, failedProviders } = await reg.listAllModels();
    const router = reg.getAutoRouter();
    return reply.send({
      object: 'list',
      data: models.map((m) => ({
        id: m.id,
        object: 'model',
        owned_by: m.provider,
        created: Math.floor(Date.now() / 1000),
        display_name: m.displayName,
        context_window: m.contextWindow,
        provider: m.provider,
        free: m.free,
        description: m.description,
        capability_score: scoreModel(m, 'capability', router.getProfile(m.id)),
        quota: reg.getModelQuota(m.provider, m.id),
      })),
      fmf: {
        enabled_providers: reg.listEnabledProviders(),
        succeeded_providers: succeededProviders,
        failed_providers: failedProviders,
      },
    });
  });

  app.get('/api/model-quotas', async () => {
    const reg = getRegistry();
    const { models } = await reg.listAllModels();
    return { data: reg.listModelQuotas(models) };
  });

  app.post(
    '/api/model-quotas/probe',
    async (req: FastifyRequest<{ Body: { model?: string } }>, reply: FastifyReply) => {
      const model = req.body?.model?.trim();
      if (!model) return reply.code(400).send({ error: 'model required' });
      try {
        const reg = getRegistry();
        const quota = await reg.probeModel(model);
        const { models } = await reg.listAllModels();
        const affected = models.filter((item) => item.provider === quota.provider);
        return reply.send({ quota, data: reg.listModelQuotas(affected) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.post(
    '/v1/chat/completions',
    async (req: FastifyRequest<{ Body: OpenAIChatCompletionRequest }>, reply: FastifyReply) => {
      const body = req.body;
      if (!body?.model || !Array.isArray(body?.messages)) {
        return reply.code(400).send({ error: 'model and messages are required' });
      }
      const reg = getRegistry();
      const chatReq = openAIToChatRequest(body);

      if (!chatReq.stream) {
        try {
          const { response, notices, finalModel } = await dispatchWithAutoRoute(reg, chatReq);
          const payload = chatResponseToOpenAI(response) as Record<string, unknown> & {
            model?: string;
          };
          payload.model = finalModel;
          if (notices.length > 0) {
            (payload as Record<string, unknown>).fmf_route_notices = notices;
          }
          return reply.send(payload);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const match = msg.match(/failed\s+(\d{3})/i);
          const upstream = match ? Number(match[1]) : undefined;
          return reply
            .code(upstream && upstream >= 400 && upstream < 600 ? upstream : 502)
            .send({ error: { message: msg, type: 'upstream_error', upstream } });
        }
      }

      // Streaming path: never interrupt an active stream. Only preflight
      // and switch-back notices are surfaced; a mid-stream 429 is passed
      // through as an error (per user requirement: only switch on the NEXT
      // request after a limit-triggered interruption).
      const origin = req.headers.origin;
      const corsHeaders: Record<string, string> = origin
        ? {
            'access-control-allow-origin': origin,
            'access-control-allow-credentials': 'true',
            vary: 'Origin',
          }
        : { 'access-control-allow-origin': '*' };

      const router = reg.getAutoRouter();
      const originalRequested = chatReq.model;
      const preNotices: SwitchNotice[] = [];
      const pre = await router.preflight(chatReq.model);
      if (pre.switched) {
        chatReq.model = pre.model.id;
        preNotices.push(pre.notice);
      }

      let provider;
      let realModelId: string;
      try {
        const resolved = reg.resolveModel(chatReq.model);
        provider = resolved.provider;
        realModelId = resolved.modelId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(400).send({ error: { message: msg, type: 'resolve_error' } });
      }
      const dispatchReq: ChatRequest = { ...chatReq, model: realModelId };

      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        ...corsHeaders,
      });

      for (const notice of preNotices) {
        reply.raw.write(
          `data: ${JSON.stringify({ fmf_route_notice: notice, id: 'fmf', object: 'chat.completion.chunk', choices: [] })}\n\n`,
        );
      }

      try {
        for await (const chunk of provider.stream(dispatchReq)) {
          const payload = streamChunkToOpenAI(chunk);
          reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
        // Post-stream: if we were on a fallback and preferred is free again,
        // emit a switch-back notice (applied on the NEXT request).
        const switchBack = await router.maybeSwitchBack(chatReq.model);
        if (switchBack) {
          reply.raw.write(
            `data: ${JSON.stringify({ fmf_route_notice: switchBack, id: 'fmf', object: 'chat.completion.chunk', choices: [] })}\n\n`,
          );
        }
        reply.raw.write('data: [DONE]\n\n');
      } catch (err) {
        const parsed = parseRateLimitError(err);
        if (parsed.isRateLimit && router.isEnabled()) {
          router.markRateLimited(
            chatReq.model,
            extractProviderIdFromError(chatReq, reg) as ProviderId,
            parsed,
          );
          router.rememberPreference(originalRequested);
        }
        const msg = err instanceof Error ? err.message : String(err);
        reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      } finally {
        reply.raw.end();
      }
    },
  );
}
