import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChatRequest, StreamChunk } from '../../types.js';
import type { BaseProvider, ProviderContext } from '../base.js';
import { CohereProvider } from '../cohere.js';
import { CustomProvider } from '../custom.js';
import { GeminiProvider } from '../gemini.js';
import { GitHubModelsProvider } from '../github.js';
import { HuggingFaceProvider } from '../huggingface.js';
import { ModelScopeProvider } from '../modelscope.js';
import { NvidiaProvider } from '../nvidia.js';
import { OpenRouterProvider } from '../openrouter.js';
import { SenseNovaProvider } from '../sensenova.js';
import { SiliconFlowProvider } from '../siliconflow.js';
import { ZhipuProvider } from '../zhipu.js';

type ProviderConstructor = new (context: ProviderContext) => BaseProvider;

const openAiCompatibleProviders: Array<[string, ProviderConstructor]> = [
  ['openrouter', OpenRouterProvider],
  ['zhipu', ZhipuProvider],
  ['siliconflow', SiliconFlowProvider],
  ['modelscope', ModelScopeProvider],
  ['nvidia', NvidiaProvider],
  ['github', GitHubModelsProvider],
  ['cohere', CohereProvider],
  ['huggingface', HuggingFaceProvider],
  ['sensenova', SenseNovaProvider],
];

