import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const version = process.argv[2];
const output = process.argv[3];
if (!version || !output) {
  throw new Error('usage: node scripts/create-release-notes.mjs <version> <output>');
}

const changelog = await readFile(resolve(process.cwd(), 'CHANGELOG.md'), 'utf8');
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = new RegExp(`^## \\[${escapedVersion}\\][^\\n]*$`, 'm').exec(changelog);
if (!heading) throw new Error(`CHANGELOG.md has no section for ${version}`);
const sectionStart = heading.index + heading[0].length;
const nextHeading = changelog.indexOf('\n## ', sectionStart);
const linkDefinitions = changelog.indexOf('\n[Unreleased]:', sectionStart);
const sectionEnd = [nextHeading, linkDefinitions]
  .filter((index) => index !== -1)
  .reduce((earliest, index) => Math.min(earliest, index), changelog.length);
const changes = changelog.slice(sectionStart, sectionEnd).trim();

const notes = `# FreeModelFinder ${version}

${changes}

## Known limitations

- Text chat only: Tool / Function Calling and multimodal input or output are not supported.
- A stream that fails after output begins cannot fall back inside the same request.
- Multi-key rotation, Ollama, remote deployment, Docker and Homebrew are not supported.
- The Tauri desktop source is experimental; this release contains no native desktop application.

## Artifacts

- npm package tarball
- SHA256SUMS
- CycloneDX JSON SBOM
`;

const outputPath = resolve(process.cwd(), output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, notes);
