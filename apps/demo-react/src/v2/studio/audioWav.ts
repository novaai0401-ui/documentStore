/**
 * WAV encoding — turn decoded PCM into a .wav file so extracted audio opens
 * anywhere (WhatsApp, old players, editing apps), unlike WebM/Opus. Pure byte
 * work, unit-tested; decodeAudioData glue stays in the modal.
 */

/** Slice each channel to the [startSec, endSec) window. */
export function sliceChannels(channels: Float32Array[], sampleRate: number, startSec: number, endSec: number): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  const a = Math.max(0, Math.min(len, Math.round(startSec * sampleRate)));
  const b = Math.max(a, Math.min(len, Math.round(endSec * sampleRate)));
  return channels.map((ch) => ch.subarray(a, b));
}

/** Smooth the edges: linear fade-in/out applied in place (returns the input).
 *  Fades shrink rather than overlap when the clip is shorter than two fades. */
export function applyFades(channels: Float32Array[], sampleRate: number, fadeInSec: number, fadeOutSec: number): Float32Array[] {
  const len = channels[0]?.length ?? 0;
  if (!len) return channels;
  const fi = Math.min(Math.max(0, Math.round(fadeInSec * sampleRate)), Math.floor(len / 2));
  const fo = Math.min(Math.max(0, Math.round(fadeOutSec * sampleRate)), Math.floor(len / 2));
  for (const ch of channels) {
    for (let i = 0; i < fi; i++) ch[i]! *= i / fi;
    for (let i = 0; i < fo; i++) ch[len - 1 - i]! *= i / fo;
  }
  return channels;
}

/** Float sample (-1…1) → clamped signed 16-bit int. */
export const toInt16 = (s: number): number => {
  const v = s < -1 ? -1 : s > 1 ? 1 : s;
  return Math.round(v < 0 ? v * 0x8000 : v * 0x7fff);
};

/** Interleaved 16-bit PCM WAV (RIFF) from per-channel float samples. */
export function wavEncode(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const nCh = Math.max(1, channels.length);
  const nFrames = channels[0]?.length ?? 0;
  const dataLen = nFrames * nCh * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);            // PCM
  dv.setUint16(22, nCh, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * nCh * 2, true); // byte rate
  dv.setUint16(32, nCh * 2, true);      // block align
  dv.setUint16(34, 16, true);           // bits per sample
  ascii(36, 'data'); dv.setUint32(40, dataLen, true);
  let off = 44;
  for (let i = 0; i < nFrames; i++) {
    for (let c = 0; c < nCh; c++) { dv.setInt16(off, toInt16(channels[c]?.[i] ?? 0), true); off += 2; }
  }
  return buf;
}
