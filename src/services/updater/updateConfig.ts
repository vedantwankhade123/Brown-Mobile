/**
 * GitHub Releases update configuration.
 * Public feed: https://github.com/vedantwankhade123/Brown-Releases
 */
export const UPDATE_CONFIG = {
  /** GitHub org or user that owns the releases repo */
  GITHUB_OWNER: 'vedantwankhade123',
  /** Public repo that publishes desktop EXE + mobile APK release assets */
  GITHUB_REPO: 'Brown-Releases',
  /** Prefer assets whose name matches this pattern (case-insensitive) */
  APK_NAME_HINTS: ['brown', 'mobile', 'android', '.apk'],
  /** AsyncStorage keys */
  STORAGE_KEYS: {
    AUTO_CHECK: '@brown/auto_check_updates',
    DISMISSED_VERSION: '@brown/dismissed_update_version',
    LAST_CHECK_AT: '@brown/last_update_check_at',
  },
  /** Minimum hours between automatic launch checks */
  AUTO_CHECK_COOLDOWN_HOURS: 12,
} as const;

export function getLatestReleaseApiUrl(): string {
  const { GITHUB_OWNER, GITHUB_REPO } = UPDATE_CONFIG;
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
}
