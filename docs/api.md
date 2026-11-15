# API guide

The API is a Hono app on Node (`apps/api`). Every endpoint is listed in [api-endpoints.md](api-endpoints.md), which is generated from the route files. This page is the rules that apply to all of them.

- Base path: `/api`. Health check: `GET /api/health` returns `{ "ok": true, "app": "...", "time": "..." }` and fails if the database is down.
- Bodies and responses are JSON (`Content-Type: application/json`). The one exception is the SMS webhook, which also accepts a form body.
- Request and response shapes live in `packages/shared-types` (zod schemas and TypeScript types), shared with the web app. A route validates its input with the matching schema.
- Every response carries `X-Request-Id`. Quote it when reporting a problem; the same id is in the server log.

## Authentication

- Sign in with `POST /api/auth/login` (email and password; add `facilityCode` to sign in to a facility). The response has `accessToken`, `refreshToken` and the `user`.
- Send the access token in the **`X-Auth`** header on every protected call. It is a JWT (HS256, algorithm pinned). `Authorization` is not used.
- The access token lives **15 minutes**. When a call answers `401 token_expired`, call `POST /api/auth/refresh` with `{ refreshToken }` to get a new pair. A refresh token lives **30 days** and is single use (it rotates); only a hash of it is stored.
- Tokens are checked against the user on every call: a changed password or `POST /api/auth/logout-all` bumps `token_version` and kills live tokens at once; a suspended account gets `403 suspended`.
- Roles:
  - **donor / any signed-in account**: `/api/me`, `/api/donor/calls`, `/api/requests`.
  - **facility member**: `/api/my-facilities/:id/...`. The caller must belong to that facility. Facility admins can do everything; attendants need the matching permission (for example approving requests or publishing calls).
  - **super admin**: `/api/admin/...`.
  - **public**: `/api/public/...`, `/api/facilities` search, and the auth, invite and webhook routes. Public routes never return patient, requester or donor details, and never a full phone number.
- The cron and SMS webhook routes take a shared key in the query string (`?key=`) instead of a token; they are for the server and the SMS provider only.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "invalid_input", "message": "Please check the highlighted fields.", "fields": { "neededBy": "Choose a time in the future" } } }
```

`fields` appears on validation errors (and some conflicts) and maps a field name to a message fit to show beside it. `code` is stable and meant for code; `message` is meant for people.

| Status | Meaning | Common codes |
|---|---|---|
| 400 | Body is not valid JSON | `bad_json` |
| 401 | Not signed in or token not accepted | `unauthenticated`, `invalid_token`, `token_expired`, `token_revoked`, `invalid_refresh` |
| 403 | Signed in but not allowed | `forbidden`, `suspended`, `locked`, `not_admin`, `admins_only`, `not_a_donor`, `not_verified`, `email_not_verified`, `phone_not_verified`, `facility_not_verified` |
| 404 | Not found, or not visible to this caller (the two look the same) | `not_found` |
| 409 | The action conflicts with the current state | `account_exists`, `email_taken`, `phone_taken`, `duplicate`, `already_done`, `invalid_move`, `closed`, `covered`, `not_eligible`, `last_admin`, `is_admin` |
| 422 | Input failed validation | `invalid_input` |
| 429 | Rate limited | `too_many_requests`, `daily_limit` |
| 500 | Unexpected; details only in the server log | `internal` |

Unknown routes answer `404 not_found`. Responses that must not reveal whether an account exists (login, password reset, the SMS webhook) answer the same way either way.

## Formats

- **Dates**: calendar dates are `YYYY-MM-DD`. Moments are ISO 8601 in UTC (`2026-11-14T08:00:00.000Z`). The interface shows Africa/Nairobi time; the API never does.
- **Ids**: 26-character sortable ids for rows. People see short codes instead: `CALL-0187`, `REQ-0044`, donor codes and facility codes. Calls and drives also have a short link code used in `/c/<short>` and `/d/<short>`.
- **Phones**: stored and returned as E.164 (`+2547...`). Other people's numbers are masked (`+254 7•• ••• 733`) except where the facility is entitled to see one (a donor who replied YES).
- **Blood types**: `A+ A- B+ B- AB+ AB- O+ O-`.
- **Paging**: list endpoints that page take `page` (from 1) and return `{ items, total, page, pageSize }`.

## Limits

Sensitive endpoints are rate limited per IP or per account and answer `429`. Examples: sign-in failures (5 in 15 minutes per account), public listings (60 a minute per IP), the SMS webhook (120 a minute per IP), requests per requester per day (a setting, default 3). Limits that are settings can be changed under the super admin **System settings** page.

## Side effects worth knowing

- Writing actions by facility members and super admins are recorded in the **audit log** (`GET /api/admin/audit`). Entries are append-only.
- SMS and email go through stand-in drivers in development: the server prints them and nothing is sent. Production uses the configured providers.
- `POST /api/cron/tick` runs the scheduled work (expire calls, send due alert rings, close stale drives, raise misuse flags). In production a timer calls it every few minutes.

## Keeping this current

`node scripts/api-docs.mjs` regenerates [api-endpoints.md](api-endpoints.md). If you add a route file, add it to the list at the top of that script; it warns about route files it does not know.
