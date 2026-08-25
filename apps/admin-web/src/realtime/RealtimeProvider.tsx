import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  ComplaintEventPayloadSchema,
  REALTIME_EVENTS,
  type ComplaintEventPayload,
  type RealtimeEvent,
} from '@driver-complaint/shared-types';
import { apiUrl } from '../config/env';
import { refreshSession } from '../api/client';
import { getAccessToken, notifySessionEnded } from '../api/tokens';
import { useAuth } from '../auth/AuthContext';

export interface RealtimeMessage {
  event: RealtimeEvent;
  payload: ComplaintEventPayload;
}

type Handler = (message: RealtimeMessage) => void;

interface RealtimeContextValue {
  /** Whether the live connection is currently up — shown in the header. */
  connected: boolean;
  /** Register a handler for complaint events. Returns an unsubscribe function. */
  subscribe: (handler: Handler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * One Socket.IO connection for the whole dashboard.
 *
 * Realtime events are live HINTS, not the source of truth: every event has a matching durable
 * Notification row, and the screens re-fetch over REST when they act on one. So a dropped
 * connection degrades the dashboard to "manual refresh", never to "wrong data".
 */
export function RealtimeProvider({ children }: { children: ReactNode }): ReactElement {
  const { status } = useAuth();
  const [connected, setConnected] = useState(false);

  // Handlers live in a ref so subscribing does not re-create the socket.
  const handlers = useRef(new Set<Handler>());

  const subscribe = useCallback((handler: Handler): (() => void) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setConnected(false);
      return;
    }

    const socket: Socket = io(apiUrl, {
      path: '/socket.io',
      // The API authenticates the CONNECT packet (not the HTTP handshake) and reads
      // handshake.auth.token. Supplying `auth` as a callback means each reconnect attempt
      // fetches the CURRENT access token, rather than reusing the one captured at mount —
      // which would be expired after 15 minutes.
      auth: (cb: (data: Record<string, unknown>) => void) => {
        cb({ token: getAccessToken() ?? '' });
      },
      reconnectionDelayMax: 10_000,
    });

    socket.on('connect', () => {
      setConnected(true);
    });
    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      setConnected(false);
      // Only an auth rejection is ours to fix. Transport/network errors are left to
      // socket.io's own backoff — refreshing on those would rotate the refresh token every
      // few seconds for as long as the API stays unreachable.
      if (err.message !== 'UNAUTHORIZED') return;
      void refreshSession().then((ok) => {
        if (ok) return; // The next automatic reconnect picks up the new token.
        socket.disconnect();
        notifySessionEnded();
      });
    });

    for (const event of Object.values(REALTIME_EVENTS)) {
      socket.on(event, (raw: unknown) => {
        // Validate against the shared contract: a malformed event is dropped rather than
        // pushed into the UI as a half-populated row.
        const parsed = ComplaintEventPayloadSchema.safeParse(raw);
        if (!parsed.success) return;
        for (const handler of handlers.current) handler({ event, payload: parsed.data });
      });
    }

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [status]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ connected, subscribe }),
    [connected, subscribe],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return value;
}
