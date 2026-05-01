# Security Policy

Concierge is a local-first companion for Codex. Treat the backend host as trusted and the mobile client as an authenticated control surface.

## Supported Scope

This repository currently targets a local-network MVP:

- the backend runs on the user's own machine;
- Codex credentials and execution stay on that backend host;
- the mobile app talks only to the Concierge backend;
- the backend must not expose unauthenticated command or approval endpoints.

## Do Not Commit

Never commit:

- `.env` or local environment files;
- backend bearer tokens;
- OpenAI, Codex, GitHub, Expo, or platform credentials;
- SQLite runtime databases;
- logs that may contain commands, local paths, or diagnostics;
- mobile signing keys or provisioning files.

Use `.env.example` for documented placeholder values only.

## Reporting Security Issues

Do not include secrets, tokens, private repository names, or personal filesystem paths in public issues. Share only the minimal reproduction details needed to understand the risk.

## Deployment Guidance

For the MVP, keep the backend LAN-only. For remote access, use a private VPN or authenticated private tunnel. Do not expose raw Codex app-server endpoints directly to the internet.
