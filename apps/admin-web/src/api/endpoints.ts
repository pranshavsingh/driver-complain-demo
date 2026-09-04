import { z } from 'zod';
import {
  AdminSummarySchema,
  ComplaintDetailSchema,
  ComplaintPublicSchema,
  DriverListItemSchema,
  ListComplaintsResponseSchema,
  LoginResponseSchema,
  UserPublicSchema,
  VehiclePublicSchema,
  type AdminSummary,
  type ComplaintDetail,
  type ComplaintPublic,
  type DriverListItem,
  type ListComplaintsResponse,
  type LoginRequest,
  type LoginResponse,
  type UpdateComplaintStatus,
  type UserPublic,
  type VehiclePublic,
  type CreateUser,
  type UpdateUser,
  LoadingRecordSchema,
  type LoadingRecord,
  DriverMonthlyTripSummarySchema,
  type DriverMonthlyTripSummary,
} from '@driver-complaint/shared-types';
import { download, request, requestNoContent, type QueryValue } from './client';
import { clearTokens, getRefreshToken } from './tokens';

/**
 * Complaint filters as the UI holds them: every value a string, `''` meaning "no filter".
 *
 * Deliberately not `ComplaintFilter` from shared-types — that type has already been through
 * `z.coerce.date()`, so its date fields are `Date`. Form inputs produce strings, and the
 * round-trip through the URL is strings too.
 */
export interface ComplaintFilterInput {
  search: string;
  status: string;
  priority: string;
  driverId: string;
  vehicleId: string;
  assignedToId: string;
  createdFrom: string;
  createdTo: string;
}

export const EMPTY_FILTER: ComplaintFilterInput = {
  search: '',
  status: '',
  priority: '',
  driverId: '',
  vehicleId: '',
  assignedToId: '',
  createdFrom: '',
  createdTo: '',
};

/**
 * `<input type="date">` yields a bare "2026-08-22". Sent as-is, the API's `z.coerce.date()`
 * reads it as UTC midnight — so a "created to 2026-08-22" filter would exclude every
 * complaint filed on the 22nd, which is not what the admin asked for. Expand each bound to
 * the start/end of that day in the ADMIN'S OWN timezone, which is what they meant.
 */
function dayBound(date: string, edge: 'start' | 'end'): string | undefined {
  if (!date) return undefined;
  const local = new Date(`${date}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}`);
  return Number.isNaN(local.getTime()) ? undefined : local.toISOString();
}

function toQuery(filter: ComplaintFilterInput): Record<string, QueryValue> {
  return {
    search: filter.search,
    status: filter.status,
    priority: filter.priority,
    driverId: filter.driverId,
    vehicleId: filter.vehicleId,
    assignedToId: filter.assignedToId,
    createdFrom: dayBound(filter.createdFrom, 'start'),
    createdTo: dayBound(filter.createdTo, 'end'),
  };
}

export const auth = {
  login: (input: LoginRequest): Promise<LoginResponse> =>
    request(LoginResponseSchema, '/auth/login', {
      method: 'POST',
      body: input,
      anonymous: true,
    }),

  /**
   * Revoke the refresh token server-side, then clear the local session.
   *
   * Best-effort by design: the local tokens are dropped even if the network call fails, so a
   * flaky connection can never trap an admin inside a session they asked to end.
   */
  logout: async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await requestNoContent('/auth/logout', { method: 'POST', body: { refreshToken } });
      } catch {
        // Already expired, revoked, or offline — nothing useful left to do server-side.
      }
    }
    clearTokens();
  },
};