const chatRequest: ChatRequest = {
  model: 'fixture-model',
  messages: [{ role: 'user', content: 'hello' }],
  stream: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function openAiChatFetch(): typeof fetch {
  return (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { stream?: boolean };
    if (body.stream) {
      return new Response(
        [
          'data: {"id":"stream-1","model":"fixture-model","created":1,"choices":[{"index":0,"delta":{"content":"hello "},"finish_reason":null}]}',
          'data: {"id":"stream-1","model":"fixture-model","created":1,"choices":[{"index":0,"delta":{"content":"world"},"finish_reason":"stop"}]}',
          'data: [DONE]',
          '',
        ].join('\n\n'),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }
    return jsonResponse({
      id: 'chat-1',
      model: 'fixture-model',
      created: 1,
      choices: [{ index: 0, message: { role: 'assistant', content: 'hello world' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });
  }) as typeof fetch;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('built-in provider chat contracts', () => {
  for (const [id, Provider] of openAiCompatibleProviders) {
    it(`${id} supports non-streaming, streaming and 429 errors`, async () => {
      const provider = new Provider({
        credentials: { apiKey: 'test-key' },
        fetchImpl: openAiChatFetch(),
      });
      const response = await provider.chat(chatRequest);
      assert.equal(response.content, 'hello world');
      assert.equal(response.usage?.total_tokens, 3);

      const chunks = await collect(provider.stream({ ...chatRequest, stream: true }));
      assert.equal(chunks.map((chunk) => chunk.delta).join(''), 'hello world');

      const limited = new Provider({
        credentials: { apiKey: 'test-key' },
        fetchImpl: (async () => new Response('rate limited', { status: 429 })) as typeof fetch,
      });
      await assert.rejects(limited.chat(chatRequest), new RegExp(`${id} chat failed 429`));
      await assert.rejects(
        async () => collect(limited.stream({ ...chatRequest, stream: true })),
        new RegExp(`${id} stream failed 429`),
      );
    });
  }

  it('Gemini supports non-streaming, streaming and 429 errors', async () => {
    const provider = new GeminiProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: (async (input: string | URL | Request) => {
        if (String(input).includes(':streamGenerateContent')) {
          return new Response(
            [
              'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"hello "}]}}]}',
              'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"world"}]},"finishReason":"STOP"}]}',
              '',
            ].join('\n\n'),
            { headers: { 'content-type': 'text/event-stream' } },
          );
        }
        return jsonResponse({
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'hello ' }, { text: 'world' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
        });
      }) as typeof fetch,
    });
    const response = await provider.chat(chatRequest);
    assert.equal(response.content, 'hello world');
    assert.equal(response.usage?.total_tokens, 3);
    const chunks = await collect(provider.stream({ ...chatRequest, stream: true }));
    assert.equal(chunks.map((chunk) => chunk.delta).join(''), 'hello world');

    const limited = new GeminiProvider({
      credentials: { apiKey: 'test-key' },
      fetchImpl: (async () => new Response('rate limited', { status: 429 })) as typeof fetch,
    });
    await assert.rejects(limited.chat(chatRequest), /gemini chat failed 429/);
    await assert.rejects(
      async () => collect(limited.stream({ ...chatRequest, stream: true })),
      /gemini stream failed 429/,
    );
  });

  it('Custom Source supports catalog, chat, stream, 429 and empty configuration', async () => {
    const credentials = {
      apiKey: '',
      extra: {
        sources: [
          {
            id: 'fixture',
            label: 'Fixture',
            baseUrl: 'https://fixture.invalid/v1',
            apiKey: 'custom-key',
            models: [{ id: 'fixture-model', displayName: 'Fixture Model' }],
          },
        ],
      },
    };
    const provider = new CustomProvider({ credentials, fetchImpl: openAiChatFetch() });
    const models = await provider.listModels();
    assert.deepEqual(
      models.map((model) => model.id),
      ['fixture:fixture-model'],
    );
    const customRequest = { ...chatRequest, model: 'fixture:fixture-model' };
    assert.equal((await provider.chat(customRequest)).content, 'hello world');
    assert.equal(
      (await collect(provider.stream({ ...customRequest, stream: true })))
        .map((chunk) => chunk.delta)
        .join(''),
      'hello world',
    );

    const limited = new CustomProvider({
      credentials,
      fetchImpl: (async () => new Response('rate limited', { status: 429 })) as typeof fetch,
    });
    await assert.rejects(limited.chat(customRequest), /custom chat failed 429/);
    await assert.rejects(
      async () => collect(limited.stream({ ...customRequest, stream: true })),
      /custom stream failed 429/,
    );
    assert.deepEqual(await new CustomProvider({ credentials: { apiKey: '' } }).listModels(), []);
  });
});

describe('provider empty-catalog contracts', () => {
  it('distinguishes empty upstream data from audited static fallbacks', async () => {
    const cases: Array<[string, BaseProvider, 'empty' | 'fallback' | 'error']> = [
      [
        'openrouter',
        new OpenRouterProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse({ data: [] }),
        }),
        'empty',
      ],
      [
        'gemini',
        new GeminiProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse({ models: [] }),
        }),
        'error',
      ],
      ['zhipu', new ZhipuProvider({ credentials: { apiKey: 'key' } }), 'fallback'],
      [
        'siliconflow',
        new SiliconFlowProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse({ data: [] }),
        }),
        'error',
      ],
      [
        'modelscope',
        new ModelScopeProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse({ data: [] }),
        }),
        'fallback',
      ],
      [
        'nvidia',
        new NvidiaProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse({ data: [] }),
        }),
        'empty',
      ],
      [
        'github',
        new GitHubModelsProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse([]),
        }),
        'empty',
      ],
      [
        'cohere',
        new CohereProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse({ models: [] }),
        }),
        'error',
      ],
      [
        'huggingface',
        new HuggingFaceProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse({ data: [] }),
        }),
        'error',
      ],
      [
        'sensenova',
        new SenseNovaProvider({
          credentials: { apiKey: 'key' },
          fetchImpl: async () => jsonResponse({ data: [] }),
        }),
        'fallback',
      ],
    ];

    for (const [id, provider, expected] of cases) {
      if (expected === 'error') {
        await assert.rejects(provider.listModels(), /empty|no chat models/);
        continue;
      }
      const models = await provider.listModels();
      assert.equal(models.length > 0 ? 'fallback' : 'empty', expected, id);
    }
  });
});
