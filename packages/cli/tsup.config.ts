import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  dts: false,
  clean: true,
  sourcemap: true,
  shims: true,
  noExternal: ['@freemodelfinder/core', '@freemodelfinder/server'],
  banner: { js: '#!/usr/bin/env node' },
});
