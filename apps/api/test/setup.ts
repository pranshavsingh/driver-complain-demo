process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_UAMvij9m5xfd@ep-soft-water-aygahi7e.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15&pool_timeout=15';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-0123456789abcdef';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL = '30d';
process.env.LOG_LEVEL = 'silent';

// Ensure required env vars exist before any module imports config/env.
// Real values (CI, local .env) take precedence — these are safe test fallbacks.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://neondb_owner:npg_UAMvij9m5xfd@ep-soft-water-aygahi7e.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15&pool_timeout=15';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-0123456789abcdef';
process.env.ACCESS_TOKEN_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL ??= '30d';
process.env.LOG_LEVEL ??= 'silent';
