import './proxy.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import {
  ProviderIdSchema,
  ProviderRegistry,
  loadConfig,
  updateConfig,
} from '@freemodelfinder/core';
import { registerOpenAIRoutes } from './routes/openai.js';
import { registerAnthropicRoutes } from './routes/anthropic.js';
import { registerGeminiRoutes } from './routes/gemini.js';
import { ModelWatcher } from './watcher.js';
import { registerOnboardingRoutes } from './onboarding.js';

export interface ServerOptions {
  port?: number;
  registry?: ProviderRegistry;
  watchIntervalMs?: number;
  uiDir?: string;
}

export type DeploymentMode = 'local' | 'server';

export interface ServerRuntimeOptions extends ServerOptions {
  mode?: DeploymentMode;
  adminPort?: number;
  gatewayPort?: number;
  adminOrigin?: string;
  publicUrl?: string;
}

export interface ServerRuntime {
  mode: DeploymentMode;
  adminApp: FastifyInstance;
  gatewayApp?: FastifyInstance;
  registry: ProviderRegistry;
  listen: () => Promise<{ adminUrl: string; gatewayUrl?: string }>;
  close: () => Promise<void>;
}

interface SharedRuntimeState {
  registry: ProviderRegistry;
  watcher?: ModelWatcher;
}

interface AppOptions {
  mode: DeploymentMode;
  surface: 'local' | 'admin' | 'gateway';
  state: SharedRuntimeState;
  watchIntervalMs?: number;
  uiDir?: string;
  adminOrigin?: string;
  adminPort: number;
  gatewayPort: number;
  publicUrl?: string;
  ownsWatcher: boolean;
}

const PROTECTED_PREFIXES = ['/v1/', '/v1beta/'];
export const SERVER_VERSION = '0.1.0-rc.3';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

const LOCAL_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'tauri.localhost']);

function isPublicGatewayRoute(method: string, url: string): boolean {
  if (method === 'GET' && url === '/v1/models') return true;
  if (method !== 'POST') return false;
  if (url === '/v1/chat/completions' || url === '/v1/messages') return true;
  return /^\/v1beta\/models\/.+:(generateContent|streamGenerateContent)$/.test(url);
}

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

function keyMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  return LOOPBACK_HOSTS.has(addr);
}

function hasTrustedOrigin(req: FastifyRequest, adminOrigin?: string): boolean {
  const candidates = [req.headers['origin'], req.headers['referer']];
  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol === 'tauri:') return true;
      if (LOCAL_ORIGIN_HOSTS.has(u.hostname)) return true;
      if (adminOrigin && u.origin === adminOrigin) return true;
    } catch {
      /* ignore malformed origin */
    }
  }
  return false;
}

function isTrustedUiRequest(req: FastifyRequest, adminOrigin?: string): boolean {
  if (!isLoopbackAddress(req.socket?.remoteAddress ?? null)) return false;
  const clientHeader = req.headers['x-fmf-client'];
  if (typeof clientHeader === 'string' && clientHeader.toLowerCase() === 'ui') {
    return hasTrustedOrigin(req, adminOrigin);
  }
  const hasOrigin = !!(req.headers['origin'] || req.headers['referer']);
  if (!hasOrigin) {
    return false;
  }
  return hasTrustedOrigin(req, adminOrigin);
}

function generateApiKey(): string {
  return `fmf-${randomBytes(24).toString('base64url')}`;
}

function normalizeHttpsOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label} must not include a path, query, or fragment`);
  }
  return url.origin;
}

async function enforceServerGatewayAuth(
  registry: ProviderRegistry,
  persist: boolean,
): Promise<void> {
  const current = registry.getConfig();
  if (current.gateway?.apiKey && current.gateway.requireAuth) return;
  if (!persist) {
    registry.updateConfig({
      ...current,
      gateway: {
        ...current.gateway,
        apiKey: current.gateway?.apiKey || generateApiKey(),
        requireAuth: true,
      },
    });
    return;
  }
  const next = await updateConfig((cfg) => ({
    ...cfg,
    gateway: {
      ...cfg.gateway,
      apiKey: cfg.gateway?.apiKey || generateApiKey(),
      requireAuth: true,
    },
  }));
  registry.updateConfig(next);
}

async function createApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.x-api-key',
          'req.headers.x-goog-api-key',
          'req.body.apiKey',
          'req.body.credential.apiKey',
          'req.body.sources[*].apiKey',
        ],
        censor: '[REDACTED]',
      },
    },
  });
  if (opts.surface !== 'gateway') {
    await app.register(cors, {
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        try {
          const url = new URL(origin);
          callback(
            null,
            url.protocol === 'tauri:' ||
              LOCAL_ORIGIN_HOSTS.has(url.hostname) ||
              (!!opts.adminOrigin && url.origin === opts.adminOrigin),
          );
        } catch {
          callback(null, false);
        }
      },
    });
  }

  const getRegistry = () => opts.state.registry;

  if (opts.ownsWatcher) {
    const watcher = new ModelWatcher({
      intervalMs: opts.watchIntervalMs ?? 60 * 60 * 1000,
      getRegistry,
      logger: app.log,
    });
    await watcher.init();
    watcher.start();
    opts.state.watcher = watcher;
    app.addHook('onClose', async () => {
      watcher.stop();
    });
  }

  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0] ?? req.url;
    if (
      opts.surface !== 'gateway' &&
      url.startsWith('/api/') &&
      !isTrustedUiRequest(req, opts.adminOrigin)
    ) {
      return reply.code(403).send({ error: 'management API is available only to the local UI' });
    }
    if (opts.surface === 'gateway' && !isPublicGatewayRoute(req.method, url)) return;
    if (!PROTECTED_PREFIXES.some((p) => url.startsWith(p))) return;
    const gateway = getRegistry().getConfig().gateway;
    if (opts.surface !== 'gateway' && (!gateway?.requireAuth || !gateway.apiKey)) return;
    if (opts.surface !== 'gateway' && isTrustedUiRequest(req, opts.adminOrigin)) return;
    const provided = extractBearer(req);
    if (keyMatches(provided, gateway?.apiKey)) return;
    reply.code(401).send({
      error: {
        message: 'Missing or invalid API key. Include `Authorization: Bearer <key>`.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    });
  });

  app.get('/healthz', async () => ({
    ok: true,
    service: 'freemodelfinder',
    version: SERVER_VERSION,
    ts: Date.now(),
  }));

  if (opts.surface !== 'gateway') {
    app.get('/api/config', async () => {
      const cfg = getRegistry().getConfig();
      const custom = cfg.providers.custom;
      const customExtra = (custom?.credentials?.extra ?? {}) as {
        sources?: Array<{
          id: string;
          label?: string;
          baseUrl: string;
          hasKey?: boolean;
          models?: Array<{ id: string; displayName?: string; contextWindow?: number }>;
        }>;
        models?: Array<{ id: string; displayName?: string; contextWindow?: number }>;
      };
      const rawSources = Array.isArray(customExtra.sources) ? customExtra.sources : null;
      const legacyBaseUrl = custom?.credentials?.baseUrl ?? '';
      const legacyModels = Array.isArray(customExtra.models) ? customExtra.models : [];
      const legacyHasKey = !!custom?.credentials?.apiKey;
      const sources = rawSources
        ? rawSources.map((s) => ({
            id: String(s.id ?? ''),
            label: s.label ?? '',
            baseUrl: String(s.baseUrl ?? ''),
            hasKey: !!(s as { apiKey?: string }).apiKey,
            models: Array.isArray(s.models) ? s.models : [],
          }))
        : legacyBaseUrl
          ? [
              {
                id: 'default',
                label: 'Custom',
                baseUrl: legacyBaseUrl,
                hasKey: legacyHasKey,
                models: legacyModels,
              },
            ]
          : [];
      return {
        version: cfg.version,
        port: cfg.port,
        defaultModel: cfg.defaultModel,
        onboarding: cfg.onboarding,
        providers: Object.fromEntries(
          Object.entries(cfg.providers).map(([id, s]) => [
            id,
            {
              enabled: s?.enabled ?? false,
              hasKey: !!s?.credentials?.apiKey,
              credentialError: s?.credentialError,
            },
          ]),
        ),
        custom: {
          enabled: !!custom?.enabled,
          hasKey: legacyHasKey,
          baseUrl: legacyBaseUrl,
          models: legacyModels,
          sources,
        },
      };
    });

    registerOnboardingRoutes(app, {
      getRegistry,
      updateRegistry: (config) => getRegistry().updateConfig(config),
      refreshSnapshot: () => opts.state.watcher?.tick(true) ?? Promise.resolve(null),
    });

    app.post<{
      Body: {
        provider: string;
        apiKey?: string;
        enabled?: boolean;
        baseUrl?: string;
        clearCredentials?: boolean;
        models?: Array<{ id: string; displayName?: string; contextWindow?: number }>;
        sources?: Array<{
          id: string;
          label?: string;
          baseUrl: string;
          apiKey?: string;
          models?: Array<{ id: string; displayName?: string; contextWindow?: number }>;
        }>;
      };
    }>('/api/providers', async (req, reply) => {
      const { provider, apiKey, enabled, baseUrl, clearCredentials, models, sources } =
        req.body ?? {};
      if (!provider) return reply.code(400).send({ error: 'provider required' });
      const parsedProvider = ProviderIdSchema.safeParse(provider);
      if (!parsedProvider.success || parsedProvider.data === 'ollama') {
        return reply.code(400).send({ error: `unsupported provider: ${provider}` });
      }
      const providerId = parsedProvider.data;
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
      const cleanSources = Array.isArray(sources)
        ? sources
            .map((s) => {
              const id = typeof s?.id === 'string' ? s.id.trim() : '';
              const bu = typeof s?.baseUrl === 'string' ? s.baseUrl.trim() : '';
              if (!id || !bu) return null;
              const key = typeof s?.apiKey === 'string' ? s.apiKey.trim() : '';
              const label =
                typeof s?.label === 'string' && s.label.trim() ? s.label.trim() : undefined;
              const modelsList = Array.isArray(s?.models)
                ? s!
                    .models!.map((m) => ({
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
                : [];
              return {
                id,
                label,
                baseUrl: bu.replace(/\/$/, ''),
                apiKey: key || undefined,
                models: modelsList,
              };
            })
            .filter((s): s is NonNullable<typeof s> => !!s)
        : undefined;
      try {
        const next = await updateConfig((cfg) => {
          const cur = (cfg.providers[providerId] ?? { enabled: false }) as {
            enabled: boolean;
            credentials?: {
              apiKey: string;
              baseUrl?: string;
              extra?: Record<string, unknown>;
            };
          };
          const shouldClear = clearCredentials === true || cleanApiKey === '';
          const prevExtra = cur.credentials?.extra ?? {};

          if (providerId === 'custom') {
            if (clearCredentials === true) {
              cfg.providers[providerId] = {
                ...cur,
                enabled: enabled ?? false,
                credentials: undefined,
              };
              return cfg;
            }
            const nextExtra: Record<string, unknown> = { ...prevExtra };
            if (cleanSources !== undefined) {
              nextExtra.sources = cleanSources;
              delete (nextExtra as { models?: unknown }).models;
            } else if (cleanModels !== undefined) {
              nextExtra.models = cleanModels;
            }
            const topKey = cleanApiKey ?? cur.credentials?.apiKey ?? '';
            const topBaseUrl = cleanBaseUrl !== undefined ? cleanBaseUrl : cur.credentials?.baseUrl;
            cfg.providers[providerId] = {
              ...cur,
              enabled: enabled ?? cur.enabled,
              credentials: {
                apiKey: topKey,
                baseUrl: topBaseUrl,
                extra: nextExtra,
              },
            };
            return cfg;
          }

          const nextExtra = {
            ...prevExtra,
            ...(cleanModels !== undefined ? { models: cleanModels } : {}),
          };
          cfg.providers[providerId] = {
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
                      baseUrl: cleanBaseUrl !== undefined ? cleanBaseUrl : cur.credentials.baseUrl,
                      extra: nextExtra,
                    }
                  : undefined,
          };
          return cfg;
        });
        opts.state.registry = new ProviderRegistry(next);
        void opts.state.watcher?.tick(true);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        const hint =
          code === 'EPERM' || code === 'EACCES'
            ? '（配置目录写入被拒绝，请检查 ~/.freemodelfinder 权限或设置 FREEMODELFINDER_HOME 到有写权限的目录）'
            : '';
        req.log.error({ err, provider: providerId }, 'failed to save provider config');
        return reply.code(500).send({ error: `${message}${hint}`, code });
      }
    });

    app.post<{ Body: { model: string } }>('/api/default-model', async (req, reply) => {
      const { model } = req.body ?? {};
      if (!model) return reply.code(400).send({ error: 'model required' });
      const next = await updateConfig((cfg) => ({ ...cfg, defaultModel: model }));
      getRegistry().updateConfig(next);
      return { ok: true, defaultModel: model };
    });

    app.get('/api/auto-route', async () => {
      const cfg = getRegistry().getConfig();
      const ar = cfg.autoRoute ?? { enabled: false, strategy: 'capability' as const };
      const router = getRegistry().getAutoRouter();
      return {
        enabled: !!ar.enabled,
        strategy: ar.strategy,
        profiles: ar.profiles ?? [],
        fallbackChain: ar.fallbackChain ?? [],
        cooldowns: router.listCooldowns(),
        rememberedPreference: router.getRememberedPreference(),
        recentNotices: getRegistry().peekNotices(),
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
      getRegistry().updateConfig(next);
      return { ok: true, autoRoute: next.autoRoute };
    });

    app.post<{ Body: { model?: string } }>('/api/auto-route/clear-cooldown', async (req) => {
      const router = getRegistry().getAutoRouter();
      if (req.body?.model) {
        router.clearCooldown(req.body.model);
      } else {
        for (const c of router.listCooldowns()) router.clearCooldown(c.model);
        router.resetPreference();
      }
      return { ok: true, cooldowns: router.listCooldowns() };
    });

    app.get('/api/gateway', async () => {
      const cfg = getRegistry().getConfig();
      const gw = cfg.gateway ?? {};
      return {
        hasKey: !!gw.apiKey,
        apiKey: gw.apiKey ?? null,
        requireAuth: !!gw.requireAuth,
        port: opts.mode === 'server' ? opts.gatewayPort : cfg.port,
        mode: opts.mode,
        adminPort: opts.adminPort,
        gatewayPort: opts.gatewayPort,
        publicBaseUrl: opts.publicUrl ?? null,
        authLocked: opts.mode === 'server',
      };
    });

    app.post<{ Body: { action?: 'generate' | 'revoke' | 'update'; requireAuth?: boolean } }>(
      '/api/gateway',
      async (req, reply) => {
        const { action, requireAuth } = req.body ?? {};
        if (opts.mode === 'server' && (action === 'revoke' || requireAuth === false)) {
          return reply.code(409).send({
            error: 'gateway authentication is mandatory in server mode; rotate the key instead',
          });
        }
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
              opts.mode === 'server'
                ? true
                : typeof requireAuth === 'boolean'
                  ? requireAuth
                  : action === 'revoke'
                    ? false
                    : action === 'generate'
                      ? (cur.requireAuth ?? true)
                      : cur.requireAuth,
          };
          return cfg;
        });
        getRegistry().updateConfig(next);
        const gw = next.gateway ?? {};
        return {
          ok: true,
          hasKey: !!gw.apiKey,
          apiKey: gw.apiKey ?? null,
          requireAuth: !!gw.requireAuth,
          mode: opts.mode,
          adminPort: opts.adminPort,
          gatewayPort: opts.gatewayPort,
          publicBaseUrl: opts.publicUrl ?? null,
          authLocked: opts.mode === 'server',
        };
      },
    );
  }

  registerOpenAIRoutes(app, getRegistry, { includeManagement: opts.surface !== 'gateway' });
  registerAnthropicRoutes(app, getRegistry);
  registerGeminiRoutes(app, getRegistry);

  if (opts.surface !== 'gateway') {
    app.get<{ Querystring: { since?: string; limit?: string } }>(
      '/v1/models/changes',
      async (req) => {
        const watcher = opts.state.watcher!;
        const snapshot = watcher.getSnapshot();
        const status = watcher.getStatus();
        const sinceRaw = req.query?.since;
        const limitRaw = req.query?.limit;
        const since = sinceRaw ? Number(sinceRaw) : 0;
        const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : 50;
        const added = (snapshot?.added ?? []).filter((c) => c.detectedAt > since).slice(0, limit);
        const removed = (snapshot?.removed ?? [])
          .filter((c) => c.detectedAt > since)
          .slice(0, limit);
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
      const watcher = opts.state.watcher!;
      const snapshot = await watcher.tick(true);
      const status = watcher.getStatus();
      return {
        ok: !status.lastError,
        error: status.lastError,
        updatedAt: snapshot?.updatedAt ?? 0,
        total: snapshot?.models.length ?? 0,
      };
    });
  }

  if (opts.uiDir) {
    const uiRoot = resolve(opts.uiDir);
    await app.register(fastifyStatic, {
      root: uiRoot,
      prefix: '/',
      index: false,
    });
    app.get('/', async (_req, reply) => reply.sendFile('index.html'));
    app.get('/settings', async (_req, reply) => reply.sendFile('settings.html'));
  }

  return app;
}

export async function createServer(opts: ServerOptions = {}): Promise<{
  app: FastifyInstance;
  registry: ProviderRegistry;
  listen: (port?: number) => Promise<string>;
}> {
  const state: SharedRuntimeState = {
    registry: opts.registry ?? new ProviderRegistry(await loadConfig()),
  };
  const defaultPort = opts.port ?? state.registry.getConfig().port ?? 11435;
  const app = await createApp({
    mode: 'local',
    surface: 'local',
    state,
    watchIntervalMs: opts.watchIntervalMs,
    uiDir: opts.uiDir,
    adminPort: defaultPort,
    gatewayPort: defaultPort,
    ownsWatcher: true,
  });
  return {
    app,
    get registry() {
      return state.registry;
    },
    listen: async (port?: number) => app.listen({ port: port ?? defaultPort, host: '127.0.0.1' }),
  };
}

export async function createServerRuntime(opts: ServerRuntimeOptions = {}): Promise<ServerRuntime> {
  const mode = opts.mode ?? 'local';
  if (mode === 'local') {
    const local = await createServer(opts);
    return {
      mode,
      adminApp: local.app,
      get registry() {
        return local.registry;
      },
      listen: async () => ({ adminUrl: await local.listen(opts.port) }),
      close: async () => local.app.close(),
    };
  }

  const adminPort = opts.adminPort ?? 11435;
  const gatewayPort = opts.gatewayPort ?? 11436;
  if (adminPort === gatewayPort) throw new Error('admin port and gateway port must be different');
  if (!opts.adminOrigin) throw new Error('admin origin is required in server mode');
  if (!opts.publicUrl) throw new Error('public URL is required in server mode');
  const adminOrigin = normalizeHttpsOrigin(opts.adminOrigin, 'admin origin');
  const publicUrl = normalizeHttpsOrigin(opts.publicUrl, 'public URL');
  const registry = opts.registry ?? new ProviderRegistry(await loadConfig());
  await enforceServerGatewayAuth(registry, !opts.registry);
  const state: SharedRuntimeState = { registry };
  const adminApp = await createApp({
    mode,
    surface: 'admin',
    state,
    watchIntervalMs: opts.watchIntervalMs,
    uiDir: opts.uiDir,
    adminOrigin,
    adminPort,
    gatewayPort,
    publicUrl,
    ownsWatcher: true,
  });
  let gatewayApp: FastifyInstance;
  try {
    gatewayApp = await createApp({
      mode,
      surface: 'gateway',
      state,
      adminPort,
      gatewayPort,
      publicUrl,
      ownsWatcher: false,
    });
  } catch (error) {
    await adminApp.close();
    throw error;
  }

  return {
    mode,
    adminApp,
    gatewayApp,
    get registry() {
      return state.registry;
    },
    listen: async () => {
      let adminUrl: string;
      try {
        adminUrl = await adminApp.listen({ port: adminPort, host: '127.0.0.1' });
        const gatewayUrl = await gatewayApp.listen({ port: gatewayPort, host: '127.0.0.1' });
        return { adminUrl, gatewayUrl };
      } catch (error) {
        await Promise.allSettled([gatewayApp.close(), adminApp.close()]);
        throw error;
      }
    },
    close: async () => {
      await Promise.allSettled([gatewayApp.close(), adminApp.close()]);
    },
  };
}
