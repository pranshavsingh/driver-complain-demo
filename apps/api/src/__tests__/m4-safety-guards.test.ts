import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateUrlPreflight,
  sanitizeUrlForLogging,
  executeGuardedDatabaseReset,
} from '../../test/disposable-db-safety';

describe('M4 — Disposable Database Safety Preflight Guards', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('sanitizeUrlForLogging', () => {
    it('redacts passwords and usernames from valid connection URLs', () => {
      const sanitized = sanitizeUrlForLogging('postgresql://admin:super_secret_password@127.0.0.1:5432/postgres');
      expect(sanitized).toBe('postgresql://***@127.0.0.1:5432/postgres');
      expect(sanitized).not.toContain('super_secret_password');
    });

    it('handles URLs without user credentials safely', () => {
      const sanitized = sanitizeUrlForLogging('postgres://localhost:5432/driver_complaint_m4_disposable');
      expect(sanitized).toBe('postgres://localhost:5432/driver_complaint_m4_disposable');
    });

    it('returns a safe fallback string for malformed URLs without crashing', () => {
      expect(sanitizeUrlForLogging('invalid-url-format')).toBe('[REDACTED MALFORMED URL]');
    });
  });

  describe('validateUrlPreflight', () => {
    it('accepts valid localhost maintenance URL', () => {
      const url = validateUrlPreflight('postgresql://user:pass@127.0.0.1:5432/postgres', 'maintenance');
      expect(url.hostname).toBe('127.0.0.1');
      expect(url.pathname).toBe('/postgres');
    });

    it('accepts template1 as an alternative maintenance database', () => {
      const url = validateUrlPreflight('postgresql://localhost:5432/template1', 'maintenance');
      expect(url.pathname).toBe('/template1');
    });

    it('accepts valid disposable application database name', () => {
      const url = validateUrlPreflight('postgresql://localhost:5432/driver_complaint_m4_disposable', 'disposable_app');
      expect(url.pathname).toBe('/driver_complaint_m4_disposable');
    });

    it('rejects forbidden non-disposable database names for application role', () => {
      expect(() =>
        validateUrlPreflight('postgresql://127.0.0.1:5432/driver_complaint', 'disposable_app')
      ).toThrowError(/Application DB must strictly be "driver_complaint_m4_disposable"/);
    });

    it('rejects production application DATABASE_URL fallback', () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/driver_complaint';
      expect(() =>
        validateUrlPreflight('postgresql://localhost:5432/driver_complaint', 'disposable_app')
      ).toThrowError(/Cannot use production application DATABASE_URL/);
    });

    it('rejects cloud provider keywords in connection URL', () => {
      const cloudUrls = [
        'postgresql://user:pass@ep-cool-fog-1234.us-east-2.aws.neon.tech:5432/driver_complaint_m4_disposable',
        'postgresql://user:pass@mydb.rds.amazonaws.com:5432/driver_complaint_m4_disposable',
        'postgresql://user:pass@db.xyz.supabase.co:5432/driver_complaint_m4_disposable',
      ];
      for (const url of cloudUrls) {
        expect(() => validateUrlPreflight(url, 'disposable_app')).toThrowError(/prohibited keyword/);
      }
    });

    it('rejects production and staging keywords in connection URL', () => {
      expect(() =>
        validateUrlPreflight('postgresql://localhost:5432/driver_complaint_prod', 'disposable_app')
      ).toThrowError(/prohibited keyword/);

      expect(() =>
        validateUrlPreflight('postgresql://localhost:5432/driver_complaint_staging', 'disposable_app')
      ).toThrowError(/prohibited keyword/);
    });

    it('rejects remote hosts and non-loopback IP addresses', () => {
      expect(() =>
        validateUrlPreflight('postgresql://192.168.1.50:5432/driver_complaint_m4_disposable', 'disposable_app')
      ).toThrowError(/Host must strictly be localhost or 127.0.0.1/);
    });

    it('rejects non-standard ports unless explicitly configured in M4_TEST_DB_PORT', () => {
      expect(() =>
        validateUrlPreflight('postgresql://127.0.0.1:5433/driver_complaint_m4_disposable', 'disposable_app')
      ).toThrowError(/Port must strictly be 5432/);
    });

    it('rejects invalid database protocols (e.g. mysql, http)', () => {
      expect(() =>
        validateUrlPreflight('mysql://localhost:5432/driver_complaint_m4_disposable', 'disposable_app')
      ).toThrowError(/Protocol must be postgresql: or postgres:/);
    });
  });

  describe('executeGuardedDatabaseReset Preflight Checks', () => {
    it('aborts immediately before connection if M4_ALLOW_DESTRUCTIVE_TEST_DB is not true', async () => {
      process.env.M4_ALLOW_DESTRUCTIVE_TEST_DB = 'false';

      await expect(
        executeGuardedDatabaseReset({
          maintenanceUrl: 'postgresql://localhost:5432/postgres',
          disposableAppUrl: 'postgresql://localhost:5432/driver_complaint_m4_disposable',
          expectedClusterSysId: '7412345678901234567',
        })
      ).rejects.toThrowError(/M4_ALLOW_DESTRUCTIVE_TEST_DB must be strictly set to "true"/);
    });

    it('aborts immediately if expectedClusterSysId is missing, empty, or too short', async () => {
      process.env.M4_ALLOW_DESTRUCTIVE_TEST_DB = 'true';

      await expect(
        executeGuardedDatabaseReset({
          maintenanceUrl: 'postgresql://localhost:5432/postgres',
          disposableAppUrl: 'postgresql://localhost:5432/driver_complaint_m4_disposable',
          expectedClusterSysId: '   ',
        })
      ).rejects.toThrowError(/Mandatory expected cluster system_identifier must be provided/);
    });

    it('aborts before any database action if application URL fails validation', async () => {
      process.env.M4_ALLOW_DESTRUCTIVE_TEST_DB = 'true';

      await expect(
        executeGuardedDatabaseReset({
          maintenanceUrl: 'postgresql://localhost:5432/postgres',
          disposableAppUrl: 'postgresql://remote-host:5432/driver_complaint_m4_disposable',
          expectedClusterSysId: '7412345678901234567',
        })
      ).rejects.toThrowError(/Host must strictly be localhost or 127.0.0.1/);
    });
  });
});

