import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from './logger';

/**
 * Transcribe an audio buffer:
 * 1. Groq / OpenAI / HuggingFace API if key set (0MB RAM overhead, sub-second response on cloud hosts like Render)
 * 2. Local Python faster-whisper fallback (for local PC dev)
 */
export async function transcribeAudio(
  buffer: Buffer,
  originalName?: string,
): Promise<string | null> {
  // 1. Try Cloud APIs if API keys are configured (Fast & light — avoids 512MB OOM on Render)
  const cloudResult = await transcribeViaCloudApi(buffer, originalName);
  if (cloudResult) return cloudResult;

  // 2. Try local Python faster-whisper (for local dev)
  const localResult = await transcribeViaLocalPython(buffer, originalName);
  if (localResult) return localResult;

  return null;
}

async function transcribeViaCloudApi(
  buffer: Buffer,
  originalName?: string,
): Promise<string | null> {
  const filename = originalName ? path.basename(originalName) : 'voice.mp3';

  // 1. Groq Whisper API (100% Free, sub-second ultra-fast transcription, 0MB server RAM)
  if (process.env.GROQ_API_KEY) {
    try {
      const formData = new FormData();
      const fileBlob = new Blob([buffer], { type: 'audio/mp3' });
      formData.append('file', fileBlob, filename);
      formData.append('model', 'whisper-large-v3-turbo');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text?.trim()) return data.text.trim();
      } else {
        const errText = await res.text();
        logger.warn({ status: res.status, errText }, 'Groq API failed');
      }
    } catch (err) {
      logger.warn({ err }, 'Groq Whisper API call error');
    }
  }

  // 2. OpenAI Whisper API
  if (process.env.OPENAI_API_KEY) {
    try {
      const formData = new FormData();
      const fileBlob = new Blob([buffer], { type: 'audio/mp3' });
      formData.append('file', fileBlob, filename);
      formData.append('model', 'whisper-1');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text?.trim()) return data.text.trim();
      }
    } catch (err) {
      logger.warn({ err }, 'OpenAI Whisper API call error');
    }
  }

  // 3. Hugging Face Inference API
  if (process.env.HF_TOKEN) {
    try {
      const res = await fetch(
        'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HF_TOKEN}`,
            'Content-Type': 'audio/mpeg',
          },
          body: buffer,
        },
      );

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text?.trim()) return data.text.trim();
      }
    } catch (err) {
      logger.warn({ err }, 'Hugging Face API call error');
    }
  }

  return null;
}

async function transcribeViaLocalPython(
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
          timeout: 60_000,
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
          logger.warn({ err, cmd }, 'Python spawn failed');
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
    return null;
  } catch (err) {
    logger.warn({ err }, 'Local Python transcription failed');
    return null;
  } finally {
    fs.unlink(tempPath).catch(() => {
      // Ignore cleanup errors
    });
  }
}

/**
 * Fetch an audio file from a URL (e.g. Cloudinary) and transcribe it.
 */
export async function transcribeAudioFromUrl(url: string): Promise<string | null> {
  try {
    let res = await fetch(url);
    if (!res.ok && url.includes('/upload/')) {
      // Try formatting Cloudinary URL to mp3
      const mp3Url = url.replace(/\/upload\//, '/upload/f_mp3/').replace(/\.[a-zA-Z0-9]+$/, '.mp3');
      res = await fetch(mp3Url);
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
