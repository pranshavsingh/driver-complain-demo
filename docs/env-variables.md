# SSE Connect+ API Environment Variables Reference

This document provides a comprehensive specification of all environment variables used by `@driver-complaint/api`.

---

## 1. Core Runtime Configuration

| Variable | Type | Default | Required in Production | Description |
| :--- | :---: | :---: | :---: | :--- |
| `NODE_ENV` | Enum (`development` \| `test` \| `production`) | `development` | **Yes** | Defines Node runtime mode. When `production`, stack traces are hidden and security headers are enforced. |
| `PORT` | Integer | `4000` | No | Port on which the HTTP server listens. |
| `LOG_LEVEL` | Enum (`fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent`) | `info` | No | Log output verbosity level for Pino logger. |
| `UV_THREADPOOL_SIZE` | Integer | `2` | No | Libuv worker thread pool size for bcrypt, DNS, and filesystem I/O. Initialized via `src/bootstrap.ts` and tuned to 2 to match container 2-CPU Guaranteed allocation for native `@node-rs/bcrypt`. |

---

## 2. Database & Persistence

| Variable | Type | Default | Required in Production | Description |
| :--- | :---: | :---: | :---: | :--- |
| `DATABASE_URL` | String (URI) | - | **Yes** | PostgreSQL connection URL. In production, connect through PgBouncer or Neon pooler with SSL (`sslmode=require&connection_limit=20`). |

---

## 3. Authentication & JWT Tokens

| Variable | Type | Default | Required in Production | Description |
| :--- | :---: | :---: | :---: | :--- |
| `JWT_ACCESS_SECRET` | String (Min 16 chars) | - | **Yes** | Secret used to sign short-lived access JWT tokens. |
| `REFRESH_TOKEN_SECRET` | String (Min 16 chars) | - | **Yes** | Secret used to sign long-lived refresh tokens. |
| `ACCESS_TOKEN_TTL` | String | `15m` | No | Lifetime of access tokens (e.g. `15m`, `1h`). |
| `REFRESH_TOKEN_TTL` | String | `30d` | No | Lifetime of refresh tokens (e.g. `30d`, `60d`). |
| `JWT_ISSUER` | String | `driver-complaint` | No | Expected JWT issuer claim (`iss`). |
| `JWT_AUDIENCE` | String | `driver-complaint-api` | No | Expected JWT audience claim (`aud`). |

---

## 4. Telemetry & Metrics Security

| Variable | Type | Default | Required in Production | Description |
| :--- | :---: | :---: | :---: | :--- |
| `METRICS_AUTH_TOKEN` | String | - | Recommended | Secret token required to query `/metrics`. When set, requests must pass header `Authorization: Bearer <METRICS_AUTH_TOKEN>` or query `?token=<METRICS_AUTH_TOKEN>`. In production without a token, only localhost requests are allowed. |
| `SENTRY_DSN` | String (URI) | - | No | Sentry Project DSN for automated crash reporting and performance monitoring. |
| `SENTRY_ENVIRONMENT` | String | `development` | No | Deployment environment label reported to Sentry (`staging`, `production`). |
| `SENTRY_TRACES_SAMPLE_RATE` | Float (0.0 to 1.0) | `0.1` | No | Percentage of transactions captured for distributed tracing. |

---

## 5. Media & Storage (Cloudinary)

| Variable | Type | Default | Required in Production | Description |
| :--- | :---: | :---: | :---: | :--- |
| `CLOUDINARY_CLOUD_NAME` | String | - | **Yes** | Cloudinary cloud namespace. |
| `CLOUDINARY_API_KEY` | String | - | **Yes** | API key for Cloudinary authentication. |
| `CLOUDINARY_API_SECRET` | String | - | **Yes** | API secret for generating upload signatures and managing assets. |
| `CLOUDINARY_FOLDER` | String | `driver-complaint/local` | No | Root folder prefix inside Cloudinary for uploaded media. |

