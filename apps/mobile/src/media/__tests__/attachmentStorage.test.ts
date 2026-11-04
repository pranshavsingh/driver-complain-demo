import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as FileSystem from 'expo-file-system/legacy';
import {
  persistAttachment,
  persistAttachmentBatch,
  isFileAccessible,
  removeLocalAttachment,
} from '../attachmentStorage';

describe('AttachmentStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      size: 2048,
      isDirectory: false,
    } as any);
    vi.mocked(FileSystem.copyAsync).mockResolvedValue(undefined);
    vi.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined);
  });

  it('persists attachment successfully and returns verified file metadata', async () => {
    const result = await persistAttachment(
      'file:///cache/image_picker_123.jpg',
      'damaged_bumper.jpg',
      'image/jpeg',
      'PHOTO',
    );

    expect(result.fileName).toBe('damaged_bumper.jpg');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.kind).toBe('PHOTO');
    expect(result.fileSize).toBe(2048);
    expect(result.localUri).toContain('persistent_attachments');
    expect(result.localUri).toContain('damaged_bumper.jpg');

    expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
    const copyArgs = vi.mocked(FileSystem.copyAsync).mock.calls[0]![0];
    expect(copyArgs.from).toBe('file:///cache/image_picker_123.jpg');
    expect(copyArgs.to).toBe(result.localUri);

    // Verified destination existence and size
    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith(result.localUri);
  });

  it('fails fast on copy error without falling back to temporary cache URI, cleaning up destination', async () => {
    vi.mocked(FileSystem.copyAsync).mockRejectedValueOnce(new Error('POSIX error: ENOSPC (No space left on device)'));

    await expect(
      persistAttachment(
        'file:///cache/temp_voice.m4a',
        'voice_note.m4a',
        'audio/m4a',
        'VOICE',
      ),
    ).rejects.toThrow(/Failed to persist voice attachment.*ENOSPC/);

    // Destination cleanup was attempted
    expect(FileSystem.deleteAsync).toHaveBeenCalled();
  });

  it('fails fast and deletes destination if copied file does not exist after copy', async () => {
    // getInfoAsync for ensureDirectoryExists returns exists: true, but for destinationUri returns exists: false
    vi.mocked(FileSystem.getInfoAsync)
      .mockResolvedValueOnce({ exists: true, isDirectory: true } as any) // directory check
      .mockResolvedValueOnce({ exists: false } as any); // destination check

    await expect(
      persistAttachment(
        'file:///cache/video_sample.mp4',
        'video_evidence.mp4',
        'video/mp4',
        'VIDEO',
      ),
    ).rejects.toThrow(/Destination file does not exist after copy/);
  });

  it('fails fast and deletes destination if copied file is empty (0 bytes)', async () => {
    vi.mocked(FileSystem.getInfoAsync)
      .mockResolvedValueOnce({ exists: true, isDirectory: true } as any)
      .mockResolvedValueOnce({ exists: true, size: 0, isDirectory: false } as any);

    await expect(
      persistAttachment(
        'file:///cache/empty_photo.jpg',
        'empty_photo.jpg',
        'image/jpeg',
        'PHOTO',
      ),
    ).rejects.toThrow(/Destination file is empty \(0 bytes\)/);

    // Cleanup delete was called
    expect(FileSystem.deleteAsync).toHaveBeenCalled();
  });

  it('persistAttachmentBatch persists all items atomically when all succeed', async () => {
    const items = [
      {
        sourceUri: 'file:///cache/p1.jpg',
        fileName: 'p1.jpg',
        mimeType: 'image/jpeg',
        kind: 'PHOTO' as const,
      },
      {
        sourceUri: 'file:///cache/v1.m4a',
        fileName: 'v1.m4a',
        mimeType: 'audio/m4a',
        kind: 'VOICE' as const,
      },
    ];

    const results = await persistAttachmentBatch(items);
    expect(results.length).toBe(2);
    expect(results[0]?.fileName).toBe('p1.jpg');
    expect(results[1]?.fileName).toBe('v1.m4a');
  });

  it('persistAttachmentBatch rolls back and cleans up earlier files if a subsequent copy fails', async () => {
    // First copy succeeds, second copy fails
    vi.mocked(FileSystem.copyAsync)
      .mockResolvedValueOnce(undefined) // item 1
      .mockRejectedValueOnce(new Error('Permission denied')); // item 2

    const items = [
      {
        sourceUri: 'file:///cache/photo1.jpg',
        fileName: 'photo1.jpg',
        mimeType: 'image/jpeg',
        kind: 'PHOTO' as const,
      },
      {
        sourceUri: 'file:///cache/photo2.jpg',
        fileName: 'photo2.jpg',
        mimeType: 'image/jpeg',
        kind: 'PHOTO' as const,
      },
    ];

    await expect(persistAttachmentBatch(items)).rejects.toThrow(/Permission denied/);

    // Rolled back the first file
    expect(FileSystem.deleteAsync).toHaveBeenCalled();
  });

  it('isFileAccessible checks file existence via getInfoAsync', async () => {
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: true } as any);
    expect(await isFileAccessible('file:///doc/photo.jpg')).toBe(true);

    vi.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: false } as any);
    expect(await isFileAccessible('file:///doc/missing.jpg')).toBe(false);

    vi.mocked(FileSystem.getInfoAsync).mockRejectedValueOnce(new Error('Filesystem error'));
    expect(await isFileAccessible('file:///doc/error.jpg')).toBe(false);
  });

  it('removeLocalAttachment calls deleteAsync with idempotent true', async () => {
    await removeLocalAttachment('file:///doc/old.jpg');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///doc/old.jpg', { idempotent: true });
  });
});

