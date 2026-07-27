import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir, userInfo, hostname } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import type { AppConfig } from '../../types.js';

const testHome = await mkdtemp(join(tmpdir(), 'freemodelfinder-config-'));
process.env.FREEMODELFINDER_HOME = testHome;

const { CONFIG_PATH, MASTER_KEY_PATH, loadConfig, saveConfig } = await import('../store.js');
const { decryptString, encryptString, looksEncrypted } = await import('../crypto.js');

const baseConfig = (): AppConfig => ({
  version: 2,
  port: 11435,
  providers: {
    openrouter: {
      enabled: true,
      credentials: { apiKey: 'provider-secret' },
      credentialError: 'stale test error',
    },
    custom: {
      enabled: true,
      credentials: {
        apiKey: 'legacy-custom-secret',
        baseUrl: 'https://example.test/v1',
        extra: {
          sources: [
            {
              id: 'source-one',
              baseUrl: 'https://one.example/v1',
              apiKey: 'custom-source-secret',
              models: [{ id: 'test-model' }],
            },
          ],
        },
      },
    },
  },
  gateway: { requireAuth: true, apiKey: 'gateway-secret' },
});

async function resetHome(): Promise<void> {
  await rm(testHome, { recursive: true, force: true });
  await mkdir(testHome, { recursive: true, mode: 0o700 });
}

function encryptV1(plaintext: string): string {
  const salt = 'freemodelfinder.v1';
  const key = scryptSync(`${userInfo().username}::${hostname()}::${salt}`, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

describe('configuration encryption and migration', () => {
  beforeEach(resetHome);

  after(async () => {
    await rm(testHome, { recursive: true, force: true });
  });

  it('encrypts provider, custom source and gateway keys with v3', async () => {
    await saveConfig(baseConfig());

    const raw = await readFile(CONFIG_PATH, 'utf8');
    assert.doesNotMatch(
      raw,
      /provider-secret|legacy-custom-secret|custom-source-secret|gateway-secret/,
    );
    assert.doesNotMatch(raw, /credentialError/);
    assert.equal((raw.match(/v3:/g) ?? []).length, 4);

    const loaded = await loadConfig();
    assert.equal(loaded.version, 2);
    assert.equal(loaded.providers.openrouter?.credentials?.apiKey, 'provider-secret');
    assert.equal(loaded.providers.openrouter?.credentialError, undefined);
    assert.equal(loaded.providers.custom?.credentials?.apiKey, 'legacy-custom-secret');
    const sources = loaded.providers.custom?.credentials?.extra?.sources as Array<{
      apiKey: string;
    }>;
    assert.equal(sources[0]?.apiKey, 'custom-source-secret');
    assert.equal(loaded.gateway?.apiKey, 'gateway-secret');

    if (process.platform !== 'win32') {
      assert.equal((await stat(testHome)).mode & 0o777, 0o700);
      assert.equal((await stat(CONFIG_PATH)).mode & 0o777, 0o600);
      assert.equal((await stat(MASTER_KEY_PATH)).mode & 0o777, 0o600);
    }
  });

  it('keeps v3 payloads bound to their random master key', () => {
    const key = randomBytes(32);
    const otherKey = randomBytes(32);
    const encrypted = encryptString('secret', key);
    assert.ok(looksEncrypted(encrypted));
    assert.equal(decryptString(encrypted, key), 'secret');
    assert.throws(() => decryptString(encrypted, otherKey), /key mismatch/);
    assert.throws(() => decryptString(encrypted), /master key is required/);
  });

  it('migrates plaintext and v1/v2 ciphertext to v3 after a successful read', async () => {
    const legacy = baseConfig();
    legacy.version = 1;
    legacy.providers.openrouter!.credentials!.apiKey = encryptV1('provider-secret');
    legacy.providers.custom!.credentials!.apiKey = encryptString('legacy-custom-secret');
    legacy.gateway!.apiKey = 'gateway-secret';
    await writeFile(CONFIG_PATH, JSON.stringify(legacy, null, 2), { mode: 0o600 });

    const loaded = await loadConfig();
    assert.equal(loaded.providers.openrouter?.credentials?.apiKey, 'provider-secret');
    assert.equal(loaded.providers.custom?.credentials?.apiKey, 'legacy-custom-secret');
    assert.equal(loaded.gateway?.apiKey, 'gateway-secret');

    const migrated = await readFile(CONFIG_PATH, 'utf8');
    assert.match(migrated, /"version": 2/);
    assert.doesNotMatch(migrated, /"apiKey": "(?:v1:|v2:|gateway-secret)/);
    const persisted = JSON.parse(migrated) as AppConfig;
    const keys = [
      persisted.providers.openrouter?.credentials?.apiKey,
      persisted.providers.custom?.credentials?.apiKey,
      persisted.gateway?.apiKey,
    ];
    assert.ok(keys.every((value) => value?.startsWith('v3:')));
  });

  it('does not overwrite ciphertext when the v3 master key is wrong', async () => {
    const encrypted = encryptString('provider-secret', randomBytes(32));
    const config = baseConfig();
    config.providers = {
      openrouter: { enabled: true, credentials: { apiKey: encrypted } },
    };
    config.gateway = undefined;
    const raw = JSON.stringify(config, null, 2);
    await writeFile(CONFIG_PATH, raw, { mode: 0o600 });
    await writeFile(MASTER_KEY_PATH, `${randomBytes(32).toString('base64')}\n`, { mode: 0o600 });

    const loaded = await loadConfig();
    assert.equal(loaded.providers.openrouter?.credentials?.apiKey, '');
    assert.match(loaded.providers.openrouter?.credentialError ?? '', /decryption failed/);
    assert.equal(await readFile(CONFIG_PATH, 'utf8'), raw);
  });

  it('uses an atomic temporary file without leaving plaintext or stale files behind', async () => {
    await saveConfig(baseConfig());
    await saveConfig({ ...baseConfig(), port: 12000 });

    const files = await readdir(testHome);
    assert.deepEqual(files.sort(), ['config.json', 'master.key']);
    assert.doesNotMatch(await readFile(CONFIG_PATH, 'utf8'), /provider-secret/);
    assert.equal((await loadConfig()).port, 12000);
  });
});