---

## 6. Realtime, Cache & Rate Limiting

| Variable | Type | Default | Required in Production | Description |
| :--- | :---: | :---: | :---: | :--- |
| `REDIS_URL` | String (URI) | - | Recommended | Redis connection URI (`redis://...` or `rediss://...` with TLS). Enables Socket.IO cross-pod broadcasting and distributed rate limiting. |
| `CORS_ORIGINS` | Comma-separated Strings | `http://localhost:3000` | **Yes** | Allowed origins for browser CORS headers (e.g. `https://admin.sseconnect.com`). |
| `LOGIN_RATE_LIMIT_MAX` | Integer | `5` | No | Maximum allowed failed login attempts before throttling. |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | Integer | `900000` (15 min) | No | Time window in milliseconds for login rate limit accumulation. |

---

## 7. Push Notifications (Firebase)

| Variable | Type | Default | Required in Production | Description |
| :--- | :---: | :---: | :---: | :--- |
| `FIREBASE_PROJECT_ID` | String | - | No | Firebase Project ID for FCM push notification delivery to mobile apps. |
| `FIREBASE_SERVICE_ACCOUNT` | JSON String | - | No | Service account credentials JSON string for Firebase Admin SDK. |

---

## 8. Infrastructure Sizing & Libuv Threadpool Tuning

### CPU Sizing Decision: 2 CPUs (Guaranteed QoS)
- **Container Allocation:** `requests.cpu: '2'`, `limits.cpu: '2'`, `requests.memory: 1Gi`, `limits.memory: 1Gi`.
- **Architectural Context & Contention:**
  - Bcrypt cost factor 12 is a CPU-intensive operation (~230 ms of continuous CPU execution per verification). The native `@node-rs/bcrypt` library offloads hashing to libuv worker threads.
  - On a 1-CPU container or under CPU contention with a lower request (e.g. 500m), CFS time-slicing starves the V8 main event loop, causing `/health` p99 latency to degrade to 35–50+ ms.
  - Setting requests equal to limits establishes `Guaranteed` QoS, which shields the pod from CFS share degradation. However, **Kubernetes Guaranteed QoS does not imply exclusive physical CPU pinning**; nodes without `cpuManagerPolicy=static` may still exhibit hyperthread sharing or Linux scheduling jitter.
  - **Sidecar Requirement:** If sidecars (e.g. Istio, Fluentbit) are introduced to the Pod, every container in the Pod must have matching CPU and memory requests and limits; otherwise, Kubernetes demotes the Pod QoS class to `Burstable`.
- **Infrastructure Cost & Capacity:**
  - *Baseline Footprint (3 replicas):* 6.0 vCPUs, 3 GiB RAM (~$180–$220/month on standard cloud compute). Accepted explicitly by operations to support native bcrypt concurrency.
  - *Peak Autoscaling (10 replicas via HPA):* 20.0 vCPUs, 10 GiB RAM.
  - *HPA Target:* `averageUtilization: 70%` corresponds to approximately 1.4 CPU per Pod before triggering horizontal scale-out.
  - *Node Planning:* Nodes must have $\ge 4\text{ vCPUs}$ (e.g. `c6i.xlarge` hosting 1-2 pods or `c6i.2xlarge` hosting 3 pods alongside daemonsets).

### Libuv Threadpool Bootstrap
- Libuv reads `UV_THREADPOOL_SIZE` only once when the worker pool is first created.
- In `@driver-complaint/api`, `src/bootstrap.ts` runs at process startup (via `--import ./src/bootstrap.ts` and as the first import in `src/index.ts` and `src/instrument.ts`) to configure `process.env.UV_THREADPOOL_SIZE = '2'` before any application dependencies or Sentry/OpenTelemetry can initialize libuv.
- Any deployment-level override (via Kubernetes `env` or `docker run -e UV_THREADPOOL_SIZE=...`) takes precedence and is strictly preserved.


