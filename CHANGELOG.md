# Changelog

All notable changes to FreeModelFinder are documented here.

## [Unreleased]

- Add an opt-in server mode with separate Tailscale-admin and API-only loopback listeners.
- Force Gateway Key authentication on the server-mode API and add `fmf doctor server` deployment checks.
- Ship systemd, Nginx, Tailscale and short-lived IP certificate deployment templates.

## [0.1.0-rc.3] - 2026-07-27

- Switch npm publication from the one-time bootstrap token to GitHub Actions OIDC Trusted Publishing.

## [0.1.0-rc.2] - 2026-07-27

- Publish the `freemodelfinder` npm package with the `fmf` CLI.
- Serve the web UI and compatible API gateway from one loopback address.
- Aggregate verified free-model catalogs from ten built-in providers.
- Support OpenAI, Anthropic and Gemini text-chat request formats.
- Add local quota observation, provider failure reporting and automatic routing.
- Encrypt provider, custom-source and gateway credentials with the v3 local format.

[Unreleased]: https://github.com/orange90/FreeModelFinder/compare/v0.1.0-rc.3...HEAD
[0.1.0-rc.3]: https://github.com/orange90/FreeModelFinder/compare/v0.1.0-rc.2...v0.1.0-rc.3
[0.1.0-rc.2]: https://github.com/orange90/FreeModelFinder/releases/tag/v0.1.0-rc.2
