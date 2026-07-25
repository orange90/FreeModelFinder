import './proxy.js';
import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { ProviderRegistry, loadConfig, updateConfig } from '@freemodelfinder/core';
import { registerOpenAIRoutes } from './routes/openai.js';
import { registerAnthropicRoutes } from './routes/anthropic.js';
import { registerGeminiRoutes } from './routes/gemini.js';
import { ModelWatcher } from './watcher.js';

export interface ServerOptions {
  host?: string;
  port?: number;
  registry?: ProviderRegistry;
  watchIntervalMs?: number;
}

const PROTECTED_PREFIXES = ['/v1/', '/anthropic/', '/gemini/'];

const LOOPBACK_HOSTS = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
]);

const LOCAL_ORIGIN_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'tauri.localhost',
]);

function extractBearer(req: FastifyRequest): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const xKey = req.headers['x-api-key'];
  if (typeof xKey === 'string' && xKey.trim()) return xKey.trim();
  const googKey = req.headers['x-goog-api-key'];
  if (typeof googKey === 'string' && googKey.trim()) return googKey.trim();
  return null;
}

function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  return LOOPBACK_HOSTS.has(addr);
}

function hasLocalOrigin(req: FastifyRequest): boolean {
  const candidates = [req.headers['origin'], req.headers['referer']];
  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol === 'tauri:' || u.protocol === 'file:') return true;
      if (LOCAL_ORIGIN_HOSTS.has(u.hostname)) return true;
    } catch {
      /* ignore malformed origin */
    }
  }
  return false;
}

function isTrustedLocalUiRequest(req: FastifyRequest): boolean {
  if (!isLoopbackAddress(req.socket?.remoteAddress ?? null)) return false;
  const clientHeader = req.headers['x-fmf-client'];
  if (typeof clientHeader === 'string' && clientHeader.toLowerCase() === 'ui') {
    return true;
  }
  const hasOrigin = !!(req.headers['origin'] || req.headers['referer']);
  if (!hasOrigin) {
    return false;
  }
  return hasLocalOrigin(req);
}

function generateApiKey(): string {
  return `fmf-${randomBytes(24).toString('base64url')}`;
}

