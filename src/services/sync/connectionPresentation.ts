import type { SyncStatus } from '../../types/sync';

export function connectionPresentation(status: SyncStatus) {
  if (status.isConnected) return {
    heading: 'Desktop connected',
    description: 'Use desktop models from your phone.\nShare chats and manage voice access.',
    label: 'Connected',
  };
  if (status.reauthReason?.includes('Disconnected for this session')) return { heading: 'Desktop disconnected', description: 'Your pairing stays saved.\nReopen either app to reconnect.', label: 'Disconnected' };
  if (status.activeDesktop) return {
    heading: status.needsReauth ? 'Reconnect your desktop' : 'Desktop is offline',
    description: status.needsReauth ? 'Approve a new connection on your PC.' : status.autoConnectEnabled === false ? 'Your pairing is saved. Tap refresh to reconnect.' : 'Your pairing is saved. Brown will reconnect when your PC is available.',
    label: status.needsReauth ? 'Approval needed' : 'Paired · Offline',
  };
  return {
    heading: 'Connect your desktop',
    description: 'Pair once. Use your PC’s models over Wi-Fi, your phone’s hotspot or USB.',
    label: 'Not connected',
  };
}
