// Ensure required env vars exist before any module imports config/env.
// Real values (CI, local .env) take precedence — these are safe test fallbacks.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://app:app@localhost:5432/driver_complaint?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-0123456789abcdef';
process.env.ACCESS_TOKEN_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL ??= '30d';
process.env.LOG_LEVEL ??= 'silent';
