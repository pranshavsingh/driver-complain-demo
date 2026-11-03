process.env.DATABASE_URL = 'postgresql://app:app@127.0.0.1:5432/driver_complaint_m4_disposable?schema=public';

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { signAccessToken } from '../lib/jwt';

describe('M4 — Endpoint Compatibility & Response Envelopes', () => {
  const app = createApp();
  let adminToken: string;

  beforeAll(async () => {
    // Generate valid token for ADMIN
    const adminUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    adminToken = await signAccessToken({
      sub: adminUserId,
      role: 'ADMIN',
      employeeId: 'EMP-ADM-01',
    });
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
    });

    it('GET /api/v1/loading returns a legacy envelope with array of records', async () => {
      const res = await request(app)
        .get('/api/v1/loading')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.data)).toBe(true);
    });

    it('GET /api/v1/loading/trips returns paginated trips with X- headers', async () => {
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
    it('exposes all pagination headers in CORS preflight', async () => {
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
    });
  });
});
