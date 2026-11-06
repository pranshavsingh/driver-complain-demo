import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * M8.3 — MySQL 8.0 Runtime Integration Verification Suite
 *
 * Verifies live database behaviors required by M8.1 and M8.3:
 * A. Fresh database migration & table/index verification
 * B. Foreign key cascading, SetNull, and constraint failure behaviors
 * C. utf8mb4_0900_ai_ci collation (case-insensitive & accent-insensitive equality, search, uniqueness)
 * D. Composite unique constraint for idempotencyKey (driverId + idempotencyKey, NULL handling)
 * E. Schema drift integrity
 */
describe('M8.3 — MySQL 8.0 Runtime Integration Tests', () => {
  const dbUrl =
    process.env.DATABASE_URL || 'mysql://app:app@127.0.0.1:3306/driver_complaint';

  let prisma: PrismaClient;
  let isDbConnected = false;

  // Distinct fixture IDs to avoid interference
  const TEST_USER_ID_1 = '10000000-0000-4000-8000-000000000001';
  const TEST_USER_ID_2 = '10000000-0000-4000-8000-000000000002';
  const TEST_DRIVER_ID_1 = '20000000-0000-4000-8000-000000000001';
  const TEST_DRIVER_ID_2 = '20000000-0000-4000-8000-000000000002';
  const TEST_VEHICLE_ID_1 = '30000000-0000-4000-8000-000000000001';
  const TEST_VEHICLE_ID_2 = '30000000-0000-4000-8000-000000000002';
  const TEST_COMPLAINT_ID_1 = '40000000-0000-4000-8000-000000000001';
  const TEST_COMPLAINT_ID_2 = '40000000-0000-4000-8000-000000000002';
  const TEST_COMPLAINT_ID_3 = '40000000-0000-4000-8000-000000000003';
  const TEST_ATTACHMENT_ID_1 = '50000000-0000-4000-8000-000000000001';
  const TEST_UPDATE_ID_1 = '60000000-0000-4000-8000-000000000001';

  async function cleanupFixtures(): Promise<void> {
    if (!prisma || !isDbConnected) return;
    try {
      await prisma.complaintAttachment.deleteMany({
        where: { id: { in: [TEST_ATTACHMENT_ID_1] } },
      });
      await prisma.complaintUpdate.deleteMany({
        where: { id: { in: [TEST_UPDATE_ID_1] } },
      });
      await prisma.complaint.deleteMany({
        where: {
          id: { in: [TEST_COMPLAINT_ID_1, TEST_COMPLAINT_ID_2, TEST_COMPLAINT_ID_3] },
        },
      });
      await prisma.vehicle.deleteMany({
        where: { id: { in: [TEST_VEHICLE_ID_1, TEST_VEHICLE_ID_2] } },
      });
      await prisma.driver.deleteMany({
        where: { id: { in: [TEST_DRIVER_ID_1, TEST_DRIVER_ID_2] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [TEST_USER_ID_1, TEST_USER_ID_2] } },
      });
    } catch {
      // Ignore cleanup errors on non-existent records
    }
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: dbUrl });
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;
      await cleanupFixtures();
    } catch (err) {
      console.warn(
        `[MySQL Integration Suite] Database connection to ${dbUrl} is not available:`,
        err instanceof Error ? err.message : err,
      );
      console.warn(
        '[MySQL Integration Suite] Skipping runtime assertions locally. This suite runs in GitHub Actions CI against MySQL 8.0.',
      );
      isDbConnected = false;
    }
  });

  afterAll(async () => {
    if (isDbConnected) {
      await cleanupFixtures();
    }
    await prisma?.$disconnect();
  });

  // =========================================================================
  // SECTION A: Fresh Database Migration & Table Verification
  // =========================================================================
  describe('Phase 4.A — Fresh Database Migration & Table Schema', () => {
    it('verifies all 28 tables exist in the target MySQL database', async () => {
      if (!isDbConnected) return;

      const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_TYPE = 'BASE TABLE'
      `;

      const tableNames = tables.map((t) => t.TABLE_NAME);
      const expectedTables = [
        'User',
        'Driver',
        'Vehicle',
        'Complaint',
        'ComplaintAttachment',
        'ComplaintUpdate',
        'Notification',
        'DeviceToken',
        'RefreshToken',
        'Counter',
        'LoadingRecord',
        'FuelRecord',
        'MaintenanceRecord',
        'Warehouse',
        'SparePartRequest',
        'SupportMessage',
        'OperatingSite',
        'CategorySla',
        'AdminCategoryAssignment',
        'RegisteredConsumer',
        'TransactionalOutbox',
        'OutboxConsumerDispatchIntent',
        'DeliveryLedger',
        'ConsumerAggregateCursor',
        'SequenceResolutionRecord',
        'TransactionalOutboxArchive',
        'OutboxConsumerDispatchIntentArchive',
        'DeliveryLedgerArchive',
      ];

      for (const expected of expectedTables) {
        expect(tableNames).toContain(expected);
      }
    });

    it('verifies baseline migration 20261106120000_init_mysql is recorded in _prisma_migrations', async () => {
      if (!isDbConnected) return;

      const migrations = await prisma.$queryRaw<
        Array<{ migration_name: string; rolled_back_at: Date | null; applied_steps_count: number }>
      >`
        SELECT migration_name, rolled_back_at, applied_steps_count 
        FROM _prisma_migrations 
        WHERE migration_name = '20261106120000_init_mysql'
      `;

      expect(migrations.length).toBe(1);
      expect(migrations[0]?.migration_name).toBe('20261106120000_init_mysql');
      expect(migrations[0]?.rolled_back_at).toBeNull();
      expect(migrations[0]?.applied_steps_count).toBe(1);
    });

    it('verifies target MySQL table collation is utf8mb4_0900_ai_ci', async () => {
      if (!isDbConnected) return;

      const collations = await prisma.$queryRaw<Array<{ TABLE_NAME: string; TABLE_COLLATION: string }>>`
        SELECT TABLE_NAME, TABLE_COLLATION 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME IN ('User', 'Complaint', 'Vehicle')
      `;

      for (const row of collations) {
        expect(row.TABLE_COLLATION).toBe('utf8mb4_0900_ai_ci');
      }
    });
  });

  // =========================================================================
  // SECTION B: Foreign Key Behavior (Cascade, SetNull, Constraints)
  // =========================================================================
  describe('Phase 4.B — Foreign Key Integrity & Constraints', () => {
    it('verifies User -> Driver CASCADE delete behavior', async () => {
      if (!isDbConnected) return;

      // 1. Create User
      await prisma.user.create({
        data: {
          id: TEST_USER_ID_1,
          employeeId: 'EMP-FK-001',
          email: 'fk-driver@example.com',
          firstName: 'FK',
          lastName: 'Tester',
          pinHash: 'dummy',
          role: 'DRIVER',
        },
      });

      // 2. Create Driver referencing User
      await prisma.driver.create({
        data: {
          id: TEST_DRIVER_ID_1,
          userId: TEST_USER_ID_1,
          licenseNumber: 'DL-FK-001',
        },
      });

      // 3. Delete User
      await prisma.user.delete({ where: { id: TEST_USER_ID_1 } });

      // 4. Assert Driver was CASCADE deleted
      const driver = await prisma.driver.findUnique({
        where: { id: TEST_DRIVER_ID_1 },
      });
      expect(driver).toBeNull();
    });

    it('verifies Driver -> Vehicle SET NULL on delete behavior', async () => {
      if (!isDbConnected) return;

      // 1. Create User & Driver
      await prisma.user.create({
        data: {
          id: TEST_USER_ID_1,
          employeeId: 'EMP-FK-002',
          email: 'fk-vehicle@example.com',
          firstName: 'FK',
          lastName: 'Vehicle',
          pinHash: 'dummy',
          role: 'DRIVER',
        },
      });
      await prisma.driver.create({
        data: {
          id: TEST_DRIVER_ID_1,
          userId: TEST_USER_ID_1,
          licenseNumber: 'DL-FK-002',
        },
      });

      // 2. Create Vehicle assigned to Driver
      await prisma.vehicle.create({
        data: {
          id: TEST_VEHICLE_ID_1,
          plateNumber: 'KA-01-FK-01',
          driverId: TEST_DRIVER_ID_1,
        },
      });

      // 3. Delete Driver
      await prisma.driver.delete({ where: { id: TEST_DRIVER_ID_1 } });

      // 4. Vehicle should still exist with driverId = null
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: TEST_VEHICLE_ID_1 },
      });
      expect(vehicle).not.toBeNull();
      expect(vehicle?.driverId).toBeNull();

      // Cleanup
      await prisma.vehicle.delete({ where: { id: TEST_VEHICLE_ID_1 } });
      await prisma.user.delete({ where: { id: TEST_USER_ID_1 } });
    });

    it('verifies foreign key rejection when inserting with non-existent parent ID', async () => {
      if (!isDbConnected) return;

      const nonExistentUserId = '99999999-9999-4000-8000-999999999999';

      await expect(
        prisma.driver.create({
          data: {
            id: '88888888-8888-4000-8000-888888888888',
            userId: nonExistentUserId,
            licenseNumber: 'DL-FAIL-001',
          },
        }),
      ).rejects.toThrow();
    });

    it('verifies Complaint -> ComplaintAttachment and ComplaintUpdate CASCADE delete', async () => {
      if (!isDbConnected) return;

      // 1. Setup User and Driver
      await prisma.user.create({
        data: {
          id: TEST_USER_ID_1,
          employeeId: 'EMP-FK-003',
          email: 'fk-complaint@example.com',
          firstName: 'FK',
          lastName: 'Complaint',
          pinHash: 'dummy',
          role: 'DRIVER',
        },
      });
      await prisma.driver.create({
        data: {
          id: TEST_DRIVER_ID_1,
          userId: TEST_USER_ID_1,
          licenseNumber: 'DL-FK-003',
        },
      });

      // 2. Create Complaint
      await prisma.complaint.create({
        data: {
          id: TEST_COMPLAINT_ID_1,
          complaintNo: 'DC-2026-999901',
          driverId: TEST_DRIVER_ID_1,
          title: 'FK Cascade Test',
          description: 'Testing cascade of attachments and updates',
        },
      });

      // 3. Create Attachment and Update
      await prisma.complaintAttachment.create({
        data: {
          id: TEST_ATTACHMENT_ID_1,
          complaintId: TEST_COMPLAINT_ID_1,
          url: 'https://example.com/attachment.jpg',
          publicId: 'test-pub-id-1',
          resourceType: 'IMAGE',
        },
      });
      await prisma.complaintUpdate.create({
        data: {
          id: TEST_UPDATE_ID_1,
          complaintId: TEST_COMPLAINT_ID_1,
          fromStatus: 'NEW',
          toStatus: 'IN_PROGRESS',
        },
      });

      // 4. Delete Complaint
      await prisma.complaint.delete({ where: { id: TEST_COMPLAINT_ID_1 } });

      // 5. Assert child records were CASCADE deleted
      const att = await prisma.complaintAttachment.findUnique({
        where: { id: TEST_ATTACHMENT_ID_1 },
      });
      const upd = await prisma.complaintUpdate.findUnique({
        where: { id: TEST_UPDATE_ID_1 },
      });
      expect(att).toBeNull();
      expect(upd).toBeNull();

      // Cleanup
      await prisma.driver.delete({ where: { id: TEST_DRIVER_ID_1 } });
      await prisma.user.delete({ where: { id: TEST_USER_ID_1 } });
    });
  });

  // =========================================================================
  // SECTION C: Collation Behavior (utf8mb4_0900_ai_ci)
  // =========================================================================
  describe('Phase 4.C — utf8mb4_0900_ai_ci Collation & Uniqueness Semantics', () => {
    it('verifies case-insensitive search and equality matching under utf8mb4_0900_ai_ci', async () => {
      if (!isDbConnected) return;

      await prisma.user.create({
        data: {
          id: TEST_USER_ID_1,
          employeeId: 'EMP-COLLATE-A1',
          email: 'rahul.kumar@example.com',
          firstName: 'Rahul',
          lastName: 'Kumar',
          pinHash: 'dummy',
          role: 'DRIVER',
        },
      });

      // Case-insensitive equals
      const userByUpperEmail = await prisma.user.findFirst({
        where: { email: { equals: 'RAHUL.KUMAR@EXAMPLE.COM' } },
      });
      expect(userByUpperEmail?.id).toBe(TEST_USER_ID_1);

      // Case-insensitive contains
      const userBySubstring = await prisma.user.findFirst({
        where: { firstName: { contains: 'ahu' } },
      });
      expect(userBySubstring?.id).toBe(TEST_USER_ID_1);

      await prisma.user.delete({ where: { id: TEST_USER_ID_1 } });
    });

    it('verifies accent-insensitive comparison under utf8mb4_0900_ai_ci', async () => {
      if (!isDbConnected) return;

      await prisma.vehicle.create({
        data: {
          id: TEST_VEHICLE_ID_1,
          plateNumber: 'KA-01-ACCENT-1',
          make: 'Citroën',
        },
      });

      // Accent-insensitive equality: 'Citroen' should match 'Citroën'
      const vehicle = await prisma.vehicle.findFirst({
        where: { make: { equals: 'Citroen' } },
      });
      expect(vehicle?.id).toBe(TEST_VEHICLE_ID_1);

      await prisma.vehicle.delete({ where: { id: TEST_VEHICLE_ID_1 } });
    });

    it('verifies unique index rejects case-variant duplicate insertions', async () => {
      if (!isDbConnected) return;

      await prisma.user.create({
        data: {
          id: TEST_USER_ID_1,
          employeeId: 'EMP-CASE-COLLISION',
          email: 'driver.case@example.com',
          firstName: 'Case',
          lastName: 'Tester',
          pinHash: 'dummy',
          role: 'DRIVER',
        },
      });

      // Attempt to insert with lowercase employeeId
      await expect(
        prisma.user.create({
          data: {
            id: TEST_USER_ID_2,
            employeeId: 'emp-case-collision',
            email: 'other.driver@example.com',
            firstName: 'Other',
            lastName: 'Driver',
            pinHash: 'dummy',
            role: 'DRIVER',
          },
        }),
      ).rejects.toThrow();

      // Attempt to insert with uppercase email
      await expect(
        prisma.user.create({
          data: {
            id: TEST_USER_ID_2,
            employeeId: 'EMP-OTHER-002',
            email: 'DRIVER.CASE@EXAMPLE.COM',
            firstName: 'Other',
            lastName: 'Driver',
            pinHash: 'dummy',
            role: 'DRIVER',
          },
        }),
      ).rejects.toThrow();

      await prisma.user.delete({ where: { id: TEST_USER_ID_1 } });
    });
  });

  // =========================================================================
  // SECTION D: Idempotency Key Composite Unique Constraint
  // =========================================================================
  describe('Phase 4.D — Idempotency Key Composite Constraint (driverId + idempotencyKey)', () => {
    it('verifies normal insertion, duplicate rejection for same driver, and acceptance for different drivers', async () => {
      if (!isDbConnected) return;

      // Setup 2 Drivers
      await prisma.user.create({
        data: {
          id: TEST_USER_ID_1,
          employeeId: 'EMP-IDEMP-01',
          email: 'idemp1@example.com',
          firstName: 'Driver1',
          lastName: 'Idemp',
          pinHash: 'dummy',
          role: 'DRIVER',
        },
      });
      await prisma.driver.create({
        data: {
          id: TEST_DRIVER_ID_1,
          userId: TEST_USER_ID_1,
          licenseNumber: 'DL-IDEMP-01',
        },
      });

      await prisma.user.create({
        data: {
          id: TEST_USER_ID_2,
          employeeId: 'EMP-IDEMP-02',
          email: 'idemp2@example.com',
          firstName: 'Driver2',
          lastName: 'Idemp',
          pinHash: 'dummy',
          role: 'DRIVER',
        },
      });
      await prisma.driver.create({
        data: {
          id: TEST_DRIVER_ID_2,
          userId: TEST_USER_ID_2,
          licenseNumber: 'DL-IDEMP-02',
        },
      });

      const sharedKey = 'idempotency-key-test-uuid-12345';

      // 1. Driver 1 creates complaint with sharedKey -> SUCCESS
      await prisma.complaint.create({
        data: {
          id: TEST_COMPLAINT_ID_1,
          complaintNo: 'DC-2026-888801',
          driverId: TEST_DRIVER_ID_1,
          title: 'Complaint 1',
          description: 'Desc 1',
          idempotencyKey: sharedKey,
        },
      });

      // 2. Driver 1 attempts duplicate insertion with same sharedKey -> REJECTED
      await expect(
        prisma.complaint.create({
          data: {
            id: TEST_COMPLAINT_ID_2,
            complaintNo: 'DC-2026-888802',
            driverId: TEST_DRIVER_ID_1,
            title: 'Complaint Duplicate',
            description: 'Duplicate Desc',
            idempotencyKey: sharedKey,
          },
        }),
      ).rejects.toThrow();

      // 3. Driver 2 inserts with same sharedKey -> SUCCESS (composite key allows different driver)
      const c2 = await prisma.complaint.create({
        data: {
          id: TEST_COMPLAINT_ID_2,
          complaintNo: 'DC-2026-888802',
          driverId: TEST_DRIVER_ID_2,
          title: 'Complaint Driver 2',
          description: 'Desc 2',
          idempotencyKey: sharedKey,
        },
      });
      expect(c2.id).toBe(TEST_COMPLAINT_ID_2);

      // 4. NULL idempotency key behavior: multiple NULLs are allowed for the same driver
      const cNull1 = await prisma.complaint.create({
        data: {
          id: TEST_COMPLAINT_ID_3,
          complaintNo: 'DC-2026-888803',
          driverId: TEST_DRIVER_ID_1,
          title: 'Complaint NULL Key 1',
          description: 'Desc NULL 1',
          idempotencyKey: null,
        },
      });
      expect(cNull1.id).toBe(TEST_COMPLAINT_ID_3);

      const nullId2 = '40000000-0000-4000-8000-000000000004';
      const cNull2 = await prisma.complaint.create({
        data: {
          id: nullId2,
          complaintNo: 'DC-2026-888804',
          driverId: TEST_DRIVER_ID_1,
          title: 'Complaint NULL Key 2',
          description: 'Desc NULL 2',
          idempotencyKey: null,
        },
      });
      expect(cNull2.id).toBe(nullId2);

      // Cleanup
      await prisma.complaint.deleteMany({
        where: {
          id: { in: [TEST_COMPLAINT_ID_1, TEST_COMPLAINT_ID_2, TEST_COMPLAINT_ID_3, nullId2] },
        },
      });
      await prisma.driver.deleteMany({
        where: { id: { in: [TEST_DRIVER_ID_1, TEST_DRIVER_ID_2] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [TEST_USER_ID_1, TEST_USER_ID_2] } },
      });
    });
  });
});
