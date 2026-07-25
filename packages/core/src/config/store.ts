import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AppConfig, ProviderId, ProviderSettings } from '../types.js';
import { decryptString, encryptString, looksEncrypted } from './crypto.js';

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

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  port: 11435,
  providers: {
    openrouter: { enabled: false },
    gemini: { enabled: false },
    ollama: { enabled: false },
    zhipu: { enabled: false },
    siliconflow: { enabled: false },
    deepseek: { enabled: false },
    modelscope: { enabled: false },
    dashscope: { enabled: false },
    cerebras: { enabled: false },
    nvidia: { enabled: false },
    mistral: { enabled: false },
    cloudflare: { enabled: false },
    github: { enabled: false },
    custom: { enabled: false },
  },
};

async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
}

function encryptProviders(config: AppConfig): AppConfig {
  const providers: AppConfig['providers'] = {};
  for (const [id, settings] of Object.entries(config.providers)) {
    if (!settings) continue;
    const clone: ProviderSettings = { ...settings };
    if (clone.credentials?.apiKey) {
      clone.credentials = {
        ...clone.credentials,
        apiKey: encryptString(clone.credentials.apiKey),
      };
    }
    providers[id as ProviderId] = clone;
  }
  const gateway = config.gateway
    ? {
        ...config.gateway,
        apiKey: config.gateway.apiKey ? encryptString(config.gateway.apiKey) : undefined,
      }
    : undefined;
  return { ...config, providers, gateway };
}

function decryptProviders(config: AppConfig): AppConfig {
  const providers: AppConfig['providers'] = {};
  for (const [id, settings] of Object.entries(config.providers)) {
    if (!settings) continue;
    const clone: ProviderSettings = { ...settings };
    const rawKey = clone.credentials?.apiKey;
    if (rawKey) {
      try {
        clone.credentials = {
          ...clone.credentials!,
          apiKey: decryptString(rawKey),
        };
      } catch (err) {
        // CRITICAL: never fall back to the raw ciphertext. Doing so would
        // silently ship an encrypted blob to upstream providers, which reject
        // it as an invalid API key and the model watcher would then flag every
        // model behind that provider as "removed". Wipe the key instead and
        // surface a clear signal via `credentialError`.
        const reason = err instanceof Error ? err.message : String(err);
        if (looksEncrypted(rawKey)) {
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
    providers[id as ProviderId] = clone;
  }
  let gateway = config.gateway;
  const gwKey = gateway?.apiKey;
  if (gateway && gwKey) {
    try {
      gateway = { ...gateway, apiKey: decryptString(gwKey) };
    } catch {
      if (looksEncrypted(gwKey)) {
        gateway = { ...gateway, apiKey: undefined };
      }
    }
  }
  return { ...config, providers, gateway };
}

export async function loadConfig(): Promise<AppConfig> {
  await ensureDir(CONFIG_DIR);
  if (!existsSync(CONFIG_PATH)) {
    await saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw) as AppConfig;
  return decryptProviders({ ...DEFAULT_CONFIG, ...parsed });
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureDir(dirname(CONFIG_PATH));
  const encrypted = encryptProviders(config);
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
