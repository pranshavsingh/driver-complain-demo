process.env.DATABASE_URL = 'postgresql://app:app@127.0.0.1:5432/driver_complaint_m4_disposable?schema=public';
process.env.M4_ALLOW_DESTRUCTIVE_TEST_DB = 'true';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app';
import { signAccessToken } from '../lib/jwt';
import { assertDestructiveTestDbSafety } from '../../test/disposable-db-safety';

describe('M4 — Endpoint Compatibility & Response Envelopes', () => {
  const app = createApp();
  let db: PrismaClient;
  let adminToken: string;
  let superAdminToken: string;
  let driverToken: string;

  // Targeted fixture IDs for driver & vehicle mine test
  const MINE_TEST_USER_ID = '99999999-9999-4000-8000-999999999991';
  const MINE_TEST_DRIVER_ID = '99999999-9999-4000-8000-999999999992';
  const MINE_TEST_VEHICLE_ID = '99999999-9999-4000-8000-999999999993';
  const COMPAT_ADMIN_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  async function cleanupTargetedFixtures(): Promise<void> {
    if (!db) return;
    await db.vehicle.deleteMany({ where: { id: MINE_TEST_VEHICLE_ID } });
    await db.driver.deleteMany({ where: { id: MINE_TEST_DRIVER_ID } });
    await db.user.deleteMany({ where: { id: { in: [MINE_TEST_USER_ID, COMPAT_ADMIN_USER_ID] } } });
  }

  beforeAll(async () => {
    // 1. Safety validation on test database connection
    db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    await db.$connect();

    await assertDestructiveTestDbSafety(db, process.env.DATABASE_URL ?? '');

    // 2. Clean up previous test fixtures
    await cleanupTargetedFixtures();

    // 3. Create Admin user in DB and generate valid tokens
    await db.user.create({
      data: {
        id: COMPAT_ADMIN_USER_ID,
        email: 'admin-compat-test@example.com',
        phone: '9999988881',
        firstName: 'Adam',
        lastName: 'Admin',
        employeeId: 'EMP-ADM-01',
        role: 'ADMIN',
        approvalStatus: 'APPROVED',
        pinHash: 'dummy',
      },
    });

    adminToken = await signAccessToken({
      sub: COMPAT_ADMIN_USER_ID,
      role: 'ADMIN',
      employeeId: 'EMP-ADM-01',
    });

    const superAdminUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    superAdminToken = await signAccessToken({
      sub: superAdminUserId,
      role: 'SUPER_ADMIN',
      employeeId: 'EMP-SADM-01',
    });

    // 4. Create a valid driver user with profile and assigned vehicle for /vehicles/mine test
    const driverUser = await db.user.create({
      data: {
        id: MINE_TEST_USER_ID,
        email: 'driver-mine-test@example.com',
        phone: '9999988880',
        firstName: 'Dinesh',
        lastName: 'Driver',
        employeeId: 'DRV-MINE-01',
        role: 'DRIVER',
        approvalStatus: 'APPROVED',
        pinHash: 'dummy',
      },
    });

    const driver = await db.driver.create({
      data: {
        id: MINE_TEST_DRIVER_ID,
        userId: driverUser.id,
        licenseNumber: 'DL-MINE-001',
      },
    });

    await db.vehicle.create({
      data: {
        id: MINE_TEST_VEHICLE_ID,
        plateNumber: 'KA-01-MINE-001',
        make: 'Volvo',
        model: 'FH16',
        year: 2024,
        vin: 'VIN-MINE-001',
        driverId: driver.id,
      },
    });

    driverToken = await signAccessToken({
      sub: driverUser.id,
      role: 'DRIVER',
      employeeId: 'DRV-MINE-01',
    });
  });

  afterAll(async () => {
    await cleanupTargetedFixtures();
    if (db) {
      await db.$disconnect();
    }
  });

  describe('Legacy Array Responses (Default / Backward Compatibility)', () => {
    it('GET /api/v1/vehicles returns a pure JSON array in res.body.data by default', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Pagination headers present
      expect(res.headers['x-total-count']).toBeDefined();
      expect(res.headers['x-page']).toBe('1');
      expect(res.headers['x-page-size']).toBe('250');
      expect(res.headers['x-total-pages']).toBeDefined();
      expect(res.headers['x-has-next-page']).toBeDefined();
      expect(res.headers['x-has-prev-page']).toBe('false');
    });

    it('GET /api/v1/drivers returns a pure JSON array in res.body.data by default', async () => {
      const res = await request(app)
        .get('/api/v1/drivers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.headers['x-total-count']).toBeDefined();
      expect(res.headers['x-page']).toBe('1');
      expect(res.headers['x-page-size']).toBe('250');
      expect(res.headers['x-has-prev-page']).toBe('false');
    });

    it('GET /api/v1/users returns a pure JSON array in res.body.data by default', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.headers['x-total-count']).toBeDefined();
      expect(res.headers['x-page']).toBe('1');
      expect(res.headers['x-page-size']).toBe('250');
      expect(res.headers['x-has-prev-page']).toBe('false');
    });

    it('GET /api/v1/loading returns a legacy envelope with array of records', async () => {
      const res = await request(app)
        .get('/api/v1/loading')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
    });

    it('GET /api/v1/loading/trips returns paginated trips with all X- headers including X-Has-Prev-Page', async () => {
      const res = await request(app)
        .get('/api/v1/loading/trips')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.meta).toBeDefined();
      expect(res.headers['x-total-count']).toBeDefined();
      expect(res.headers['x-page']).toBe('1');
      expect(res.headers['x-has-next-page']).toBeDefined();
      expect(res.headers['x-has-prev-page']).toBe('false');
    });
  });

  describe('Opt-in Pagination (?paginate=true)', () => {
    it('GET /api/v1/vehicles?paginate=true returns { data, pagination } envelope', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles?paginate=true&page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.pageSize).toBe(10);
      expect(typeof res.body.data.pagination.total).toBe('number');
      expect(typeof res.body.data.pagination.totalPages).toBe('number');
      expect(typeof res.body.data.pagination.hasNextPage).toBe('boolean');
      expect(res.body.data.pagination.hasPrevPage).toBe(false);
    });

    it('GET /api/v1/drivers?paginate=true returns { data, pagination } envelope', async () => {
      const res = await request(app)
        .get('/api/v1/drivers?paginate=true&page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.pageSize).toBe(10);
      expect(typeof res.body.data.pagination.total).toBe('number');
      expect(typeof res.body.data.pagination.totalPages).toBe('number');
      expect(typeof res.body.data.pagination.hasNextPage).toBe('boolean');
      expect(res.body.data.pagination.hasPrevPage).toBe(false);
    });

    it('GET /api/v1/users?paginate=true returns { data, pagination } envelope', async () => {
      const res = await request(app)
        .get('/api/v1/users?paginate=true&page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.pageSize).toBe(10);
      expect(typeof res.body.data.pagination.total).toBe('number');
      expect(typeof res.body.data.pagination.totalPages).toBe('number');
      expect(typeof res.body.data.pagination.hasNextPage).toBe('boolean');
      expect(res.body.data.pagination.hasPrevPage).toBe(false);
    });
  });

  describe('Consistent Pagination Metadata Shape Across Endpoints', () => {
    it('verifies identical metadata keys across vehicles, drivers, users, and trips', async () => {
      const [vRes, dRes, uRes, tRes] = await Promise.all([
        request(app).get('/api/v1/vehicles?paginate=true&pageSize=5').set('Authorization', `Bearer ${adminToken}`),
        request(app).get('/api/v1/drivers?paginate=true&pageSize=5').set('Authorization', `Bearer ${adminToken}`),
        request(app).get('/api/v1/users?paginate=true&pageSize=5').set('Authorization', `Bearer ${adminToken}`),
        request(app).get('/api/v1/loading/trips?pageSize=5').set('Authorization', `Bearer ${adminToken}`),
      ]);

      const expectedKeys = ['page', 'pageSize', 'total', 'totalPages', 'hasNextPage', 'hasPrevPage'];

      const vMeta = vRes.body.data.pagination;
      const dMeta = dRes.body.data.pagination;
      const uMeta = uRes.body.data.pagination;
      const tMeta = tRes.body.data.meta;

      for (const key of expectedKeys) {
        expect(vMeta[key]).toBeDefined();
        expect(dMeta[key]).toBeDefined();
        expect(uMeta[key]).toBeDefined();
        expect(tMeta[key]).toBeDefined();
      }
    });
  });

  describe('Page Boundaries and Empty Results', () => {
    it('returns empty array and accurate boundary headers when requesting page beyond totalPages', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles?page=9999&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.headers['x-page']).toBe('9999');
      expect(res.headers['x-has-next-page']).toBe('false');
      expect(res.headers['x-has-prev-page']).toBe('true');
    });

    it('returns empty data array with full pagination metadata when paginate=true on page beyond totalPages', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles?paginate=true&page=9999&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toEqual([]);
      expect(res.body.data.pagination.page).toBe(9999);
      expect(res.body.data.pagination.pageSize).toBe(10);
      expect(res.body.data.pagination.hasNextPage).toBe(false);
      expect(res.body.data.pagination.hasPrevPage).toBe(true);
    });
  });

  describe('Existing Filtering and Deterministic Sorting Behavior', () => {
    it('GET /api/v1/users?role=ADMIN returns only ADMIN accounts for SuperAdmin', async () => {
      const res = await request(app)
        .get('/api/v1/users?role=ADMIN')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      for (const u of res.body.data) {
        expect(u.role).toBe('ADMIN');
      }
    });

    it('GET /api/v1/vehicles returns deterministic ordering by createdAt DESC, id DESC', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles?pageSize=50')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const items = res.body.data;
      for (let i = 0; i < items.length - 1; i++) {
        const curDate = new Date(items[i].createdAt).getTime();
        const nextDate = new Date(items[i + 1].createdAt).getTime();
        expect(curDate >= nextDate).toBe(true);
        if (curDate === nextDate) {
          expect(items[i].id >= items[i + 1].id).toBe(true);
        }
      }
    });
  });

  describe('DoS Protection & 250-Record Hard Cap', () => {
    it('clamps requested pageSize > 250 down to MAX_PAGE_SIZE (250) on /vehicles', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles?pageSize=5000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-page-size']).toBe('250');
    });

    it('clamps requested pageSize > 250 down to MAX_PAGE_SIZE (250) on /drivers', async () => {
      const res = await request(app)
        .get('/api/v1/drivers?pageSize=9999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-page-size']).toBe('250');
    });

    it('clamps requested pageSize > 250 down to MAX_PAGE_SIZE (250) on /users', async () => {
      const res = await request(app)
        .get('/api/v1/users?pageSize=1000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-page-size']).toBe('250');
    });
  });

  describe('Specialized Unpaginated Dropdown Endpoints', () => {
    it('GET /api/v1/users/admins retains pure array response for assignment dropdowns', async () => {
      const res = await request(app)
        .get('/api/v1/users/admins')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Unpaginated: no pagination envelope or metadata in body
      expect(res.body.data.pagination).toBeUndefined();
    });

    it('GET /api/v1/vehicles/mine returns 200 with pure array for authenticated driver with assigned vehicle', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles/mine')
        .set('Authorization', `Bearer ${driverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((v: any) => v.plateNumber === 'KA-01-MINE-001')).toBe(true);
      // Unpaginated contract preserved for vehicle selector dropdown
      expect(res.body.data.pagination).toBeUndefined();
    });

    it('GET /api/v1/vehicles/mine rejects non-driver accounts with 400', async () => {
      // Admin account has no driver record
      const res = await request(app)
        .get('/api/v1/vehicles/mine')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('driver profile');
    });
  });

  describe('CORS Exposed Headers', () => {
    it('exposes all pagination headers including X-Has-Prev-Page in CORS preflight', async () => {
      const res = await request(app)
        .options('/api/v1/vehicles')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.status).toBe(204);
      const exposed = res.headers['access-control-expose-headers'];
      expect(exposed).toContain('X-Total-Count');
      expect(exposed).toContain('X-Page');
      expect(exposed).toContain('X-Page-Size');
      expect(exposed).toContain('X-Total-Pages');
      expect(exposed).toContain('X-Has-Next-Page');
      expect(exposed).toContain('X-Has-Prev-Page');
    });
  });
});
