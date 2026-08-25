import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { Role, ComplaintEventPayload, RealtimeEvent } from '@driver-complaint/shared-types';
import { corsOrigins } from '../config/env';
import { verifyAccessToken } from '../lib/jwt';
import { logger } from '../lib/logger';

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
    cors: { origin: corsOrigins.length > 0 ? corsOrigins : undefined, credentials: true },
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
    // SAFETY-CRITICAL: a socket only ever joins its OWN user room. Never join a room from
    // client-supplied input — that would let any driver subscribe to another driver's events.
    void socket.join(userRoom(userId));
    logger.debug({ userId, role, socketId: socket.id }, 'Realtime client connected');

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, socketId: socket.id, reason }, 'Realtime client disconnected');
    });
  });

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

/** Close all sockets during graceful shutdown. Safe to call when realtime never started. */
export async function closeRealtime(): Promise<void> {
  if (!io) return;
  const instance = io;
  io = null;
  await new Promise<void>((resolve) => {
    instance.close(() => resolve());
  });
}
