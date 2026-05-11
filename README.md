# CodexButler

CodexButler is a local-first mobile companion for monitoring Codex threads from a phone.

## Current State

CodexButler is currently a local-first MVP. The backend runs on the Codex host, the phone talks only to the CodexButler backend, and Codex credentials plus command execution stay on the host.

Working today:

- list active and recent Codex threads;
- inspect thread summaries and recent turn timelines;
- show live thread, turn, session, and approval state with SSE plus polling fallback;
- answer approval requests that belong to turns started through CodexButler's backend app-server connection;
- send follow-up prompts to idle threads;
- create backend-owned Codex threads from the mobile Inbox;
- choose the backend default project folder, a known project folder, or a custom absolute host path for new mobile-created threads;
- pin important threads locally on the phone;
- run the whole app in mock mode for mobile UI and approval-flow testing.

Not working as a dependable remote-control path yet:

- receiving approvals that originate inside Codex Desktop when Desktop owns its private app-server connection;
- using `codex remote-control` as CodexButler's backend transport;
- exposing CodexButler as a public internet service without a private network or authenticated tunnel.

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

When `CODEX_MOCK_MODE=false`, `CODEX_CONNECTION_MODE` controls how CodexButler connects to Codex:

- `child` starts a CodexButler-owned `codex app-server` process. This is the supported path for mobile-sent prompts and approvals created by those prompts.
- `proxy` tries `codex app-server proxy`, intended to attach to an existing Codex app-server control socket when Codex exposes one on the host.

Set `CODEX_DEFAULT_CWD` to the workspace directory that should be used when the phone creates a new thread without selecting a specific folder.

On macOS with `codex-cli 0.130.0-alpha.5`, `codex app-server` responds on stdio and supports `thread/turns/list` with `itemsView: "summary"`, which CodexButler uses for mobile timelines. The new `codex remote-control` command is not a drop-in stdio app-server for CodexButler in this build: it attempts remote-control websocket enrollment through ChatGPT and did not answer local JSON-RPC during testing.

The mobile Settings screen shows `Mode`, `Bridge`, and diagnostic detail from authenticated `GET /session`. Public `GET /health` returns only `{ ok: true }`. If proxy mode reports `Bridge: unavailable` with an `app-server-control` socket error, the installed Codex Desktop process is not exposing a proxy target for CodexButler on that machine.

## Mobile Features

The Inbox is the main control surface. It shows pending approvals first, then pinned threads, active threads, and recent threads grouped by project. It can also start a new thread from the phone.

Thread detail shows the thread title, status, summary, cwd, a readable message timeline, and a prompt composer. The composer is disabled while the thread is running or waiting on approval, so the phone does not enqueue ambiguous work into an active turn.

Pinned threads are stored locally on the phone with AsyncStorage. They are a mobile convenience only; pinning does not modify Codex state on the host.

Settings stores the backend URL and bearer token, tests the connection, and refreshes session diagnostics so connection-mode problems are visible without reading backend logs.

## Thread Creation and Prompt Push

From a thread detail screen, the mobile app can send a short prompt to an existing idle thread. The backend mediates this through `POST /threads/:id/prompts`, audits the submission metadata, and forwards the text to Codex with `turn/start` in real Codex mode.

From the Inbox, the mobile app can also create a backend-owned thread with `POST /threads`. The user can keep the backend default folder, choose a known project folder from `/projects`, or enter a custom absolute folder path on the Codex host. The backend starts the Codex thread in the selected `cwd` or `CODEX_DEFAULT_CWD`, sends the first prompt as a Codex turn, audits the submission metadata, and routes approvals for that thread through CodexButler.

Real Codex approvals are live JSON-RPC requests sent to the app-server connection that owns the running turn. CodexButler can answer approvals for turns started through its backend app-server connection, including prompts sent from the mobile app. `CODEX_CONNECTION_MODE=proxy` is the experimental path for discovering whether the local Codex installation exposes the Desktop-owned app-server to another client.

## Current Technical Limitation

CodexButler does not currently receive approval requests that originate inside Codex Desktop. On the tested Windows setup, Codex Desktop starts its own app-server as `codex.exe app-server --analytics-default-enabled`, which uses the default `stdio://` transport and does not create a shared control socket. As a result, `codex app-server proxy` cannot attach to the Desktop-owned app-server and `/session` reports `Bridge: unavailable` in proxy mode.

