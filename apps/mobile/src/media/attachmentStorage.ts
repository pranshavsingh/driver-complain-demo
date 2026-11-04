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
 */
async function ensureDirectoryExists(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(ATTACHMENT_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(ATTACHMENT_DIR, { intermediates: true });
    }
  } catch (err) {
    console.warn('[attachmentStorage] Failed to ensure attachment directory:', err);
  }
}

/**
 * Copy an attachment from its picker or recorder temporary URI into
 * persistent application storage so it survives app restarts.
 */
export async function persistAttachment(
  sourceUri: string,
  fileName: string,
  mimeType: string,
  kind: AttachmentKind,
): Promise<PersistentFile> {
  await ensureDirectoryExists();

  const extension = fileName.includes('.') ? fileName.split('.').pop() : 'dat';
  const cleanBase = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const persistentFileName = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${cleanBase}.${extension}`;
  const destinationUri = `${ATTACHMENT_DIR}${persistentFileName}`;

  try {
    // Copy rather than move to preserve original picker cache intact if other components use it
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });

    const info = await FileSystem.getInfoAsync(destinationUri);
    const fileSize = info.exists && 'size' in info ? (info.size ?? 0) : 0;

    return {
      localUri: destinationUri,
      fileName,
      mimeType,
      fileSize,
      kind,
    };
  } catch (err) {
    console.warn('[attachmentStorage] Copy failed, falling back to source URI:', err);
    // If copying fails (e.g. disk full), gracefully fall back to original URI rather than crashing
    let fileSize = 0;
    try {
      const info = await FileSystem.getInfoAsync(sourceUri);
      if (info.exists && 'size' in info) fileSize = info.size ?? 0;
    } catch {
      // Ignored
    }

    return {
      localUri: sourceUri,
      fileName,
      mimeType,
      fileSize,
      kind,
    };
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
