import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, type Socket as ClientSocketType } from 'socket.io-client';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { defaultRedisOptions } from '../lib/redis';

describe('Milestone 2: Real Redis Cross-Instance Integration Test', () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  const activeServers: HttpServer[] = [];
  const activeClients: ClientSocketType[] = [];
  const activeRedisClients: Redis[] = [];

  afterEach(async () => {
    for (const client of activeClients) {
      if (client.connected) client.disconnect();
    }
    activeClients.length = 0;

    for (const srv of activeServers) {
      await new Promise<void>((r) => srv.close(() => r()));
    }
    activeServers.length = 0;

    for (const rClient of activeRedisClients) {
      try {
        rClient.disconnect();
      } catch {
        // ignore cleanup error
      }
    }
    activeRedisClients.length = 0;
  });

  it('proves real Redis Pub/Sub transport delivers events across isolated Socket.IO instances', async () => {
    // 0. Verify real Redis server reachability
    let isRedisReachable = false;
    const probeClient = new Redis(REDIS_URL, { ...defaultRedisOptions, connectTimeout: 1500, lazyConnect: true });
    probeClient.on('error', () => {});
    try {
      await probeClient.connect();
      const pong = await probeClient.ping();
      isRedisReachable = pong === 'PONG';
    } catch {
      isRedisReachable = false;
    } finally {
      probeClient.disconnect();
    }

    if (!isRedisReachable) {
      if (process.env.CI) {
        throw new Error(
          `[CI FAILURE] Real Redis server is required in CI but could not be reached at ${REDIS_URL}. ` +
            'The integration test cannot be bypassed or silently skipped in CI.',
        );
      }
      console.warn(
        `[REAL REDIS TEST SKIPPED LOCALLY] Standalone Redis server not reachable at ${REDIS_URL}. ` +
          'This integration test runs against a real Redis 7 container in the GitHub Actions CI environment.',
      );
      return;
    }

    console.log(`[REAL REDIS TEST] Connected to real Redis server at ${REDIS_URL}`);

    // 1. Create separate Redis pub/sub connections for Instance A
    const pubA = new Redis(REDIS_URL, defaultRedisOptions);
    const subA = new Redis(REDIS_URL, defaultRedisOptions);
    activeRedisClients.push(pubA, subA);

    // 2. Create separate Redis pub/sub connections for Instance B
    const pubB = new Redis(REDIS_URL, defaultRedisOptions);
    const subB = new Redis(REDIS_URL, defaultRedisOptions);
    activeRedisClients.push(pubB, subB);

    // 3. Start Socket.IO Instance A on independent HTTP server
    const serverA = createServer();
    const ioA = new SocketIOServer(serverA, {
      adapter: createAdapter(pubA, subA),
    });
    activeServers.push(serverA);
    await new Promise<void>((r) => serverA.listen(0, r));
    const portA = (serverA.address() as any).port;

    // 4. Start Socket.IO Instance B on independent HTTP server
    const serverB = createServer();
    const ioB = new SocketIOServer(serverB, {
      adapter: createAdapter(pubB, subB),
    });
    activeServers.push(serverB);
    await new Promise<void>((r) => serverB.listen(0, r));
    const portB = (serverB.address() as any).port;

    // Instance A handler: joins authorized room
    ioA.on('connection', (socket) => {
      const room = socket.handshake.query.room as string;
      if (room) socket.join(room);
    });

    // Instance B handler: joins authorized room or unauthorized room based on query
    ioB.on('connection', (socket) => {
      const room = socket.handshake.query.room as string;
      if (room) socket.join(room);
    });

    // 5. Connect Client A to Instance A in authorized room
    const clientA: ClientSocketType = ClientSocket(`http://127.0.0.1:${portA}`, {
      query: { room: 'user:authorized-101' },
      transports: ['websocket'],
      forceNew: true,
    });
    activeClients.push(clientA);
    await new Promise<void>((resolve, reject) => {
      clientA.on('connect', resolve);
      clientA.on('connect_error', reject);
    });

    // 6. Connect Client B to Instance B in the SAME authorized room
    const clientB: ClientSocketType = ClientSocket(`http://127.0.0.1:${portB}`, {
      query: { room: 'user:authorized-101' },
      transports: ['websocket'],
      forceNew: true,
    });
    activeClients.push(clientB);
    await new Promise<void>((resolve, reject) => {
      clientB.on('connect', resolve);
      clientB.on('connect_error', reject);
    });

    // 7. Connect Client C to Instance B in a DIFFERENT (unauthorized) room
    let clientCReceivedUnintendedEvent = false;
    const clientC: ClientSocketType = ClientSocket(`http://127.0.0.1:${portB}`, {
      query: { room: 'user:unauthorized-999' },
      transports: ['websocket'],
      forceNew: true,
    });
    activeClients.push(clientC);
    await new Promise<void>((resolve, reject) => {
      clientC.on('connect', resolve);
      clientC.on('connect_error', reject);
    });
    clientC.on('complaint:created', () => {
      clientCReceivedUnintendedEvent = true;
    });

    // 8. Prepare expectation on Client B (connected to Instance B)
    const payloadSent = {
      complaintId: 'DC-2026-REAL-REDIS',
      status: 'NEW',
      priority: 'HIGH',
      timestamp: new Date().toISOString(),
    };

    const clientBEventPromise = new Promise<{ complaintId: string; status: string; priority: string }>((resolve) => {
      clientB.on('complaint:created', (data) => {
        resolve(data);
      });
    });

    // 9. EMIT FROM INSTANCE A -> Real Redis Pub/Sub -> INSTANCE B -> CLIENT B
    ioA.to('user:authorized-101').emit('complaint:created', payloadSent as any);

    const receivedOnB = await clientBEventPromise;

    // 10. Assertions
    expect(receivedOnB).toEqual(payloadSent);
    expect(clientCReceivedUnintendedEvent).toBe(false);

    // Wait a brief window to confirm unauthorized room client never received the event
    await new Promise((r) => setTimeout(r, 200));
    expect(clientCReceivedUnintendedEvent).toBe(false);

    console.log('[REAL REDIS TEST PASSED] Verified cross-instance event propagation through real Redis Pub/Sub');
  }, 15000);
});
