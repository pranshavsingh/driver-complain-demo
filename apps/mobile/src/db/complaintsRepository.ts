import { getDatabase } from './database';
import type * as SQLite from 'expo-sqlite';

export type LocalSyncStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED_TRANSIENT'
  | 'FAILED_PERMANENT';

export interface PendingAttachmentRecord {
  id: string;
  complaintId: string;
  kind: 'PHOTO' | 'VOICE' | 'VIDEO';
  localUri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadStatus: 'PENDING' | 'UPLOADED' | 'FAILED';
  createdAt: string;
}

export interface PendingComplaintRecord {
  id: string;
  userId: string;
  idempotencyKey: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
  tripPhase?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: LocalSyncStatus;
  retryCount: number;
  lastSyncAttempt?: string | null;
  lastFailureReason?: string | null;
  serverComplaintId?: string | null;
  serverComplaintNo?: string | null;
  attachments: PendingAttachmentRecord[];
}

export type CreatePendingAttachmentInput = {
  id?: string;
  kind: 'PHOTO' | 'VOICE' | 'VIDEO';
  localUri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadStatus?: 'PENDING' | 'UPLOADED' | 'FAILED';
  createdAt?: string;
};

export type CreatePendingComplaintInput = {
  id: string;
  userId: string;
  idempotencyKey: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
  tripPhase?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  attachments?: CreatePendingAttachmentInput[];
};

interface ComplaintRow {
  id: string;
  user_id: string;
  idempotency_key: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  vehicle_id: string | null;
  vehicle_number: string | null;
  trip_phase: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  created_at: string;
  updated_at: string;
  sync_status: LocalSyncStatus;
  retry_count: number;
  last_sync_attempt: string | null;
  last_failure_reason: string | null;
  server_complaint_id: string | null;
  server_complaint_no: string | null;
}

interface AttachmentRow {
  id: string;
  complaint_id: string;
  kind: 'PHOTO' | 'VOICE' | 'VIDEO';
  local_uri: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  upload_status: 'PENDING' | 'UPLOADED' | 'FAILED';
  created_at: string;
}

function mapAttachmentRow(row: AttachmentRow): PendingAttachmentRecord {
  return {
    id: row.id,
    complaintId: row.complaint_id,
    kind: row.kind,
    localUri: row.local_uri,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    uploadStatus: row.upload_status,
    createdAt: row.created_at,
  };
}

function mapComplaintRow(row: ComplaintRow, attachments: PendingAttachmentRecord[] = []): PendingComplaintRecord {
  return {
    id: row.id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    vehicleId: row.vehicle_id,
    vehicleNumber: row.vehicle_number,
    tripPhase: row.trip_phase,
    latitude: row.latitude,
    longitude: row.longitude,
    locationName: row.location_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
    retryCount: row.retry_count,
    lastSyncAttempt: row.last_sync_attempt,
    lastFailureReason: row.last_failure_reason,
    serverComplaintId: row.server_complaint_id,
    serverComplaintNo: row.server_complaint_no,
    attachments,
  };
}

