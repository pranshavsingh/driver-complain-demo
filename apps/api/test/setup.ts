// Ensure required env vars exist before any module imports config/env.
// Real values (CI, local .env) take precedence — these are safe test fallbacks.
process.env.NODE_ENV ??= 'test';
process.env.M4_ALLOW_DESTRUCTIVE_TEST_DB ??= 'true';
process.env.M4_EXPECTED_TEST_SYSTEM_IDENTIFIER ??= 'mysql-ci-cluster-id-12345';
process.env.M4_TEST_DISPOSABLE_DB_URL ??=
  'mysql://app:app@127.0.0.1:3306/driver_complaint_m4_disposable';
process.env.DATABASE_URL ??= process.env.M4_TEST_DISPOSABLE_DB_URL;
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-0123456789abcdef';
process.env.ACCESS_TOKEN_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL ??= '30d';
process.env.LOG_LEVEL ??= 'silent';
