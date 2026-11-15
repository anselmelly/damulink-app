# DamuLink

A platform that connects verified medical facilities, donors and families so a call for blood reaches the right donors fast.

This is the application, rebuilt step by step with reference to an earlier version, from the [DamuLink prototype](https://github.com/anselmelly/damulink-prototype) (screens, spec and plans). It was built by the team with Claude Code and the Claude Sonnet 5.5 model.

## Stack

Hono on Node (API), SvelteKit (web), Drizzle ORM on MariaDB, pnpm + Turborepo. Runs on a single Linux box behind Caddy.

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

## Try the demo

The demo server at https://dl.anselmelly.com has invented data only (emails end in `@demo.example`). Nothing real is stored there. The password and a walk-through are in [docs/demo-guide.md](docs/demo-guide.md).

| Role | Email | What to look at |
|---|---|---|
| Donor | `donor1@demo.example` | Dashboard, calls for you, alerts, appointments |
| Facility admin | `admin.rift-county-hospital@demo.example` | Requests, calls, blood drives, check-in, team |
| Facility attendant | `attendant.rift-county-hospital@demo.example` | The attendant's view of the same facility |

To sign in to a facility, add its facility code on the log-in page ("Signing in to a facility?"). The codes are printed when the demo seeder runs and are in `demo-accounts.txt` on the server.

## Status

Built: accounts and sign-in, the donor account (donate or get tested, appointments, alerts, reminders, profile, calls for you), facilities (registration, review, team, invites, check-in, lab results, walk-ins, records), blood requests and calls with SMS alerts in rings, blood drives (share card, interest list, day tracker, summary and CSV), and the super admin area (verification queue, facilities, settings, super admins, audit log, misuse flags, dashboard).

Mail and SMS are stand-ins in development (the server prints them; nothing is sent) until a provider is connected. API reference: `docs/api.md`. Deploying: see `deploy/README.md`. Demo data for a server: `seed:demo` in `apps/api` (tagged so it never touches real records).

Not built yet: withdrawing a yes from the app, the email alert channel, the facility-requests list for super admins, phone-width polish.
