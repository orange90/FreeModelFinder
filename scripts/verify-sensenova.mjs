import { ProviderRegistry } from '../packages/core/dist/index.js';

const registry = new ProviderRegistry({
  version: 1,
  port: 11435,
  providers: {
    sensenova: {
      enabled: true,
      credentials: { apiKey: 'sk-BcXwIRU3U6MUTmeF3yIHdP6F9ao1Ly4x' },
    },
  },
});

const models = ['sensenova-6.7-flash-lite', 'deepseek-v4-flash', 'glm-5.2'];

for (const model of models) {
  console.log(`\n=== ${model} (non-stream) ===`);
  try {
    const { provider, modelId } = registry.resolveModel(model);
    console.log('routed to provider:', provider.id, '/ modelId:', modelId);
    const res = await provider.chat({
      model: modelId,
      messages: [{ role: 'user', content: 'Say hi in one short word.' }],
      max_tokens: 256,
    });
    console.log('OK content:', JSON.stringify(res.content));
    console.log('finish_reason:', res.finish_reason);
  } catch (err) {
    console.log('FAIL:', err.message);
    process.exitCode = 1;
  }

  console.log(`\n=== ${model} (stream) ===`);
  try {
    const { provider, modelId } = registry.resolveModel(model);
    const chunks = [];
    for await (const chunk of provider.stream({
      model: modelId,
      messages: [{ role: 'user', content: 'Reply with the number 42.' }],
      max_tokens: 256,
    })) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.finish_reason) break;
    }
    console.log('OK stream chunks:', chunks.length, '/ joined:', JSON.stringify(chunks.join('')));
  } catch (err) {
    console.log('FAIL:', err.message);
    process.exitCode = 1;
  }
}

console.log('\n=== listModels() ===');
const provider = registry.getProvider('sensenova');
const list = await provider.listModels();
console.log(list.map((m) => m.id));
