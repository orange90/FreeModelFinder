import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ProviderIdSchema } from '../types.js';
import type { AppConfig, ProviderId, ProviderSettings } from '../types.js';
import { decryptString, encryptString, looksEncrypted } from './crypto.js';

function decryptSecret(payload: string, masterKey: Buffer): string {
  let current = payload;
  // Older releases could persist a ciphertext that had already been encrypted
  // once. Unwrap a small, bounded number of legacy layers so the UI never
  // mistakes ciphertext for a usable credential.
  for (let layer = 0; layer < 3 && looksEncrypted(current); layer += 1) {
    current = decryptString(current, masterKey);
  }
  return current;
}

function canWrite(dir: string): boolean {
  try {
    if (!existsSync(dir)) return false;
    const probe = join(dir, `.write-probe.${process.pid}.${Date.now()}`);
    const fd = openSync(probe, 'w', 0o600);
    closeSync(fd);
    try {
      unlinkSync(probe);
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

function resolveConfigDir(): string {
  const override = process.env.FREEMODELFINDER_HOME;
  if (override && override.trim()) return override.trim();
  const primary = join(homedir(), '.freemodelfinder');
  // Fallback for sandboxed dev environments (e.g. Trae CN sandbox) where
  // ~/.freemodelfinder is not on the write allowlist. ~/Library/Caches is
  // typically permitted on macOS sandbox profiles.
  if (existsSync(primary)) {
    if (canWrite(primary)) return primary;
  } else {
    // Try to create it; if we can't, fall back.
    try {
      mkdirSync(primary, { recursive: true, mode: 0o700 });
      if (canWrite(primary)) return primary;
    } catch {
      /* fall through to fallback */
    }
  }
  const fallback = join(homedir(), 'Library', 'Caches', 'FreeModelFinder');
  return fallback;
}

export const CONFIG_DIR = resolveConfigDir();
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
export const MASTER_KEY_PATH = join(CONFIG_DIR, 'master.key');

const DEFAULT_CONFIG: AppConfig = {
  version: 2,
  port: 11435,
  providers: {
    openrouter: { enabled: false },
    gemini: { enabled: false },
    ollama: { enabled: false },
    zhipu: { enabled: false },
    siliconflow: { enabled: false },
    modelscope: { enabled: false },
    nvidia: { enabled: false },
    github: { enabled: false },
    cohere: { enabled: false },
    huggingface: { enabled: false },
    sensenova: { enabled: false },
    custom: { enabled: false },
  },
  gateway: {
    requireAuth: false,
  },
  autoRoute: {
    enabled: false,
    strategy: 'capability',
  },
};

async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
  try {
    await chmod(path, 0o700);
  } catch {
    // Windows does not provide POSIX mode semantics; its user profile ACL remains authoritative.
  }
}

async function loadMasterKey(): Promise<Buffer> {
  await ensureDir(CONFIG_DIR);
  try {
    const encoded = (await readFile(MASTER_KEY_PATH, 'utf8')).trim();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('master key must contain exactly 32 bytes');
    try {
      await chmod(MASTER_KEY_PATH, 0o600);
    } catch {
      // See ensureDir: Windows uses ACLs rather than POSIX modes.
    }
    return key;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }

  const created = randomBytes(32);
  try {
    await writeFile(MASTER_KEY_PATH, `${created.toString('base64')}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    return created;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const encoded = (await readFile(MASTER_KEY_PATH, 'utf8')).trim();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('master key must contain exactly 32 bytes');
    return key;
  }
}

function mapCustomSourceKeys(
  extra: Record<string, unknown> | undefined,
  transform: (value: string) => string,
): Record<string, unknown> | undefined {
  if (!extra) return extra;
  const sources = extra.sources;
  if (!Array.isArray(sources)) return { ...extra };
  return {
    ...extra,
    sources: sources.map((source) => {
      if (!source || typeof source !== 'object') return source;
      const clone = { ...(source as Record<string, unknown>) };
      if (typeof clone.apiKey === 'string' && clone.apiKey) {
        clone.apiKey = transform(clone.apiKey);
      }
      return clone;
    }),
  };
}

function encryptProviders(config: AppConfig, masterKey: Buffer): AppConfig {
  const providers: AppConfig['providers'] = {};
  for (const [id, settings] of Object.entries(config.providers)) {
    if (!settings) continue;
    const clone: ProviderSettings = { ...settings };
    // This is a runtime-only recovery hint. Drop it when saving so replacing
    // a broken key also clears the stale decryption warning.
    delete clone.credentialError;
    if (clone.credentials) {
      clone.credentials = {
        ...clone.credentials,
        apiKey: clone.credentials.apiKey
          ? encryptString(clone.credentials.apiKey, masterKey)
          : clone.credentials.apiKey,
        extra: mapCustomSourceKeys(clone.credentials.extra, (value) =>
          encryptString(value, masterKey),
        ),
      };
    }
    providers[id as ProviderId] = clone;
  }
  const gateway = config.gateway
    ? {
        ...config.gateway,
        apiKey: config.gateway.apiKey ? encryptString(config.gateway.apiKey, masterKey) : undefined,
      }
    : undefined;
  return { ...config, version: 2, providers, gateway };
}

function decryptProviders(
  config: AppConfig,
  masterKey: Buffer,
): { config: AppConfig; failed: boolean } {
  const providers: AppConfig['providers'] = {};
  let failed = false;
  for (const [id, settings] of Object.entries(config.providers)) {
    if (!settings) continue;
    const clone: ProviderSettings = { ...settings };
    const rawKey = clone.credentials?.apiKey;
    if (rawKey) {
      try {
        clone.credentials = {
          ...clone.credentials!,
          apiKey: decryptSecret(rawKey, masterKey),
        };
      } catch (err) {
        // CRITICAL: never fall back to the raw ciphertext. Doing so would
        // silently ship an encrypted blob to upstream providers, which reject
        // it as an invalid API key and the model watcher would then flag every
        // model behind that provider as "removed". Wipe the key instead and
        // surface a clear signal via `credentialError`.
        const reason = err instanceof Error ? err.message : String(err);
        if (looksEncrypted(rawKey)) {
          failed = true;
          clone.credentials = {
            ...clone.credentials!,
            apiKey: '',
          };
          (clone as ProviderSettings).credentialError =
            `decryption failed: ${reason}. Please re-enter the API key in Settings.`;
          // eslint-disable-next-line no-console
          console.warn(
            `[config] provider ${id} apiKey decryption failed (${reason}); disabling until re-entered`,
          );
        }
        // If it doesn't look encrypted, treat as plaintext (older configs).
      }
    }
    if (clone.credentials?.extra) {
      try {
        clone.credentials = {
          ...clone.credentials,
          extra: mapCustomSourceKeys(clone.credentials.extra, (value) =>
            decryptSecret(value, masterKey),
          ),
        };
      } catch (err) {
        failed = true;
        const reason = err instanceof Error ? err.message : String(err);
        clone.credentialError = `custom source key decryption failed: ${reason}. Please re-enter the API key in Settings.`;
        clone.credentials = {
          ...clone.credentials,
          extra: mapCustomSourceKeys(clone.credentials.extra, () => ''),
        };
      }
    }
    providers[id as ProviderId] = clone;
  }
  let gateway = config.gateway;
  const gwKey = gateway?.apiKey;
  if (gateway && gwKey) {
    try {
      gateway = { ...gateway, apiKey: decryptSecret(gwKey, masterKey) };
    } catch (error) {
      if (looksEncrypted(gwKey)) {
        failed = true;
        gateway = { ...gateway, apiKey: undefined };
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[config] gateway apiKey decryption failed (${reason}); key removed from memory`,
        );
      }
    }
  }
  return { config: { ...config, version: 2, providers, gateway }, failed };
}

