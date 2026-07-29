import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, '..');
const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'));
const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch;
const sourceApp = join(
  desktopRoot,
  'src-tauri',
  'target',
  'release',
  'bundle',
  'macos',
  'FreeModelFinder.app',
);
const releaseDir = join(desktopRoot, 'release');
const staging = join(releaseDir, `dmg-${arch}`);
const output = join(releaseDir, `FreeModelFinder-${manifest.version}-${arch}.dmg`);

rmSync(staging, { recursive: true, force: true });
rmSync(output, { force: true });
mkdirSync(staging, { recursive: true });
cpSync(sourceApp, join(staging, 'FreeModelFinder.app'), { recursive: true });
symlinkSync('/Applications', join(staging, 'Applications'));
execFileSync(
  'hdiutil',
  [
    'create',
    '-volname',
    'FreeModelFinder',
    '-srcfolder',
    staging,
    '-ov',
    '-format',
    'UDZO',
    output,
  ],
  { stdio: 'inherit' },
);
rmSync(staging, { recursive: true, force: true });
process.stderr.write(`[desktop] packaged ${output}\n`);
