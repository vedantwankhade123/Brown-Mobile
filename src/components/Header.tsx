import { ButtonSurface } from './ButtonSurface';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GridMenuIcon, SettingsIcon } from './Icons';
import { headerTitleSurface, headerButtonStyle, GlassControl } from './ScreenHeader';

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
  isScrolled?: boolean;
  onHeightChange?: (height: number) => void;
  updateAvailable?: boolean;
  updateVersion?: string | null;
  onOpenUpdate?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSidebar,
  onOpenSettings,
  isScrolled = false,
  onHeightChange,
  updateAvailable = false,
  updateVersion = null,
  onOpenUpdate,
}) => {

  return (
    <View style={styles.outerWrapper} pointerEvents="box-none">
      <View style={styles.container} onLayout={(event: { nativeEvent: { layout: { height: number } } }) => onHeightChange?.(event.nativeEvent.layout.height)} pointerEvents="box-none">
        <GlassControl radius={22} active style={styles.iconButton}
          onPress={onOpenSidebar} accessibilityLabel="Open History">
          <GridMenuIcon size={22} color="#ffffff" />
        </GlassControl>
        <View style={styles.modelTitleAnchor}>
          <View style={[headerTitleSurface, styles.modelTitleButton]}>
            <ButtonSurface />
            <Text style={[styles.brandTitle, { zIndex: 1 }]}>Brown</Text>
          </View>
        </View>

        <View style={styles.rightActions}>
          {updateAvailable && onOpenUpdate ? (
            <GlassControl
              radius={9999}
              active={true}
              style={styles.updateButton}
              onPress={onOpenUpdate}
              activeOpacity={0.85}
              accessibilityLabel={
                updateVersion ? `Update available version ${updateVersion}` : 'Update available'
              }
            >
              <Text style={styles.updateButtonText}>Update</Text>
            </GlassControl>
          ) : null}

          <GlassControl
            radius={22}
            active={true}
            style={styles.settingsButton}
            onPress={onOpenSettings}
            accessibilityLabel="Settings"
          >
            <SettingsIcon size={24} color="#ffffff" />
          </GlassControl>
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 56,
    backgroundColor: 'transparent',
  },
  leftGroupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    maxWidth: '80%',
    minWidth: 0,
    paddingLeft: 0,
    paddingRight: 6,
    paddingVertical: 0,
  },
  iconButton: { ...headerButtonStyle },
  modelTitleAnchor: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  modelTitleButton: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 6,
    paddingHorizontal: 16,
    minWidth: 96,
    height: 44,
    borderRadius: 9999,
    flexShrink: 1,
  },
  brandBlock: {
    flexShrink: 0,
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  titleDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    flexShrink: 0,
  },
  activeModelLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.4,
    flexShrink: 1,
    minWidth: 0,
  },
  modelSubtitle: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  updateButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  updateButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  settingsButton: { ...headerButtonStyle },

});
