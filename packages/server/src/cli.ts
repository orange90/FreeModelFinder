#!/usr/bin/env node
import './proxy.js';
import { getProxyResult } from './proxy.js';
import { createServer } from './server.js';

async function main() {
  const proxyResult = getProxyResult();
  if (proxyResult.installed && proxyResult.url) {
    console.log(`[freemodelfinder] outbound proxy enabled: ${proxyResult.url}`);
  } else if (proxyResult.url && proxyResult.reason) {
    console.warn(
      `[freemodelfinder] proxy env detected (${proxyResult.url}) but not installed: ${proxyResult.reason}`,
    );
  }

  const portEnv = process.env.PORT ? Number(process.env.PORT) : undefined;
  const { listen } = await createServer({ port: portEnv });
  const url = await listen();
  console.log(`[freemodelfinder] server listening at ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
