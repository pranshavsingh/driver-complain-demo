import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from './logger';

function audioFilename(originalName?: string): string {
  if (!originalName) return 'voice.m4a';
  try {
    // Cloudinary URLs can contain query strings; only the URL pathname is a reliable source
    // of the extension sent to the speech API.
    const pathname = new URL(originalName).pathname;
    const basename = path.basename(pathname);
    return path.extname(basename) ? basename : 'voice.m4a';
  } catch {
    const basename = path.basename(originalName);
    return path.extname(basename) ? basename : 'voice.m4a';
  }
}

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
 * The Hugging Face-hosted Systran/faster-whisper-large-v3 model is downloaded to the
 * API host and run locally. No transcription API key or paid provider is involved.
 */
export async function transcribeAudio(
  buffer: Buffer,
  originalName?: string,
): Promise<string | null> {
  return transcribeViaLocalPython(buffer, originalName);
}

async function transcribeViaLocalPython(
  buffer: Buffer,
  originalName?: string,
): Promise<string | null> {
  const ext = path.extname(audioFilename(originalName)) || '.m4a';
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
    const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    for (const model of models) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: `You are a professional translator. Translate the text into ${langName}. Do NOT summarize, comment, reformat, or add anything. Return ONLY the translated text.`,
              },
              {
                role: 'user',
                content: text,
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
        logger.warn({ err, model }, 'Groq translation failed');
      }
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
