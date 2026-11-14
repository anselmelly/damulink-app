# DamuLink

A platform that connects verified medical facilities, donors and families so a call for blood reaches the right donors fast.

This is the application, rebuilt step by step with reference to an earlier version, from the [DamuLink prototype](https://github.com/anselmelly/damulink-prototype) (screens, spec and plans). It was built by the team with Claude Code and the Claude Sonnet 5.5 model.

## Stack

Hono on Node (API), SvelteKit (web, later), Drizzle ORM on MariaDB, pnpm + Turborepo. Runs on a single Linux box behind Caddy.

## Develop

Needs Node 24, pnpm and a local MariaDB.

```bash
cp .env.example .env     # then fill in the database user and password
pnpm install
pnpm check               # typecheck, tests (a throwaway database per run) and the secrets check
pnpm --filter @damu/api dev
```

Create a local database and a user that may also create `damulink_test_*` databases (see `.env.example` for the names the app reads).

## Status

Phase 0: foundations (repo, health endpoint, error format, request ids, CORS for `X-Auth`, settings and an append-only audit log, test harness, secrets check). Auth is next.
