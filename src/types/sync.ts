export interface DesktopInstance {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  version: string;
  isPaired: boolean;
  lastSeen: number;
  syncId?: string;
  isFallback?: boolean;
  platform?: string;
  companion?: { v: number; addresses?: string[]; directUrl?: string; relayUrl?: string; relayRoom?: string; bootstrapKey?: string; keyId?: string };
}

export interface UltronRemoteProfile {
  displayName: string;
  email: string;
  systemPrompt: string;
  geminiApiKey: string;
}

export interface ProfileConflict {
  desktop: UltronRemoteProfile;
  mobile: UltronRemoteProfile;
}

export interface SyncStatus {
  isConnected: boolean;
  activeDesktop?: DesktopInstance;
  lastSyncTimestamp?: number;
  syncInProgress: boolean;
  syncedThreadsCount: number;
  authToken?: string;
  needsReauth?: boolean;
  reauthReason?: string;
  autoConnectEnabled?: boolean;
  connectionType?: 'local' | 'direct' | 'relay';
  preferences?: { modelAccess: boolean; voiceAccess: boolean; profileMode: 'separate' | 'shared'; livePreview?: boolean };
  transferRequest?: { id: string; action: 'import' | 'send' | 'merge' | 'profile'; expiresAt: number } | null;
}

export interface PairingSession {
  requestId: string;
  desktop: DesktopInstance;
  expiresIn: number;
}
