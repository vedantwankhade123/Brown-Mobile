import { BrownButton as TouchableOpacity } from './ButtonSurface';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  
  Modal,
  ScrollView,
  Platform,
  Animated,
  Dimensions,
  Keyboard,
} from 'react-native';
import {
  ChevronDownIcon,
  CheckIcon,
  SparklesIcon,
} from './Icons';
import { headerButtonStyle } from './ScreenHeader';
import { ModelMetadata } from '../types/model';
import {
  modelCaption,
  shortModelName,
} from '../services/modelManager/AvailableChatModels';

interface ModelSelectorProps {
  models?: ModelMetadata[];
  activeModel?: ModelMetadata | null;
  onSelectModel?: (model: ModelMetadata) => void;
  onOpenModelStore?: () => void;
  /** Fired when the model menu is opened so the list can be refreshed */
  onMenuOpen?: () => void;
}

const POPOVER_GAP = 12;
const FALLBACK_TOP = Platform.OS === 'ios' ? 104 : 56;

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models = [],
  activeModel = null,
  onSelectModel,
  onOpenModelStore,
  onMenuOpen,
}) => {
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number; maxHeight: number } | null>(null);
  const titleAnchorRef = useRef<any>(null);
  const triggerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const openingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (openingTimerRef.current) clearTimeout(openingTimerRef.current); }, []);
  const menuAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(menuAnim, {
      toValue: isModelMenuOpen ? 1 : 0,
      duration: isModelMenuOpen ? 170 : 110,
      useNativeDriver: true,
    }).start();
  }, [isModelMenuOpen]);

  const closeModelMenu = () => {
    setIsModelMenuOpen(false);
    setHoveredModelId(null);
  };

  const positionMenu = (height: number) => {
    const trigger = triggerPositionRef.current;
    if (!trigger) return;
    setAnchor({
      left: Math.max(14, trigger.x),
      bottom: Math.max(12, height - trigger.y + POPOVER_GAP),
      maxHeight: Math.max(100, trigger.y - POPOVER_GAP - 48),
    });
  };

  const openModelMenu = () => {
    onMenuOpen?.();
    Keyboard.dismiss();
    if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
    // Measure after keyboard dismissal and before the modal owns the window.
    openingTimerRef.current = setTimeout(() => {
      titleAnchorRef.current?.measureInWindow?.((x: number, y: number) => {
        triggerPositionRef.current = { x, y };
        positionMenu(Dimensions.get('window').height);
        setIsModelMenuOpen(true);
      });
    }, 250);
  };

  const modelShort = shortModelName(activeModel?.name);

  return (
    <View style={styles.outerWrapper} pointerEvents="box-none">
        <View ref={titleAnchorRef} style={styles.modelTitleAnchor} collapsable={false}>
          <TouchableOpacity style={styles.modelTitleButton} onPress={openModelMenu}
            activeOpacity={0.7} accessibilityLabel="Change model">
            
            <View style={styles.modelSubtitle}>
              <Text style={styles.activeModelLabel} numberOfLines={1}>{modelShort || 'Choose a model'}</Text>
              <ChevronDownIcon size={12} color="#a1a1aa" />
            </View>
          </TouchableOpacity>
        </View>

      <Modal
        visible={isModelMenuOpen}
        transparent
        animationType="none"
        onRequestClose={closeModelMenu}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={styles.menuRoot} onLayout={(event: { nativeEvent: { layout: { height: number } } }) => positionMenu(event.nativeEvent.layout.height)}>
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={closeModelMenu}
          />
          <Animated.View
            style={[
              styles.modelMenuCard,
              anchor ? { left: anchor.left, bottom: anchor.bottom, maxHeight: anchor.maxHeight } : null,
              {
                opacity: anchor ? menuAnim : 0,
                transform: [
                  {
                    translateY: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                  {
                    scale: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }),
                  },
                ],
              },
            ]}
          >
            {onOpenModelStore ? (
              <View style={styles.promoRow}>
                <View style={styles.promoIconBox}>
                  <SparklesIcon size={17} color="#ffffff" />
                </View>
                <View style={styles.promoTextCol}>
                  <Text style={styles.promoTitle}>Model library</Text>
                  <Text style={styles.promoCaption}>
                    Get on-device models or add a cloud key
                  </Text>
                </View>
                <TouchableOpacity brownSurface
                  style={styles.promoPill}
                  activeOpacity={0.8}
                  onPress={() => {
                    closeModelMenu();
                    onOpenModelStore();
                  }}
                >
                  <Text style={styles.promoPillText}>Open</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <ScrollView
              style={styles.menuScroll}
              contentContainerStyle={styles.menuList}
              showsVerticalScrollIndicator={false}
            >
              {models.length === 0 ? (
                <Text style={styles.menuEmptyText}>
                  No models ready yet. Open the model library to download one.
                </Text>
              ) : (
                models.map((m) => {
                  const isSelected = activeModel?.id === m.id || activeModel?.name === m.name;
                  const isHovered = hoveredModelId === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.menuRow, isHovered && styles.menuRowHovered]}
                      activeOpacity={0.7}
                      onPress={() => {
                        onSelectModel?.(m);
                        closeModelMenu();
                      }}
                      {...(Platform.OS === 'web'
                        ? ({
                            onMouseEnter: () => setHoveredModelId(m.id),
                            onMouseLeave: () => setHoveredModelId(null),
                          } as any)
                        : {})}
                    >
                      <View style={styles.menuTextCol}>
                        <Text style={styles.menuRowTitle} numberOfLines={1}>
                          {m.name}
                        </Text>
                        <Text style={styles.menuRowMeta} numberOfLines={1}>
                          {modelCaption(m)}
                        </Text>
                      </View>
                      {isSelected ? <CheckIcon size={17} color="#ffffff" /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    alignSelf: 'flex-start',
    marginBottom: 0,
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
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  modelTitleButton: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9999,
    flexShrink: 1,
    minWidth: 0,
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
    color: '#e4e4e7',
    fontSize: 13,
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
  menuRoot: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingLeft: 16,
    paddingRight: 14,
    paddingTop: FALLBACK_TOP,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  modelMenuCard: {
    position: 'absolute',
    width: 306,
    maxWidth: '100%',
    backgroundColor: '#2b2b2d',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 20,
  },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#3a3a3c',
    borderRadius: 15,
    paddingVertical: 11,
    paddingHorizontal: 11,
    marginBottom: 4,
  },
  promoIconBox: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  promoTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  promoTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  promoCaption: {
    color: '#a1a1a6',
    fontSize: 12.5,
    lineHeight: 16,
  },
  promoPill: {
    backgroundColor: '#19191b',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexShrink: 0,
  },
  promoPillText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  menuScroll: {
    maxHeight: 330,
    flexGrow: 0,
    flexShrink: 1,
  },
  menuList: {
    gap: 1,
    paddingVertical: 1,
  },
  menuEmptyText: {
    color: '#a1a1a6',
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 15,
    minHeight: 54,
  },
  menuRowHovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  menuTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  menuRowTitle: {
    color: '#ffffff',
    fontSize: 15.5,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  menuRowMeta: {
    color: '#a1a1a6',
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 17,
  },
});

