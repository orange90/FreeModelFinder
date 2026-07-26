import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CloudflareProvider } from '../cloudflare.js';
import { GeminiProvider } from '../gemini.js';
import { OpenRouterProvider } from '../openrouter.js';

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
    assert.deepEqual(models.map((model) => model.id), ['vendor/chat:free']);
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
    assert.deepEqual(models.map((model) => model.id), ['gemini-3.5-flash']);
  });

  it('requires a Cloudflare account id before listing static models', async () => {
    const provider = new CloudflareProvider({
      credentials: { apiKey: 'test-key' },
    });

    await assert.rejects(
      () => provider.listModels(),
      /requires accountId in credentials\.extra/,
    );
  });
});
