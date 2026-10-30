<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GUARDRAIL: working rules for every agent (Claude Code and Antigravity)

Read `docs/plans/00 Overzicht.md` first, then the plan for the layer you work on (`docs/plans/01`–`06`).
The plans are copied from Sem's Obsidian vault, which is leading: propose plan changes to Sem, don't edit `docs/plans/` yourself.
Tasks are handed out on the shared board (`Agent-overdracht.md` in the vault).

## Core principle
The AI proposes, code decides. The policy engine never uses agent output as evidence: amounts come from the PayPal order,
sellers from the registry, product data is fetched by the server. Missing evidence = failed rule.

## Repo layout: five npm workspaces, one Next.js app, one deploy
| Folder | Package | Contains |
|---|---|---|
| `frontend/` | `@guardrail/frontend` | Next.js app: `src/app/` (pages + thin route handlers in `src/app/api/`), `src/components/`, `src/hooks/`, `.env.local` |
| `backend/` | `@guardrail/backend` | server runtime: env, logger, errors, `route()` wrapper, health, monitoring; `scripts/` (spike, webhook, jobs, eval) |
| `database/` | `@guardrail/database` | `db()` client (Postgres or PGlite), `migrations/`, seed, repositories |
| `apis/` | `@guardrail/apis` | `src/domain/` (zod types), `src/contracts/` (our HTTP + SSE contract), `src/mocks/`, adapters `src/paypal/`, `src/channel3/`, `src/llm/` |
| `services/` | `@guardrail/services` | business logic: `catalog`, `payments`, `policy`, `agent`, `invoices`, `disputes`, `audit` |

**Dependencies point one way:** frontend → backend → services → database → apis.
- Client components import only `@guardrail/apis` (domain, contracts, mocks).
- Server code in frontend (route handlers, server components) may use `@guardrail/backend` and `@guardrail/services`, never `@guardrail/database` directly.
- Import other workspaces by package name (`@guardrail/services/catalog`), never with `../../` across folders. New public modules go in that package's `exports`.
- Install a dependency in the workspace that uses it: `npm install <pkg> -w frontend`.

## Ownership (two tracks, never touch the other track's files)
Roles since 30-10: **Antigravity builds the core, Claude Code does UI design and the frontend.**

| | Track A, core: Antigravity (`feat/core`) | Track B, frontend + UI design: Claude Code (`feat/ui`) |
|---|---|---|
| Owns | `backend/`, `database/`, `services/`, `apis/` (except `apis/src/mocks/`; includes the Channel3 adapter), `frontend/src/app/api/` | `frontend/` (except `frontend/src/app/api/`), `apis/src/mocks/` |
| Shared | `apis/src/domain/`, `apis/src/contracts/`, root `package.json`, `frontend/.env.example`, `AGENTS.md`: changed by Track A, **always reviewed by Track B** before merge | request changes on the board with `[!]` |

- Each track edits only the `package.json` of its own workspaces (`npm install <pkg> -w <workspace>`).
- Track B builds against `apis/src/mocks/` until the real endpoint exists. Mocks must keep passing `npm run contracts:check`;
  a contract change may update the mocks it breaks in the same commit.
- Swap a mock for the real endpoint only when that endpoint is merged to `main`.
- Changes to the policy engine (`services/src/policy/`) and the payment flow (`services/src/payments/`) always get a Track B review with the edge cases.
- One branch per track; merge to `main` daily after review; the other track rebases.
- Before every merge, from the repo root: `npm run check` (typecheck all workspaces + lint + contracts:check).

## Peer review (required before anything reaches `main`)
Every task, Track A's included, is reviewed by the **other** agent on the shared board (`Agent-overdracht.md` in the vault, section *Collegiale review*).
1. Author: push the branch, set the task to `[?]` with branch + commit hash, and say what was not tested.
2. Reviewer: start every session with open `[?]` reviews before new work. Write findings under **Review** in the task,
   each with a label and `file:line`: **Blocker** (must fix before merge), **Moet** (fix before feature freeze 6-11),
   **Suggestie** (author decides), **Goed** (keep this).
3. No blockers: reviewer approves, the author merges to `main` and sets `[x]`. Blockers: `[↺]`, author fixes, back to `[?]`.
4. Never edit the other track's files to "fix" a finding; comment instead. Disagreement after one round: `[!]`, Sem decides.
5. Changes to `apis/src/domain/` or `apis/src/contracts/` are made by Track A and always reviewed by Track B (the consumer) before merge.
- Before every merge, from the repo root: `npm run check` (typecheck all workspaces + lint + contracts:check).

## Commands (repo root)
- `npm run dev`: the app on http://localhost:3000 (env from `frontend/.env.local`, copy from `frontend/.env.example`)
- `npm run check`, `npm run build`
- `npm run spike`, `npm run webhook:register -- <public url>`

## Conventions
- Money: integer cents + currency (`Money` in `apis/src/domain/money.ts`). Never floats.
- Validate every input (HTTP, webhooks, LLM output) with the zod schemas in `apis/src/contracts/` and `apis/src/domain/`.
- Errors: `{ error: AppError }` (see `apis/src/contracts/api.ts`); a policy BLOCK is an outcome, not an exception.
- No secrets in git, logs, responses or client bundles. Keys live in `frontend/.env.local`.
- No new dependency without a reason in the commit message.
- UI copy in English (for the jury); comments in English.
