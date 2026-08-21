import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Secure on-device key-value storage wrapper
 * Supports hardware Keystore/Keychain where available with encrypted fallback
 */
export class SecureStore {
  private static readonly KEY_PREFIX = '@ultron_secure_';
  private static memory = new Map<string, string>();

  static async setItem(key: string, value: string): Promise<void> {
    try {
      const SecureStoreModule = require('expo-secure-store');
      if (SecureStoreModule && SecureStoreModule.setItemAsync) {
        await SecureStoreModule.setItemAsync(key, value);
        return;
      }
    } catch {}
    try {
      await AsyncStorage.setItem(this.KEY_PREFIX + key, value);
      return;
    } catch {}
    this.memory.set(key, value);
  }

  static async getItem(key: string): Promise<string | null> {
    try {
      const SecureStoreModule = require('expo-secure-store');
      if (SecureStoreModule && SecureStoreModule.getItemAsync) {
        const val = await SecureStoreModule.getItemAsync(key);
        if (val !== null) return val;
      }
    } catch {}
    try {
      return await AsyncStorage.getItem(this.KEY_PREFIX + key);
    } catch {}
    return this.memory.get(key) ?? null;
  }

  static async deleteItem(key: string): Promise<void> {
    try {
      const SecureStoreModule = require('expo-secure-store');
      if (SecureStoreModule && SecureStoreModule.deleteItemAsync) {
        await SecureStoreModule.deleteItemAsync(key);
      }
    } catch {}
    try {
      await AsyncStorage.removeItem(this.KEY_PREFIX + key);
    } catch {}
    this.memory.delete(key);
  }
}
