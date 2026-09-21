import { z } from 'zod';
import {
  ComplaintDetailSchema,
  DeviceTokenPublicSchema,
  ListComplaintsResponseSchema,
  LoginResponseSchema,
  UserPublicSchema,
  VehiclePublicSchema,
  LoadingRecordSchema,
  ActiveLoadingResponseSchema,
  FuelRecordPublicSchema,
  ListFuelRecordsResponseSchema,
  MaintenanceRecordPublicSchema,
  ListMaintenanceRecordsResponseSchema,
  type ActiveLoadingResponse,
  type ComplaintDetail,
  type CreateComplaint,
  type DeviceTokenPublic,
  type ListComplaintsResponse,
  type LoginRequest,
  type LoginResponse,
  type RegisterDeviceToken,
  type UserPublic,
  type VehiclePublic,
  type LoadingRecord,
  type FuelRecordPublic,
  type MaintenanceRecordPublic,
} from '@driver-complaint/shared-types';
import { request, requestNoContent, warmUpServer } from './client';
import { clearTokens, getRefreshToken } from './tokens';

/** A file picked or recorded on the device, in the shape React Native's FormData wants. */
export interface FileToUpload {
  /** file:// or content:// URI from the picker or the recorder. */
  uri: string;
  name: string;
  /** MIME type. The API checks the prefix per field: image/, audio/, video/. */
  type: string;
}

/**
 * Evidence for one complaint: at most one file of each kind. The keys are the API's multipart
 * field names (apps/api/src/middleware/upload.ts) — renaming one here silently drops the file,
 * so they are used verbatim as the form field names below.
 */
export interface EvidenceUpload {
  photo?: FileToUpload;
  voice?: FileToUpload;
  video?: FileToUpload;
}

export function validateGpsCoordinates(lat?: number, lng?: number): void {
  if (lat !== undefined) {
    if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
      throw new Error('Latitude must be a valid number between -90 and 90');
    }
  }
  if (lng !== undefined) {
    if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
      throw new Error('Longitude must be a valid number between -180 and 180');
    }
  }
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
   * Best-effort by design: the stored tokens are dropped even if the network call fails, so a
   * driver with no signal can still hand the phone back without leaving a live session on it.
   */
  logout: async (): Promise<void> => {
    const token = await getRefreshToken();
    if (token) {
      try {
        await requestNoContent('/auth/logout', {
          method: 'POST',
          body: { refreshToken: token },
          anonymous: true,
        });
      } catch {
        // Drop network failures silently; clearing local tokens is the priority.
      }
    }
    await clearTokens();
  },
};

export const users = {
  me: (): Promise<UserPublic> => request(UserPublicSchema, '/users/me'),
};

export const vehicles = {
  /** The vehicles currently assigned to the logged-in driver. */
  mine: (): Promise<VehiclePublic[]> =>
    request(z.array(VehiclePublicSchema), '/vehicles/mine'),
};

/**
 * Helper to append a single FileToUpload to a React Native FormData instance.
 *
 * React Native's FormData implementation expects `{ uri, name, type }` as the second argument
 * (typed here as `any` because the web `Blob` typings don't match the RN native object).
 */