export async function createServer(opts: ServerOptions = {}): Promise<{
  app: FastifyInstance;
  registry: ProviderRegistry;
  listen: (port?: number, host?: string) => Promise<string>;
}> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(cors, { origin: true });

  let registry =
    opts.registry ??
    new ProviderRegistry(await loadConfig());

  const getRegistry = () => registry;

  const watcher = new ModelWatcher({
    intervalMs: opts.watchIntervalMs ?? 60 * 60 * 1000,
    getRegistry,
    logger: app.log,
  });
  await watcher.init();
  watcher.start();
  app.addHook('onClose', async () => {
    watcher.stop();
  });

  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0] ?? req.url;
    if (!PROTECTED_PREFIXES.some((p) => url.startsWith(p))) return;
    const gateway = registry.getConfig().gateway;
    if (!gateway?.requireAuth || !gateway.apiKey) return;
    if (isTrustedLocalUiRequest(req)) return;
    const provided = extractBearer(req);
    if (provided && provided === gateway.apiKey) return;
    reply.code(401).send({
      error: {
        message: 'Missing or invalid API key. Include `Authorization: Bearer <key>`.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    });
  });

  app.get('/healthz', async () => ({ ok: true, ts: Date.now() }));

  app.get('/api/config', async () => {
    const cfg = registry.getConfig();
    const custom = cfg.providers.custom;
    const customExtra = (custom?.credentials?.extra ?? {}) as {
      models?: Array<{ id: string; displayName?: string; contextWindow?: number }>;
    };
    return {
      version: cfg.version,
      port: cfg.port,
      defaultModel: cfg.defaultModel,
      providers: Object.fromEntries(
        Object.entries(cfg.providers).map(([id, s]) => [
          id,
          { enabled: s?.enabled ?? false, hasKey: !!s?.credentials?.apiKey },
        ]),
      ),
      custom: {
        enabled: !!custom?.enabled,
        hasKey: !!custom?.credentials?.apiKey,
        baseUrl: custom?.credentials?.baseUrl ?? '',
        models: Array.isArray(customExtra.models) ? customExtra.models : [],
      },
    };
  });

  app.post<{
    Body: {
      provider: string;
      apiKey?: string;
      enabled?: boolean;
      baseUrl?: string;
      clearCredentials?: boolean;
      models?: Array<{ id: string; displayName?: string; contextWindow?: number }>;
    };
  }>(
    '/api/providers',
    async (req, reply) => {
      const { provider, apiKey, enabled, baseUrl, clearCredentials, models } = req.body ?? {};
      if (!provider) return reply.code(400).send({ error: 'provider required' });
      const cleanApiKey = typeof apiKey === 'string' ? apiKey.trim() : apiKey;
      const cleanBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : baseUrl;
      const cleanModels = Array.isArray(models)
        ? models
            .map((m) => ({
              id: typeof m?.id === 'string' ? m.id.trim() : '',
              displayName:
                typeof m?.displayName === 'string' && m.displayName.trim()
                  ? m.displayName.trim()
                  : undefined,
              contextWindow:
                typeof m?.contextWindow === 'number' && m.contextWindow > 0
                  ? m.contextWindow
                  : undefined,
            }))
            .filter((m) => m.id)
        : undefined;
      try {
        const next = await updateConfig((cfg) => {
          const cur = (cfg.providers[provider as never] ?? { enabled: false }) as {
            enabled: boolean;
            credentials?: {
              apiKey: string;
              baseUrl?: string;
              extra?: Record<string, unknown>;
            };
          };
          const shouldClear = clearCredentials === true || cleanApiKey === '';
          const prevExtra = cur.credentials?.extra ?? {};
          const nextExtra =
            cleanModels !== undefined ? { ...prevExtra, models: cleanModels } : prevExtra;
          cfg.providers[provider as never] = {
            ...cur,
            enabled: enabled ?? cur.enabled,
            credentials: shouldClear
              ? undefined
              : cleanApiKey
                ? {
                    apiKey: cleanApiKey,
                    baseUrl: cleanBaseUrl ?? cur.credentials?.baseUrl,
                    extra: nextExtra,
                  }
                : cur.credentials
                  ? {
                      ...cur.credentials,
                      baseUrl:
                        cleanBaseUrl !== undefined ? cleanBaseUrl : cur.credentials.baseUrl,
                      extra: nextExtra,
                    }
                  : undefined,
          } as never;
          return cfg;
        });
        registry = new ProviderRegistry(next);
        void watcher.tick(true);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        const hint =
          code === 'EPERM' || code === 'EACCES'
            ? '（配置目录写入被拒绝，请检查 ~/.freemodelfinder 权限或设置 FREEMODELFINDER_HOME 到有写权限的目录）'
            : '';
        req.log.error({ err, provider }, 'failed to save provider config');
        return reply.code(500).send({ error: `${message}${hint}`, code });
      }
    },
  );

  app.post<{ Body: { model: string } }>('/api/default-model', async (req, reply) => {
    const { model } = req.body ?? {};
    if (!model) return reply.code(400).send({ error: 'model required' });
    const next = await updateConfig((cfg) => ({ ...cfg, defaultModel: model }));
    registry.updateConfig(next);
    return { ok: true, defaultModel: model };
  });

  app.get('/api/auto-route', async () => {
    const cfg = registry.getConfig();
    const ar = cfg.autoRoute ?? { enabled: false, strategy: 'capability' as const };
    const router = registry.getAutoRouter();
    return {
      enabled: !!ar.enabled,
      strategy: ar.strategy,
      profiles: ar.profiles ?? [],
      fallbackChain: ar.fallbackChain ?? [],
      cooldowns: router.listCooldowns(),
      rememberedPreference: router.getRememberedPreference(),
      recentNotices: registry.peekNotices(),
    };
  });

  app.post<{
    Body: {
      enabled?: boolean;
      strategy?: 'capability' | 'speed' | 'rate-limit';
      fallbackChain?: string[];
      profiles?: unknown;
    };
  }>('/api/auto-route', async (req, reply) => {
    const { enabled, strategy, fallbackChain, profiles } = req.body ?? {};
    if (strategy && !['capability', 'speed', 'rate-limit'].includes(strategy)) {
      return reply.code(400).send({ error: 'invalid strategy' });
    }
    const next = await updateConfig((cfg) => {
      const cur = cfg.autoRoute ?? { enabled: false, strategy: 'capability' as const };
      cfg.autoRoute = {
        enabled: typeof enabled === 'boolean' ? enabled : cur.enabled,
        strategy: strategy ?? cur.strategy,
        fallbackChain: Array.isArray(fallbackChain) ? fallbackChain : cur.fallbackChain,
        profiles: Array.isArray(profiles) ? (profiles as never) : cur.profiles,
      };
      return cfg;
    });
    registry.updateConfig(next);
    return { ok: true, autoRoute: next.autoRoute };
  });

  app.post<{ Body: { model?: string } }>('/api/auto-route/clear-cooldown', async (req) => {
    const router = registry.getAutoRouter();
    if (req.body?.model) {
      router.clearCooldown(req.body.model);
    } else {
      for (const c of router.listCooldowns()) router.clearCooldown(c.model);
      router.resetPreference();
    }
    return { ok: true, cooldowns: router.listCooldowns() };
  });

  app.get('/api/gateway', async () => {
    const cfg = registry.getConfig();
    const gw = cfg.gateway ?? {};
    return {
      hasKey: !!gw.apiKey,
      apiKey: gw.apiKey ?? null,
      requireAuth: !!gw.requireAuth,
      port: cfg.port,
    };
  });

  app.post<{ Body: { action?: 'generate' | 'revoke' | 'update'; requireAuth?: boolean } }>(
    '/api/gateway',
    async (req) => {
      const { action, requireAuth } = req.body ?? {};
      const next = await updateConfig((cfg) => {
        const cur = cfg.gateway ?? {};
        let apiKey = cur.apiKey;
        if (action === 'generate') {
          apiKey = generateApiKey();
        } else if (action === 'revoke') {
          apiKey = undefined;
        }
        cfg.gateway = {
          ...cur,
          apiKey,
          requireAuth:
            typeof requireAuth === 'boolean'
              ? requireAuth
              : action === 'revoke'
                ? false
                : action === 'generate'
                  ? cur.requireAuth ?? true
                  : cur.requireAuth,
        };
        return cfg;
      });
      registry.updateConfig(next);
      const gw = next.gateway ?? {};
      return {
        ok: true,
        hasKey: !!gw.apiKey,
        apiKey: gw.apiKey ?? null,
        requireAuth: !!gw.requireAuth,
      };
    },
  );

  registerOpenAIRoutes(app, getRegistry);
  registerAnthropicRoutes(app, getRegistry);
  registerGeminiRoutes(app, getRegistry);

  app.get<{ Querystring: { since?: string; limit?: string } }>(
    '/v1/models/changes',
    async (req) => {
      const snapshot = watcher.getSnapshot();
      const status = watcher.getStatus();
      const sinceRaw = req.query?.since;
      const limitRaw = req.query?.limit;
      const since = sinceRaw ? Number(sinceRaw) : 0;
      const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : 50;
      const added = (snapshot?.added ?? []).filter((c) => c.detectedAt > since).slice(0, limit);
      const removed = (snapshot?.removed ?? []).filter((c) => c.detectedAt > since).slice(0, limit);
      return {
        updatedAt: snapshot?.updatedAt ?? 0,
        total: snapshot?.models.length ?? 0,
        watcher: {
          intervalMs: status.intervalMs,
          lastRunAt: status.lastRunAt,
          lastError: status.lastError,
          running: status.running,
        },
        added,
        removed,
      };
    },
  );

  app.post('/v1/models/refresh', async () => {
    const snapshot = await watcher.tick(true);
    const status = watcher.getStatus();
    return {
      ok: !status.lastError,
      error: status.lastError,
      updatedAt: snapshot?.updatedAt ?? 0,
      total: snapshot?.models.length ?? 0,
    };
  });

  return {
    app,
    get registry() {
      return registry;
    },
    listen: async (port?: number, host?: string) => {
      const p = port ?? opts.port ?? registry.getConfig().port ?? 11435;
      const h = host ?? opts.host ?? '127.0.0.1';
      return app.listen({ port: p, host: h });
    },
  };
}
