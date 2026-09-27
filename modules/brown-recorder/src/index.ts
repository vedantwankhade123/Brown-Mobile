/**
 * brown-recorder — raw 16 kHz mono PCM WAV capture for Whisper STT.
 * expo-av's Android recorder is MediaRecorder (AAC only), so capture lives here.
 */
type BrownRecorderNative = {
  start(): boolean;
  stop(): string | null;
  isRecording(): boolean;
};

let cached: BrownRecorderNative | null | undefined;

export function isRecorderAvailable(): boolean {
  if (cached !== undefined) return cached !== null;
  try {
    const { requireNativeModule } = require('expo-modules-core');
    const mod = requireNativeModule('BrownRecorder');
    cached = mod && typeof mod.start === 'function' ? mod : null;
  } catch {
    cached = null;
  }
  return cached !== null;
}

function native(): BrownRecorderNative {
  if (!isRecorderAvailable()) {
    throw new Error(
      'Voice input recorder is unavailable. Rebuild the Brown app (expo run:android / expo run:ios) to enable Whisper voice input.'
    );
  }
  return cached as BrownRecorderNative;
}

/** Start capture; returns false if the recorder could not be initialized. */
export function startRecording(): boolean {
  return native().start();
}

/** Stop capture and return the `file://…wav` URI (null if nothing was recorded). */
export function stopRecording(): string | null {
  return native().stop();
}

export function isRecording(): boolean {
  try {
    return native().isRecording();
  } catch {
    return false;
  }
}
