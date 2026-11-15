# DamuLink app notes

- Fresh build of DamuLink in this repo, step by step, one commit per step. Source of truth for look and flows: the prototype (`damulink-prototype` repo, mocks) and its `planning.md`. Plans for the stack: `plans/` (local, not in git).
- **The mocks are the prototype, so build every screen to match its mock.** Before writing or changing any page, open its mock (`~/Desktop/claude/damudrop/mock/<name>.html`, states by URL hash) and copy its layout, spacing, classes, copy and states. After building, screenshot the mock and the page side by side and fix the differences. Do not invent a layout, and do not add UI the mock lacks unless Ansel asked (then place it so the mock layout still holds). Public pages count too.
- Stack: Hono on Node (`apps/api`), SvelteKit with adapter-node (`apps/web`, later), Drizzle on MariaDB (`packages/db`), zod schemas in `packages/shared-types`.
- Tests first, feature tests only (HTTP level through the Hono app, real MariaDB, real migrations). `pnpm check` must be green. UI is checked by hand in a browser.
- Never print `.env` or any credential. Never add a dev-auth bypass. The one development aid is `OTP_FIXED_CODE` (every phone code becomes that value): it lives only in the local `.env`, and the server refuses to start with it in production or when `APP_URL` is not localhost. JWT in the `X-Auth` header, HS256 pinned, never session cookies.
- The product name is read from `BRAND` (`packages/shared-types/src/brand.ts`). Do not write the name in product source.
- Fictional data only. UTC for storage, Africa/Nairobi for display.
- Ask before: any push, any deploy, any remote resource.
