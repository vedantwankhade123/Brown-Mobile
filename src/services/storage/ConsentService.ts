import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { AppDatabase } from './Database';

export interface ConsentRecord {
  id: string;
  fullName: string;
  email: string;
  birthdate: string;
  agreedToTerms: boolean;
  agreedToPrivacyPolicy: boolean;
  termsVersion: string;
  privacyVersion: string;
  agreedAt: number;
  agreedAtIso: string;
  devicePlatform: string;
  zeroTelemetryAcknowledged: boolean;
}

export class ConsentService {
  private static STORAGE_KEY = '@ultron_legal_consent';
  private static TERMS_VERSION = '1.0-offline';
  private static PRIVACY_VERSION = '1.0-offline';

  /**
   * Records and permanently archives the user's legal agreement
   * both in AsyncStorage and in the encrypted local SQLite database.
   */
  public static async recordConsent(data: {
    fullName?: string;
    email?: string;
    birthdate?: string;
    agreedToTerms?: boolean;
    agreedToPrivacyPolicy?: boolean;
    termsVersion?: string;
    privacyVersion?: string;
  }): Promise<ConsentRecord> {
    const now = Date.now();
    const consentId = `consent_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const record: ConsentRecord = {
      id: consentId,
      fullName: data.fullName || '',
      email: data.email || '',
      birthdate: data.birthdate || '',
      agreedToTerms: data.agreedToTerms ?? true,
      agreedToPrivacyPolicy: data.agreedToPrivacyPolicy ?? true,
      termsVersion: data.termsVersion || this.TERMS_VERSION,
      privacyVersion: data.privacyVersion || this.PRIVACY_VERSION,
      agreedAt: now,
      agreedAtIso: new Date(now).toISOString(),
      devicePlatform: Platform.OS,
      zeroTelemetryAcknowledged: true,
    };

    // 1. Save to AsyncStorage for instant retrieval
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(record));
    } catch (err) {
      console.warn('[ConsentService] Failed to save to AsyncStorage:', err);
    }

    // 2. Save into SQLite local database for durable offline auditing
    try {
      const db = AppDatabase.getInstance();
      await db.exec(
        `INSERT OR REPLACE INTO legal_consents (
          id, user_email, user_name, user_birthdate,
          terms_agreed, privacy_agreed, terms_version, privacy_version,
          agreed_at, device_platform, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.email,
          record.fullName,
          record.birthdate,
          record.agreedToTerms ? 1 : 0,
          record.agreedToPrivacyPolicy ? 1 : 0,
          record.termsVersion,
          record.privacyVersion,
          record.agreedAt,
          record.devicePlatform,
          JSON.stringify(record),
        ]
      );
    } catch (err) {
      console.warn('[ConsentService] Failed to save to SQLite database:', err);
    }

    return record;
  }

  /**
   * Retrieves the most recent consent record from local storage.
   */
  public static async getLatestConsent(): Promise<ConsentRecord | null> {
    try {
      const raw = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as ConsentRecord;
      }
    } catch {}

    try {
      const db = AppDatabase.getInstance();
      const row = await db.getFirst<any>(
        `SELECT payload_json FROM legal_consents ORDER BY agreed_at DESC LIMIT 1`
      );
      if (row && row.payload_json) {
        return JSON.parse(row.payload_json) as ConsentRecord;
      }
    } catch {}

    return null;
  }
}
