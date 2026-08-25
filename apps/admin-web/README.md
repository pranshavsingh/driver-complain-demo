# admin-web

The **admin dashboard** — React + Vite + TypeScript, a plain SPA. Admins and super-admins
triage complaints, change statuses, assign owners, read the audit trail, and export to Excel.

## Running it

```bash
cp .env.example .env          # then edit VITE_API_URL if the API is not on :4000
pnpm install                  # from the repo root
pnpm --filter @driver-complaint/admin-web dev
```

Opens on <http://localhost:3000> with `strictPort`. That port is not cosmetic: it is the
API's default `CORS_ORIGINS` value, so a fresh clone works with no env editing, and failing
loudly beats silently moving to 3001 where every API call would be CORS-blocked.

There is **no dev proxy**. The dev server talks to the API cross-origin exactly as the
deployed dashboard will, so CORS problems surface here instead of in production.

## Scripts

| Script      | What it does                                  |
| ----------- | --------------------------------------------- |
| `dev`       | Vite dev server on :3000                      |
| `build`     | `tsc --noEmit` then `vite build` → `dist/`    |
| `preview`   | Serve the built `dist/` locally               |
| `typecheck` | `tsc --noEmit`                                |
| `lint`      | ESLint (root flat config + react-hooks rules) |

## Environment

Only one variable, in `.env`:

```
VITE_API_URL=http://localhost:4000
```

**Every `VITE_`-prefixed variable is inlined into the JavaScript bundle and is therefore
public.** Never put a secret here — no API keys, no service accounts. `src/config/env.ts`
validates it with zod at module load, so a misconfigured deploy fails visibly rather than
firing requests at `undefined/api/v1`.

## Structure

```
src/
  api/        client.ts (fetch + auth + refresh), endpoints.ts, tokens.ts
  auth/       AuthContext.tsx, RequireAdmin.tsx
  realtime/   RealtimeProvider.tsx  (one Socket.IO connection)
  components/ Layout, Badges, ErrorBanner, ErrorBoundary, Pagination
  pages/      LoginPage, ComplaintsListPage, ComplaintDetailPage, NotFoundPage
  hooks/      useApiResource, useDebouncedValue
  lib/        format.ts
  config/     env.ts
```

Two error paths, deliberately separate: **`ErrorBanner`** shows a failed request (the screen still
works — retry the action), **`ErrorBoundary`** catches a render-time throw so one broken screen
does not blank the dashboard. The in-shell boundary is keyed by pathname, so the header stays
usable and navigating away clears the error; a second boundary sits above the providers.

## How auth works

- **Access token in memory** (a module variable) — gone on reload, never in storage.
- **Refresh token in `localStorage`** so a reload does not force a re-login.
- On any `401`, the fetch wrapper refreshes once and replays the request. The refresh is
  **single-flight**: the API rotates refresh tokens and treats reuse as theft, so two parallel
  refreshes would revoke the whole token family and log the admin out.
- **Known tradeoff:** a refresh token in `localStorage` is readable by any XSS on this origin.
  The fix is an `httpOnly; Secure; SameSite=Strict` cookie, which needs cookie parsing and CSRF
  protection on the API. Tracked as a follow-up, not done in the MVP.

Route guarding (`RequireAdmin`) is **UX, not security**. Every endpoint behind it runs its own
`authenticate` + `requireRole` check, so a bypassed guard yields 401s and 403s, not access.

## Realtime

One Socket.IO connection for the whole app, authenticated with the current access token on
every (re)connect. Events are **live hints, not the source of truth** — each one has a durable
`Notification` row behind it, and the screens re-fetch over REST when they act on an event. A
dropped connection degrades the dashboard to "manual refresh", never to "wrong data". The
header shows `Live` / `Offline`.

The complaints list shows a "N live updates — Refresh now" banner instead of re-fetching
itself, so rows never renumber under the cursor mid-triage. The detail page re-fetches
immediately, since there is nothing there to disturb.

**Known gap in the API's event routing, not in this app:** `COMPLAINT_CREATED` goes to all
active admins, but `STATUS_CHANGED` goes only to the driver and `ASSIGNED` only to the assignee.
So two admins with the same complaint open do **not** see each other's status changes live —
they see them on the next refresh. Fixing it means deciding whether other admins should also get
durable `Notification` rows (which would fill the notification centre with each other's work) or
whether the dashboard needs a separate broadcast channel with no rows behind it. Left as an API
decision rather than papered over here.

## Deploying (Vercel)

`vercel.json` rewrites all paths to `/index.html` — without it, a hard refresh on
`/complaints/<id>` is a 404 from the static host. Build command `pnpm build`, output `dist`,
and set `VITE_API_URL` to the deployed API. Add that dashboard origin to the API's
`CORS_ORIGINS`.

## Not implemented here

- **FCM Web Push.** Admins get live updates over Socket.IO while the dashboard is open. Push
  to a closed browser needs a service worker plus the user's Firebase project; FCM is
  mobile-only for now.
- Notification centre UI (`GET /api/v1/notifications` exists and is unused here).
- Creating/editing drivers, vehicles or admins — the seed and the API cover that.
- Automated tests. Verified manually against the running API; see the phase report.
