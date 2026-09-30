/**
 * brown-speech — on-device Android speech recognition (system SpeechRecognizer).
 *
 * The recognizer lives in the OS/Google app, so nothing is recorded to disk and no desktop
 * is needed. Callers must handle `isSpeechSupported() === false`: Expo Go and APKs built
 * before this module existed simply do not have it.
 */
export type SpeechPartialEvent = { text?: string };
export type SpeechFinalEvent = { text?: string };
export type SpeechErrorEvent = { message?: string; code?: number; text?: string };

export type SpeechHandlers = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string, code: number, partialText: string) => void;
  onEnd?: () => void;
};

export type SpeechStartOptions = {
  continuous?: boolean;
  preferOffline?: boolean;
  language?: string;
};

type NativeSpeech = {
  isSupported(): boolean;
  start(continuous: boolean, preferOffline: boolean, language: string): boolean;
  stop(): void;
  cancel(): void;
};

type Emitter = {
  addListener(event: string, listener: (body: any) => void): { remove(): void };
};

let native: NativeSpeech | null | undefined;
let emitter: Emitter | null = null;

function getNative(): NativeSpeech | null {
  if (native !== undefined) return native;
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    const mod = requireOptionalNativeModule('BrownSpeech');
    native = mod && typeof mod.start === 'function' ? (mod as NativeSpeech) : null;
  } catch {
    native = null;
  }
  return native;
}

function getEmitter(): Emitter | null {
  const mod = getNative();
  if (!mod) return null;
  if (emitter) return emitter;
  try {
    const { EventEmitter } = require('expo-modules-core');
    emitter = new EventEmitter(mod) as Emitter;
  } catch {
    emitter = null;
  }
  return emitter;
}

/** True when this build has the module and the phone exposes a recognition service. */
export function isSpeechSupported(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(mod.isSupported());
  } catch {
    return false;
  }
}

export function subscribeSpeech(handlers: SpeechHandlers): { remove(): void } {
  const em = getEmitter();
  if (!em) return { remove: () => {} };
  const subs = [
    handlers.onPartial
      ? em.addListener('onSpeechPartial', (b: SpeechPartialEvent) => handlers.onPartial?.(String(b?.text ?? '')))
      : null,
    handlers.onFinal
      ? em.addListener('onSpeechFinal', (b: SpeechFinalEvent) => handlers.onFinal?.(String(b?.text ?? '')))
      : null,
    handlers.onError
      ? em.addListener('onSpeechError', (b: SpeechErrorEvent) =>
          handlers.onError?.(
            String(b?.message ?? 'Speech recognition failed.'),
            Number(b?.code ?? 0),
            String(b?.text ?? '')
          )
        )
      : null,
    handlers.onEnd ? em.addListener('onSpeechEnd', () => handlers.onEnd?.()) : null,
  ].filter(Boolean) as Array<{ remove(): void }>;

  return {
    remove: () => {
      subs.forEach((s) => {
        try {
          s.remove();
        } catch {}
      });
      subs.length = 0;
    },
  };
}

/** Returns false when recognition could not be started. */
export function startSpeech(options: SpeechStartOptions = {}): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return Boolean(
      mod.start(
        options.continuous !== false,
        options.preferOffline !== false,
        options.language || ''
      )
    );
  } catch {
    return false;
  }
}

/** Commit: ask for the final transcript. Delivered through `onFinal`. */
export function stopSpeech(): void {
  try {
    getNative()?.stop();
  } catch {}
}

/** Discard: no final transcript is emitted. */
export function cancelSpeech(): void {
  try {
    getNative()?.cancel();
  } catch {}
}
