/**
 * Privacy-first diagnostic logs.
 *
 * Captures global unhandled exceptions and rejected promises, caches a
 * SANITIZED payload locally (device specs, app version, timestamp, stack
 * trace only — never prompts, chat history, or credentials), and sends it
 * over HTTPS to the Brown website Firestore backend (appErrorLogs mailbox
 * doc) where server-side security rules rate-limit submissions to one per
 * device per 60 seconds.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

const FIRESTORE_PROJECT = 'ultron-da7a0';
const COLLECTION = 'appErrorLogs';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${COLLECTION}`;

const KEYS = {
  LOGS: '@brown/diagnostic_logs',
  DEVICE_ID: '@brown/diagnostic_device_id',
  LAST_SENT_AT: '@brown/diagnostic_last_sent_at',
};

export const SEND_COOLDOWN_MS = 60_000;
const MAX_CACHED_LOGS = 20;
const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN = 8000;

export interface DiagnosticLogEntry {
  message: string;
  stack: string;
  timestamp: string;
  appVersion: string;
  source: 'global' | 'rejection' | 'boundary' | 'manual';
}

export type SendResult =
  | { status: 'sent'; count: number }
  | { status: 'empty' }
  | { status: 'cooldown'; retryInMs: number }
  | { status: 'error'; message: string };

function generateDeviceId(): string {
  const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `m-${hex()}${hex()}-${hex()}-${hex()}`;
}

export async function getDiagnosticsDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEYS.DEVICE_ID);
  if (existing) return existing;
  const created = generateDeviceId();
  await AsyncStorage.setItem(KEYS.DEVICE_ID, created);
  return created;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sanitizeMessage(error: unknown): string {
  if (error instanceof Error) return truncate(error.message || error.name, MAX_MESSAGE_LEN);
  if (typeof error === 'string') return truncate(error, MAX_MESSAGE_LEN);
  try {
    return truncate(JSON.stringify(error), MAX_MESSAGE_LEN);
  } catch {
    return 'Unserializable error';
  }
}

function sanitizeStack(error: unknown): string {
  const stack = error instanceof Error ? error.stack : undefined;
  return truncate(stack || 'No stack trace available', MAX_STACK_LEN);
}

export function getAppVersion(): string {
  // nativeAppVersion comes from the compiled Android package and is not
  // affected by the stale embedded app.config asset (see release notes).
  return (
    Constants.nativeAppVersion ||
    Constants.expoConfig?.version ||
    'unknown'
  );
}

function getDeviceSpecs(): { deviceName: string; osName: string; osVersion: string; hardware: string } {
  const ramGb = Device.totalMemory ? `${(Device.totalMemory / 1024 / 1024 / 1024).toFixed(1)}GB RAM` : 'unknown RAM';
  const archs = Device.supportedCpuArchitectures?.join(', ') || 'unknown arch';
  return {
    deviceName: truncate(Device.modelName || 'unknown device', 120),
    osName: Device.osName || 'unknown',
    osVersion: truncate(Device.osVersion || 'unknown', 60),
    hardware: truncate(`${ramGb} · ${archs}`, 300),
  };
}

class DiagnosticLogStore {
  private cache: DiagnosticLogEntry[] | null = null;
  private writing: Promise<void> = Promise.resolve();

  private async load(): Promise<DiagnosticLogEntry[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await AsyncStorage.getItem(KEYS.LOGS);
      const parsed = raw ? JSON.parse(raw) : [];
      this.cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private persist(entries: DiagnosticLogEntry[]): void {
    this.cache = entries;
    this.writing = this.writing
      .then(() => AsyncStorage.setItem(KEYS.LOGS, JSON.stringify(entries)))
      .catch(() => {});
  }

  async record(error: unknown, source: DiagnosticLogEntry['source']): Promise<void> {
    const entries = await this.load();
    const entry: DiagnosticLogEntry = {
      message: sanitizeMessage(error),
      stack: sanitizeStack(error),
      timestamp: new Date().toISOString(),
      appVersion: getAppVersion(),
      source,
    };
    const next = [entry, ...entries].slice(0, MAX_CACHED_LOGS);
    this.persist(next);
  }

  async list(): Promise<DiagnosticLogEntry[]> {
    return this.load();
  }

  async count(): Promise<number> {
    return (await this.load()).length;
  }

  async clear(): Promise<void> {
    this.persist([]);
    await AsyncStorage.removeItem(KEYS.LAST_SENT_AT).catch(() => {});
  }
}

export const diagnosticLogStore = new DiagnosticLogStore();

function str(value: string) {
  return { stringValue: value };
}

function logEntryToFirestoreValue(entry: DiagnosticLogEntry) {
  return {
    mapValue: {
      fields: {
        message: str(entry.message),
        stack: str(entry.stack),
        timestamp: str(entry.timestamp),
        appVersion: str(entry.appVersion),
        source: str(entry.source),
      },
    },
  };
}

function buildPayload(logs: DiagnosticLogEntry[]) {
  const specs = getDeviceSpecs();
  return {
    fields: {
      platform: str('mobile'),
      appVersion: str(getAppVersion()),
      deviceName: str(specs.deviceName),
      osName: str(specs.osName),
      osVersion: str(specs.osVersion),
      hardware: str(specs.hardware),
      lastSentAt: { timestampValue: new Date().toISOString() },
      logs: { arrayValue: { values: logs.map(logEntryToFirestoreValue) } },
    },
  };
}

async function firestoreWrite(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

export async function sendDiagnosticLogs(): Promise<SendResult> {
  const logs = await diagnosticLogStore.list();
  if (logs.length === 0) return { status: 'empty' };

  const lastSentRaw = await AsyncStorage.getItem(KEYS.LAST_SENT_AT).catch(() => null);
  if (lastSentRaw) {
    const elapsed = Date.now() - Number(lastSentRaw);
    if (Number.isFinite(elapsed) && elapsed < SEND_COOLDOWN_MS) {
      return { status: 'cooldown', retryInMs: SEND_COOLDOWN_MS - elapsed };
    }
  }

  const deviceId = await getDiagnosticsDeviceId();
  const payload = buildPayload(logs);
  const fieldMask = ['platform', 'appVersion', 'deviceName', 'osName', 'osVersion', 'hardware', 'lastSentAt', 'logs']
    .map((f) => `updateMask.fieldPaths=${f}`)
    .join('&');

  try {
    // Update the existing mailbox doc; create it on first submission.
    let response = await firestoreWrite(
      `${BASE_URL}/${deviceId}?${fieldMask}&currentDocument.exists=true`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
    if (response.status === 404 || response.status === 412) {
      response = await firestoreWrite(`${BASE_URL}?documentId=${encodeURIComponent(deviceId)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      if (response.status === 403) {
        // Server-side rate limit (or validation) rejection.
        return { status: 'cooldown', retryInMs: SEND_COOLDOWN_MS };
      }
      const body = await response.text().catch(() => '');
      return { status: 'error', message: `Upload failed (${response.status}) ${body.slice(0, 160)}` };
    }

    await AsyncStorage.setItem(KEYS.LAST_SENT_AT, String(Date.now())).catch(() => {});
    await diagnosticLogStore.clear();
    return { status: 'sent', count: logs.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', message: `Network error: ${truncate(message, 160)}` };
  }
}

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  // Unhandled exceptions: record, then hand off to the default RN handler so
  // dev redbox / production behavior is unchanged.
  const errorUtils = (global as any).ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      diagnosticLogStore.record(error, 'global').catch(() => {});
      if (previous) previous(error, isFatal);
    });
  }

  // Unhandled promise rejections (Hermes/JSC rejection tracking ships with RN).
  try {
    const rejectionTracking = require('promise/setimmediate/rejection-tracking');
    rejectionTracking.enable({
      allRejections: true,
      onUnhandled: (_id: string, error: unknown) => {
        diagnosticLogStore.record(error, 'rejection').catch(() => {});
      },
      onHandled: () => {},
    });
  } catch {
    // Rejection tracking is best-effort.
  }
}

export const ErrorLogService = {
  installGlobalErrorHandlers,
  record: (error: unknown, source: DiagnosticLogEntry['source'] = 'manual') =>
    diagnosticLogStore.record(error, source),
  list: () => diagnosticLogStore.list(),
  count: () => diagnosticLogStore.count(),
  send: sendDiagnosticLogs,
  getDeviceId: getDiagnosticsDeviceId,
  getAppVersion,
};
