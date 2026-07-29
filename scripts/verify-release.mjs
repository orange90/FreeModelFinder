import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repoDir = process.cwd();
const manifestPaths = [
  'package.json',
  'packages/core/package.json',
  'packages/server/package.json',
  'packages/cli/package.json',
  'packages/ui/package.json',
  'apps/desktop/package.json',
];
const manifests = await Promise.all(
  manifestPaths.map(async (path) => JSON.parse(await readFile(resolve(repoDir, path), 'utf8'))),
);
const versions = new Set(manifests.map((manifest) => manifest.version));

if (versions.size !== 1) {
  throw new Error(`release versions do not match: ${[...versions].join(', ')}`);
}
if (manifests[0].name !== '@freemodelfinder/repo' || manifests[0].private !== true) {
  throw new Error('the monorepo root must remain private');
}
if (manifests[3].name !== 'freemodelfinder' || manifests[3].private === true) {
  throw new Error('packages/cli must be the only public package');
}
for (const manifest of [manifests[1], manifests[2], manifests[4], manifests[5]]) {
  if (manifest.private !== true) throw new Error(`${manifest.name} must remain private`);
}
for (const path of ['LICENSE', 'README.md', 'CHANGELOG.md', 'SECURITY.md']) {
  await access(resolve(repoDir, path));
}

const serverSource = await readFile(resolve(repoDir, 'packages/server/src/server.ts'), 'utf8');
const version = [...versions][0];
if (!serverSource.includes(`SERVER_VERSION = '${version}'`)) {
  throw new Error('server health version does not match package version');
}

const desktopConfig = JSON.parse(
  await readFile(resolve(repoDir, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
);
const desktopCargo = await readFile(resolve(repoDir, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
if (desktopConfig.version !== version || !desktopCargo.includes(`version = "${version}"`)) {
  throw new Error('desktop release versions do not match package version');
}

console.log(`release metadata verified for v${version}`);
