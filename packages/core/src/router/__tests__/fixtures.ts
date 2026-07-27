import type { AutoRouteSettings, ModelInfo, ProviderId, SwitchNotice } from '../../types.js';
import { AutoRouter } from '../auto-router.js';

export function makeModel(
  id: string,
  provider: ProviderId,
  overrides: Partial<ModelInfo> = {},
): ModelInfo {
  return {
    id,
    provider,
    displayName: overrides.displayName ?? id,
    free: overrides.free ?? true,
    contextWindow: overrides.contextWindow,
    description: overrides.description,
  };
}

export function makeSettings(overrides: Partial<AutoRouteSettings> = {}): AutoRouteSettings {
  return {
    enabled: overrides.enabled ?? true,
    strategy: overrides.strategy ?? 'capability',
    profiles: overrides.profiles,
    fallbackChain: overrides.fallbackChain,
  };
}

export interface RouterHarness {
  router: AutoRouter;
  notices: SwitchNotice[];
  setSettings: (s: AutoRouteSettings | undefined) => void;
  setModels: (m: ModelInfo[]) => void;
  setListError: (err: Error | null) => void;
}

export function makeRouter(
  initialModels: ModelInfo[] = [],
  ...settingsArgs: [] | [AutoRouteSettings | undefined]
): RouterHarness {
  let settings: AutoRouteSettings | undefined =
    settingsArgs.length === 0 ? makeSettings() : settingsArgs[0];
  let models = initialModels;
  let listError: Error | null = null;
  const notices: SwitchNotice[] = [];
  const router = new AutoRouter({
    getSettings: () => settings,
    listAllModels: async () => {
      if (listError) throw listError;
      return models;
    },
    onNotice: (n) => notices.push(n),
  });
  return {
    router,
    notices,
    setSettings: (s) => {
      settings = s;
    },
    setModels: (m) => {
      models = m;
    },
    setListError: (err) => {
      listError = err;
    },
  };
}
