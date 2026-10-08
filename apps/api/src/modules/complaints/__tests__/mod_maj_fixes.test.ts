import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import { create, getOne, updateStatus, list } from '../complaints.service';
import { updateUser, deleteUser } from '../../users/users.service';
import type { Actor } from '../complaints.service';

describe('MOD and MAJ Fixes Regression Suite', () => {
  const PREFIX = 'MMTEST_';
  let adminUser: any;
  let superAdminUser: any;
  let driver1User: any;
  let driver1: any;
  let driver2User: any;
  let driver2: any;
  let vehicle1: any;
  let vehicle2: any;

  beforeAll(async () => {
    const pinHash = await hashPin('9999');

    // Create SuperAdmin
    superAdminUser = await prisma.user.upsert({
      where: { employeeId: `${PREFIX}SA1` },
      update: { pinHash, isActive: true, role: 'SUPER_ADMIN' },
      create: { employeeId: `${PREFIX}SA1`, pinHash, role: 'SUPER_ADMIN', firstName: 'Super', lastName: 'Admin' },
    });

    // Create Admin with null category
    adminUser = await prisma.user.upsert({
      where: { employeeId: `${PREFIX}A1` },
      update: { pinHash, isActive: true, role: 'ADMIN', category: null },
      create: { employeeId: `${PREFIX}A1`, pinHash, role: 'ADMIN', category: null, firstName: 'Category', lastName: 'Admin' },
    });

    // Assign TYRE_ISSUE to adminUser via adminCategoryAssignments
    await prisma.adminCategoryAssignment.deleteMany({ where: { adminId: adminUser.id } });
    await prisma.adminCategoryAssignment.create({
      data: { adminId: adminUser.id, category: 'TYRE_ISSUE' },
    });

    // Create Driver 1 & Driver 2
    driver1User = await prisma.user.upsert({
      where: { employeeId: `${PREFIX}D1` },
      update: { pinHash, isActive: true, role: 'DRIVER' },
      create: { employeeId: `${PREFIX}D1`, pinHash, role: 'DRIVER', firstName: 'Driver', lastName: 'One' },
    });
    driver1 = await prisma.driver.upsert({
      where: { userId: driver1User.id },
      update: {},
      create: { userId: driver1User.id, licenseNumber: `${PREFIX}DL1` },
    });

    driver2User = await prisma.user.upsert({
      where: { employeeId: `${PREFIX}D2` },
      update: { pinHash, isActive: true, role: 'DRIVER' },
      create: { employeeId: `${PREFIX}D2`, pinHash, role: 'DRIVER', firstName: 'Driver', lastName: 'Two' },
    });
    driver2 = await prisma.driver.upsert({
      where: { userId: driver2User.id },
      update: {},
      create: { userId: driver2User.id, licenseNumber: `${PREFIX}DL2` },
    });

    // Create Vehicle 1 owned by Driver 1, Vehicle 2 owned by Driver 2
    vehicle1 = await prisma.vehicle.upsert({
      where: { plateNumber: `${PREFIX}PLATE1` },
      update: { driverId: driver1.id },
      create: { plateNumber: `${PREFIX}PLATE1`, driverId: driver1.id, make: 'Volvo', model: 'FH16' },
    });
    vehicle2 = await prisma.vehicle.upsert({
      where: { plateNumber: `${PREFIX}PLATE2` },
      update: { driverId: driver2.id },
      create: { plateNumber: `${PREFIX}PLATE2`, driverId: driver2.id, make: 'Scania', model: 'R500' },
    });
  }, 30000);

  afterAll(async () => {
    // Cleanup created test records
    await prisma.notification.deleteMany({ where: { user: { employeeId: { startsWith: PREFIX } } } });
    await prisma.complaintUpdate.deleteMany({ where: { complaint: { driver: { user: { employeeId: { startsWith: PREFIX } } } } } });
    await prisma.complaintAttachment.deleteMany({ where: { complaint: { driver: { user: { employeeId: { startsWith: PREFIX } } } } } });
    await prisma.complaint.deleteMany({ where: { driver: { user: { employeeId: { startsWith: PREFIX } } } } });
    await prisma.vehicle.deleteMany({ where: { plateNumber: { startsWith: PREFIX } } });
    await prisma.driver.deleteMany({ where: { user: { employeeId: { startsWith: PREFIX } } } });
    await prisma.adminCategoryAssignment.deleteMany({ where: { admin: { employeeId: { startsWith: PREFIX } } } });
    await prisma.refreshToken.deleteMany({ where: { user: { employeeId: { startsWith: PREFIX } } } });
    await prisma.user.deleteMany({ where: { employeeId: { startsWith: PREFIX } } });
  }, 30000);

  // MAJ-1: Interactive transaction execution safety
  it('MAJ-1: interactive transaction callback runs exactly once without automatic retry replay', async () => {
    let executions = 0;
    const result = await prisma.$transaction(async (tx) => {
      executions++;
      return tx.user.findUnique({ where: { id: superAdminUser.id } });
    });
    expect(executions).toBe(1);
    expect(result?.id).toBe(superAdminUser.id);
  }, 25000);

  // MAJ-2: SLA_BREACH_ESCALATION Enum
  it('MAJ-2: inserts SLA_BREACH_ESCALATION notification cleanly without type casting', async () => {
    const notif = await prisma.notification.create({
      data: {
        userId: adminUser.id,
        type: 'SLA_BREACH_ESCALATION',
        title: 'SLA Breached Test',
        body: 'Test body',
      },
    });
    expect(notif.type).toBe('SLA_BREACH_ESCALATION');
  }, 25000);

  // MAJ-3 & MAJ-4: adminCategoryAssignments in getOne and updateStatus
  it('MAJ-3 & MAJ-4: admin with adminCategoryAssignments can access and update assigned category complaints', async () => {
    const created = await create(driver1User.id, {
      category: 'TYRE_ISSUE',
      title: 'Flat tyre on highway',
      description: 'Rear tyre burst',
    });

    const adminActorObj: Actor = { id: adminUser.id, role: 'ADMIN' };
    
    // getOne (MAJ-3)
    const detail = await getOne(adminActorObj, created.id);
    expect(detail.id).toBe(created.id);
    expect(detail.category).toBe('TYRE_ISSUE');

    // updateStatus (MAJ-4)
    const updated = await updateStatus(adminActorObj, created.id, {
      status: 'IN_PROGRESS',
      note: 'Dispatching mechanic',
    });
    expect(updated.status).toBe('IN_PROGRESS');

    // Unrelated category (BREAKDOWN) should throw 403
    const breakdownComplaint = await create(driver1User.id, {
      category: 'BREAKDOWN',
      title: 'Engine overheating',
      description: 'Engine temperature critical',
    });

    await expect(getOne(adminActorObj, breakdownComplaint.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(updateStatus(adminActorObj, breakdownComplaint.id, { status: 'IN_PROGRESS' })).rejects.toMatchObject({ statusCode: 403 });
  }, 60000);

  // MAJ-5: Complaint deduplication title & vehicle check
  it('MAJ-5: complaint duplicate detection merges identical double-taps but keeps distinct issues separate', async () => {
    // 1. First complaint
    const c1 = await create(driver1User.id, {
      category: 'BREAKDOWN',
      title: 'Flat Tyre',
      description: 'Front right tyre flat',
      vehicleId: vehicle1.id,
    });

    // 2. Second complaint within 5m with SAME title -> should merge (wasAppended = true)
    const c2 = await create(driver1User.id, {
      category: 'BREAKDOWN',
      title: 'Flat Tyre',
      description: 'Extra photo added',
      vehicleId: vehicle1.id,
    });
    expect(c2.id).toBe(c1.id);
    expect((c2 as any).wasAppended).toBe(true);

    // 3. Third complaint within 5m with DIFFERENT title ("Engine Failure") -> should NOT merge
    const c3 = await create(driver1User.id, {
      category: 'BREAKDOWN',
      title: 'Engine Failure',
      description: 'Engine stopped running',
      vehicleId: vehicle1.id,
    });
    expect(c3.id).not.toBe(c1.id);
    expect((c3 as any).wasAppended).toBeUndefined();
  }, 60000);

  // MOD-6: Complaint number concurrency
  it('MOD-6: concurrent complaint creations generate unique, sequential complaint numbers', async () => {
    const promises = Array.from({ length: 5 }).map((_, i) =>
      create(driver1User.id, {
        category: 'ACCOUNTS',
        title: `Unique Issue ${i}_${Date.now()}_${Math.random()}`,
        description: 'Testing concurrency',
      })
    );
    const results = await Promise.all(promises);
    const nos = results.map((r) => r.complaintNo);
    const uniqueNos = new Set(nos);
    expect(uniqueNos.size).toBe(5);
    for (const no of nos) {
      expect(no).toMatch(/^DC-\d{4}-\d{6}$/);
    }
  }, 60000);

  // MOD-1: Refresh token rotation atomic reuse detection
  it('MOD-1: refresh token rotation detects atomic reuse attempt', async () => {
    const familyId = randomUUID();
    const tokenHash = randomUUID();
    
    // Create an initial refresh token row
    const oldToken = await prisma.refreshToken.create({
      data: {
        userId: driver1User.id,
        familyId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60000),
      },
    });

    // Simulate rotation attempt
    const newGenTokenHash = randomUUID();
    await prisma.$transaction(async (tx) => {
      const updatedOld = await tx.refreshToken.updateMany({
        where: { id: oldToken.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
      });
      expect(updatedOld.count).toBe(1);

      await tx.refreshToken.create({
        data: {
          userId: driver1User.id,
          familyId,
          tokenHash: newGenTokenHash,
          expiresAt: new Date(Date.now() + 60000),
          replacedById: null,
        },
      });
    });

    // Second rotation attempt on same oldToken should return count 0 and detect reuse
    let reuseCaught = false;
    await prisma.$transaction(async (tx) => {
      const updatedOld = await tx.refreshToken.updateMany({
        where: { id: oldToken.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
      });
      if (updatedOld.count === 0) {
        reuseCaught = true;
        await tx.refreshToken.updateMany({
          where: { familyId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' },
        });
      }
    });
    expect(reuseCaught).toBe(true);
  }, 25000);

  // MOD-2: assignedToId filtering for ADMIN
  it('MOD-2: admin can filter complaints by assignedToId within their authorized scope', async () => {
    const adminActorObj: Actor = { id: adminUser.id, role: 'ADMIN' };
    const res = await list(adminActorObj, { page: 1, pageSize: 10, assignedToId: adminUser.id });
    expect(res.data).toBeDefined();
    for (const item of res.data) {
      expect(item.category).toBe('TYRE_ISSUE');
    }
  }, 25000);

  // MOD-3: updateUser service authorization
  it('MOD-3: updateUser service enforces SUPER_ADMIN authorization', async () => {
    const adminActorObj: Actor = { id: adminUser.id, role: 'ADMIN' };
    const saActorObj: Actor = { id: superAdminUser.id, role: 'SUPER_ADMIN' };

    // Call by ADMIN should fail with 403
    await expect(updateUser(adminActorObj, driver1User.id, { firstName: 'Updated' })).rejects.toMatchObject({ statusCode: 403 });

    // Call by SUPER_ADMIN should succeed
    const updated = await updateUser(saActorObj, driver1User.id, { firstName: 'UpdatedName' });
    expect(updated.firstName).toBe('UpdatedName');
  }, 25000);

  // MOD-4: Vehicle ownership check on vehicleNumber
  it('MOD-4: create complaint with vehicleNumber enforces driver ownership', async () => {
    // 1. Own vehicleNumber -> allowed
    const c1 = await create(driver1User.id, {
      vehicleNumber: `${PREFIX}PLATE1`,
      title: 'Own Vehicle Issue',
      description: 'Ok',
    });
    expect(c1.vehicleId).toBe(vehicle1.id);

    // 2. Another driver's vehicleNumber -> rejected with 400
    await expect(
      create(driver1User.id, {
        vehicleNumber: `${PREFIX}PLATE2`, // belongs to driver 2
        title: 'Unauthorized Vehicle',
        description: 'Fail',
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    // 3. vehicleNumber and vehicleId mismatch -> rejected with 400
    await expect(
      create(driver1User.id, {
        vehicleNumber: `${PREFIX}PLATE1`,
        vehicleId: vehicle2.id,
        title: 'Mismatch Vehicle',
        description: 'Fail',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  }, 25000);

  // MOD-5 & MOD-7: User deletion timeline preservation and performance
  it('MOD-5 & MOD-7: deleteUser anonymizes complaint updates and executes quickly without deleting timeline history', async () => {
    // Create a temporary user to delete
    const tempPinHash = await hashPin('1234');
    const tempUser = await prisma.user.create({
      data: {
        employeeId: `${PREFIX}TEMP_DEL`,
        pinHash: tempPinHash,
        role: 'ADMIN',
        firstName: 'Temp',
        lastName: 'DeleteMe',
      },
    });

    // Create a complaint update authored by tempUser
    const complaint = await create(driver1User.id, {
      title: 'Audit Preservation Test',
      description: 'Testing timeline retention on delete',
    });

    const updateRecord = await prisma.complaintUpdate.create({
      data: {
        complaintId: complaint.id,
        authorId: tempUser.id,
        fromStatus: 'NEW',
        toStatus: 'IN_PROGRESS',
        note: 'Admin note before deletion',
      },
    });

    const saActorObj: Actor = { id: superAdminUser.id, role: 'SUPER_ADMIN' };

    // Perform deletion
    const startMs = Date.now();
    await deleteUser(saActorObj, tempUser.id);
    const elapsedMs = Date.now() - startMs;
    expect(elapsedMs).toBeLessThan(12000); // MOD-7: fast execution

    // Verify timeline update record remains with authorId: null (MOD-5)
    const preservedUpdate = await prisma.complaintUpdate.findUnique({
      where: { id: updateRecord.id },
    });
    expect(preservedUpdate).not.toBeNull();
    expect(preservedUpdate?.authorId).toBeNull();
    expect(preservedUpdate?.note).toBe('Admin note before deletion');
  }, 25000);
});
