import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CohereProvider } from '../cohere.js';
import { GeminiProvider } from '../gemini.js';
import { GitHubModelsProvider } from '../github.js';
import { HuggingFaceProvider } from '../huggingface.js';
import { ModelScopeProvider } from '../modelscope.js';
import { NvidiaProvider } from '../nvidia.js';
import { OpenRouterProvider } from '../openrouter.js';
import { SenseNovaProvider } from '../sensenova.js';
import { SiliconFlowProvider } from '../siliconflow.js';
import { ZhipuProvider } from '../zhipu.js';

function jsonFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

describe('free provider catalogs', () => {
  it('keeps only zero-price text free variants from OpenRouter', async () => {
    const provider = new OpenRouterProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch({
        data: [
          {
            id: 'vendor/chat:free',
            name: 'Free chat',
            pricing: { prompt: '0', completion: '0' },
            architecture: { output_modalities: ['text'] },
          },
          {
            id: 'vendor/paid',
            pricing: { prompt: '0.000001', completion: '0.000002' },
            architecture: { output_modalities: ['text'] },
          },
          {
            id: 'vendor/music:free',
            pricing: { prompt: '0', completion: '0' },
            architecture: { output_modalities: ['audio'] },
          },
          {
            id: 'vendor/content-safety:free',
            pricing: { prompt: '0', completion: '0' },
            architecture: { output_modalities: ['text'] },
          },
        ],
      }),
    });

    const models = await provider.listModels();
    assert.deepEqual(
      models.map((model) => model.id),
      ['vendor/chat:free'],
    );
  });

  it('publishes OpenRouter account-wide free-model limits from the current key tier', async () => {
    let observed: Array<{ windowSeconds?: number; limit?: number; scope: string }> = [];
    const provider = new OpenRouterProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: (async (input: string | URL | Request) => {
        const url = String(input);
        const body = url.endsWith('/key')
          ? { data: { is_free_tier: false } }
          : {
              data: [
                {
                  id: 'vendor/chat:free',
                  pricing: { prompt: '0', completion: '0' },
                  architecture: { output_modalities: ['text'] },
                },
              ],
            };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
      onQuotaWindows: ({ windows }) => {
        observed = windows;
      },
    });

    await provider.listModels();
    assert.deepEqual(
      observed.map((window) => [window.windowSeconds, window.limit, window.scope]),
      [
        [60, 20, 'provider'],
        [86_400, 1_000, 'provider'],
      ],
    );
  });

  it('does not advertise Gemini versions unavailable to new accounts', async () => {
    const provider = new GeminiProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-3.5-flash',
            displayName: 'Gemini 3.5 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }),
    });

    const models = await provider.listModels();
    assert.deepEqual(
      models.map((model) => model.id),
      ['gemini-3.5-flash'],
    );
  });

  it('does not publish paid Zhipu models in the provider catalog', async () => {
    const provider = new ZhipuProvider({
      credentials: { apiKey: 'test-key' },
    });

    const models = await provider.listModels();
    assert.deepEqual(
      models.map((model) => model.id),
      ['glm-4-flash', 'glm-4.7-flash'],
    );
    assert.ok(models.every((model) => model.free));
  });

  it('keeps only Cohere models that stay free with production keys', async () => {
    const provider = new CohereProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch({
        models: [
          { name: 'command-a-03-2025', endpoints: ['chat'] },
          { name: 'north-mini-code-1-0', endpoints: ['chat'] },
        ],
      }),
    });

    const models = await provider.listModels();
    assert.deepEqual(
      models.map((model) => model.id),
      ['north-mini-code-1-0'],
    );
  });

  it('does not publish GitHub embedding models through the chat catalog', async () => {
    const provider = new GitHubModelsProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch([
        {
          id: 'openai/gpt-4.1-mini',
          supported_output_modalities: ['text'],
        },
        {
          id: 'openai/text-embedding-3-small',
          supported_output_modalities: ['embeddings'],
        },
      ]),
    });

    const models = await provider.listModels();
    assert.deepEqual(
      models.map((model) => model.id),
      ['openai/gpt-4.1-mini'],
    );
  });

  it('filters the remaining dynamic catalogs to their audited free models', async () => {
    const siliconflow = new SiliconFlowProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch({
        data: [{ id: 'Qwen/Qwen3-8B' }, { id: 'vendor/paid-model' }],
      }),
    });
    assert.deepEqual(
      (await siliconflow.listModels()).map((model) => model.id),
      ['Qwen/Qwen3-8B'],
    );

    const modelscope = new ModelScopeProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch({
        data: [{ id: 'deepseek-ai/DeepSeek-R1' }, { id: 'vendor/not-audited' }],
      }),
    });
    assert.deepEqual(
      (await modelscope.listModels()).map((model) => model.id),
      ['deepseek-ai/DeepSeek-R1'],
    );

    const nvidia = new NvidiaProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch({
        data: [{ id: 'meta/llama-3.1-8b-instruct' }, { id: 'vendor/not-audited' }],
      }),
    });
    assert.deepEqual(
      (await nvidia.listModels()).map((model) => model.id),
      ['meta/llama-3.1-8b-instruct'],
    );

    const huggingface = new HuggingFaceProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch({
        data: [
          { id: 'free/model', providers: [{ provider: 'fixture', is_free: true }] },
          {
            id: 'paid/model',
            providers: [{ provider: 'fixture', pricing: { input: 1, output: 1 } }],
          },
        ],
      }),
    });
    assert.deepEqual(
      (await huggingface.listModels()).map((model) => model.id),
      ['free/model'],
    );

    const sensenova = new SenseNovaProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: jsonFetch({
        data: [
          {
            id: 'free-text-model',
            output_modalities: ['text'],
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'paid-text-model',
            output_modalities: ['text'],
            pricing: { prompt: '0.1', completion: '0.1' },
          },
        ],
      }),
    });
    assert.deepEqual(
      (await sensenova.listModels()).map((model) => model.id),
      ['free-text-model'],
    );
  });
});
