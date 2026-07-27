import { fileURLToPath } from 'node:url';

/** @param {string} phase */
export default function nextConfig(phase) {
  const isDevelopmentServer = phase === 'phase-development-server';
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

  return {
    // Keep `next dev` and `next build` artifacts separate. Otherwise a build that
    // runs while the local UI is open replaces the dev CSS/chunk manifest and the
    // homepage falls back to unstyled HTML until the server is restarted.
    distDir: isDevelopmentServer ? '.next-dev' : '.next',
    turbopack: { root: repoRoot },
    output: 'export',
    images: { unoptimized: true },
    env: process.env.NEXT_PUBLIC_GATEWAY_URL
      ? { NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL }
      : undefined,
  };
}
