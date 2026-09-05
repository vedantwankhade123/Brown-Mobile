import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MenuIcon, SettingsIcon } from './Icons';

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
  isScrolled?: boolean;
  /** Show blue Update control to the left of Settings when a newer release exists */
  updateAvailable?: boolean;
  updateVersion?: string | null;
  onOpenUpdate?: () => void;
}

const SCROLLED_BG = '#212121';

export const Header: React.FC<HeaderProps> = ({
  onOpenSidebar,
  onOpenSettings,
  isScrolled = false,
  updateAvailable = false,
  updateVersion = null,
  onOpenUpdate,
}) => {
  return (
    <View style={styles.outerWrapper} pointerEvents="box-none">
      <View style={styles.container} pointerEvents="box-none">
        <View style={[styles.leftGroupPill, isScrolled && styles.scrolledPill]}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onOpenSidebar}
            activeOpacity={0.7}
            accessibilityLabel="Open History"
          >
            <MenuIcon size={22} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.brandLeft}>
            <Image
              source={require('../../Assets/brown-white-wordmark.png')}
              style={styles.brandLogo}
              resizeMode="contain"
            />
          </View>
        </View>

        <View style={styles.rightActions}>
          {updateAvailable && onOpenUpdate ? (
            <TouchableOpacity
              style={[styles.updateButton, isScrolled && styles.scrolledUpdateButton]}
              onPress={onOpenUpdate}
              activeOpacity={0.85}
              accessibilityLabel={
                updateVersion ? `Update available version ${updateVersion}` : 'Update available'
              }
            >
              <Text style={styles.updateButtonText}>Update</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.settingsButton, isScrolled && styles.scrolledPill]}
            onPress={onOpenSettings}
            activeOpacity={0.7}
            accessibilityLabel="Settings"
          >
            <SettingsIcon size={26} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    width: '100%',
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    zIndex: 10,
  },
  container: {
    width: '100%',
    maxWidth: 740,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 48,
    backgroundColor: 'transparent',
  },
  leftGroupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  scrolledPill: {
    backgroundColor: SCROLLED_BG,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLeft: {
    justifyContent: 'center',
    paddingRight: 2,
  },
  brandLogo: {
    width: 72,
    height: 22,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: '#2563eb',
  },
  scrolledUpdateButton: {
    backgroundColor: '#1d4ed8',
  },
  updateButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
