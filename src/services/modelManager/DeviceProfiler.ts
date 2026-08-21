export type DeviceRamTier = 'ultra-light' | 'standard' | 'flagship';

export interface DeviceHardwareProfile {
  totalRamMb: number;
  availableRamMb: number;
  totalRamGb: number;
  cpuArchitecture: string;
  deviceName: string;
  osName: string;
  ramTier: DeviceRamTier;
  source: 'expo-device' | 'estimated';
}

function classifyRamTier(totalRamMb: number): DeviceRamTier {
  if (totalRamMb < 4096) return 'ultra-light';
  if (totalRamMb < 8192) return 'standard';
  return 'flagship';
}

function estimateFromUserAgent(): { totalRamMb: number; availableRamMb: number; arch: string } {
  try {
    const ua = (globalThis as any)?.navigator?.userAgent || '';
    if (/iPhone|iPad/i.test(ua)) {
      return { totalRamMb: 6144, availableRamMb: 3800, arch: 'arm64' };
    }
  } catch {}
  return { totalRamMb: 6144, availableRamMb: 3400, arch: 'arm64' };
}

export class DeviceProfiler {
  static async detect(): Promise<DeviceHardwareProfile> {
    const fallback = estimateFromUserAgent();
    let totalRamMb = fallback.totalRamMb;
    let availableRamMb = fallback.availableRamMb;
    let cpuArchitecture = fallback.arch;
    let deviceName = 'Android / iOS';
    let osName = 'mobile';
    let source: DeviceHardwareProfile['source'] = 'estimated';

    try {
      const Device = require('expo-device');
      if (Device) {
        source = 'expo-device';
        deviceName = Device.modelName || Device.deviceName || deviceName;
        osName = Device.osName || osName;
        if (typeof Device.totalMemory === 'number' && Device.totalMemory > 0) {
          totalRamMb = Math.round(Device.totalMemory / (1024 * 1024));
          availableRamMb = Math.round(totalRamMb * 0.55);
        }
        const arches = Device.supportedCpuArchitectures;
        if (Array.isArray(arches) && arches.length) {
          cpuArchitecture = arches.join(', ');
        } else if (Device.osInternalBuildId) {
          cpuArchitecture = String(Device.osInternalBuildId);
        }
      }
    } catch {}

    try {
      const { Platform } = require('react-native');
      if (Platform?.OS) osName = Platform.OS;
      const constants = Platform?.constants || {};
      if (constants.Brand) deviceName = `${constants.Brand} ${constants.Model || ''}`.trim();
    } catch {}

    return {
      totalRamMb,
      availableRamMb,
      totalRamGb: Math.round((totalRamMb / 1024) * 10) / 10,
      cpuArchitecture,
      deviceName,
      osName,
      ramTier: classifyRamTier(totalRamMb),
      source,
    };
  }
}
