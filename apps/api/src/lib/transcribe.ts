import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from './logger';

/**
 * Transcribe an audio buffer using the faster-whisper Python script.
 * Returns the transcribed text or null if transcription failed or produced empty text.
 */
export async function transcribeAudio(
  buffer: Buffer,
  originalName?: string,
): Promise<string | null> {
  const ext = originalName ? path.extname(originalName) || '.m4a' : '.m4a';
  const tempPath = path.join(
    os.tmpdir(),
    `voice_${Date.now()}_${Math.random().toString(36).substring(2)}${ext}`,
  );

  try {
    await fs.writeFile(tempPath, buffer);

    const scriptPath = path.resolve(process.cwd(), 'scripts/transcribe.py');
    const result = await new Promise<string | null>((resolve) => {
      const child = spawn('python', [scriptPath, tempPath], {
        timeout: 30000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        logger.warn({ err }, 'Failed to spawn Python transcription script');
        resolve(null);
      });

      child.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          logger.warn({ code, stderr }, 'Transcription process exited with non-zero code');
          resolve(null);
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.text && typeof parsed.text === 'string' && parsed.text.trim()) {
            resolve(parsed.text.trim());
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });

    return result;
  } catch (err) {
    logger.warn({ err }, 'Voice note transcription failed');
    return null;
  } finally {
    fs.unlink(tempPath).catch(() => {
      // Ignore cleanup errors
    });
  }
}

/**
 * Fetch an audio file from a URL (e.g. Cloudinary) and transcribe it using faster-whisper.
 */
export async function transcribeAudioFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return await transcribeAudio(buffer, url);
  } catch (err) {
    logger.warn({ err, url }, 'Failed to download and transcribe audio from URL');
    return null;
  }
}
