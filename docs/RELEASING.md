# Release runbook

This repository publishes one public npm package, `freemodelfinder`. The Core, Server, UI, repository root and experimental desktop packages stay private.

## One-time repository setup

1. Confirm that `freemodelfinder` is still unclaimed on npm immediately before the first publish. Enable 2FA on the maintainer account.
2. In GitHub, set the repository description to “Local gateway and Web UI for verified free LLM models” and add the topics `llm`, `openai`, `anthropic`, `gemini`, `api-gateway`, `free-models`, `typescript`, and `cli`.
3. Enable private vulnerability reporting.
4. Protect `main`. Require pull requests and the `Quality and release gates` plus all three `Package smoke` checks from `CI` before merge.
5. Protect `v*` tags so only release maintainers can create them.

The macOS/Tauri project is not part of these gates.

## Bootstrap `0.1.0-rc.2`

npm cannot configure a Trusted Publisher until the package exists. The first prerelease therefore uses a temporary granular automation token:

1. Change all release manifests and `SERVER_VERSION` to `0.1.0-rc.2`; `pnpm verify:release` must pass.
2. Because `freemodelfinder` does not exist yet, create a granular npm token with the shortest practical expiry, `Read and write` access to `All Packages`, and `Bypass 2FA` enabled. Store it temporarily as the GitHub Actions secret `NPM_BOOTSTRAP_TOKEN`, then revoke it after the first OIDC-only publish succeeds.
3. Merge through green CI, then push the protected tag `v0.1.0-rc.2`. `release.yml` chooses the `next` dist-tag for prerelease versions.
4. Install from the public registry in a clean environment and verify the model catalog, one non-streaming chat, and one streaming chat:

   ```bash
   npm install -g freemodelfinder@0.1.0-rc.2
   fmf serve --open
   ```

Do not reuse this bootstrap token for the final release.

## Enable npm Trusted Publishing

In the npm package settings, configure:

- Provider: GitHub Actions
- Organization/user: `orange90`
- Repository: `FreeModelFinder`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

The release job runs on a GitHub-hosted runner, grants only the required `id-token: write`, uses Node 24 and npm 11.18.0, and publishes directly with `npm publish`. The public package receives npm provenance automatically; the command also keeps the explicit `--provenance` safety flag.

Publish `v0.1.0-rc.3` without `NODE_AUTH_TOKEN` as the OIDC-only verification release. After it succeeds, delete the `NPM_BOOTSTRAP_TOKEN` GitHub secret and revoke the token at npm. Set npm publishing access to require 2FA and disallow traditional tokens if that policy is compatible with the maintainer recovery process.

## Final `v0.1.0`

1. Set all release manifests and `SERVER_VERSION` to `0.1.0`, update `CHANGELOG.md`, and merge only after CI is green.
2. Verify locally with Node 22.14 or later:

   ```bash
   pnpm install --frozen-lockfile
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm test:coverage
   pnpm build
   pnpm audit:prod
   pnpm verify:release
   pnpm test:pack
   ```

3. Push the protected tag `v0.1.0`. The workflow checks the tag against the manifest, reruns every gate, publishes the tested staging directory to npm under `latest`, and creates a GitHub Release.
4. Confirm that the GitHub Release contains the `.tgz`, `SHA256SUMS`, CycloneDX JSON SBOM, change notes and known limitations.
5. Reinstall from the registry rather than the local tarball and perform a real Provider acceptance test:

   ```bash
   npm uninstall -g freemodelfinder
   npm cache clean --force
   npm install -g freemodelfinder@0.1.0
   fmf --version
   fmf serve --open
   ```

Verify `/healthz`, the Web UI, the real model catalog, non-streaming chat and streaming chat. Record the Provider, model, time and result in the release issue.

## Recovery

npm versions are immutable. If publish succeeds but GitHub Release creation fails, rerun only the release-asset step manually; do not rebuild and republish the same version. If a published version is bad, deprecate it when appropriate, fix forward with a new version, and document the incident in the changelog and release notes.
