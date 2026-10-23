import { AnimatedSearchSwap } from './AnimatedSearchSwap';
import { AnimatedModal as Modal } from "./AnimatedModal";
import { BrownButton as TouchableOpacity } from './ButtonSurface';
import { AppBackground } from './AppBackground';
import { pushNavBarColor } from '../theme/systemBars';
import { useReducedMotion } from '../utils/useReducedMotion';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  
  ScrollView,
  SafeAreaView,
  Animated,
  PanResponder,
  Dimensions,
  Easing,
  Pressable,
} from 'react-native';
import { ChatSession } from '../types/chat';
import { colors } from '../theme/colors';
import {
  CloseIcon,
  SearchIcon,
  TrashIcon,
  SettingsIcon,
  PencilIcon,
  QrCodeIcon,
  DownloadIcon,
} from './Icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from './EmptyState';
import { HeaderTitle, headerButtonStyle, GlassControl } from './ScreenHeader';
import { animateOnce } from '../utils/motion';

interface DrawerSidebarProps {
  isOpen: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => Promise<void>;
  onOpenSync: (options?: { scan?: boolean }) => void;
  onOpenSettings?: () => void;
  onOpenDownloads?: () => void;
  onClose: () => void;
}

/**
 * Formats conversation titles so the first letter of each word is in uppercase
 * and the remaining letters are in lowercase.
 */
function formatConversationTitle(rawTitle: string): string {
  if (!rawTitle) return 'New Chat';
  return rawTitle
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      if (word.length <= 4 && word === word.toUpperCase() && /^[A-Z0-9]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

const SWIPE_MAX = 132;
const SWIPE_THRESHOLD = 62;

/** Long-press reveals row actions; swiping still asks for deletion confirmation. */
const SwipeableHistoryRow: React.FC<{
  title: string;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onShowActions: () => void;
}> = ({ title, isActive, isFirst, isLast, onSelect, onDelete, onShowActions }) => {
  const dragX = useRef(new Animated.Value(0)).current;
  const exitAnim = useRef(new Animated.Value(0)).current;
  const deleteRef = useRef(onDelete);
  deleteRef.current = onDelete;

  const springBack = () =>
    Animated.spring(dragX, {
      toValue: 0,
      friction: 5.5,
      tension: 70,
      useNativeDriver: false,
    }).start();

  const commitDelete = () =>
    Animated.parallel([
      Animated.spring(dragX, { toValue: -SWIPE_MAX, friction: 7, tension: 90, useNativeDriver: false }),
      Animated.timing(exitAnim, { toValue: 1, duration: 190, useNativeDriver: false }),
    ]).start(() => {
      deleteRef.current();
      exitAnim.setValue(0);
      dragX.setValue(0);
    });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_: any, g: any) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3,
      onMoveShouldSetPanResponderCapture: (_: any, g: any) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3,
      onPanResponderMove: (_: any, g: any) => {
        let x = g.dx;
        if (x > 0) {
          x = x / 3; // soft rubber-band if the user drags right
        }
        dragX.setValue(Math.max(-SWIPE_MAX, Math.min(0, x)));
      },
      onPanResponderRelease: (_: any, g: any) => {
        if (g.dx <= -SWIPE_THRESHOLD) {
          commitDelete();
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: () => {
        springBack();
      },
      onPanResponderReject: () => {
        springBack();
      },
    })
  ).current;

  const restColor = isActive ? 'rgba(41, 82, 148, 0.22)' : 'rgba(0, 0, 0, 0)';

  // Content tracks the finger 1:1 for a connected, responsive feel.
  const translateX = dragX.interpolate({
    inputRange: [-SWIPE_MAX, 0],
    outputRange: [-SWIPE_MAX, 0],
    extrapolate: 'clamp',
  });
  const backgroundColor = dragX.interpolate({
    inputRange: [-SWIPE_MAX, -SWIPE_MAX * 0.35, 0],
    outputRange: ['rgba(220, 38, 38, 1)', 'rgba(220, 38, 38, 0.55)', restColor],
    extrapolate: 'clamp',
  });
  const contentOpacity = dragX.interpolate({
    inputRange: [-SWIPE_MAX, -SWIPE_THRESHOLD, 0],
    outputRange: [0, 0.25, 1],
    extrapolate: 'clamp',
  });
  const deleteOpacity = dragX.interpolate({
    inputRange: [-SWIPE_MAX, -SWIPE_THRESHOLD, -14, 0],
    outputRange: [1, 1, 0.35, 0],
    extrapolate: 'clamp',
  });
  const deleteScale = dragX.interpolate({
    inputRange: [-SWIPE_MAX, 0],
    outputRange: [1, 0.7],
    extrapolate: 'clamp',
  });
  // Exit: fade + a little extra momentum once the delete commits.
  const rowOpacity = exitAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const rowScale = exitAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });

  return (
    <Animated.View
      style={[
        styles.historyRow,
        !isLast && styles.historyRowGap,
        {
          borderTopLeftRadius: isFirst ? 13 : 0,
          borderTopRightRadius: isFirst ? 13 : 0,
          borderBottomLeftRadius: isLast ? 13 : 0,
          borderBottomRightRadius: isLast ? 13 : 0,
          opacity: rowOpacity,
          transform: [{ scale: rowScale }],
        },
      ]}
    >
      <View style={styles.historyCard} {...panResponder.panHandlers}>
      <Animated.View style={[styles.historyRowReveal, { backgroundColor }]} pointerEvents="none" />
      <Animated.View style={{ transform: [{ translateX }] }}>
        <View style={styles.historyRowContent}>
          <TouchableOpacity
            style={styles.historyTitleTouch}
            onPress={onSelect}
            onLongPress={onShowActions}
            delayLongPress={400}
            accessibilityLabel={title}
            accessibilityHint="Touch and hold to show chat actions. Swipe left to delete."
            activeOpacity={0.7}
          >
            <Text style={styles.historyTitleText} numberOfLines={1}>
              {title}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
      <Animated.View
        style={[styles.historyDeleteHint, { opacity: deleteOpacity, transform: [{ scale: deleteScale }] }]}
        pointerEvents="none"
      >
        <Text style={styles.historyDeleteText}>Delete</Text>
        <TrashIcon size={16} color="#ffffff" />
      </Animated.View>
      </View>
    </Animated.View>
  );
};