function normalizeConfig(input: AppConfig): AppConfig {
  const providers: AppConfig['providers'] = { ...DEFAULT_CONFIG.providers };
  for (const [id, settings] of Object.entries(input.providers ?? {})) {
    const parsed = ProviderIdSchema.safeParse(id);
    if (!parsed.success || !settings) continue;
    providers[parsed.data] = settings;
  }
  return {
    ...DEFAULT_CONFIG,
    ...input,
    version: 2,
    providers,
    gateway: { ...DEFAULT_CONFIG.gateway, ...input.gateway },
    autoRoute: { ...DEFAULT_CONFIG.autoRoute!, ...input.autoRoute },
  };
}

export async function loadConfig(): Promise<AppConfig> {
  await ensureDir(CONFIG_DIR);
  const masterKey = await loadMasterKey();
  if (!existsSync(CONFIG_PATH)) {
    await saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw) as AppConfig;
  const decrypted = decryptProviders(normalizeConfig(parsed), masterKey);
  const persistedApiKeys = [...raw.matchAll(/"apiKey"\s*:\s*"([^"]*)"/g)].map(
    (match) => match[1] ?? '',
  );
  const needsMigration =
    parsed.version !== 2 ||
    persistedApiKeys.some((apiKey) => apiKey.length > 0 && !apiKey.startsWith('v3:'));
  if (needsMigration && !decrypted.failed) {
    await saveConfig(decrypted.config);
  }
  return decrypted.config;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureDir(dirname(CONFIG_PATH));
  const masterKey = await loadMasterKey();
  const encrypted = encryptProviders(config, masterKey);
  const tmpPath = `${CONFIG_PATH}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(encrypted, null, 2);
  try {
    await writeFile(tmpPath, payload, { mode: 0o600 });
    await rename(tmpPath, CONFIG_PATH);
  } catch (err) {
    try {
      await unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export async function updateConfig(mutator: (cfg: AppConfig) => AppConfig): Promise<AppConfig> {
  const current = await loadConfig();
  const next = mutator(current);
  await saveConfig(next);
  return next;
}
