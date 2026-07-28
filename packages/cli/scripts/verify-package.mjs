import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publishDir = resolve(packageDir, 'dist');
const manifest = JSON.parse(await readFile(resolve(publishDir, 'package.json'), 'utf8'));
const requiredFiles = [
  'index.js',
  'index.js.map',
  'ui/index.html',
  'ui/settings.html',
  'deploy/server/freemodelfinder.service',
  'deploy/server/freemodelfinder-cert-renew.service',
  'deploy/server/freemodelfinder-cert-renew.timer',
  'deploy/server/freemodelfinder-doctor.service',
  'deploy/server/freemodelfinder-doctor.timer',
  'deploy/server/nginx.conf',
  'deploy/server/freemodelfinder-proxy.conf',
  'deploy/server/tailscale-policy.hujson',
  'docs/SERVER_MODE.md',
  'LICENSE',
  'README.md',
  'package.json',
];

for (const file of requiredFiles) {
  await access(resolve(publishDir, file));
}

if (manifest.name !== 'freemodelfinder' || manifest.private === true) {
  throw new Error('the CLI package must be the public freemodelfinder package');
}
if (manifest.bin?.fmf !== './index.js' || Object.keys(manifest.bin ?? {}).length !== 1) {
  throw new Error('fmf must be the only published executable');
}

const serializedManifest = JSON.stringify(manifest);
if (serializedManifest.includes('workspace:') || serializedManifest.includes('@freemodelfinder/')) {
  throw new Error('published manifest must not reference private workspace packages');
}

const entry = await readFile(resolve(publishDir, 'index.js'), 'utf8');
if (!entry.startsWith('#!/usr/bin/env node')) {
  throw new Error('published CLI entry is missing its node shebang');
}
if (/from\s+["']@freemodelfinder\//.test(entry)) {
  throw new Error('published CLI still imports a private workspace package');
}

console.log('package contents verified');
