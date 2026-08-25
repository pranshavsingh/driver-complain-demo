# Driver Complaint

A monorepo for the Driver Complaint system: drivers file complaints (with photo/document
attachments), admins triage and update them, and users are notified. Roles: `driver`,
`admin`, `super_admin`.

## Stack

| Area             | Tech                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| Monorepo         | pnpm workspaces + Turborepo                                            |
| Language         | TypeScript (ESM)                                                       |
| API              | Express 5 + Prisma + PostgreSQL                                        |
| Admin dashboard  | React + Vite (SPA)                                                     |
| Driver app       | Expo + React Native                                                    |
| Shared contracts | `@driver-complaint/shared-types` (zod schemas → inferred types)        |
| Auth             | JWT (Employee ID + PIN), refresh-token rotation, role-based middleware |
| Attachments      | Cloudinary                                                             |
| Realtime         | Socket.IO (dashboard) + FCM push (mobile)                              |
| Export           | ExcelJS (`.xlsx`)                                                      |
| Errors           | Sentry                                                                 |
| Tests            | Vitest + supertest                                                     |

## Layout

```
apps/
  api/          # Express + Prisma API
  admin-web/    # React + Vite dashboard for admins        → apps/admin-web/README.md
  mobile/       # Expo driver app (dev build, native FCM)  → apps/mobile/README.md
packages/
  shared-types/ # zod schemas + inferred DTOs/enums shared across apps
```

Each app's README covers running it, its environment variables, and what it does **not** do.

## Prerequisites

- **Node 24** (`.nvmrc`)
- **pnpm 10** — provisioned via corepack (`corepack enable`, or `corepack pnpm@10 ...`)
- **Docker** — runs local PostgreSQL

> On Windows, if `corepack enable` fails with `EPERM` (can't write shims into
> `C:\Program Files\nodejs`), invoke pnpm through the corepack proxy instead, e.g.
> `corepack pnpm@10.15.0 install`.

## Bootstrap (empty checkout → running API)

```bash
# 1. install workspace dependencies
corepack pnpm@10.15.0 install

# 2. build shared-types (the API typechecks against its dist + .d.ts)
corepack pnpm@10.15.0 --filter @driver-complaint/shared-types build

# 3. create the API env file, then fill in secrets / Cloudinary creds
cp apps/api/.env.example apps/api/.env

# 4. start PostgreSQL
docker compose up -d db

# 5. create + apply the initial migration and generate the Prisma client
corepack pnpm@10.15.0 --filter @driver-complaint/api exec prisma migrate dev --name init

# 6. seed baseline users (super_admin, admin, driver + vehicle)
corepack pnpm@10.15.0 --filter @driver-complaint/api run seed

# 7. run the API
corepack pnpm@10.15.0 --filter @driver-complaint/api dev
# health check:
curl http://localhost:4000/health   # -> {"ok":true}
```

## Seeded accounts & auth quickstart

The seed creates three users, all with **PIN `2468`**:

| Employee ID | Role                 |
| ----------- | -------------------- |
| `E0001`     | `super_admin`        |
| `E0002`     | `admin`              |
| `E1001`     | `driver` (+ vehicle) |

```bash
# log in → { accessToken, refreshToken, expiresIn, user }
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"employeeId":"E0001","pin":"2468"}'

# use the access token
curl -s http://localhost:4000/api/v1/users/me -H 'authorization: Bearer <accessToken>'

# rotate — returns a NEW pair; replaying the old refresh token 401s and revokes the family
curl -s -X POST http://localhost:4000/api/v1/auth/refresh \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

## Common scripts (from the repo root)

```bash
corepack pnpm@10.15.0 build        # turbo run build
corepack pnpm@10.15.0 typecheck    # turbo run typecheck
corepack pnpm@10.15.0 lint         # turbo run lint
corepack pnpm@10.15.0 test         # turbo run test
corepack pnpm@10.15.0 format       # prettier --write .
```

## Environments

Local / staging / production differ only by host-injected environment variables:

- **`DATABASE_URL`** — a separate PostgreSQL database per environment
- **`CLOUDINARY_FOLDER`** — `driver-complaint/{local,staging,prod}` for asset isolation
- **`SENTRY_ENVIRONMENT`** — segments Sentry issues

`NODE_ENV=production` is used for both staging and production; the environment identity lives
in `SENTRY_ENVIRONMENT` / `CLOUDINARY_FOLDER`, not `NODE_ENV`. See `apps/api/.env.example`.
