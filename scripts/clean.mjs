import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const repoDir = process.cwd();
const generatedPaths = [
  'packages/core/dist',
  'packages/server/dist',
  'packages/cli/dist',
  'packages/ui/.next',
  'packages/ui/.next-dev',
  'packages/ui/out',
  'packages/ui/coverage',
  'packages/core/coverage',
  'packages/server/coverage',
  'packages/cli/coverage',
];

await Promise.all(
  generatedPaths.map((path) => rm(resolve(repoDir, path), { recursive: true, force: true })),
);