function appendFile(form: FormData, fieldName: string, file: FileToUpload): void {
  form.append(fieldName, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}

export const complaints = {
  create: async (input: CreateComplaint, evidence?: EvidenceUpload): Promise<ComplaintDetail> => {
    await warmUpServer();

    const form = new FormData();
    form.append('title', input.title);
    form.append('description', input.description);
    if (input.vehicleId) form.append('vehicleId', input.vehicleId);
    if (input.vehicleNumber) form.append('vehicleNumber', input.vehicleNumber);
    if (input.priority) form.append('priority', input.priority);
    if (input.category) form.append('category', input.category);
    if (input.tripPhase) form.append('tripPhase', input.tripPhase);

    if (evidence?.photo) appendFile(form, 'photo', evidence.photo);
    if (evidence?.voice) appendFile(form, 'voice', evidence.voice);
    if (evidence?.video) appendFile(form, 'video', evidence.video);

    return request(ComplaintDetailSchema, '/complaints', {
      method: 'POST',
      body: form,
    });
  },

  mine: (page = 1, pageSize = 15, status?: string): Promise<ListComplaintsResponse> =>
    request(ListComplaintsResponseSchema, '/complaints', {
      query: { page, pageSize, ...(status ? { status } : {}) },
    }),

  listMine: (query?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<ListComplaintsResponse> =>
    request(ListComplaintsResponseSchema, '/complaints', {
      query: query as Record<string, string | number>,
    }),

  get: (id: string): Promise<ComplaintDetail> =>
    request(ComplaintDetailSchema, `/complaints/${encodeURIComponent(id)}`),

  getById: (id: string): Promise<ComplaintDetail> =>
    request(ComplaintDetailSchema, `/complaints/${encodeURIComponent(id)}`),
};

export const notifications = {
  registerDevice: (input: RegisterDeviceToken): Promise<DeviceTokenPublic> =>
    request(DeviceTokenPublicSchema, '/notifications/devices', {
      method: 'POST',
      body: input,
    }),

  unregisterDevice: (token: string): Promise<void> =>
    requestNoContent(`/notifications/devices/${encodeURIComponent(token)}`, {
      method: 'DELETE',
    }),
};

export const devices = notifications;

export const loading = {
  active: (): Promise<ActiveLoadingResponse> =>
    request(ActiveLoadingResponseSchema, '/loading/active'),

  getActive: (): Promise<ActiveLoadingResponse> =>
    request(ActiveLoadingResponseSchema, '/loading/active'),

  reached: async (
    input: {
      latitude: number;
      longitude: number;
      address?: string;
      locationName?: string;
      complaintId?: string;
    },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    validateGpsCoordinates(input.latitude, input.longitude);
    await warmUpServer();
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    if (input.locationName) form.append('locationName', input.locationName);
    if (input.complaintId) form.append('complaintId', input.complaintId);
    appendFile(form, 'photo', photo);
    return request(LoadingRecordSchema, '/loading/reached', { method: 'POST', body: form });
  },

  completed: async (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    validateGpsCoordinates(input.latitude, input.longitude);
    await warmUpServer();
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    appendFile(form, 'photo', photo);
    return request(LoadingRecordSchema, `/loading/${encodeURIComponent(loadingId)}/complete`, {
      method: 'PATCH',
      body: form,
    });
  },

  startTrip: (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
  ): Promise<LoadingRecord> => {
    validateGpsCoordinates(input.latitude, input.longitude);
    return request(LoadingRecordSchema, `/loading/${encodeURIComponent(loadingId)}/start-trip`, {
      method: 'POST',
      body: input,
    });
  },

  /** "Reached unloading point" — ends transit and starts the unloading clock. */
  completeTrip: async (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    validateGpsCoordinates(input.latitude, input.longitude);
    await warmUpServer();
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    appendFile(form, 'photo', photo);
    return request(LoadingRecordSchema, `/loading/${encodeURIComponent(loadingId)}/complete-trip`, {
      method: 'PATCH',
      body: form,
    });
  },

  /** "Unloading done" — closes the cycle out and increments the completed-trip count. */
  completeUnloading: async (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    validateGpsCoordinates(input.latitude, input.longitude);
    await warmUpServer();
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    appendFile(form, 'photo', photo);
    return request(LoadingRecordSchema, `/loading/${encodeURIComponent(loadingId)}/complete-unloading`, {
      method: 'PATCH',
      body: form,
    });
  },
};

export const fuel = {
  create: async (
    input: {
      vehicleId?: string;
      vehicleNumber?: string;
      type: 'FUEL' | 'DEF';
      quantityLtr: number;
      totalPrice?: number;
      odometerKm?: number;
      notes?: string;
    },
    receiptPhoto?: FileToUpload,
  ): Promise<FuelRecordPublic> => {
    await warmUpServer();
    const form = new FormData();
    if (input.vehicleId) form.append('vehicleId', input.vehicleId);
    if (input.vehicleNumber) form.append('vehicleNumber', input.vehicleNumber);
    form.append('type', input.type);
    form.append('quantityLtr', String(input.quantityLtr));
    if (input.totalPrice !== undefined) form.append('totalPrice', String(input.totalPrice));
    if (input.odometerKm !== undefined) form.append('odometerKm', String(input.odometerKm));
    if (input.notes) form.append('notes', input.notes);
    if (receiptPhoto) appendFile(form, 'receipt', receiptPhoto);

    return request(FuelRecordPublicSchema, '/fuel', { method: 'POST', body: form });
  },

  mine: (page = 1, limit = 20): Promise<{ data: FuelRecordPublic[]; meta: any }> =>
    request(ListFuelRecordsResponseSchema, '/fuel', { query: { page, limit } }),
};

export const maintenance = {
  create: async (
    input: {
      vehicleId?: string;
      vehicleNumber?: string;
      type: 'TYRE' | 'BATTERY';
      itemNumber: string;
      oldItemNumber?: string;
      quantity?: number;
      odometerKm?: number;
      brand?: string;
      position?: string;
      cost?: number;
      notes?: string;
    },
    photo?: FileToUpload,
  ): Promise<MaintenanceRecordPublic> => {
    await warmUpServer();
    const form = new FormData();
    if (input.vehicleId) form.append('vehicleId', input.vehicleId);
    if (input.vehicleNumber) form.append('vehicleNumber', input.vehicleNumber);
    form.append('type', input.type);
    form.append('itemNumber', input.itemNumber);
    if (input.oldItemNumber) form.append('oldItemNumber', input.oldItemNumber);
    if (input.quantity !== undefined) form.append('quantity', String(input.quantity));
    if (input.odometerKm !== undefined) form.append('odometerKm', String(input.odometerKm));
    if (input.brand) form.append('brand', input.brand);
    if (input.position) form.append('position', input.position);
    if (input.cost !== undefined) form.append('cost', String(input.cost));
    if (input.notes) form.append('notes', input.notes);
    if (photo) appendFile(form, 'photo', photo);

    return request(MaintenanceRecordPublicSchema, '/maintenance', { method: 'POST', body: form });
  },

  mine: (page = 1, limit = 20): Promise<{ data: MaintenanceRecordPublic[]; meta: any }> =>
    request(ListMaintenanceRecordsResponseSchema, '/maintenance', { query: { page, limit } }),
};

export const spareParts = {
  create: async (
    input: {
      vehicleId?: string;
      vehicleNumber?: string;
      partName?: string;
      description?: string;
      quantity?: number;
      type?: 'NEW' | 'EXCHANGE' | 'REPAIR' | 'OTHER';
    },
    evidence?: {
      photo?: FileToUpload;
      voice?: FileToUpload;
    },
  ): Promise<any> => {
    await warmUpServer();
    const form = new FormData();
    if (input.vehicleId) form.append('vehicleId', input.vehicleId);
    if (input.vehicleNumber) form.append('vehicleNumber', input.vehicleNumber);
    if (input.partName) form.append('partName', input.partName);
    if (input.description) form.append('description', input.description);
    if (input.quantity !== undefined) form.append('quantity', String(input.quantity));
    if (input.type) form.append('type', input.type);

    if (evidence?.photo) appendFile(form, 'photo', evidence.photo);
    if (evidence?.voice) appendFile(form, 'voice', evidence.voice);

    return request(z.any(), '/spare-parts', { method: 'POST', body: form });
  },

  mine: (page = 1, limit = 20): Promise<{ data: any[]; meta: any }> =>
    request(z.any(), '/spare-parts', { query: { page, limit } }),
};

export const support = {
  getDefaultAdmin: (): Promise<UserPublic> =>
    request(UserPublicSchema, '/support/default-admin'),

  getConversations: (): Promise<any[]> =>
    request(z.array(z.any()), '/support/conversations'),

  getMessages: (
    otherUserId: string,
    query?: { page?: number; limit?: number },
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> =>
    request(
      z.object({
        data: z.array(z.any()),
        total: z.number(),
        page: z.number(),
        limit: z.number(),
      }),
      `/support/messages/${encodeURIComponent(otherUserId)}`,
      {
        query: query as Record<string, string | number>,
      },
    ),

  sendMessage: async (
    input: { receiverId?: string; content?: string; type?: 'TEXT' | 'IMAGE' | 'AUDIO' },
    attachment?: FileToUpload,
  ): Promise<any> => {
    await warmUpServer();
    const form = new FormData();
    if (input.receiverId) form.append('receiverId', input.receiverId);
    if (input.content) form.append('content', input.content);
    if (input.type) form.append('type', input.type);
    if (attachment) {
      appendFile(form, 'attachment', attachment);
    }
    return request(z.any(), '/support/messages', {
      method: 'POST',
      body: form,
    });
  },

  markRead: (otherUserId: string): Promise<{ updated: number }> =>
    request(z.object({ updated: z.number() }), `/support/messages/${encodeURIComponent(otherUserId)}/read`, {
      method: 'PATCH',
    }),

  getUnreadCount: (): Promise<{ unreadCount: number }> =>
    request(z.object({ unreadCount: z.number() }), '/support/unread-count'),
};
