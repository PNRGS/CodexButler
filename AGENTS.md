# AGENTS.md

## Project

Build a lightweight companion app to monitor and control Codex threads from a phone.

Primary use case:
- the user runs Codex on a personal computer or always-on host
- the phone is used to inspect thread status, read the latest messages, and answer approval requests
- sensitive execution stays on the backend host

## Product goals

Ship a small, reliable MVP first.

The MVP must support:
1. List active and recent Codex threads
2. Read a thread summary and recent turns
3. Show live status for each thread
4. Surface approval requests for command execution
5. Let the user approve once, approve for session, always allow by rule, or deny
6. Work with a backend hosted locally on the user's machine

Nice-to-have after MVP:
- push notifications
- reconnect / resume session UX
- filters and search
- per-project views
- audit log of approvals and denials

## Non-goals

Do not try to re-create the full Codex desktop experience.

Do not:
- implement code editing on mobile in v1
- expose raw Codex app-server endpoints directly to the internet
- execute sensitive commands from the phone without backend mediation
- over-engineer auth or infra before the local-first MVP works

## Recommended architecture

Use three layers:

1. **Codex host**
   - runs Codex locally
   - owns repository access and command execution
   - keeps Codex credentials and rules

2. **Backend API**
   - Node.js 18+
   - talks to Codex SDK / app-server
   - exposes a minimal HTTPS API or WebSocket layer to the mobile app
   - stores only lightweight metadata if persistence is needed

3. **Mobile client**
   - React Native with Expo preferred
   - read-first UI with a dedicated approvals inbox
   - no direct access to Codex internals

## Security and trust model

Security is a hard requirement.

Rules:
- keep Codex execution and secrets on the backend host
- never embed OpenAI or Codex credentials in the mobile app
- never expose an unauthenticated command-execution endpoint
- prefer local network access for early development
- for remote access, require a private VPN or another authenticated private tunnel
- log approval decisions with timestamp, command, cwd, and decision source
- default to deny when the approval state is ambiguous

## Approval model

The app must treat approvals as first-class product behavior.

Support these actions:
- approve once
- approve for session
- add allow rule for a known-safe command prefix
- deny
- cancel / dismiss

Policy guidance:
- safe read-only commands may be allowlisted
- destructive, networked, or write-heavy commands should require confirmation unless explicitly allowlisted
- if the command cannot be classified safely, require explicit approval

## Initial command policy

Use this as the starting policy and refine only with evidence.

