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
  ActiveLoadingResponseSchema,
  type ActiveLoadingResponse,
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
  mine: (): Promise<VehiclePublic[]> => request(z.array(VehiclePublicSchema), '/vehicles/mine'),
};

export function normalizeFileUri(uri: string): string {
  if (!uri) return uri;
  let clean = uri.trim();
  if (clean.startsWith('file:/') && !clean.startsWith('file:///')) {
    clean = clean.replace(/^file:\/+/, 'file:///');
  } else if (clean.startsWith('/')) {
    clean = `file://${clean}`;
  }
  return clean;
}

/** React Native resolves this native URI when it builds the multipart request. */
async function appendFile(form: FormData, field: string, file: FileToUpload): Promise<void> {
  const cleanUri = normalizeFileUri(file.uri);
  const defaultName = field === 'voice' ? 'voice.m4a' : field === 'video' ? 'video.mp4' : 'photo.jpg';
  const defaultType = field === 'voice' ? 'audio/m4a' : field === 'video' ? 'video/mp4' : 'image/jpeg';
  const fileName = file.name || defaultName;
  const mimeType = file.type || defaultType;

  console.log(`[endpoints] Converting ${field} to Blob from: ${cleanUri}`);
  try {
    const res = await fetch(cleanUri);
    const blob = await res.blob();
    if (typeof File !== 'undefined') {
      const fileObj = new File([blob], fileName, { type: mimeType });
      form.append(field, fileObj as unknown as Blob);
    } else {
      (form as any).append(field, blob, fileName);
    }
    console.log(`[endpoints] Appended ${field} as native Blob/File:`, {
      size: blob.size,
      fileName,
      mimeType,
    });
    return;
  } catch (blobErr) {
    console.warn(`[endpoints] blob conversion failed for ${field}, trying direct part:`, blobErr);
  }

  // Fallback for older legacy runtimes
  form.append(field, {
    uri: cleanUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);
}

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
   *
   * warmUpServer() pings /health first so Render.com's sleeping free-tier server has time
   * to wake before the large multipart body arrives — without this, the upload fails with
   * "Network request failed" during the server's ~30-60 s cold-start window.
   */
  create: async (input: CreateComplaint, evidence: EvidenceUpload = {}): Promise<ComplaintPublic> => {
    // Wake the server before sending the complaint
    await warmUpServer();
    const form = new FormData();
    form.append('title', input.title);
    form.append('description', input.description);
    if (input.category) form.append('category', input.category);
    if (input.vehicleId) form.append('vehicleId', input.vehicleId);
    if (input.vehicleNumber) form.append('vehicleNumber', input.vehicleNumber);
    if (input.priority) form.append('priority', input.priority);
    for (const [field, file] of Object.entries(evidence)) {
      if (file) await appendFile(form, field, file);
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
  active: (): Promise<ActiveLoadingResponse> =>
    request(ActiveLoadingResponseSchema, '/loading/active'),

  reached: async (
    input: { latitude: number; longitude: number; address?: string; locationName?: string; complaintId?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    await warmUpServer();
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    if (input.locationName) form.append('locationName', input.locationName);
    if (input.complaintId) form.append('complaintId', input.complaintId);
    await appendFile(form, 'photo', photo);
    return request(LoadingRecordSchema, '/loading/reached', { method: 'POST', body: form });
  },

  completed: async (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
    await warmUpServer();
    const form = new FormData();
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    if (input.address) form.append('address', input.address);
    await appendFile(form, 'photo', photo);
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

  /** "Reached unloading point" — ends transit and starts the unloading clock. */
  completeTrip: async (
    loadingId: string,
    input: { latitude: number; longitude: number; address?: string },
    photo: FileToUpload,
  ): Promise<LoadingRecord> => {
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
