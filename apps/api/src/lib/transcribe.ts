import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from './logger';

/** Strip <think>...</think> blocks from Qwen model outputs */
function stripThinkTags(text: string): string {
  // Remove complete <think>...</think> blocks
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Remove incomplete <think> blocks (when </think> is cut off)
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
  return cleaned.trim();
}

/**
 * Transcribe an audio buffer — returns text in the ORIGINAL spoken language.
 * Strategy:
 *   1. Groq /audio/transcriptions with whisper-large-v3 (best accuracy, free)
 *   2. OpenAI /audio/transcriptions with whisper-1
 *   3. Hugging Face Inference API
 *   4. Local Python faster-whisper (unlimited, no API dependency)
 */
export async function transcribeAudio(
  buffer: Buffer,
  originalName?: string,
): Promise<string | null> {
  const cloudResult = await transcribeViaCloudApi(buffer, originalName);
  if (cloudResult) return cloudResult;

  const localResult = await transcribeViaLocalPython(buffer, originalName);
  if (localResult) return localResult;

  return null;
}

async function transcribeViaCloudApi(
  buffer: Buffer,
  originalName?: string,
): Promise<string | null> {
  const filename = originalName ? path.basename(originalName) : 'voice.mp3';

  // Determine correct MIME type from filename extension
  const ext = path.extname(filename).toLowerCase();
  const mimeType =
    ext === '.wav' ? 'audio/wav' :
    ext === '.webm' ? 'audio/webm' :
    ext === '.ogg' ? 'audio/ogg' :
    ext === '.m4a' ? 'audio/m4a' :
    ext === '.mp4' ? 'audio/mp4' :
    ext === '.flac' ? 'audio/flac' :
    'audio/mpeg';

  // 1. Groq /audio/transcriptions — accurate transcription in the original language
  if (process.env.GROQ_API_KEY) {
    try {
      const fd = new FormData();
      fd.append('file', new Blob([buffer], { type: mimeType }), filename);
      fd.append('model', 'whisper-large-v3');
      fd.append('response_format', 'verbose_json');
      // Temperature 0 = most deterministic/accurate output
      fd.append('temperature', '0');
      // Prompt hint: helps Whisper understand context and punctuate correctly
      fd.append('prompt', 'This is a driver complaint about a vehicle issue. Transcribe accurately with proper punctuation.');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: fd,
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string; language?: string };
        if (data.text?.trim()) {
          logger.info({ language: data.language }, 'Groq /transcriptions succeeded');
          return data.text.trim();
        }
      } else {
        const errBody = await res.text();
        logger.warn({ status: res.status, errBody }, 'Groq /transcriptions failed');
      }
    } catch (err) {
      logger.warn({ err }, 'Groq /transcriptions error');
    }
  }

  // 2. OpenAI Whisper API — transcriptions endpoint (not translations)
  if (process.env.OPENAI_API_KEY) {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: mimeType }), filename);
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('temperature', '0');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string; language?: string };
        if (data.text?.trim()) {
          logger.info({ language: data.language }, 'OpenAI /transcriptions succeeded');
          return data.text.trim();
        }
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
            'Content-Type': mimeType,
          },
          body: buffer,
        },
      );

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text?.trim()) {
          logger.info('Hugging Face transcription succeeded');
          return data.text.trim();
        }
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
          timeout: 120_000,
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

/**
 * Translate text into specified target language: 'ENGLISH', 'HINDI', or 'BENGALI'
 */
export async function translateText(
  text: string,
  targetLang: 'ENGLISH' | 'HINDI' | 'BENGALI',
): Promise<string> {
  if (!text.trim()) return text;

  const langName =
    targetLang === 'HINDI' ? 'Hindi' : targetLang === 'BENGALI' ? 'Bengali' : 'English';

  // 1. Groq Chat API translation
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.6-27b',
          messages: [
            {
              role: 'user',
              content: `/no_think\nTranslate the following text into ${langName}. Return ONLY the translated text, nothing else:\n\n${text}`,
            },
          ],
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        let content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          content = stripThinkTags(content);
          if (content) return content;
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Groq translation failed');
    }
  }

  // 2. MyMemory Free API fallback
  if (targetLang !== 'ENGLISH') {
    try {
      const langCode = targetLang === 'HINDI' ? 'hi' : 'bn';
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${langCode}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { responseData?: { translatedText?: string } };
        if (data.responseData?.translatedText?.trim()) {
          return data.responseData.translatedText.trim();
        }
      }
    } catch (err) {
      logger.warn({ err }, 'MyMemory translation failed');
    }
  }

  return text;
}
