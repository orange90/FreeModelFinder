export function formatK(k: number) {
  if (k >= 1000) return `${(k / 1000).toFixed(k % 1000 === 0 ? 0 : 1)}M`;
  return `${k}K`;
}

export function formatNumber(n: number) {
  return n.toLocaleString('en-US');
}

function resolveGateway(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GATEWAY_URL) {
    return process.env.NEXT_PUBLIC_GATEWAY_URL;
  }
  if (typeof window !== 'undefined' && window.location.port !== '3000') {
    return window.location.origin;
  }
  return 'http://127.0.0.1:11435';
}

export const GATEWAY = resolveGateway();

export const UI_CLIENT_HEADERS: Record<string, string> = {
  'x-fmf-client': 'ui',
};

export function withUiHeaders(init?: RequestInit): RequestInit {
  const merged = new Headers(init?.headers);
  for (const [k, v] of Object.entries(UI_CLIENT_HEADERS)) {
    if (!merged.has(k)) merged.set(k, v);
  }
  return { ...(init ?? {}), headers: merged };
}

export function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
