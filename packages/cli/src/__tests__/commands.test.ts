import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  ProviderRegistry,
  type AppConfig,
  type ChatRequest,
  type StreamChunk,
} from '@freemodelfinder/core';
import { chatCommand } from '../commands/chat.js';
import { keyCommand } from '../commands/key.js';
import { modelCommand } from '../commands/model.js';

function config(): AppConfig {
  return {
    version: 2,
    port: 11435,
    providers: { openrouter: { enabled: false } },
  };
}

const originalLog = console.log;
const originalWrite = process.stdout.write;

afterEach(() => {
  console.log = originalLog;
  process.stdout.write = originalWrite;
});

function captureOutput(): string[] {
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return lines;
}

function configStore(initial = config()) {
  let current = initial;
  return {
    loadConfig: async () => current,
    updateConfig: async (mutator: (value: AppConfig) => AppConfig) => {
      current = mutator(current);
      return current;
    },
    current: () => current,
  };
}

function registryWithModels(): ProviderRegistry {
  const registry = new ProviderRegistry(config());
  registry.listAllModels = async () => ({
    models: [{ id: 'fixture', provider: 'custom', displayName: 'Fixture', free: true }],
    succeededProviders: ['custom'],
    failedProviders: [{ id: 'github', error: 'temporarily offline' }],
  });
  return registry;
}

describe('interactive CLI command branches', () => {
  it('adds provider keys through provider and password prompts', async () => {
    const store = configStore();
    const answers = [{ pid: 'openrouter' }, { apiKey: 'fixture-key' }];
    const output = captureOutput();
    const command = keyCommand({
      ...store,
      prompt: async () => answers.shift() as never,
    });
    await command.parseAsync(['node', 'fmf', 'add']);
    assert.equal(store.current().providers.openrouter?.enabled, true);
    assert.equal(store.current().providers.openrouter?.credentials?.apiKey, 'fixture-key');
    assert.match(output.join('\n'), /openrouter enabled/);
  });

  it('aborts empty provider keys without changing configuration', async () => {
    const store = configStore();
    const output = captureOutput();
    const command = keyCommand({
      ...store,
      prompt: async () => ({ apiKey: '' }) as never,
    });
    await command.parseAsync(['node', 'fmf', 'add', 'gemini']);
    assert.equal(store.current().providers.gemini, undefined);
    assert.match(output.join('\n'), /empty key, aborted/);
  });

  it('lists failures and models, and selects a model interactively', async () => {
    const store = configStore();
    const registry = registryWithModels();
    const output = captureOutput();
    let stopped = 0;
    const dependencies = {
      ...store,
      loadRegistry: async () => registry,
      startSpinner: () => ({
        stop: () => {
          stopped += 1;
        },
      }),
      prompt: async () => ({ model: 'custom:fixture' }) as never,
    };
    await modelCommand(dependencies).parseAsync(['node', 'fmf', 'list']);
    await modelCommand(dependencies).parseAsync(['node', 'fmf', 'use']);
    assert.equal(stopped, 2);
    assert.equal(store.current().defaultModel, 'custom:fixture');
    assert.match(output.join('\n'), /temporarily offline/);
    assert.match(output.join('\n'), /Fixture/);
  });

  it('returns cleanly when interactive model selection has no candidates', async () => {
    const store = configStore();
    const registry = new ProviderRegistry(config());
    const output = captureOutput();
    const command = modelCommand({
      ...store,
      loadRegistry: async () => registry,
      startSpinner: () => ({ stop: () => undefined }),
    });
    await command.parseAsync(['node', 'fmf', 'use']);
    assert.match(output.join('\n'), /No models available/);
  });

  it('switches models and streams an interactive chat response', async () => {
    const store = configStore({ ...config(), defaultModel: 'custom:old' });
    const registry = registryWithModels();
    const provider = {
      id: 'custom',
      async *stream(_request: ChatRequest): AsyncGenerator<StreamChunk> {
        yield {
          id: 'fixture',
          model: 'fixture',
          created: 1,
          delta: 'hello from model',
          finish_reason: 'stop',
        };
      },
    };
    registry.resolveModel = () => ({ provider: provider as never, modelId: 'fixture' });
    const answers = ['/model', 'hello', '/exit'];
    let closed = false;
    const output = captureOutput();
    const command = chatCommand({
      ...store,
      loadRegistry: async () => registry,
      prompt: async () => ({ model: 'custom:fixture' }) as never,
      createInterface: () => ({
        question: (_query, callback) => callback(answers.shift() ?? '/exit'),
        close: () => {
          closed = true;
        },
      }),
    });
    await command.parseAsync(['node', 'fmf']);
    assert.equal(closed, true);
    assert.equal(store.current().defaultModel, 'custom:fixture');
    assert.match(output.join('\n'), /hello from model/);
  });

  it('skips blank chat input and reports provider errors', async () => {
    const store = configStore({ ...config(), defaultModel: 'custom:broken' });
    const registry = registryWithModels();
    registry.resolveModel = () => {
      throw new Error('model unavailable');
    };
    const answers = ['', 'hello', '/quit'];
    const output = captureOutput();
    const command = chatCommand({
      ...store,
      loadRegistry: async () => registry,
      createInterface: () => ({
        question: (_query, callback) => callback(answers.shift() ?? '/quit'),
        close: () => undefined,
      }),
    });
    await command.parseAsync(['node', 'fmf']);
    assert.match(output.join('\n'), /model unavailable/);
  });
});
