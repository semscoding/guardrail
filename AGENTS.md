<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GUARDRAIL: working rules for every agent (Claude Code and Antigravity)

Read `docs/plans/00 Overzicht.md` first, then the plan for the layer you work on (`docs/plans/01`–`06`).
The plans are copied from Sem's Obsidian vault, which is leading: propose plan changes to Sem, don't edit `docs/plans/` yourself.

## Core principle
The AI proposes, code decides. The policy engine never uses agent output as evidence: amounts come from the PayPal order,
sellers from the registry, product data is fetched by the server. Missing evidence = failed rule.

## Ownership (two tracks, never touch the other track's files)
| | Track A: Claude Code (`feat/core`) | Track B: Antigravity (`feat/ui`) |
|---|---|---|
| Owns | `src/services/`, `src/adapters/paypal/`, `src/adapters/llm/`, `src/db/` (incl. **all migrations**), `src/lib/`, `src/app/api/`, `scripts/`, `tests/` | `src/app/**` pages and layouts (not `src/app/api/`), `src/components/`, `src/hooks/`, `src/adapters/channel3/`, styling and tokens |
| Shared, changed only by Track A | `src/domain/`, `src/contracts/`, `package.json`, `.env.example`, `AGENTS.md` | ask Sem to request a change |

- Track B builds against `src/mocks/` until the real endpoint exists. Mocks must keep passing `npm run contracts:check`.
- Swap a mock for the real endpoint only when that endpoint is merged to `main`.
- One branch per track; merge to `main` daily; the other track rebases.
- Before every merge: `npm run typecheck && npm run lint && npm run contracts:check`.

## Conventions
- Money: integer cents + currency (`Money` in `src/domain/money.ts`). Never floats.
- Validate every input (HTTP, webhooks, LLM output) with the zod schemas in `src/contracts/` and `src/domain/`.
- Errors: `{ error: AppError }` (see `src/contracts/api.ts`); a policy BLOCK is an outcome, not an exception.
- No secrets in git, logs, responses or client bundles. Keys live in `.env.local`.
- No new dependency without a reason in the commit message.
- UI copy in English (for the jury); comments in English.
