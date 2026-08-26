import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from './logger';

/**
 * Transcribe an audio buffer using faster-whisper Python script (supports python3 and python binaries).
 * Includes HuggingFace Whisper API fallback.
 */
export async function transcribeAudio(
  buffer: Buffer,
  originalName?: string,
): Promise<string | null> {
  const ext = originalName ? path.extname(originalName) || '.mp3' : '.mp3';
  const tempPath = path.join(
    os.tmpdir(),
    `voice_${Date.now()}_${Math.random().toString(36).substring(2)}${ext}`,
  );

  try {
    await fs.writeFile(tempPath, buffer);

    const scriptPath = path.resolve(process.cwd(), 'scripts/transcribe.py');
    const pyCmds = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];

    for (const cmd of pyCmds) {
      const result = await new Promise<string | null>((resolve) => {
        const child = spawn(cmd, [scriptPath, tempPath], {
          timeout: 45000,
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
          logger.warn({ err, cmd }, 'Python spawn failed, trying next command...');
          resolve(null);
        });

        child.on('close', (code) => {
          if (code !== 0 && !stdout.trim()) {
            logger.warn({ code, stderr, cmd }, 'Transcription process exited with non-zero code');
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

      if (result) return result;
    }

    // Fallback: HuggingFace Whisper Inference API
    return await transcribeViaHuggingFace(buffer);
  } catch (err) {
    logger.warn({ err }, 'Voice note transcription failed');
    return null;
  } finally {
    fs.unlink(tempPath).catch(() => {
      // Ignore cleanup errors
    });
  }
}

async function transcribeViaHuggingFace(buffer: Buffer): Promise<string | null> {
  try {
    const hfToken = process.env.HF_TOKEN;
    const headers: Record<string, string> = {
      'Content-Type': 'audio/mpeg',
    };
    if (hfToken) {
      headers.Authorization = `Bearer ${hfToken}`;
    }

    const res = await fetch(
      'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo',
      {
        method: 'POST',
        headers,
        body: buffer,
      },
    );

    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() ?? null;
  } catch (err) {
    logger.warn({ err }, 'HuggingFace transcription fallback failed');
    return null;
  }
}

/**
 * Fetch an audio file from a URL (e.g. Cloudinary) and transcribe it using faster-whisper.
 */
export async function transcribeAudioFromUrl(url: string): Promise<string | null> {
  try {
    // Transform Cloudinary URL to clean MP3 format if possible
    let fetchUrl = url;
    if (url.includes('/upload/') && !url.includes('/upload/f_mp3/')) {
      fetchUrl = url.replace(/\/upload\//, '/upload/f_mp3/');
    }

    let res = await fetch(fetchUrl);
    if (!res.ok) {
      // Fallback to original URL
      res = await fetch(url);
    }
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return await transcribeAudio(buffer, url);
  } catch (err) {
    logger.warn({ err, url }, 'Failed to download and transcribe audio from URL');
    return null;
  }
}
