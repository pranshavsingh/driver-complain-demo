import { z } from 'zod';
import {
  ComplaintDetailSchema,
  ComplaintPublicSchema,
  DeviceTokenPublicSchema,
  ListComplaintsResponseSchema,
  LoginResponseSchema,
  UserPublicSchema,
  VehiclePublicSchema,
  LoadingRecordSchema,
  type ComplaintDetail,
  type ComplaintPublic,
  type CreateComplaint,
  type DeviceTokenPublic,
  type ListComplaintsResponse,
  type LoginRequest,
  type LoginResponse,
  type RegisterDeviceToken,
  type UserPublic,
  type VehiclePublic,
  type LoadingRecord,
} from '@driver-complaint/shared-types';
import { request, requestNoContent } from './client';
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
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await requestNoContent('/auth/logout', { method: 'POST', body: { refreshToken } });
      } catch {
        // Already expired, revoked, or offline — nothing useful left to do server-side.
      }
    }
    await clearTokens();
  },
};

export const users = {
  me: (): Promise<UserPublic> => request(UserPublicSchema, '/users/me'),
};

export const vehicles = {
  /** The vehicles assigned to the signed-in driver. Usually exactly one. */
  mine: (): Promise<VehiclePublic[]> => request(z.array(VehiclePublicSchema as any) as any, '/vehicles/mine'),
};

export const complaints = {
  /**
   * The driver's own complaints. The API scopes this by the caller's role — a driver never
   * sees another driver's rows — so no driverId filter is sent from here.
   */
  mine: (page: number, pageSize: number): Promise<ListComplaintsResponse> =>
    request(ListComplaintsResponseSchema, '/complaints', { query: { page, pageSize } }),

  get: (id: string): Promise<ComplaintDetail> =>
    request(ComplaintDetailSchema, `/complaints/${encodeURIComponent(id)}`),

  /**
   * File a complaint, with optional photo / voice note / video, as one multipart request.
   *
   * Multipart even with no evidence: the endpoint runs multer before zod either way, and one
   * code path means the with-evidence case is the one that gets exercised every time.
   */
  create: (input: CreateComplaint, evidence: EvidenceUpload = {}): Promise<ComplaintPublic> => {
    const form = new FormData();
    form.append('title', input.title);
    form.append('description', input.description);
    if (input.category) form.append('category', input.category);
    if (input.vehicleId) form.append('vehicleId', input.vehicleId);
    if (input.priority) form.append('priority', input.priority);
    for (const [field, file] of Object.entries(evidence)) {
      // React Native's FormData accepts this {uri,name,type} object and streams the file from
      // disk; the DOM typings only know about Blob, hence the cast. Do NOT "fix" it by reading
      // the file into a Blob — that loads several megabytes into JS memory on a cheap phone.
      if (file) form.append(field, file as unknown as Blob);
    }
    return request(ComplaintPublicSchema, '/complaints', { method: 'POST', body: form });
  },
};

export const notifications = {
  /** Register this device for push. Safe to call on every launch — the API upserts on token. */
  registerDevice: (input: RegisterDeviceToken): Promise<DeviceTokenPublic> =>
    request(DeviceTokenPublicSchema, '/notifications/devices', { method: 'POST', body: input }),

  /** De-register on logout, so the next person to hold this phone gets no pushes for it. */
  unregisterDevice: (token: string): Promise<void> =>
    requestNoContent(`/notifications/devices/${encodeURIComponent(token)}`, { method: 'DELETE' }),
};

export const loading = {
  active: (): Promise<{ active: LoadingRecord | null }> =>
    request(z.object({ active: z.any() }) as any, '/loading/active'),

  reached: (
    input: { latitude: number; longitude: number; address?: string; locationName?: string; complaintId?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    if (input.locationName) form.append('locationName', input.locationName);
    if (input.complaintId) form.append('complaintId', input.complaintId);
    form.append('photo', photo as unknown as Blob);
    return request(LoadingRecordSchema, '/loading/reached', { method: 'POST', body: form });
  },

  completed: (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    form.append('photo', photo as unknown as Blob);
    return request(LoadingRecordSchema, `/loading/${encodeURIComponent(loadingId)}/complete`, {
      method: 'PATCH',
      body: form,
    });
  },

  startTrip: (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
  ): Promise<LoadingRecord> => {
    return request(LoadingRecordSchema, `/loading/${encodeURIComponent(loadingId)}/start-trip`, {
      method: 'POST',
      body: input,
    });
  },

  completeTrip: (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    form.append('photo', photo as unknown as Blob);
    return request(LoadingRecordSchema, `/loading/${encodeURIComponent(loadingId)}/complete-trip`, {
      method: 'PATCH',
      body: form,
    });
  },
};

