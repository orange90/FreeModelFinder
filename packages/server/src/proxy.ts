import { ProxyAgent, setGlobalDispatcher } from 'undici';

export function pickProxyUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw =
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy ||
    env.ALL_PROXY ||
    env.all_proxy;
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export function isSupportedProxy(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

let installed = false;
let lastResult: { installed: boolean; url?: string; reason?: string } = {
  installed: false,
  reason: 'not attempted',
};

export function installProxyFromEnv(): { installed: boolean; url?: string; reason?: string } {
  if (installed) return lastResult;
  const url = pickProxyUrl();
  if (!url) {
    lastResult = { installed: false, reason: 'no proxy env vars set' };
    return lastResult;
  }
  if (!isSupportedProxy(url)) {
    lastResult = {
      installed: false,
      url,
      reason: `unsupported proxy protocol (undici only supports http/https), got: ${url}`,
    };
    return lastResult;
  }
  try {
    setGlobalDispatcher(new ProxyAgent(url));
    installed = true;
    lastResult = { installed: true, url };
    return lastResult;
  } catch (err) {
    lastResult = {
      installed: false,
      url,
      reason: err instanceof Error ? err.message : String(err),
    };
    return lastResult;
  }
}

// Install eagerly at module-load time so any downstream module's fetch calls
// (including provider listModels) already use the proxy dispatcher.
installProxyFromEnv();

export function getProxyResult(): { installed: boolean; url?: string; reason?: string } {
  return lastResult;
}
