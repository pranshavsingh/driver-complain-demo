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
 * Transcribe an audio buffer — ALWAYS returns English text.
 * Strategy:
 *   1. Groq /audio/translations (any language → English, most reliable)
 *   2. Groq /audio/transcriptions + Chat API to force English
 *   3. OpenAI /audio/translations
 *   4. Local Python faster-whisper (dev only)
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

  // 1. Groq /audio/translations — transcribes ANY language directly to English
  if (process.env.GROQ_API_KEY) {
    try {
      const fd1 = new FormData();
      fd1.append('file', new Blob([buffer], { type: 'audio/mp3' }), filename);
      fd1.append('model', 'whisper-large-v3');
      // Prompt hint: tells whisper the output should be English
      fd1.append('prompt', 'Transcribe this audio in English.');

      const res1 = await fetch('https://api.groq.com/openai/v1/audio/translations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: fd1,
      });

      if (res1.ok) {
        const data = (await res1.json()) as { text?: string };
        if (data.text?.trim()) {
          logger.info('Groq /translations succeeded');
          return data.text.trim();
        }
      } else {
        logger.warn({ status: res1.status }, 'Groq /translations failed, trying /transcriptions');
      }
    } catch (err) {
      logger.warn({ err }, 'Groq /translations error');
    }

    // 2. Fallback: /transcriptions + Chat API translation to English
    try {
      const fd2 = new FormData();
      fd2.append('file', new Blob([buffer], { type: 'audio/mp3' }), filename);
      fd2.append('model', 'whisper-large-v3-turbo');

      const res2 = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: fd2,
      });

      if (res2.ok) {
        const data = (await res2.json()) as { text?: string };
        const rawText = data.text?.trim();
        if (rawText) {
          logger.info({ rawText }, 'Got transcription, now translating to English via Chat');
          // Always translate to English via Chat API to guarantee English output
          const english = await translateText(rawText, 'ENGLISH');
          return english || rawText;
        }
      } else {
        const errText = await res2.text();
        logger.warn({ status: res2.status, errText }, 'Groq /transcriptions also failed');
      }
    } catch (err) {
      logger.warn({ err }, 'Groq /transcriptions error');
    }
  }

  // 2. OpenAI Whisper API - translations endpoint
  if (process.env.OPENAI_API_KEY) {
    try {
      const formData = new FormData();
      const fileBlob = new Blob([buffer], { type: 'audio/mp3' });
      formData.append('file', fileBlob, filename);
      formData.append('model', 'whisper-1');

      const res = await fetch('https://api.openai.com/v1/audio/translations', {
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