export const complaintsRepository = {
  /**
   * Save a new complaint and its attachments into SQLite in a single transaction.
   */
  async savePendingComplaint(
    input: CreatePendingComplaintInput,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<PendingComplaintRecord> {
    const now = new Date().toISOString();

    db.execSync('BEGIN IMMEDIATE;');
    try {
      db.runSync(
        `INSERT INTO pending_complaints (
          id, user_id, idempotency_key, title, description, category, priority,
          vehicle_id, vehicle_number, trip_phase, latitude, longitude, location_name,
          created_at, updated_at, sync_status, retry_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0);`,
        [
          input.id,
          input.userId,
          input.idempotencyKey,
          input.title,
          input.description,
          input.category,
          input.priority,
          input.vehicleId ?? null,
          input.vehicleNumber ?? null,
          input.tripPhase ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          input.locationName ?? null,
          now,
          now,
        ],
      );

      const savedAttachments: PendingAttachmentRecord[] = [];
      if (input.attachments && input.attachments.length > 0) {
        for (const att of input.attachments) {
          const attId = att.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          db.runSync(
            `INSERT INTO pending_attachments (
              id, complaint_id, kind, local_uri, file_name, mime_type, file_size, upload_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?);`,
            [
              attId,
              input.id,
              att.kind,
              att.localUri,
              att.fileName,
              att.mimeType,
              att.fileSize,
              att.createdAt || now,
            ],
          );
          savedAttachments.push({
            id: attId,
            complaintId: input.id,
            kind: att.kind,
            localUri: att.localUri,
            fileName: att.fileName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            uploadStatus: 'PENDING',
            createdAt: att.createdAt || now,
          });
        }
      }

      db.execSync('COMMIT;');

      return {
        id: input.id,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        vehicleId: input.vehicleId ?? null,
        vehicleNumber: input.vehicleNumber ?? null,
        tripPhase: input.tripPhase ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        locationName: input.locationName ?? null,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'PENDING',
        retryCount: 0,
        lastSyncAttempt: null,
        lastFailureReason: null,
        serverComplaintId: null,
        serverComplaintNo: null,
        attachments: savedAttachments,
      };
    } catch (err) {
      db.execSync('ROLLBACK;');
      throw err;
    }
  },

  /**
   * Fetch pending complaints that are eligible for synchronization for a specific user.
   * Scoped strictly by userId.
   */
  async getPendingQueueForUser(
    userId: string,
    limit = 20,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<PendingComplaintRecord[]> {
    const rows = db.getAllSync<ComplaintRow>(
      `SELECT * FROM pending_complaints 
       WHERE user_id = ? AND sync_status IN ('PENDING', 'FAILED_TRANSIENT')
       ORDER BY created_at ASC
       LIMIT ?;`,
      [userId, limit],
    );

    if (rows.length === 0) return [];

    const complaintIds = rows.map((r) => r.id);
    const placeholders = complaintIds.map(() => '?').join(',');
    const attachmentRows = db.getAllSync<AttachmentRow>(
      `SELECT * FROM pending_attachments WHERE complaint_id IN (${placeholders});`,
      complaintIds,
    );

    const attachmentsByComplaint = new Map<string, PendingAttachmentRecord[]>();
    for (const att of attachmentRows) {
      const list = attachmentsByComplaint.get(att.complaint_id) ?? [];
      list.push(mapAttachmentRow(att));
      attachmentsByComplaint.set(att.complaint_id, list);
    }

    return rows.map((row) => mapComplaintRow(row, attachmentsByComplaint.get(row.id) ?? []));
  },

  /**
   * Fetch all local complaints (including pending, syncing, failed, and recently synced) for UI display.
   * Scoped strictly by userId.
   */
  async getDisplayComplaintsForUser(
    userId: string,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<PendingComplaintRecord[]> {
    const rows = db.getAllSync<ComplaintRow>(
      `SELECT * FROM pending_complaints 
       WHERE user_id = ?
       ORDER BY created_at DESC;`,
      [userId],
    );

    if (rows.length === 0) return [];

    const complaintIds = rows.map((r) => r.id);
    const placeholders = complaintIds.map(() => '?').join(',');
    const attachmentRows = db.getAllSync<AttachmentRow>(
      `SELECT * FROM pending_attachments WHERE complaint_id IN (${placeholders});`,
      complaintIds,
    );

    const attachmentsByComplaint = new Map<string, PendingAttachmentRecord[]>();
    for (const att of attachmentRows) {
      const list = attachmentsByComplaint.get(att.complaint_id) ?? [];
      list.push(mapAttachmentRow(att));
      attachmentsByComplaint.set(att.complaint_id, list);
    }

    return rows.map((row) => mapComplaintRow(row, attachmentsByComplaint.get(row.id) ?? []));
  },

  /**
   * Find a specific pending complaint by ID.
   */
  async getComplaintById(
    id: string,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<PendingComplaintRecord | null> {
    const row = db.getFirstSync<ComplaintRow>(
      `SELECT * FROM pending_complaints WHERE id = ?;`,
      [id],
    );
    if (!row) return null;

    const attachmentRows = db.getAllSync<AttachmentRow>(
      `SELECT * FROM pending_attachments WHERE complaint_id = ?;`,
      [id],
    );

    return mapComplaintRow(row, attachmentRows.map(mapAttachmentRow));
  },

  /**
   * Find a complaint by idempotency key and owner userId.
   */
  async getComplaintByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<PendingComplaintRecord | null> {
    const row = db.getFirstSync<ComplaintRow>(
      `SELECT * FROM pending_complaints WHERE user_id = ? AND idempotency_key = ?;`,
      [userId, idempotencyKey],
    );
    if (!row) return null;

    const attachmentRows = db.getAllSync<AttachmentRow>(
      `SELECT * FROM pending_attachments WHERE complaint_id = ?;`,
      [row.id],
    );

    return mapComplaintRow(row, attachmentRows.map(mapAttachmentRow));
  },

  /**
   * Update sync status of a complaint.
   */
  async updateSyncStatus(
    id: string,
    status: LocalSyncStatus,
    lastFailureReason: string | null = null,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<void> {
    const now = new Date().toISOString();
    db.runSync(
      `UPDATE pending_complaints 
       SET sync_status = ?, last_failure_reason = ?, updated_at = ?, last_sync_attempt = ?
       WHERE id = ?;`,
      [status, lastFailureReason, now, now, id],
    );
  },

  /**
   * Increment retry count and mark status as FAILED_TRANSIENT or FAILED_PERMANENT.
   */
  async recordSyncFailure(
    id: string,
    failureReason: string,
    isPermanent = false,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<void> {
    const now = new Date().toISOString();
    const status: LocalSyncStatus = isPermanent ? 'FAILED_PERMANENT' : 'FAILED_TRANSIENT';
    db.runSync(
      `UPDATE pending_complaints 
       SET sync_status = ?, 
           retry_count = retry_count + 1, 
           last_failure_reason = ?, 
           updated_at = ?, 
           last_sync_attempt = ?
       WHERE id = ?;`,
      [status, failureReason, now, now, id],
    );
  },

  /**
   * Mark a complaint as successfully synced with server details.
   */
  async markComplaintSynced(
    id: string,
    serverComplaintId: string,
    serverComplaintNo: string,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<void> {
    const now = new Date().toISOString();
    db.runSync(
      `UPDATE pending_complaints 
       SET sync_status = 'SYNCED', 
           server_complaint_id = ?, 
           server_complaint_no = ?, 
           last_failure_reason = NULL,
           updated_at = ?
       WHERE id = ?;`,
      [serverComplaintId, serverComplaintNo, now, id],
    );
  },

  /**
   * Reset any complaint that was interrupted mid-sync back to PENDING.
   * Recovers from app crashes or process termination during network upload.
   */
  async resetStuckSyncing(
    userId?: string,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<number> {
    const now = new Date().toISOString();
    if (userId) {
      const result = db.runSync(
        `UPDATE pending_complaints 
         SET sync_status = 'PENDING', updated_at = ?
         WHERE user_id = ? AND sync_status = 'SYNCING';`,
        [now, userId],
      );
      return result.changes;
    }
    const result = db.runSync(
      `UPDATE pending_complaints 
       SET sync_status = 'PENDING', updated_at = ?
       WHERE sync_status = 'SYNCING';`,
      [now],
    );
    return result.changes;
  },

  /**
   * Delete a pending complaint record (and cascading attachments).
   */
  async deletePendingComplaint(
    id: string,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<void> {
    db.runSync(`DELETE FROM pending_complaints WHERE id = ?;`, [id]);
  },

  /**
   * Get queue summary counts for badges and UI banners.
   */
  async getQueueCountsForUser(
    userId: string,
    db: SQLite.SQLiteDatabase = getDatabase(),
  ): Promise<{ pending: number; syncing: number; failed: number; totalUnsynced: number }> {
    const rows = db.getAllSync<{ sync_status: LocalSyncStatus; count: number }>(
      `SELECT sync_status, COUNT(*) as count 
       FROM pending_complaints 
       WHERE user_id = ? AND sync_status != 'SYNCED'
       GROUP BY sync_status;`,
      [userId],
    );

    let pending = 0;
    let syncing = 0;
    let failed = 0;

    for (const r of rows) {
      if (r.sync_status === 'PENDING') pending += r.count;
      else if (r.sync_status === 'SYNCING') syncing += r.count;
      else if (r.sync_status === 'FAILED_TRANSIENT' || r.sync_status === 'FAILED_PERMANENT') failed += r.count;
    }

    return {
      pending,
      syncing,
      failed,
      totalUnsynced: pending + syncing + failed,
    };
  },
};
