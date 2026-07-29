import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const gateway = 'http://127.0.0.1:11435';

export const modelPayload = {
  object: 'list',
  data: [
    {
      id: 'fixture-model',
      provider: 'openrouter',
      display_name: 'Fixture Model',
      context_window: 32_000,
      capability_score: 80,
      free: true,
    },
  ],
  fmf: {
    failed_providers: [{ id: 'github', error: 'temporary provider error' }],
  },
};

export const configPayload = {
  version: 2,
  port: 11435,
  defaultModel: 'openrouter:fixture-model',
  providers: {
    openrouter: { enabled: false, hasKey: false },
    gemini: { enabled: false, hasKey: false },
  },
  onboarding: {
    completedAt: 1_700_000_000_000,
    primaryProvider: 'openrouter',
  },
  custom: {
    enabled: true,
    hasKey: false,
    baseUrl: '',
    models: [],
    sources: [
      {
        id: 'fixture-source',
        label: 'Fixture Source',
        baseUrl: 'https://fixture.invalid/v1',
        hasKey: true,
        models: [{ id: 'custom-model', displayName: 'Custom Model' }],
      },
    ],
  },
};

export const defaultHandlers = [
  http.get(`${gateway}/v1/models`, () => HttpResponse.json(modelPayload)),
  http.post(`${gateway}/v1/models/refresh`, () => HttpResponse.json({ ok: true })),
  http.get(`${gateway}/api/config`, () => HttpResponse.json(configPayload)),
  http.post(`${gateway}/api/default-model`, () => HttpResponse.json({ ok: true })),
  http.get(`${gateway}/api/desktop/state`, () =>
    HttpResponse.json({
      instanceId: 'fixture-instance',
      revision: 1,
      catalogRevision: 1,
      defaultModel: 'openrouter:fixture-model',
      selectionValid: true,
      onboardingRequired: false,
    }),
  ),
  http.get(`${gateway}/api/model-quotas`, () => HttpResponse.json({ data: [] })),
  http.post(`${gateway}/api/model-quotas/probe`, () => HttpResponse.json({ data: [] })),
  http.get(`${gateway}/api/auto-route`, () =>
    HttpResponse.json({
      enabled: false,
      strategy: 'capability',
      fallbackChain: [],
      cooldowns: [],
      recentNotices: [],
    }),
  ),
  http.post(`${gateway}/api/auto-route`, () => HttpResponse.json({ ok: true })),
  http.post(`${gateway}/api/auto-route/clear-cooldown`, () => HttpResponse.json({ ok: true })),
  http.get(`${gateway}/api/gateway`, () =>
    HttpResponse.json({ hasKey: false, apiKey: null, requireAuth: false, port: 11435 }),
  ),
  http.post(`${gateway}/api/providers`, () => HttpResponse.json({ ok: true })),
  http.post(`${gateway}/api/gateway`, () =>
    HttpResponse.json({
      ok: true,
      hasKey: true,
      apiKey: 'fmf-generated-key',
      requireAuth: true,
    }),
  ),
  http.get(`${gateway}/api/onboarding/environment`, () => HttpResponse.json({ data: [] })),
  http.post(`${gateway}/api/onboarding/dismiss`, () => HttpResponse.json({ ok: true })),
];

export const server = setupServer(...defaultHandlers);
