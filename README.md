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

Done: phase 0 (foundations), phase 1a (signup, login, tokens, `/api/me`, facility search) and phase 1b (email verification, phone codes, password reset and change). Mail and SMS are stand-ins (the dev server prints them; nothing is sent) until a provider is connected. Next: the web screens for auth.
