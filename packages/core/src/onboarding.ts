import { scoreModel } from './router/auto-router.js';
import type { ModelInfo, ProviderId } from './types.js';

function modelKey(model: ModelInfo): string {
  return `${model.provider}:${model.id}`;
}

/** Selects a stable free-text model for the first-run connection test. */
export function selectOnboardingModel(
  models: readonly ModelInfo[],
  provider: ProviderId,
): ModelInfo | undefined {
  const candidates = models.filter(
    (model) => model.provider === provider && model.free === true && model.id.trim().length > 0,
  );
  if (provider === 'openrouter') {
    const freeRouter = candidates.find((model) => model.id.toLowerCase() === 'openrouter/free');
    if (freeRouter) return freeRouter;
  }
  return [...candidates].sort(
    (left, right) =>
      scoreModel(right, 'capability') - scoreModel(left, 'capability') ||
      modelKey(left).localeCompare(modelKey(right)),
  )[0];
}
