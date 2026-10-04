import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAccountResetting } from './AccountLifecycle';

/**
 * On-device key-value storage. setItem/getItem are for credentials and stay Keystore-backed:
 * if the secure store refuses a value (unavailable, or >2 KB on Android) it is kept in memory
 * for this session only, never written to AsyncStorage as plaintext. Use the *NonSecretItem
 * methods for data that is safe in plaintext and may be larger, such as the paired-desktop list.
 */
export class SecureStore {
  private static readonly PLAIN_PREFIX = '@ultron_secure_';
  private static memory = new Map<string, string>();

  private static secureModule(): any | null {
    try {
      const m = require('expo-secure-store');
      if (m && typeof m.setItemAsync === 'function') return m;
    } catch {}
    return null;
  }

  /** @returns true when the value was written to the OS secure store. */
  static async setItem(key: string, value: string): Promise<boolean> {
    if (isAccountResetting()) return false;
    const secure = this.secureModule();
    if (secure) {
      try {
        await secure.setItemAsync(key, value);
        this.memory.delete(key);
        return true;
      } catch {}
    }
    this.memory.set(key, value);
    return false;
  }

  static async getItem(key: string): Promise<string | null> {
    if (isAccountResetting()) return null;
    if (this.memory.has(key)) return this.memory.get(key) as string;
    const secure = this.secureModule();
    if (secure) {
      try {
        const val = await secure.getItemAsync(key);
        if (val !== null) return val;
      } catch {}
    }
    // Pick up a credential a previous build left in plaintext, then erase the plaintext copy.
    try {
      const legacy = await AsyncStorage.getItem(this.PLAIN_PREFIX + key);
      if (legacy === null) return null;
      await AsyncStorage.removeItem(this.PLAIN_PREFIX + key);
      await this.setItem(key, legacy);
      return legacy;
    } catch {}
    return null;
  }

  static async deleteItem(key: string): Promise<void> {
    const secure = this.secureModule();
    if (secure) {
      try {
        await secure.deleteItemAsync(key);
      } catch {}
    }
    this.memory.delete(key);
    try {
      await AsyncStorage.removeItem(this.PLAIN_PREFIX + key);
    } catch {}
  }

  static async setNonSecretItem(key: string, value: string): Promise<void> {
    if (isAccountResetting()) return;
    try {
      await AsyncStorage.setItem(this.PLAIN_PREFIX + key, value);
    } catch {}
  }

  static clearMemoryForAccountDeletion(): void { this.memory.clear(); }

  static async getNonSecretItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.PLAIN_PREFIX + key);
    } catch {}
    return null;
  }
}
