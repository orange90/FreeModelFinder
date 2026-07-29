#!/usr/bin/env node
import './proxy.js';
import { getProxyResult } from './proxy.js';
import { createServer } from './server.js';

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const proxyResult = getProxyResult();
  if (proxyResult.installed && proxyResult.url) {
    console.log(`[freemodelfinder] outbound proxy enabled: ${proxyResult.url}`);
  } else if (proxyResult.url && proxyResult.reason) {
    console.warn(
      `[freemodelfinder] proxy env detected (${proxyResult.url}) but not installed: ${proxyResult.reason}`,
    );
  }

  const portRaw = optionValue('--port') ?? process.env.PORT;
  const portEnv = portRaw ? Number(portRaw) : undefined;
  const uiDir = optionValue('--ui-dir');
  const parentPidRaw = optionValue('--parent-pid');
  const parentPid = parentPidRaw ? Number(parentPidRaw) : undefined;
  if (portEnv !== undefined && (!Number.isInteger(portEnv) || portEnv < 1 || portEnv > 65535)) {
    throw new Error('--port must be an integer between 1 and 65535');
  }
  if (parentPid !== undefined && (!Number.isInteger(parentPid) || parentPid < 1)) {
    throw new Error('--parent-pid must be a positive integer');
  }
  const { app, listen } = await createServer({ port: portEnv, uiDir });
  const url = await listen();
  console.log(`[freemodelfinder] server listening at ${url}`);

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void app.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  if (parentPid) {
    const parentMonitor = setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch {
        clearInterval(parentMonitor);
        shutdown();
      }
    }, 2_000);
    parentMonitor.unref();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
