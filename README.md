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
pnpm --filter @damu/api dev     # API on http://127.0.0.1:8790
pnpm --filter @damu/web dev     # web on http://localhost:5173 (sends /api to the API)
```

Create a local database and a user that may also create `damulink_test_*` databases (see `.env.example` for the names the app reads).

## Status

Done: foundations, phase 1 API (signup, login, tokens, /api/me, facility search, email verification, phone codes, password reset and change) and the phase 1 web screens (home, login, create account, forgot and reset password, verify email and phone), the donor dashboard, and the donor screens (donate or get tested, donor code, appointments, alert settings, reminders, profile). Mail and SMS are stand-ins (the dev server prints them; nothing is sent) until a provider is connected. Next: phase 3 (facilities).
