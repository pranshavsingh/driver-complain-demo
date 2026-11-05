import * as FileSystem from 'expo-file-system/legacy';
import type { AttachmentKind } from '@driver-complaint/shared-types';

export interface PersistentFile {
  localUri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: AttachmentKind;
}

const ATTACHMENT_DIR = `${FileSystem.documentDirectory ?? ''}persistent_attachments/`;

/**
 * Ensures the persistent directory exists on disk.
 * Explicitly propagates filesystem errors instead of swallowing them.
 */
export async function ensureDirectoryExists(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(ATTACHMENT_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(ATTACHMENT_DIR, { intermediates: true });
    }
  } catch (err) {
    throw new Error(
      `Failed to initialize attachment directory (${ATTACHMENT_DIR}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Copy an attachment from its picker or recorder temporary URI into
 * persistent application storage so it survives app restarts.
 * Fails fast without temporary fallback if copying or verification fails.
 */
export async function persistAttachment(
  sourceUri: string,
  fileName: string,
  mimeType: string,
  kind: AttachmentKind,
): Promise<PersistentFile> {
  await ensureDirectoryExists();

  const dotIndex = fileName.lastIndexOf('.');
  const extension = dotIndex !== -1 ? fileName.substring(dotIndex + 1) : 'dat';
  const baseName = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName;
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
  const persistentFileName = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanBase}.${extension}`;
  const destinationUri = `${ATTACHMENT_DIR}${persistentFileName}`;

  try {
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });
  } catch (err) {
    await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => {});
    throw new Error(
      `Failed to persist ${kind.toLowerCase()} attachment (${fileName}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Verify destination file existence and size before committing
  const info = await FileSystem.getInfoAsync(destinationUri);
  if (!info.exists) {
    await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => {});
    throw new Error(
      `Failed to verify ${kind.toLowerCase()} attachment (${fileName}): Destination file does not exist after copy`,
    );
  }

  const fileSize = 'size' in info ? (info.size ?? 0) : 0;
  if (fileSize <= 0) {
    await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => {});
    throw new Error(
      `Failed to verify ${kind.toLowerCase()} attachment (${fileName}): Destination file is empty (0 bytes)`,
    );
  }

  return {
    localUri: destinationUri,
    fileName,
    mimeType,
    fileSize,
    kind,
  };
}

/**
 * Atomically persist a batch of attachments. If any attachment fails to copy
 * or verify, all previously copied files from this batch are cleaned up immediately.
 */
export async function persistAttachmentBatch(
  items: Array<{ sourceUri: string; fileName: string; mimeType: string; kind: AttachmentKind }>,
): Promise<PersistentFile[]> {
  const persisted: PersistentFile[] = [];
  try {
    for (const item of items) {
      const file = await persistAttachment(item.sourceUri, item.fileName, item.mimeType, item.kind);
      persisted.push(file);
    }
    return persisted;
  } catch (err) {
    for (const file of persisted) {
      await removeLocalAttachment(file.localUri).catch(() => {});
    }
    throw err;
  }
}

/**
 * Verify whether a persistent file still exists on disk.
 */
export async function isFileAccessible(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Remove local attachment file safely after the server has confirmed successful sync.
 */
export async function removeLocalAttachment(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (err) {
    console.warn('[attachmentStorage] Error deleting local attachment:', uri, err);
  }
}
