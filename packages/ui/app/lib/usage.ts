import { PLATFORMS } from './platforms';

export type QuotaExceededKind = 'minute' | 'day';
export type QuotaInfo = {
  providerId: string;
  providerLabel: string;
  modelName: string;
  reqPerMin?: number;
  reqPerDay?: number;
};
export type UsageRecord = {
  dayKey: string;
  dayCount: number;
  minuteKey: string;
  minuteCount: number;
};

const USAGE_STORAGE_KEY = 'fmf.model-usage.v1';

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function minuteKey(d = new Date()) {
  return `${todayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

function readUsageStore(): Record<string, UsageRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, UsageRecord>) : {};
  } catch {
    return {};
  }
}

function writeUsageStore(store: Record<string, UsageRecord>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function getCurrentUsage(key: string): UsageRecord {
  const store = readUsageStore();
  const now = new Date();
  const dk = todayKey(now);
  const mk = minuteKey(now);
  const rec = store[key];
  if (!rec) return { dayKey: dk, dayCount: 0, minuteKey: mk, minuteCount: 0 };
  return {
    dayKey: rec.dayKey === dk ? rec.dayKey : dk,
    dayCount: rec.dayKey === dk ? rec.dayCount : 0,
    minuteKey: rec.minuteKey === mk ? rec.minuteKey : mk,
    minuteCount: rec.minuteKey === mk ? rec.minuteCount : 0,
  };
}

export function bumpUsage(key: string) {
  const store = readUsageStore();
  const now = new Date();
  const dk = todayKey(now);
  const mk = minuteKey(now);
  const cur = store[key];
  const next: UsageRecord = {
    dayKey: dk,
    dayCount: (cur?.dayKey === dk ? cur.dayCount : 0) + 1,
    minuteKey: mk,
    minuteCount: (cur?.minuteKey === mk ? cur.minuteCount : 0) + 1,
  };
  store[key] = next;
  writeUsageStore(store);
  return next;
}

export function findModelQuota(selected: string): QuotaInfo | null {
  if (!selected) return null;
  const sep = selected.indexOf(':');
  if (sep < 0) return null;
  const providerId = selected.slice(0, sep);
  const modelName = selected.slice(sep + 1);
  const platform = PLATFORMS.find((p) => p.id === providerId);
  if (!platform) return { providerId, providerLabel: providerId, modelName };
  const meta = platform.models.find((m) => m.name === modelName);
  return {
    providerId,
    providerLabel: platform.label,
    modelName,
    reqPerMin: meta?.reqPerMin,
    reqPerDay: meta?.reqPerDay,
  };
}

export function checkQuotaExceeded(
  quota: QuotaInfo,
  usage: UsageRecord,
): QuotaExceededKind | null {
  if (quota.reqPerDay != null && usage.dayCount >= quota.reqPerDay) return 'day';
  if (quota.reqPerMin != null && usage.minuteCount >= quota.reqPerMin) return 'minute';
  return null;
}
