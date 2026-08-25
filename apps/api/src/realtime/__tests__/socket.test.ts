import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { ComplaintEventPayload } from '@driver-complaint/shared-types';
import { REALTIME_EVENTS } from '@driver-complaint/shared-types';
import { signAccessToken } from '../../lib/jwt';
import { initRealtime, closeRealtime, emitToUsers } from '../socket';

// Verifies the realtime security boundary end-to-end over a real socket: the handshake
// rejects unauthenticated clients, and a connected client receives ONLY its own events.
// Note that Socket.IO's transport handshake always succeeds — auth is enforced when the
// client sends the connect packet, so this must be asserted with a real client.

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

let server: HttpServer;
let url: string;
const clients: ClientSocket[] = [];

function payload(complaintNo: string): ComplaintEventPayload {
  return {
    complaintId: 'c-1',
    complaintNo,
    title: 'Broken wiper',
    status: 'NEW',
    at: new Date().toISOString(),
  };
}

/** Open a client and resolve once connected, or reject with the handshake error. */
async function connect(token?: string): Promise<ClientSocket> {
  const socket = ioClient(url, {
    auth: token === undefined ? {} : { token },
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(socket);

  return new Promise<ClientSocket>((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

/** Wait for one event, or resolve null if nothing arrives before the timeout. */
async function waitForEvent(socket: ClientSocket, ms = 500): Promise<ComplaintEventPayload | null> {
  return new Promise<ComplaintEventPayload | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(REALTIME_EVENTS.complaintCreated, (data: ComplaintEventPayload) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

beforeAll(async () => {
  server = createServer();
  initRealtime(server);
  await new Promise<void>((resolve) => {
    // Port 0 → let the OS pick a free port, so the test never collides with a dev server.
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  url = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const client of clients) client.disconnect();
  await closeRealtime();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('realtime handshake auth', () => {
  it('rejects a connection with no token', async () => {
    await expect(connect()).rejects.toThrow('UNAUTHORIZED');
  });

  it('rejects a connection with a garbage token', async () => {
    await expect(connect('not-a-jwt')).rejects.toThrow('UNAUTHORIZED');
  });

  it('accepts a connection carrying a valid access token', async () => {
    const token = await signAccessToken({ sub: USER_A, role: 'DRIVER', employeeId: 'E1001' });
    const socket = await connect(token);
    expect(socket.connected).toBe(true);
  });
});

describe('realtime event scoping', () => {
  it('delivers an event to the addressed user', async () => {
    const token = await signAccessToken({ sub: USER_A, role: 'DRIVER', employeeId: 'E1001' });
    const socket = await connect(token);

    const received = waitForEvent(socket);
    emitToUsers([USER_A], REALTIME_EVENTS.complaintCreated, payload('DC-2026-000001'));

    expect(await received).toMatchObject({ complaintNo: 'DC-2026-000001' });
  });

  it('never leaks another user’s event', async () => {
    const token = await signAccessToken({ sub: USER_A, role: 'DRIVER', employeeId: 'E1001' });
    const socket = await connect(token);

    // SAFETY-CRITICAL: user A must not see anything addressed to user B.
    const received = waitForEvent(socket);
    emitToUsers([USER_B], REALTIME_EVENTS.complaintCreated, payload('DC-2026-000002'));

    expect(await received).toBeNull();
  });
});
