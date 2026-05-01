# Concierge

Concierge is a local-first mobile companion for monitoring Codex threads from a phone.

## Structure

- `apps/backend`: Fastify API that mediates all Codex access.
- `apps/mobile`: Expo React Native app for threads, approvals, and settings.
- `packages/shared`: shared TypeScript models, Zod schemas, and command policy helpers.

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev:backend
pnpm dev:mobile
```

If Corepack cannot create the global `pnpm` shim on Windows, use `npx pnpm@9.15.4 install` and replace `pnpm` with `npx pnpm@9.15.4` in the commands above.

The backend defaults to `CODEX_MOCK_MODE=true`, so the mobile app can be tested before connecting to a real Codex app-server. Set `CODEX_MOCK_MODE=false` once `codex app-server` is available on the host.

When `CODEX_MOCK_MODE=false`, `CODEX_CONNECTION_MODE` controls how Concierge connects to Codex:

- `child` starts a Concierge-owned `codex app-server` process. This is the supported path for mobile-sent prompts and approvals created by those prompts.
- `proxy` tries `codex app-server proxy`, intended to attach to an existing Codex app-server control socket when Codex exposes one on the host.

The mobile Settings screen shows `Mode`, `Bridge`, and diagnostic detail from authenticated `GET /session`. Public `GET /health` returns only `{ ok: true }`. If proxy mode reports `Bridge: unavailable` with an `app-server-control` socket error, the installed Codex Desktop process is not exposing a proxy target for Concierge on that machine.

## Prompt Push

From a thread detail screen, the mobile app can send a short prompt to an existing idle thread. The backend mediates this through `POST /threads/:id/prompts`, audits the submission metadata, and forwards the text to Codex with `turn/start` in real Codex mode. The mobile app does not create new threads in this MVP.

Real Codex approvals are live JSON-RPC requests sent to the app-server connection that owns the running turn. Concierge can answer approvals for turns started through its backend app-server connection, including prompts sent from the mobile app. `CODEX_CONNECTION_MODE=proxy` is the experimental path for discovering whether the local Codex installation exposes the Desktop-owned app-server to another client.

## Current Technical Limitation

Concierge does not currently receive approval requests that originate inside Codex Desktop. On the tested Windows setup, Codex Desktop starts its own app-server as `codex.exe app-server --analytics-default-enabled`, which uses the default `stdio://` transport and does not create a shared control socket. As a result, `codex app-server proxy` cannot attach to the Desktop-owned app-server and `/session` reports `Bridge: unavailable` in proxy mode.

The supported real-Codex flow today is: start or resume work through Concierge's backend app-server connection, then answer approvals created by that backend-owned turn from the mobile app.

## Mock Approval Cases

When the backend runs with `CODEX_MOCK_MODE=true`, you can seed one pending approval for repeated Android testing:

```bash
pnpm mock:approval
```

The default case is an approval for `pnpm test`, intended to test `More` -> `Add instruction` -> `Approve + send instruction`.

Optional cases:

```bash
pnpm mock:approval follow-up
pnpm mock:approval deny
pnpm mock:approval cancel
```

Seeding a case replaces the existing pending mock approval for the mock thread, so the Inbox should show only one current approval. The route is protected by the bearer token and returns `404` when `CODEX_MOCK_MODE=false`.

## Windows + Android LAN Test

1. Copy `.env.example` to `.env`.
2. Set `BACKEND_PUBLIC_BIND=true`, keep `BACKEND_PORT=4545`, and set a long `BACKEND_AUTH_TOKEN` of at least 32 random characters.
3. Start with `CODEX_MOCK_MODE=true`, then run `pnpm dev:backend`. If you test from a browser origin while publicly bound, set `BACKEND_ALLOWED_ORIGINS` to a comma-separated allowlist. Native mobile clients do not need CORS.
4. On Windows, run `ipconfig` and note the Ethernet IPv4 address, for example `192.168.1.20`.
5. Allow inbound TCP port `4545` in Windows Firewall for private networks only.
6. Run `pnpm dev:mobile`, open Expo Go on Android, and keep the phone on the same router Wi-Fi.
7. In mobile Settings, set the backend URL to `http://<PC_IPV4>:4545` and enter the bearer token.
8. Tap "Test connection", open the idle mock thread, send a prompt, and verify that a new turn appears.
9. In another terminal, run `pnpm mock:approval`, then verify that the Inbox shows the approval at the top.
10. Open `More`, add a short instruction, tap `Approve + send instruction`, then verify the approval moves to `Recently resolved` and the instruction appears in the thread timeline.
11. To test against real Codex, stop the backend, set `CODEX_MOCK_MODE=false`, keep `CODEX_CONNECTION_MODE=child`, ensure `CODEX_BIN=codex`, restart `pnpm dev:backend`, then send a non-destructive prompt to an existing idle Codex thread from the mobile app. To test real approvals, use a mobile-sent prompt that asks Codex to run a harmless command requiring confirmation.
12. To probe Desktop bridging, stop the backend, set `CODEX_CONNECTION_MODE=proxy`, restart `pnpm dev:backend`, then tap `Test connection` in Settings. If the bridge is `connected`, create a harmless Desktop-side approval and check the Inbox. If the bridge is `unavailable`, return to `CODEX_CONNECTION_MODE=child`; the current Codex Desktop install is not exposing a proxyable app-server control socket.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Security Notes

- Keep `BACKEND_AUTH_TOKEN` long, private, and easy to rotate if a phone is lost.
- The mobile app stores the bearer token in Expo SecureStore when the platform supports it.
- Use LAN-only access for the MVP. For remote use, place the backend behind a VPN or authenticated private tunnel.
- Do not expose Codex app-server directly to the internet.
