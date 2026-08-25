import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { NotificationListQuery } from '@driver-complaint/shared-types';
import { prisma } from '../../../lib/prisma';
import { hashPin } from '../../../lib/password';
import {
  listForUser,
  registerDevice,
  unregisterDevice,
  markRead,
  markAllRead,
} from '../notifications.service';

// Self-contained integration test — requires a migrated database (docker compose up -d db).
const U1 = 'NTEST_U1'; // owns the notifications under test
const U2 = 'NTEST_U2'; // a second user, for cross-user scoping

let user1Id: string;
let user2Id: string;

/** Build a fully-typed inbox query with paging defaults. */
function q(extra: Partial<NotificationListQuery> = {}): NotificationListQuery {
  return { page: 1, pageSize: 20, unreadOnly: false, ...extra };
}

/** Insert a notification for a user; `isRead` defaults to false. */
async function seedNotification(userId: string, title: string, isRead = false): Promise<string> {
  const row = await prisma.notification.create({
    data: { userId, type: 'COMPLAINT_CREATED', title, body: 'body', isRead },
  });
  return row.id;
}

beforeAll(async () => {
  const pinHash = await hashPin('9999');

  const u1 = await prisma.user.upsert({
    where: { employeeId: U1 },
    update: { pinHash, isActive: true },
    create: { employeeId: U1, pinHash, role: 'DRIVER', firstName: 'Note', lastName: 'One' },
  });
  user1Id = u1.id;

  const u2 = await prisma.user.upsert({
    where: { employeeId: U2 },
    update: { pinHash, isActive: true },
    create: { employeeId: U2, pinHash, role: 'DRIVER', firstName: 'Note', lastName: 'Two' },
  });
  user2Id = u2.id;
});

beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [user1Id, user2Id] } } });
  await prisma.deviceToken.deleteMany({ where: { userId: { in: [user1Id, user2Id] } } });
});

afterAll(async () => {
  // Deleting the users cascades their notifications and device tokens.
  await prisma.user.deleteMany({ where: { employeeId: { in: [U1, U2] } } });
  await prisma.$disconnect();
});

describe('notifications.service — listForUser', () => {
  it('returns only the caller’s notifications, newest first', async () => {
    await seedNotification(user1Id, 'mine-old');
    await seedNotification(user1Id, 'mine-new');
    await seedNotification(user2Id, 'theirs');

    const res = await listForUser(user1Id, q());
    expect(res.meta.total).toBe(2);
    expect(res.data.every((n) => n.userId === user1Id)).toBe(true);
    expect(res.data[0]?.title).toBe('mine-new');
  });

  it('filters to unread but still reports the full unread count', async () => {
    await seedNotification(user1Id, 'unread-a');
    await seedNotification(user1Id, 'unread-b');
    await seedNotification(user1Id, 'already-read', true);

    const res = await listForUser(user1Id, q({ unreadOnly: true }));
    expect(res.meta.total).toBe(2);
    expect(res.data.every((n) => !n.isRead)).toBe(true);
    expect(res.meta.unreadCount).toBe(2);

    const all = await listForUser(user1Id, q());
    expect(all.meta.total).toBe(3);
    // unreadCount ignores the filter and the page — it is the badge number.
    expect(all.meta.unreadCount).toBe(2);
  });

  it('pages the results', async () => {
    await seedNotification(user1Id, 'n1');
    await seedNotification(user1Id, 'n2');
    await seedNotification(user1Id, 'n3');

    const res = await listForUser(user1Id, q({ pageSize: 2 }));
    expect(res.data).toHaveLength(2);
    expect(res.meta.total).toBe(3);
    expect(res.meta.totalPages).toBe(2);
  });
});

describe('notifications.service — markRead / markAllRead', () => {
  it('marks one notification read and stamps readAt', async () => {
    const id = await seedNotification(user1Id, 'read-me');
    const updated = await markRead(user1Id, id);

    expect(updated.isRead).toBe(true);
    expect(updated.readAt).not.toBeNull();
  });

  it('is idempotent — re-reading keeps the original readAt', async () => {
    const id = await seedNotification(user1Id, 'read-twice');
    const first = await markRead(user1Id, id);
    const second = await markRead(user1Id, id);
    expect(second.readAt).toBe(first.readAt);
  });

  it('404s instead of touching another user’s notification', async () => {
    const id = await seedNotification(user2Id, 'not-yours');
    await expect(markRead(user1Id, id)).rejects.toMatchObject({ statusCode: 404 });

    const untouched = await prisma.notification.findUnique({ where: { id } });
    expect(untouched?.isRead).toBe(false);
  });

  it('marks every unread notification read and leaves other users alone', async () => {
    await seedNotification(user1Id, 'a');
    await seedNotification(user1Id, 'b');
    await seedNotification(user1Id, 'c', true);
    const theirs = await seedNotification(user2Id, 'theirs');

    const res = await markAllRead(user1Id);
    expect(res.updated).toBe(2);

    const after = await listForUser(user1Id, q());
    expect(after.meta.unreadCount).toBe(0);

    const untouched = await prisma.notification.findUnique({ where: { id: theirs } });
    expect(untouched?.isRead).toBe(false);
  });
});

describe('notifications.service — device tokens', () => {
  it('registers a token and is idempotent on repeat calls', async () => {
    const first = await registerDevice(user1Id, { token: 'ntest-token-1', platform: 'ANDROID' });
    expect(first.userId).toBe(user1Id);
    expect(first.platform).toBe('ANDROID');

    const second = await registerDevice(user1Id, { token: 'ntest-token-1', platform: 'WEB' });
    expect(second.id).toBe(first.id);
    expect(second.platform).toBe('WEB');

    const rows = await prisma.deviceToken.findMany({ where: { token: 'ntest-token-1' } });
    expect(rows).toHaveLength(1);
  });

  it('reassigns a token when the same device is used by another user', async () => {
    await registerDevice(user1Id, { token: 'ntest-shared', platform: 'ANDROID' });
    const moved = await registerDevice(user2Id, { token: 'ntest-shared', platform: 'ANDROID' });

    // SAFETY-CRITICAL behaviour: the old owner must no longer receive pushes on this device.
    expect(moved.userId).toBe(user2Id);
    const rows = await prisma.deviceToken.findMany({ where: { token: 'ntest-shared' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(user2Id);
  });

  it('unregisters only the caller’s own token', async () => {
    await registerDevice(user1Id, { token: 'ntest-mine', platform: 'ANDROID' });
    await registerDevice(user2Id, { token: 'ntest-theirs', platform: 'ANDROID' });

    // Another user's token is untouched...
    await unregisterDevice(user1Id, 'ntest-theirs');
    expect(await prisma.deviceToken.count({ where: { token: 'ntest-theirs' } })).toBe(1);

    // ...while the caller's own is removed.
    await unregisterDevice(user1Id, 'ntest-mine');
    expect(await prisma.deviceToken.count({ where: { token: 'ntest-mine' } })).toBe(0);
  });

  it('silently succeeds for an unknown token', async () => {
    await expect(unregisterDevice(user1Id, 'ntest-never-existed')).resolves.toBeUndefined();
  });
});
