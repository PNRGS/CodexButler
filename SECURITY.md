# Security Policy

CodexButler is a local-first companion for Codex. Treat the backend host as trusted and the mobile client as an authenticated control surface.

## Supported Scope

This repository currently targets a local-network MVP:

- the backend runs on the user's own machine;
- Codex credentials and execution stay on that backend host;
- the mobile app talks only to the CodexButler backend;
- the backend must not expose unauthenticated command or approval endpoints.
- public health checks must not expose local paths, Codex diagnostics, or session details.

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

For early testing, keep the backend LAN-only. For real remote access, use a private VPN or authenticated private tunnel such as Tailscale, WireGuard, ZeroTier, or an equivalent managed tunnel with access control. Do not expose raw Codex app-server endpoints directly to the internet.

Recommended remote posture:

- keep Codex credentials and execution on the backend host;
- keep `CODEX_CONNECTION_MODE=child` for mobile-owned turns and approvals;
- bind the backend only to the LAN or private tunnel interface when possible;
- avoid direct public port forwarding to `BACKEND_PORT`;
- require tunnel-level authentication when the tunnel provider supports it;
- use HTTPS for traffic outside the local network;
- rotate `BACKEND_AUTH_TOKEN` if a device or tunnel URL is lost;
- review approval requests carefully when a mobile-created thread uses a custom `cwd`;
- default to deny when the command, cwd, or approval source is ambiguous.

When `BACKEND_PUBLIC_BIND=true`, set `BACKEND_ALLOWED_ORIGINS` only for browser clients that need CORS. Native mobile clients can call the backend without opening browser origins.

`CODEX_CONNECTION_MODE=proxy` and `codex remote-control` are not currently dependable security boundaries for Desktop-owned approvals. Treat them as diagnostic paths until Codex exposes a compatible local transport that CodexButler can mediate.
