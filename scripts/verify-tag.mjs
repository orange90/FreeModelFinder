import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag?.startsWith('v')) {
  throw new Error(`release tag must start with v, received: ${tag ?? '(missing)'}`);
}

const manifest = JSON.parse(await readFile(resolve(process.cwd(), 'package.json'), 'utf8'));
const taggedVersion = tag.slice(1);
if (taggedVersion !== manifest.version) {
  throw new Error(`tag ${tag} does not match package version ${manifest.version}`);
}

console.log(`release tag verified: ${tag}`);
