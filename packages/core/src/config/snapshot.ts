import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ModelInfo, ProviderId } from '../types.js';
import { CONFIG_DIR } from './store.js';

export const SNAPSHOT_PATH = join(CONFIG_DIR, 'models-snapshot.json');

export interface ModelSnapshotEntry {
  id: string;
  provider: ProviderId;
  displayName: string;
  free: boolean;
}

export interface ModelChangeEntry extends ModelSnapshotEntry {
  detectedAt: number;
}

export interface ModelSnapshot {
  version: number;
  updatedAt: number;
  models: ModelSnapshotEntry[];
  added: ModelChangeEntry[];
  removed: ModelChangeEntry[];
}

const EMPTY_SNAPSHOT: ModelSnapshot = {
  version: 1,
  updatedAt: 0,
  models: [],
  added: [],
  removed: [],
};

const MAX_CHANGE_HISTORY = 200;

function keyOf(m: { provider: ProviderId; id: string }): string {
  return `${m.provider}:${m.id}`;
}

async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
}

export async function loadSnapshot(): Promise<ModelSnapshot> {
  if (!existsSync(SNAPSHOT_PATH)) {
    return { ...EMPTY_SNAPSHOT };
  }
  try {
    const raw = await readFile(SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ModelSnapshot>;
    return {
      version: parsed.version ?? 1,
      updatedAt: parsed.updatedAt ?? 0,
      models: parsed.models ?? [],
      added: parsed.added ?? [],
      removed: parsed.removed ?? [],
    };
  } catch {
    return { ...EMPTY_SNAPSHOT };
  }
}

export async function saveSnapshot(snapshot: ModelSnapshot): Promise<void> {
  await ensureDir(dirname(SNAPSHOT_PATH));
  const tmpPath = `${SNAPSHOT_PATH}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(snapshot, null, 2);
  try {
    await writeFile(tmpPath, payload, { mode: 0o600 });
    await rename(tmpPath, SNAPSHOT_PATH);
  } catch (err) {
    try {
      await unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export interface DiffResult {
  added: ModelSnapshotEntry[];
  removed: ModelSnapshotEntry[];
}

function toEntry(m: ModelInfo): ModelSnapshotEntry {
  return {
    id: m.id,
    provider: m.provider,
    displayName: m.displayName,
    free: m.free,
  };
}

export function diffModels(
  previous: ModelSnapshotEntry[],
  current: ModelInfo[],
  scopedProviders?: ReadonlyArray<ProviderId> | null,
): DiffResult {
  const prevMap = new Map(previous.map((m) => [keyOf(m), m]));
  const currMap = new Map(current.map((m) => [keyOf(m), toEntry(m)]));
  const scoped = scopedProviders ? new Set(scopedProviders) : null;
  const added: ModelSnapshotEntry[] = [];
  const removed: ModelSnapshotEntry[] = [];
  for (const [k, v] of currMap) {
    if (!prevMap.has(k)) added.push(v);
  }
  for (const [k, v] of prevMap) {
    if (currMap.has(k)) continue;
    // Only report removal for providers whose listing succeeded THIS round.
    // If the provider itself was unreachable or returned no data, we cannot
    // conclude that its models were "removed" — freeze them in the snapshot.
    if (scoped && !scoped.has(v.provider)) continue;
    removed.push(v);
  }
  return { added, removed };
}

export async function recordSnapshot(
  models: ModelInfo[],
  now: number = Date.now(),
  scopedProviders?: ReadonlyArray<ProviderId> | null,
): Promise<{ snapshot: ModelSnapshot; diff: DiffResult; isInitial: boolean }> {
  const previous = await loadSnapshot();
  const isInitial = previous.updatedAt === 0 && previous.models.length === 0;
  const diff = isInitial
    ? { added: [], removed: [] }
    : diffModels(previous.models, models, scopedProviders);

  const addedEntries: ModelChangeEntry[] = diff.added.map((m) => ({ ...m, detectedAt: now }));
  const removedEntries: ModelChangeEntry[] = diff.removed.map((m) => ({ ...m, detectedAt: now }));

  // Purge stale `removed` history for models that came back — otherwise the UI
  // keeps flashing "已下架" for a model that is once again available.
  const currentKeys = new Set(models.map((m) => keyOf(m)));
  const filteredPrevRemoved = previous.removed.filter((r) => !currentKeys.has(keyOf(r)));
  // Also purge stale `added` history for models that disappeared for good.
  const filteredPrevAdded = previous.added.filter((a) => currentKeys.has(keyOf(a)));

  const nextAdded = [...addedEntries, ...filteredPrevAdded].slice(0, MAX_CHANGE_HISTORY);
  const nextRemoved = [...removedEntries, ...filteredPrevRemoved].slice(0, MAX_CHANGE_HISTORY);

  // Preserve models from providers that failed this round so they don't get
  // silently dropped from the persisted list.
  const scoped = scopedProviders ? new Set(scopedProviders) : null;
  const preserved: ModelSnapshotEntry[] = [];
  if (scoped) {
    for (const prev of previous.models) {
      if (currentKeys.has(keyOf(prev))) continue;
      if (!scoped.has(prev.provider)) preserved.push(prev);
    }
  }

  const snapshot: ModelSnapshot = {
    version: 1,
    updatedAt: now,
    models: [...models.map(toEntry), ...preserved],
    added: nextAdded,
    removed: nextRemoved,
  };

  await saveSnapshot(snapshot);
  return { snapshot, diff, isInitial };
}