export const users = {
  me: (): Promise<UserPublic> => request(UserPublicSchema, '/users/me'),
  admins: (): Promise<AdminSummary[]> => request(z.array(AdminSummarySchema), '/users/admins'),
  list: (query?: { role?: string; approvalStatus?: string; isActive?: boolean; search?: string }): Promise<UserPublic[]> =>
    request(z.array(UserPublicSchema), '/users', { query: query as Record<string, QueryValue> }),
  create: (input: CreateUser): Promise<UserPublic> =>
    request(UserPublicSchema, '/users', { method: 'POST', body: input }),
  approve: (id: string): Promise<UserPublic> =>
    request(UserPublicSchema, `/users/${id}/approve`, { method: 'POST' }),
  reject: (id: string): Promise<UserPublic> =>
    request(UserPublicSchema, `/users/${id}/reject`, { method: 'POST' }),
  update: (id: string, input: UpdateUser): Promise<UserPublic> =>
    request(UserPublicSchema, `/users/${id}`, { method: 'PATCH', body: input }),
};

export const drivers = {
  list: (): Promise<DriverListItem[]> => request(z.array(DriverListItemSchema), '/drivers'),
};

export const vehicles = {
  list: (): Promise<VehiclePublic[]> => request(z.array(VehiclePublicSchema), '/vehicles'),
};

export const complaints = {
  list: (
    filter: ComplaintFilterInput,
    page: number,
    pageSize: number,
  ): Promise<ListComplaintsResponse> =>
    request(ListComplaintsResponseSchema, '/complaints', {
      query: { ...toQuery(filter), page, pageSize },
    }),

  get: (id: string): Promise<ComplaintDetail> =>
    request(ComplaintDetailSchema, `/complaints/${id}`),

  updateStatus: (id: string, input: UpdateComplaintStatus): Promise<ComplaintPublic> =>
    request(ComplaintPublicSchema, `/complaints/${id}/status`, { method: 'PATCH', body: input }),

  assign: (id: string, assignedToId: string): Promise<ComplaintPublic> =>
    request(ComplaintPublicSchema, `/complaints/${id}/assign`, {
      method: 'POST',
      body: { assignedToId },
    }),

  acceptAssignment: (id: string): Promise<ComplaintPublic> =>
    request(ComplaintPublicSchema, `/complaints/${id}/accept-assignment`, { method: 'POST' }),

  rejectAssignment: (id: string, note?: string): Promise<ComplaintPublic> =>
    request(ComplaintPublicSchema, `/complaints/${id}/reject-assignment`, {
      method: 'POST',
      body: { note },
    }),

  transcribe: (id: string): Promise<ComplaintPublic> =>
    request(ComplaintPublicSchema, `/complaints/${id}/transcribe`, { method: 'POST' }),

  translate: (
    text: string,
    targetLang: 'ENGLISH' | 'HINDI' | 'BENGALI',
  ): Promise<{ text: string; translatedText: string; targetLang: string }> =>
    request(
      z.object({ text: z.string(), translatedText: z.string(), targetLang: z.string() }),
      '/complaints/translate',
      { method: 'POST', body: { text, targetLang } },
    ),


  /** Streams the filtered result set as .xlsx — the same filters the list is showing. */
  exportXlsx: (filter: ComplaintFilterInput): Promise<void> =>
    download('/complaints/export', { query: toQuery(filter) }, 'complaints.xlsx'),
};

export interface TripFilterQuery {
  driverId?: string;
  status?: string;
  year?: number;
  month?: number;
  search?: string;
}

export const loading = {
  list: (query?: TripFilterQuery): Promise<{ data: LoadingRecord[] }> =>
    request(z.object({ data: z.array(LoadingRecordSchema) }), '/loading', { query: query as Record<string, QueryValue> }),

  monthlySummary: (query?: TripFilterQuery): Promise<{ data: DriverMonthlyTripSummary[] }> =>
    request(z.object({ data: z.array(DriverMonthlyTripSummarySchema) }), '/loading/monthly-summary', { query: query as Record<string, QueryValue> }),

  exportCsv: (query?: TripFilterQuery): Promise<void> =>
    download('/loading/export-csv', { query: query as Record<string, QueryValue> }, `trips-report-${Date.now()}.csv`),
};

