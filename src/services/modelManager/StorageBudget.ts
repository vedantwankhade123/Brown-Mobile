import { DeviceProfiler, DeviceHardwareProfile } from './DeviceProfiler';

export interface DeviceStorageStats {
  totalStorageBytes: number;
  freeStorageBytes: number;
  usedStorageBytes: number;
  totalRamMb: number;
  availableRamMb: number;
  cpuArchitecture?: string;
  deviceName?: string;
  ramTier?: DeviceHardwareProfile['ramTier'];
}

export class StorageBudgetService {
  static async getDeviceStorageStats(): Promise<DeviceStorageStats> {
    const hardware = await DeviceProfiler.detect();
    let totalStorageBytes = 128 * 1024 * 1024 * 1024;
    let freeStorageBytes = 42 * 1024 * 1024 * 1024;

    try {
      const FileSystem = require('expo-file-system');
      if (FileSystem?.getFreeDiskStorageAsync && FileSystem?.getTotalDiskCapacityAsync) {
        const free = await FileSystem.getFreeDiskStorageAsync();
        const total = await FileSystem.getTotalDiskCapacityAsync();
        if (total) totalStorageBytes = total;
        if (free) freeStorageBytes = free;
      }
    } catch {}

    return {
      totalStorageBytes,
      freeStorageBytes,
      usedStorageBytes: Math.max(0, totalStorageBytes - freeStorageBytes),
      totalRamMb: hardware.totalRamMb,
      availableRamMb: hardware.availableRamMb,
      cpuArchitecture: hardware.cpuArchitecture,
      deviceName: hardware.deviceName,
      ramTier: hardware.ramTier,
    };
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