The supported real-Codex flow today is: start or resume work through CodexButler's backend app-server connection, then answer approvals created by that backend-owned turn from the mobile app.

`codex remote-control` should remain an observed but unsupported path until it exposes a compatible local transport or a documented protocol that CodexButler can mediate safely.

Messages sent from the phone through CodexButler are persisted to the Codex thread, but Codex Desktop may not display those new turns live when Desktop does not own the app-server connection. In current testing, Desktop sometimes needs a refresh or restart to show phone-created turns.

## Recommended Real Remote Use

For real remote use, run CodexButler on a trusted always-on host where Codex is already configured, then connect the phone to that host through a private network path. The recommended production-like setup is:

1. Keep `CODEX_CONNECTION_MODE=child`.
2. Set `CODEX_MOCK_MODE=false`.
3. Set `CODEX_DEFAULT_CWD` to a controlled workspace directory.
4. Set a long random `BACKEND_AUTH_TOKEN` and store it only on trusted phones.
5. Bind the backend only where needed. Use LAN binding for same-network use, or bind behind a private VPN or authenticated tunnel for off-network use.
6. Use Tailscale, WireGuard, ZeroTier, or an equivalent private authenticated tunnel for remote access.
7. Point the mobile app at the private VPN or tunnel URL for the CodexButler backend, not at Codex app-server.
8. Start or resume work from the phone through CodexButler when you need mobile approval handling.
9. Keep Codex Desktop open only as an observer unless `CODEX_CONNECTION_MODE=proxy` reports a working bridge on that host.

Do not forward port `4545` directly from the public internet to the backend. Do not expose raw Codex app-server endpoints. If using an HTTPS tunnel, require tunnel authentication in addition to the CodexButler bearer token whenever the tunnel provider supports it.

Operational recommendations:

- use a dedicated low-privilege host user for unattended remote runs when practical;
- prefer one or a few known workspaces instead of arbitrary filesystem paths;
- review mobile-created custom cwd values before approving commands;
- keep approval actions explicit for destructive, networked, migration, publish, or write-heavy commands;
- rotate `BACKEND_AUTH_TOKEN` if a phone is lost or a tunnel URL leaks;
- watch backend logs for auth failures, approval decisions, rule creation, and Codex session errors;
- treat `proxy` and `codex remote-control` as diagnostic experiments until the local Codex install exposes a documented compatible transport.

## Android Alpha APK

The first GitHub APK is intended as a release-variant alpha for trusted testers. It is suitable for side-loading and MVP validation, not for Play Store distribution.

Mobile app identity for this alpha:

- Android app id: `app.codexbutler.mobile`
- Android versionCode: `1`
- User-facing app name: `CodexButler Alpha`

Local alpha APK build:

Prerequisites: JDK 17 and Android SDK/Gradle tooling available on `PATH`.

```bash
pnpm --filter @codexbutler/mobile build:android:release
```

The APK is generated at:

```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

The generated native Android project is ignored by git because this repo currently stays Expo-managed. To regenerate from a clean state, remove `apps/mobile/android` and rerun the build command.

GitHub build:

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

Pushing a `v*` tag runs `.github/workflows/android-apk-alpha.yml`. The workflow runs lint, typecheck, tests, installs the required Android SDK packages, generates the Android project, builds a release-variant alpha APK, uploads it as a workflow artifact, and attaches it to a draft GitHub Release using `docs/releases/v0.1.0-alpha.md`.

For a manual build without creating a tag, run the `Android APK Alpha` workflow from the GitHub Actions UI. Manual runs upload the APK as an artifact only.

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
11. To test against real Codex, stop the backend, set `CODEX_MOCK_MODE=false`, keep `CODEX_CONNECTION_MODE=child`, set `CODEX_BIN` to the absolute Codex binary path if needed, set `CODEX_DEFAULT_CWD` to the project directory, restart `pnpm dev:backend`, then create a new thread or send a non-destructive prompt to an existing idle Codex thread from the mobile app. To test real approvals, use a mobile-sent prompt that asks Codex to run a harmless command requiring confirmation.
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
- Use LAN-only access for early testing. For real remote use, place the backend behind a VPN or authenticated private tunnel.
- Prefer HTTPS for any tunnel that leaves the LAN, and require tunnel-level authentication when available.
- Keep `CODEX_CONNECTION_MODE=child` for the supported mobile-owned approval flow.
- Do not expose Codex app-server directly to the internet.
- Do not publish a backend URL protected only by the bearer token on the open internet.
