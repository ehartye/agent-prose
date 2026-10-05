import { ProseError } from '../errors.ts';

// 1,800 UTF-8 bytes conservatively bounds tokenizer input below the model's 2,000-token limit.
export const TTS_MODEL = 'gpt-4o-mini-tts-2025-12-15';
export const TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
const MAX_AUDIO = 100 * 1024 * 1024;
export interface SpeechProvider { endpoint?: string; apiKey?: string; timeoutMs?: number }

/** Prefer punctuation/line boundaries; a code-point fallback never divides a surrogate pair. */
export function speechChunks(text: string): string[] {
  const chunks: string[] = [];
  let pending = '';
  for (const char of text) {
    if (Buffer.byteLength(pending + char) > 1800) {
      const boundary = Math.max(pending.lastIndexOf('\n'), pending.lastIndexOf('. '), pending.lastIndexOf('! '), pending.lastIndexOf('? '));
      const at = boundary > pending.length / 2 ? boundary + (pending[boundary] === '\n' ? 1 : 2) : pending.length;
      chunks.push(pending.slice(0, at)); pending = pending.slice(at);
    }
    pending += char;
  }
  if (pending) chunks.push(pending);
  return chunks;
}

export async function synthesize(text: string, voice = 'marin', provider: SpeechProvider = {}): Promise<{ bytes: Buffer; chunkCount: number; model: string; voice: string }> {
  if (!TTS_VOICES.includes(voice)) throw new ProseError('E_USAGE', `Unsupported voice ${voice}`, { hint: TTS_VOICES.join(', ') });
  const apiKey = provider.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ProseError('E_TTS', 'OPENAI_API_KEY is required for explicit OpenAI speech export');
  const chunks = speechChunks(text.trim());
  if (!chunks.length || chunks.length > 1000) throw new ProseError('E_TTS', 'Speech must contain text and fit within 1,000 chunks');
  const pcm: Buffer[] = [];
  let size = 0;
  const exportTimeout = AbortSignal.timeout(5 * 60_000);
  try {
    for (const input of chunks) {
      // No automatic retry: this avoids duplicate paid requests after an ambiguous failure.
      const response = await fetch(provider.endpoint ?? 'https://api.openai.com/v1/audio/speech', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: TTS_MODEL, voice, input, response_format: 'pcm' }),
        signal: AbortSignal.any([exportTimeout, AbortSignal.timeout(provider.timeoutMs ?? 60_000)]), redirect: 'error',
      });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`Speech provider returned HTTP ${response.status}`); }
      const buffers: Buffer[] = []; let chunkSize = 0;
      for await (const bytes of response.body) {
        const b = Buffer.from(bytes); chunkSize += b.length; size += b.length;
        if (chunkSize > 10 * 1024 * 1024 || size > MAX_AUDIO) throw new Error('Speech response exceeded export size limit');
        buffers.push(b);
      }
      if (!chunkSize || chunkSize % 2) throw new Error('Speech provider returned incomplete 16-bit PCM samples');
      pcm.push(Buffer.concat(buffers));
    }
  } catch (e) {
    // Never include request headers, response bodies or provider secrets in errors.
    throw new ProseError('E_TTS', e instanceof Error && /^Speech /.test(e.message) ? e.message : 'Speech request failed or timed out');
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(size + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(size, 40);
  return { bytes: Buffer.concat([header, ...pcm]), chunkCount: chunks.length, model: TTS_MODEL, voice };
}