export const DrawerSidebar: React.FC<DrawerSidebarProps> = ({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onOpenSync,
  onOpenSettings,
  onOpenDownloads,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  /* The drawer is full-width, so the closed offset must equal the screen width —
     a larger value makes the 240ms slide finish in a few invisible frames. */
  const closedDrawerOffset = -Dimensions.get('window').width;
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string } | null>(null);
  const [sessionToRename, setSessionToRename] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sessionActions, setSessionActions] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => { if (!isOpen || isSearchActive) setSessionActions(null); }, [isOpen, isSearchActive]);

  const slideAnim = useRef(new Animated.Value(closedDrawerOffset)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const wasOpenRef = useRef(false);
  const motionGeneration = useRef(0);
  const reducedMotion = useReducedMotion();
  const searchInputRef = useRef<any>(null);

  useEffect(() => { if (isOpen) return pushNavBarColor('#000000'); }, [isOpen]);

  // Keeps the drawer mounted for the length of the close animation, then drops it.
  const [isClosing, setIsClosing] = useState(false);

  const runClose = (done?: () => void) => {
    const token = ++motionGeneration.current;
    animateOnce(
      [
        Animated.timing(slideAnim, {
          toValue: closedDrawerOffset,
          duration: reducedMotion ? 0 : 230,
          easing: Easing.in(Easing.cubic),
          // JS driver on purpose: native-driver transforms desync hit-testing from
          // the visual position mid-slide, so a close tap during the animation is lost.
          useNativeDriver: false,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: reducedMotion ? 0 : 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
      ],
      reducedMotion ? 0 : 230,
      () => {
        if (token !== motionGeneration.current) return;
        slideAnim.setValue(closedDrawerOffset);
        fadeAnim.setValue(0);
        done?.();
      }
    );
  };

  useEffect(() => {
    if (isOpen) {
      const token = ++motionGeneration.current;
      wasOpenRef.current = true;
      setIsClosing(false);
      animateOnce(
        [
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: reducedMotion ? 0 : 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: reducedMotion ? 0 : 200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
        ],
        reducedMotion ? 0 : 260,
        () => {
          if (token !== motionGeneration.current) return;
          slideAnim.setValue(0);
          fadeAnim.setValue(1);
        }
      );
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      setIsSearchActive(false);
      setSearchQuery('');
      setIsClosing(true);
      runClose(() => setIsClosing(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      ++motionGeneration.current;
      slideAnim.stopAnimation();
      fadeAnim.stopAnimation();
    };
  }, [isOpen, reducedMotion]);

  if (!isOpen && !isClosing) return null;

  const handleClose = () => {
    // Only flip the parent's state here — the isOpen effect owns the close animation.
    // Calling runClose() as well started two competing timings on the same values,
    // which is why one close tap sometimes needed to be repeated.
    onClose();
  };

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(query) ||
      (s.lastMessagePreview && s.lastMessagePreview.toLowerCase().includes(query))
    );
  });

  const inSearchMode = isSearchActive || searchQuery.trim().length > 0;

  const closeSearch = () => {
    setIsSearchActive(false);
    setSearchQuery('');
    searchInputRef.current?.blur();
  };

  const renderHistoryRow = (item: ChatSession, index?: number, arr?: ChatSession[]) => {
    const isActive = item.id === activeSessionId;
    const isFirst = !arr || index === undefined || index === 0;
    const isLast = !arr || index === undefined || index === arr.length - 1;
    const formattedTitle = formatConversationTitle(item.title);
    return (
      <SwipeableHistoryRow
        key={item.id}
        title={`${item.syncOrigin === 'desktop' ? '▣ ' : item.syncOrigin === 'both' ? '⇄ ' : ''}${formattedTitle}`}
        isActive={isActive}
        isFirst={isFirst}
        isLast={isLast}
        onShowActions={() => setSessionActions({ id: item.id, title: formattedTitle })}
        onSelect={() => {
          onSelectSession(item.id);
          handleClose();
        }}
        onDelete={() => setSessionToDelete({ id: item.id, title: formattedTitle })}
      />
    );
  };

  return (
    <View style={styles.overlay} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.backdropTouch} onPress={handleClose} activeOpacity={1} />
      </Animated.View>

      {/* Sliding Drawer */}
      <Animated.View style={[styles.drawerContainer, { transform: [{ translateX: slideAnim }] }]}>
        {/* Background: same desktop session-column gradient as the chat screen */}
        <AppBackground variant="sidebar" />
        <SafeAreaView style={styles.drawerInner}>
            <AnimatedSearchSwap style={{ zIndex: 20 }} active={inSearchMode} collapsed={(
              <View style={styles.topBar}>
<GlassControl
                    radius={22}
                    style={styles.closeDrawerBtn}
                    onPress={() => setIsSearchActive(true)}
                    accessibilityLabel="Search chats"
                  >
                    <SearchIcon size={22} color="#ffffff" />
                  </GlassControl>
                  <HeaderTitle title="History" style={styles.historyTitleSlot} />
<View style={styles.topBarRight}>

                  {onOpenDownloads && <GlassControl
                    radius={22}
                    style={styles.closeDrawerBtn}
                    onPress={() => { handleClose(); onOpenDownloads(); }}
                    accessibilityLabel="Downloads"
                  >
                    <DownloadIcon size={22} color="#ffffff" />
                  </GlassControl>}
                <GlassControl
                  radius={22}
                  style={styles.closeDrawerBtn}
                  onPress={handleClose}
                  activeOpacity={0.75}
                  accessibilityLabel="Close menu"
                >
                  <CloseIcon size={22} color="#ffffff" />
                </GlassControl>
              </View>
              </View>
            )} expanded={(
              <View style={styles.topBar}>
<View style={styles.searchPill}>
                  <SearchIcon size={18} color="#8e8e93" />
                  <TextInput
                    ref={searchInputRef}
                    autoFocus
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search chats"
                    placeholderTextColor="#8e8e93"
                    accessibilityLabel="Search chats"
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity brownSurface
                      style={styles.searchClearBtn}
                      onPress={() => setSearchQuery('')}
                      accessibilityLabel="Clear search"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <CloseIcon size={16} color="#8e8e93" />
                    </TouchableOpacity>
                  )}
                </View>
                <GlassControl radius={22} style={styles.closeDrawerBtn} onPress={closeSearch} accessibilityLabel="Close search">
                  <CloseIcon size={22} color="#ffffff" />
                </GlassControl>
              </View>
            )} />

          <ScrollView
            style={styles.sessionsList}
            contentContainerStyle={styles.drawerScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >


            {inSearchMode ? (
              filteredSessions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No matching chats found.</Text>
                </View>
              ) : (
                <View style={[styles.historyGroup, { marginTop: 16 }]}>
                  <ScrollView
                    style={styles.historyGroupScroll}
                    contentContainerStyle={styles.historyGroupInner}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    overScrollMode="never"
                  >
                    {filteredSessions.map(renderHistoryRow)}
                  </ScrollView>
                </View>
              )
            ) : (
              <View style={sessions.length === 0 ? styles.centeredEmptyContent : undefined}>
                {sessions.length === 0 ? (
                  <EmptyState
                    title="No chats yet"
                  />
                ) : (
                  <View style={styles.historyGroup}>
                    <ScrollView
                      style={styles.historyGroupScroll}
                      contentContainerStyle={styles.historyGroupInner}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      overScrollMode="never"
                    >
                      {sessions.map(renderHistoryRow)}
                    </ScrollView>
                  </View>
                )}
                <View style={styles.newChatRow}>
                  <GlassControl
                    radius={9999}
                    style={styles.newChatPill}
                    onPress={() => {
                      onNewChat();
                      handleClose();
                    }}
                    activeOpacity={0.8}
                    accessibilityLabel="New chat"
                  >
                    <Text style={styles.newChatPillText}>New chat</Text>
                  </GlassControl>
                </View>
              </View>
            )}
          </ScrollView>

          {/* QR scan and Settings — persistent bottom-right controls */}
          <View style={[styles.connectRow, { marginBottom: 14 + insets.bottom }]}>
            <TouchableOpacity brownSurface
              style={styles.footerQrButton}
              onPress={() => {
                onOpenSync({ scan: true });
                handleClose();
              }}
              activeOpacity={0.7}
              accessibilityLabel="Scan QR Code"
            >
              <QrCodeIcon size={24} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity brownSurface
              style={styles.connectCapsuleSettings}
              onPress={() => {
                if (onOpenSettings) onOpenSettings();
                handleClose();
              }}
              activeOpacity={0.7}
              accessibilityLabel="Settings"
            >
              <SettingsIcon size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>

      <Modal visible={!!sessionActions} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setSessionActions(null)}>
        <View style={styles.confirmModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSessionActions(null)} accessibilityLabel="Close chat options" />
          <View style={styles.confirmModalCard} accessibilityViewIsModal>
            <View style={styles.confirmModalHeader}>
              <Text style={styles.confirmModalTitle}>Chat options</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setSessionActions(null)} accessibilityLabel="Close chat options"><CloseIcon size={20} color="#b7b7b7" /></TouchableOpacity>
            </View>
            <Text style={styles.actionChatTitle} numberOfLines={2}>{sessionActions?.title}</Text>
            <TouchableOpacity style={styles.chatAction} accessibilityLabel={`Rename chat: ${sessionActions?.title}`} accessibilityRole="button" onPress={() => {
              if (!sessionActions) return;
              setRenameValue(sessionActions.title);
              setSessionToRename(sessionActions);
              setSessionActions(null);
            }}><PencilIcon size={20} color="#ffffff" /><Text style={styles.chatActionText}>Rename</Text></TouchableOpacity>
            <TouchableOpacity style={styles.chatAction} accessibilityLabel={`Delete chat: ${sessionActions?.title}`} accessibilityRole="button" onPress={() => {
              if (!sessionActions) return;
              setSessionToDelete(sessionActions);
              setSessionActions(null);
            }}><TrashIcon size={20} color="#ff7070" /><Text style={[styles.chatActionText, { color: '#ff7070' }]}>Delete</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!sessionToRename}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setSessionToRename(null)}
      >
        <TouchableOpacity style={styles.confirmModalOverlay} activeOpacity={1} onPress={() => setSessionToRename(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.confirmModalCard} onPress={() => {}}>
            <Text style={styles.confirmModalTitle}>Rename chat</Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Chat name"
              placeholderTextColor="#71717a"
              autoFocus
              maxLength={80}
              selectTextOnFocus
            />
            <View style={styles.confirmModalActionsRow}>
              <TouchableOpacity brownSurface style={styles.confirmCancelBtn} onPress={() => setSessionToRename(null)} activeOpacity={0.7}>
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity brownSurface
                style={[styles.renameSaveBtn, !renameValue.trim() && styles.renameSaveBtnDisabled]}
                onPress={async () => {
                  const nextTitle = renameValue.trim();
                  if (!sessionToRename || !nextTitle) return;
                  await onRenameSession(sessionToRename.id, nextTitle);
                  setSessionToRename(null);
                }}
                disabled={!renameValue.trim()}
                activeOpacity={0.7}
              >
                <Text style={styles.renameSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Delete Chat Confirmation Modal Dialog */}
      <Modal
        visible={!!sessionToDelete}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setSessionToDelete(null)}
      >
        <TouchableOpacity
          style={styles.confirmModalOverlay}
          activeOpacity={1}
          onPress={() => setSessionToDelete(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.confirmModalCard} onPress={() => {}}>
            <View style={styles.confirmModalHeader}>
              <Text style={styles.confirmModalTitle}>Delete chat?</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setSessionToDelete(null)} accessibilityLabel="Close delete confirmation"><CloseIcon size={18} color="#b7b7b7" /></TouchableOpacity>
            </View>
            <Text style={styles.confirmModalMessage}>
              {`This will permanently delete ${sessionToDelete?.title}.\nThis can't be undone.`}
            </Text>
            <View style={styles.confirmModalActionsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setSessionToDelete(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={() => {
                  if (sessionToDelete) {
                    onDeleteSession(sessionToDelete.id);
                    setSessionToDelete(null);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmDeleteBtnText}>Delete chat</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  backdropTouch: {
    width: '100%',
    height: '100%',
  },
  drawerContainer: {
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    backgroundColor: '#111111',
    borderRightWidth: 1,
    borderRightColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  drawerInner: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  sessionsList: {
    flex: 1,
  },
  drawerScrollContent: {
    flexGrow: 1,
    paddingTop: 6,
    paddingBottom: 20,
  },

  /* Top row */
  topBar: {
    zIndex: 20,
    overflow: 'visible',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 4,
    minHeight: 56,
  },
  avatarBtn: { ...headerButtonStyle },
  avatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  centeredEmptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 230,
    paddingVertical: 20,
  },
  newChatRow: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 18,
  },
  newChatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 26,
    paddingVertical: 12,
    minHeight: 48,
    backgroundColor: '#1B1B1B',
    borderRadius: 9999,
  },
  newChatPillText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  topBarRight: {
    marginLeft: 'auto',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  closeDrawerBtn: { ...headerButtonStyle },

  /* Search */
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 44,
    minWidth: 0,
    paddingHorizontal: 14,
    borderRadius: 9999,
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    margin: 0,
    paddingVertical: 0,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  searchClearBtn: {
    padding: 4,
  },
  historyGroup: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  historyGroupScroll: {
    flexGrow: 0,
    maxHeight: 300,
  },
  historyGroupInner: {
    paddingBottom: 5,
  },

  /* History */
  historyTitleSlot: {
    position: 'absolute',
    left: 118,
    right: 118,
    top: 4,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTitlePill: { minWidth: 96, height: 44, paddingVertical: 6 },
  historyTopTitleText: { color: '#ffffff', fontSize: 18, fontWeight: '500', letterSpacing: -0.4 },
  historyHeaderTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  historyRow: {
    position: 'relative',
  },
  historyCard: {
    overflow: 'hidden',
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  historyRowGap: {
    marginBottom: 4,
  },
  historyRowReveal: {
    ...StyleSheet.absoluteFillObject,
  },
  historyRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  historyTitleTouch: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    justifyContent: 'center',
  },
  historyTitleText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  historyMenuWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyMenuBtn: {
    width: 40,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDeleteHint: {
    position: 'absolute',
    right: 18,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyDeleteText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#d4d4d8',
    fontSize: 16,
  },

  /* Bottom-right QR scan and Settings controls */
  connectRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
  },
  footerQrButton: {
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectCapsuleSettings: {
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Confirm / action modals */
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 500,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#2b2b2b',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 20,
  },
  renameInput: {
    marginTop: 16,
    color: '#ffffff',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 8,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
  },
  renameSaveBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  renameSaveBtnDisabled: {
    opacity: 0.45,
  },
  renameSaveBtnText: {
    color: '#111113',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  confirmModalIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalTitle: {
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  confirmModalMessage: {
    color: '#b7b7b7',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 18,
  },
  confirmModalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancelBtn: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 9999,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#555555',
  },
  confirmCancelBtnText: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmDeleteBtn: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 9999,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
  },
  confirmDeleteBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  modalClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  actionChatTitle: { color: '#b7b7b7', fontSize: 14, lineHeight: 21, marginBottom: 16 },
  chatAction: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#363636', marginTop: 8 },
  chatActionText: { color: '#ffffff', fontSize: 16, fontWeight: '500' },
});
