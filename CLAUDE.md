# DamuLink app notes

- Fresh build of DamuLink in this repo, step by step, one commit per step. Source of truth for look and flows: the prototype (`damulink-prototype` repo, mocks) and its `planning.md`. Plans for the stack: `plans/` (local, not in git).
- Stack: Hono on Node (`apps/api`), SvelteKit with adapter-node (`apps/web`, later), Drizzle on MariaDB (`packages/db`), zod schemas in `packages/shared-types`.
- Tests first, feature tests only (HTTP level through the Hono app, real MariaDB, real migrations). `pnpm check` must be green. UI is checked by hand in a browser.
- Never print `.env` or any credential. Never add a dev-auth bypass. The one development aid is `OTP_FIXED_CODE` (every phone code becomes that value): it lives only in the local `.env`, and the server refuses to start with it in production or when `APP_URL` is not localhost. JWT in the `X-Auth` header, HS256 pinned, never session cookies.
- The product name is read from `BRAND` (`packages/shared-types/src/brand.ts`). Do not write the name in product source.
- Fictional data only. UTC for storage, Africa/Nairobi for display.
- Ask before: any push, any deploy, any remote resource.
