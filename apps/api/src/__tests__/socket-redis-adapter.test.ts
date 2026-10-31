import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, type Socket as ClientSocketType } from 'socket.io-client';
import { createAdapter } from '@socket.io/redis-adapter';
import EventEmitter from 'node:events';
import { initRealtime, closeRealtime, emitToUsers } from '../realtime/socket';
import { signAccessToken } from '../lib/jwt';

/**
 * In-memory Redis pub/sub simulator implementing the ioredis binary buffer interface
 * needed by @socket.io/redis-adapter (publish, pmessageBuffer, messageBuffer, duplicate).
 */
class MockRedisClient extends EventEmitter {
  public static bus = new EventEmitter();

  constructor() {
    super();
    MockRedisClient.bus.on('pmessageBuffer', (pattern: string, channel: string, message: Buffer) => {
      this.emit('pmessageBuffer', pattern, channel, message);
    });
    MockRedisClient.bus.on('messageBuffer', (channel: string, message: Buffer) => {
      this.emit('messageBuffer', channel, message);
    });
  }

  duplicate() {
    return new MockRedisClient();
  }

  async publish(channel: string, message: Buffer | string): Promise<number> {
    const buf = Buffer.isBuffer(message) ? message : Buffer.from(message);
    const channelStr = typeof channel === 'string' ? channel : String(channel);
    setImmediate(() => {
      MockRedisClient.bus.emit('pmessageBuffer', channelStr, channelStr, buf);
      MockRedisClient.bus.emit('messageBuffer', channelStr, buf);
    });
    return 1;
  }

  async subscribe(..._channels: string[]): Promise<string> {
    return 'OK';
  }

  async psubscribe(..._patterns: string[]): Promise<string> {
    return 'OK';
  }

  async unsubscribe(..._channels: string[]): Promise<string> {
    return 'OK';
  }

  async punsubscribe(..._patterns: string[]): Promise<string> {
    return 'OK';
  }

  async quit(): Promise<'OK'> {
    this.removeAllListeners();
    return 'OK';
  }

  disconnect(): void {
    this.removeAllListeners();
  }
}

describe('Milestone 2: Socket.IO Redis Adapter & Cross-Instance Realtime', () => {
  const activeServers: HttpServer[] = [];
  const activeClients: ClientSocketType[] = [];

  afterEach(async () => {
    for (const client of activeClients) {
      if (client.connected) client.disconnect();
    }
    activeClients.length = 0;

    for (const srv of activeServers) {
      await new Promise<void>((r) => srv.close(() => r()));
    }
    activeServers.length = 0;

    await closeRealtime();
    MockRedisClient.bus.removeAllListeners();
  });

  it('delivers realtime events across multiple server instances via Redis adapter', async () => {
    const pubA = new MockRedisClient();
    const subA = new MockRedisClient();
    const pubB = new MockRedisClient();
    const subB = new MockRedisClient();

    // 1. Instance A (Pod A)
    const serverA = createServer();
    const ioA = new SocketIOServer(serverA, {
      adapter: createAdapter(pubA as any, subA as any),
    });
    activeServers.push(serverA);

    await new Promise<void>((r) => serverA.listen(0, r));
    const portA = (serverA.address() as any).port;

    // 2. Instance B (Pod B)
    const serverB = createServer();
    const ioB = new SocketIOServer(serverB, {
      adapter: createAdapter(pubB as any, subB as any),
    });
    activeServers.push(serverB);

    await new Promise<void>((r) => serverB.listen(0, r));
    const portB = (serverB.address() as any).port;

    // Client connects ONLY to Instance B and joins room "user:driver-456"
    ioB.on('connection', (socket) => {
      socket.join('user:driver-456');
    });

    const clientB: ClientSocketType = ClientSocket(`http://127.0.0.1:${portB}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    activeClients.push(clientB);

    await new Promise<void>((resolve, reject) => {
      clientB.on('connect', resolve);
      clientB.on('connect_error', reject);
    });

    // 3. Emit an event from Instance A to room "user:driver-456"
    const eventPromise = new Promise<{ complaintId: string }>((resolve) => {
      clientB.on('complaint:created', (data) => {
        resolve(data);
      });
    });

    // Pod A broadcasts to room — Redis adapter propagates to Pod B
    ioA.to('user:driver-456').emit('complaint:created', { complaintId: 'DC-2026-99999' } as any);

    const received = await eventPromise;
    expect(received).toEqual({ complaintId: 'DC-2026-99999' });

    // Cleanup
    ioA.close();
    ioB.close();
  }, 15000);

  it('initializes and shuts down cleanly in fallback in-memory mode when Redis is absent', async () => {
    const httpServer = createServer();
    activeServers.push(httpServer);
    await new Promise<void>((r) => httpServer.listen(0, r));
    const port = (httpServer.address() as any).port;

    const token = await signAccessToken({
      sub: 'test-user-id',
      employeeId: 'EMP-001',
      role: 'DRIVER',
    });

    initRealtime(httpServer);

    const client = ClientSocket(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { token },
      forceNew: true,
    });
    activeClients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
    });

    expect(client.connected).toBe(true);

    // Verify emitToUsers in memory
    const eventPromise = new Promise<{ id: string }>((resolve) => {
      client.on('complaint:created', (payload) => {
        resolve(payload as any);
      });
    });

    emitToUsers(['test-user-id'], 'complaint:created', {
      complaint: { id: 'c-123' },
    } as any);

    const data = await eventPromise;
    expect(data).toEqual({ complaint: { id: 'c-123' } });

    const disconnectPromise = new Promise<void>((resolve) => {
      client.on('disconnect', () => resolve());
    });
    await closeRealtime();
    await disconnectPromise;
    expect(client.connected).toBe(false);
  }, 15000);
});
