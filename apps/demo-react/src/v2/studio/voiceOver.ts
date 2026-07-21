/**
 * Voice-over capture — records narration from the microphone as clean PCM (via
 * WebAudio) and returns a WAV File.
 *
 * WAV is a deliberate choice: the exporter mixes the track with
 * `decodeAudioData`, and a WAV/PCM buffer ALWAYS decodes. The previous approach
 * recorded with MediaRecorder (WebM/Opus), which `decodeAudioData` decodes
 * unreliably across browsers — so a recorded voice-over silently vanished from
 * the exported video. Capturing PCM straight off the mic and encoding a WAV
 * fixes that for good. Nothing is uploaded.
 */

/** Concatenate captured audio blocks into one channel of samples (pure/tested). */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export interface VoiceRecording {
  /** Stop recording; resolves to the captured narration as a WAV File. */
  stop: () => Promise<File>;
  /** Abandon without producing a file (releases the mic). */
  cancel: () => void;
}

/**
 * Begin recording from the microphone. Rejects if permission is denied or the
 * browser has no getUserMedia/WebAudio. `stop()` finalizes a WAV File and
 * releases the mic.
 */
export async function startVoiceOver(): Promise<VoiceRecording> {
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!navigator.mediaDevices?.getUserMedia || !AC) {
    throw new Error('Recording a voice-over needs a newer browser with microphone support.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AC();
  await ctx.resume().catch(() => { /* */ });
  const source = ctx.createMediaStreamSource(stream);
  const chunks: Float32Array[] = [];
  const sampleRate = ctx.sampleRate;
  // Route through a silent gain to the destination so the capture node keeps
  // firing (some browsers pause a node that isn't connected out) with no
  // audible feedback.
  const silent = ctx.createGain(); silent.gain.value = 0;
  silent.connect(ctx.destination);

  // Prefer an AudioWorklet: it captures PCM on the audio thread, so it doesn't
  // glitch/garble under UI load the way the deprecated ScriptProcessor does on
  // the main thread. Fall back to ScriptProcessor where AudioWorklet is absent.
  let workletNode: AudioWorkletNode | null = null;
  let proc: ScriptProcessorNode | null = null;
  let usedWorklet = false;
  if (ctx.audioWorklet) {
    try {
      const src = "class P extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true;}}registerProcessor('pcm-capture',P);";
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      workletNode = new AudioWorkletNode(ctx, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      workletNode.port.onmessage = (e) => { const d = e.data as Float32Array; if (d && d.length) chunks.push(new Float32Array(d)); };
      source.connect(workletNode); workletNode.connect(silent);
      usedWorklet = true;
    } catch { usedWorklet = false; }
  }
  if (!usedWorklet) {
    proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    source.connect(proc); proc.connect(silent);
  }

  let released = false;
  const release = () => {
    if (released) return; released = true;
    try {
      if (proc) { proc.onaudioprocess = null; proc.disconnect(); }
      if (workletNode) { workletNode.port.onmessage = null; workletNode.disconnect(); }
      source.disconnect(); silent.disconnect();
    } catch { /* */ }
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => { /* */ });
  };

  return {
    stop: async () => {
      const pcm = concatFloat32(chunks);
      release();
      if (!pcm.length) throw new Error('No sound was recorded — check the microphone.');
      const { wavEncode } = await import('./audioWav.js');
      const buf = wavEncode([pcm], sampleRate);
      return new File([buf], 'voiceover.wav', { type: 'audio/wav' });
    },
    cancel: release,
  };
}
