import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors } from '../theme/colors';
import { MenuIcon, SettingsIcon } from './Icons';

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
  isScrolled?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSidebar,
  onOpenSettings,
  isScrolled = false,
}) => {
  return (
    <View style={styles.outerWrapper}>
      <View style={styles.container}>
        {/* Left Side: Single Background Pill containing Hamburger Menu + Logo + Title */}
        <View style={[styles.leftGroupPill, isScrolled && styles.leftGroupPillScrolled]}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onOpenSidebar}
            activeOpacity={0.7}
            accessibilityLabel="Open History"
          >
            <MenuIcon size={22} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.brandLeft}>
            <Text style={styles.brandTitle}>
              Brown <Text style={styles.betaText}>BETA</Text>
            </Text>
          </View>
        </View>

        {/* Right Side: Settings Action with Scrolled Background */}
        <TouchableOpacity
          style={[styles.settingsButton, isScrolled && styles.settingsButtonScrolled]}
          onPress={onOpenSettings}
          activeOpacity={0.7}
          accessibilityLabel="Settings"
        >
          <SettingsIcon size={26} color="#ffffff" />
        </TouchableOpacity>
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
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  leftGroupPillScrolled: {
    backgroundColor: '#18181b',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: 6,
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  betaText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 9999,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  settingsButtonScrolled: {
    backgroundColor: '#18181b',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
});
