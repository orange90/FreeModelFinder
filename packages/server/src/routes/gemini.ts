import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  chatResponseToGemini,
  geminiToChatRequest,
  parseRateLimitError,
  type ChatRequest,
  type GeminiHttpRequest,
  type ProviderId,
  type ProviderRegistry,
  type SwitchNotice,
} from '@freemodelfinder/core';

type GeminiRouteParams = { modelAction: string };
type GeminiRouteRequest = FastifyRequest<{
  Params: GeminiRouteParams;
  Body: GeminiHttpRequest;
}>;

function parseModelAction(modelAction: string): { model: string; action: string } | null {
  const idx = modelAction.lastIndexOf(':');
  if (idx <= 0 || idx === modelAction.length - 1) return null;
  return {
    model: modelAction.slice(0, idx),
    action: modelAction.slice(idx + 1),
  };
}

async function handleGenerate(
  req: GeminiRouteRequest,
  reply: FastifyReply,
  getRegistry: () => ProviderRegistry,
  model: string,
) {
  const reg = getRegistry();
  const chatReq = geminiToChatRequest(model, req.body, false);
  const router = reg.getAutoRouter();
  const originalRequested = chatReq.model;

  const pre = await router.preflight(chatReq.model);
  const notices: SwitchNotice[] = [];
  if (pre.switched) {
    chatReq.model = pre.model.id;
    notices.push(pre.notice);
  }

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { provider, modelId } = reg.resolveModel(chatReq.model);
    const dispatchReq: ChatRequest = { ...chatReq, model: modelId };
    try {
      const res = await provider.chat(dispatchReq);
      const back = await router.maybeSwitchBack(chatReq.model);
      if (back) notices.push(back);
      const payload = chatResponseToGemini(res) as Record<string, unknown>;
      if (notices.length > 0) payload.fmf_route_notices = notices;
      return reply.send(payload);
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

async function handleStream(
  req: GeminiRouteRequest,
  reply: FastifyReply,
  getRegistry: () => ProviderRegistry,
  model: string,
) {
  const reg = getRegistry();
  const chatReq = geminiToChatRequest(model, req.body, true);
  const router = reg.getAutoRouter();
  const originalRequested = chatReq.model;

  const pre = await router.preflight(chatReq.model);
  const preNotices: SwitchNotice[] = [];
  if (pre.switched) {
    chatReq.model = pre.model.id;
    preNotices.push(pre.notice);
  }

  const { provider, modelId } = reg.resolveModel(chatReq.model);
  const dispatchReq: ChatRequest = { ...chatReq, model: modelId };

  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  for (const n of preNotices) {
    reply.raw.write(`data: ${JSON.stringify({ fmf_route_notice: n })}\n\n`);
  }

  try {
    for await (const chunk of provider.stream(dispatchReq)) {
      const payload = {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: chunk.delta }] },
            index: 0,
            finishReason:
              chunk.finish_reason === 'stop'
                ? 'STOP'
                : chunk.finish_reason === 'length'
                  ? 'MAX_TOKENS'
                  : null,
          },
        ],
      };
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
    const back = await router.maybeSwitchBack(chatReq.model);
    if (back) reply.raw.write(`data: ${JSON.stringify({ fmf_route_notice: back })}\n\n`);
  } catch (err) {
    const parsed = parseRateLimitError(err);
    if (parsed.isRateLimit && router.isEnabled()) {
      router.markRateLimited(chatReq.model, provider.id as ProviderId, parsed);
      router.rememberPreference(originalRequested);
    }
    const msg = err instanceof Error ? err.message : String(err);
    reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    reply.raw.end();
  }
}

export function registerGeminiRoutes(app: FastifyInstance, getRegistry: () => ProviderRegistry) {
  app.post<{ Params: GeminiRouteParams; Body: GeminiHttpRequest }>(
    '/v1beta/models/:modelAction',
    async (req, reply) => {
      const parsed = parseModelAction(req.params.modelAction);
      if (!parsed) {
        return reply.code(404).send({ error: 'unknown gemini action' });
      }
      const { model, action } = parsed;

      if (action === 'generateContent') {
        return handleGenerate(req, reply, getRegistry, model);
      }
      if (action === 'streamGenerateContent') {
        return handleStream(req, reply, getRegistry, model);
      }
      return reply.code(404).send({ error: `unsupported gemini action: ${action}` });
    },
  );
}