### Allow by default candidate prefixes
- `pwd`
- `ls`
- `find`
- `cat`
- `grep`
- `git status`
- `git diff`
- `npm test`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pytest -q`

### Prompt by default candidate prefixes
- `git push`
- `git commit`
- `git merge`
- `gh pr create`
- `gh pr merge`
- package publish commands
- any networked command
- migration commands
- any write command outside the workspace

### Forbidden by default candidate prefixes
- `rm -rf /`
- destructive reset commands without explicit request
- privilege escalation commands
- arbitrary remote shell execution

If unsure, prompt instead of allow.

## Tech choices

Preferred stack:
- mobile: React Native + Expo + TypeScript
- backend: Node.js + TypeScript + Fastify or Express
- state/query: TanStack Query
- realtime: WebSocket or SSE behind the backend API
- storage: start with in-memory or SQLite unless a stronger need appears
- auth: simple token-based auth for MVP; improve only if necessary

Do not introduce extra infrastructure unless it clearly reduces complexity.

## UX principles

The app is a control surface, not a coding IDE.

Prioritize:
- fast status visibility
- readable thread timeline
- obvious approval actions
- low-tap navigation
- safe defaults for risky actions

Each screen must answer one main question:
- Threads: what is running and what needs attention?
- Thread detail: what happened recently?
- Approvals: what decision is required right now?
- Settings: where is the backend and how is access secured?

## API design guidance

Design backend endpoints around product needs, not raw Codex internals.

Suggested resources:
- `GET /threads`
- `GET /threads/:id`
- `GET /threads/:id/turns`
- `GET /approvals`
- `POST /approvals/:id/decision`
- `GET /health`
- `GET /projects`

Normalize Codex events into app-friendly models.
Do not leak backend-only fields to the client unless needed.

## Data model guidance

Start with simple types.

Core entities:
- `Project`
- `Thread`
- `Turn`
- `ApprovalRequest`
- `ApprovalDecision`
- `Rule`
- `BackendSession`

Every entity should have explicit timestamps and stable ids.

## Development workflow

Implement in small vertical slices.

Recommended order:
1. backend health endpoint
2. backend thread listing from Codex
3. mobile thread list
4. thread detail
5. approval ingestion and decision flow
6. local auth and session management
7. logs and diagnostics
8. optional notifications

For every feature:
- design the API shape first
- implement backend tests where practical
- wire one mobile screen only after backend behavior is stable
- keep diffs small and reviewable

## Testing expectations

Before marking work complete:
- run lint
- run type checks
- run unit tests
- manually verify the relevant mobile flow
- manually verify one approval flow end-to-end when touching approval logic

Minimum quality bar:
- no TypeScript errors
- no broken navigation
- no silent failures for approval decisions
- backend errors must be surfaced with actionable messages

## Observability

Add useful logs early.

Must log:
- backend startup and connection state
- Codex session / thread fetch failures
- approval request received
- approval decision sent
- rule creation events
- auth failures

Never log secrets or tokens.

## Coding standards

General rules:
- prefer TypeScript everywhere
- prefer explicit types on public interfaces
- keep functions small and single-purpose
- avoid clever abstractions in MVP
- document non-obvious behavior close to the code
- keep files focused and reasonably sized
- use clear names over short names
- do not mix transport DTOs with domain models without intent

When editing code:
- preserve existing conventions unless there is a strong reason to improve them
- avoid broad refactors unrelated to the task
- explain tradeoffs in PR notes or commit messages when making architectural choices

## Definition of done

A task is done only if:
- the requested behavior works end-to-end
- tests and checks relevant to the task pass
- error states were considered
- docs are updated if behavior or setup changed
- the change is small enough for a human to review comfortably

## Setup notes to maintain

When the repository is initialized, keep this file updated with:
- actual package manager commands
- exact dev startup commands
- environment variables
- project directory map
- test commands
- any repo-specific conventions discovered during implementation

Current setup:
- package manager: `pnpm`
- install: `corepack enable`, then `pnpm install`; Windows fallback used in this workspace: `npx pnpm@9.15.4 install`
- backend dev: `pnpm dev:backend`
- mobile dev: `pnpm dev:mobile`
- full dev: `pnpm dev`
- seed mock approval: `pnpm mock:approval`
- lint/type/tests: `pnpm lint`, `pnpm typecheck`, `pnpm test`
- backend env: copy `.env.example` to `.env`; use `CODEX_MOCK_MODE=true` for local UI development, then `CODEX_MOCK_MODE=false` to connect to Codex; use `BACKEND_ALLOWED_ORIGINS` only for browser clients that need CORS while `BACKEND_PUBLIC_BIND=true`
- Codex connection mode: `CODEX_CONNECTION_MODE=child` starts a Concierge-owned `codex app-server`; `CODEX_CONNECTION_MODE=proxy` tries `codex app-server proxy` and reports `unavailable` in authenticated `/session` when no Desktop control socket is exposed.
- directory map: `apps/backend` Fastify API, `apps/mobile` Expo app, `packages/shared` shared models/schemas/policy
- real approval routing: Concierge receives approvals for turns owned by its backend app-server connection; Desktop-owned approvals require `CODEX_CONNECTION_MODE=proxy` and only work if the local Codex install exposes a compatible app-server control socket.

## When to create a plan

For any feature that changes architecture, auth, approvals, synchronization, or notifications:
- write a short implementation plan before coding
- keep the plan concrete
- prefer a sequence of reversible steps

## First milestone

Ship a local-first demo where:
- backend runs on the user's machine
- mobile app connects over local network
- user can see threads and statuses
- user can open a thread and inspect recent activity
- user can answer approval requests from the phone

## Final instruction

Optimize for a working, reviewable MVP.
When in doubt, choose the simplest design that preserves security around command execution and approvals.
