import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const repoDir = resolve(packageDir, '../..');
const distDir = resolve(packageDir, 'dist');
const uiDir = resolve(repoDir, 'packages/ui/out');

await mkdir(distDir, { recursive: true });
await cp(uiDir, resolve(distDir, 'ui'), { recursive: true, force: true });

const license = await readFile(resolve(repoDir, 'LICENSE'), 'utf8');
await writeFile(resolve(distDir, 'LICENSE'), license);

const readme = await readFile(resolve(repoDir, 'README.md'), 'utf8');
await writeFile(resolve(distDir, 'README.md'), readme);

const sourceManifest = JSON.parse(await readFile(resolve(packageDir, 'package.json'), 'utf8'));
const publishedManifest = {
  name: sourceManifest.name,
  version: sourceManifest.version,
  description: sourceManifest.description,
  type: sourceManifest.type,
  main: './index.js',
  bin: { fmf: './index.js' },
  files: ['index.js', 'index.js.map', 'ui', 'README.md', 'LICENSE'],
  engines: sourceManifest.engines,
  repository: sourceManifest.repository,
  homepage: sourceManifest.homepage,
  bugs: sourceManifest.bugs,
  keywords: sourceManifest.keywords,
  license: sourceManifest.license,
  publishConfig: sourceManifest.publishConfig,
  dependencies: sourceManifest.dependencies,
};
await writeFile(
  resolve(distDir, 'package.json'),
  `${JSON.stringify(publishedManifest, null, 2)}\n`,
);
