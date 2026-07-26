/** @param {string} phase */
export default function nextConfig(phase) {
  const isDevelopmentServer = phase === 'phase-development-server';

  return {
    // Keep `next dev` and `next build` artifacts separate. Otherwise a build that
    // runs while the local UI is open replaces the dev CSS/chunk manifest and the
    // homepage falls back to unstyled HTML until the server is restarted.
    distDir: isDevelopmentServer ? '.next-dev' : '.next',
    output: 'export',
    images: { unoptimized: true },
    env: {
      NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://127.0.0.1:11435',
    },
  };
}
