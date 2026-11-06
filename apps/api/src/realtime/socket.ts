import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Role, ComplaintEventPayload, RealtimeEvent } from '@driver-complaint/shared-types';
import { verifyAccessToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { redis, duplicateRedis } from '../lib/redis';
import {
  socketioConnectedClients,
  socketioConnectionsTotal,
  socketioDisconnectionsTotal,
  normalizeDisconnectReason,
} from '../lib/metrics';

/** What we attach to each authenticated socket after the handshake. */
interface SocketData {
  userId: string;
  role: Role;
}

/** Server→client events only; clients never emit to us (no client→server contract yet). */
type ServerToClientEvents = Record<RealtimeEvent, (payload: ComplaintEventPayload) => void>;
type ClientToServerEvents = Record<string, never>;
type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Set once by initRealtime(). Stays null in tests and scripts, making emits no-ops. */
let io: RealtimeServer | null = null;

/** Per-user room name. Emitting to a room fans out to every tab/device that user has open. */
const userRoom = (userId: string): string => `user:${userId}`;

/** Pull the access token off the handshake (`auth.token`, or an Authorization header). */
function extractToken(socket: Socket<ClientToServerEvents, ServerToClientEvents>): string | null {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

  return null;
}

/**
 * Attach Socket.IO to the HTTP server. Deliberately NOT part of createApp(): supertest
 * imports the Express app directly, and tests must not open sockets or leave handles behind.
 */
export function initRealtime(server: HttpServer): RealtimeServer {
  const instance: RealtimeServer = new Server(server, {
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        // Reflect requesting origin to guarantee compatibility with credentials: true
        return callback(null, origin);
      },
      credentials: true,
    },
  });

  // Same JWT as the REST API — an unauthenticated socket is rejected before it connects,
  // so no room is ever joined without a verified user id.
  instance.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    verifyAccessToken(token)
      .then((claims) => {
        socket.data.userId = claims.sub;
        socket.data.role = claims.role;
        next();
      })
      .catch(() => {
        next(new Error('UNAUTHORIZED'));
      });
  });

  instance.on('connection', (socket) => {
    const { userId, role } = socket.data;

    socketioConnectedClients.inc();
    socketioConnectionsTotal.inc();

    // SAFETY-CRITICAL: a socket only ever joins its OWN user room and its verified role room.
    void socket.join(userRoom(userId));
    if (role) {
      void socket.join(`role:${role}`);
    }
    logger.debug({ userId, role, socketId: socket.id }, 'Realtime client connected');

    socket.on('disconnect', (reason) => {
      socketioConnectedClients.dec();
      socketioDisconnectionsTotal.inc({ reason: normalizeDisconnectReason(reason) });
      logger.debug({ userId, socketId: socket.id, reason }, 'Realtime client disconnected');
    });
  });

  // Attach Redis adapter for horizontal scaling across pods — enforce Redis in production
  if (redis) {
    const pubClient = duplicateRedis();
    const subClient = duplicateRedis();
    if (pubClient && subClient) {
      try {
        instance.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter attached (horizontal cross-instance scaling enabled)');
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          logger.error({ err }, 'FATAL: Failed to attach Socket.IO Redis adapter in production');
          throw new Error('FATAL: Socket.IO Redis adapter failed to initialize in production environment');
        }
        logger.error({ err }, 'Failed to attach Socket.IO Redis adapter — using in-memory');
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Could not duplicate Redis connections for Socket.IO adapter in production');
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Socket.IO Redis adapter cannot be initialized without Redis in production');
    }
    logger.info('Socket.IO initialized with in-memory adapter (development/test mode)');
  }

  io = instance;
  logger.info('Realtime (Socket.IO) attached');
  return instance;
}

/** Emit an event to every connected device of the given users. No-op when realtime is off. */
export function emitToUsers(
  userIds: string[],
  event: RealtimeEvent,
  payload: ComplaintEventPayload,
): void {
  if (!io || userIds.length === 0) return;
  io.to(userIds.map(userRoom)).emit(event, payload);
}

/** Emit any realtime event to specified user rooms. */
export function emitEventToUsers(
  userIds: string[],
  event: string,
  payload: any,
): void {
  if (!io || userIds.length === 0) return;
  io.to(userIds.map(userRoom)).emit(event as any, payload);
}

/** Emit any realtime event to all users with the specified roles. */
export function emitToRoles(
  roles: Role[],
  event: string,
  payload: any,
): void {
  if (!io || roles.length === 0) return;
  io.to(roles.map((r) => `role:${r}`)).emit(event as any, payload);
}

/** Broadcast any realtime event to all connected sockets. */
export function emitToAll(event: string, payload: any): void {
  if (!io) return;
  io.emit(event as any, payload);
}

/** Close all sockets during graceful shutdown. Safe to call when realtime never started. */
export async function closeRealtime(): Promise<void> {
  if (!io) return;
  const instance = io;
  io = null;
  socketioConnectedClients.set(0);
  await new Promise<void>((resolve) => {
    instance.close(() => resolve());
  });
}

/** Access the active Socket.IO instance (or null if not initialized). */
export function getIo(): RealtimeServer | null {
  return io;
}
