import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Animated,
  Modal,
  Alert,
  PanResponder,
  Dimensions,
  Easing,
} from 'react-native';
import { ChatSession } from '../types/chat';
import { colors } from '../theme/colors';
import {
  CloseIcon,
  SearchIcon,
  TrashIcon,
  SettingsIcon,
  LaptopIcon,
  PencilIcon,
  MoreVerticalIcon,
  ArrowUpRightIcon,
  QrCodeIcon,
} from './Icons';
import { ChatRepository } from '../services/storage/ChatRepository';
import { ConsentService } from '../services/storage/ConsentService';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from './EmptyState';
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
  /** Start a fresh chat pre-filled with a starter prompt */
  onQuickAction?: (draft: string) => void;
  onClose: () => void;
}

/** Quick-start cards shown in the horizontal rail */
const QUICK_CARDS = [
  { id: 'write', label: 'Write', desc: 'Draft, rewrite or polish any text', draft: 'Help me write and improve this text:' },
  { id: 'code', label: 'Code', desc: 'Explain, debug and improve code', draft: 'Explain what this code does and fix any problems:' },
  { id: 'summarize', label: 'Summarize', desc: 'Condense long content to key points', draft: 'Summarize the key points of this text:' },
  { id: 'brainstorm', label: 'Brainstorm', desc: 'Generate fresh angles and options', draft: 'Help me brainstorm ideas about:' },
  { id: 'explain', label: 'Explain', desc: 'Break down complex topics clearly', draft: 'Explain this topic in simple terms:' },
  { id: 'translate', label: 'Translate', desc: 'Translate between any languages', draft: 'Translate the following text:' },
];

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

/** History row: tap to open, ⋯ / long-press for rename+delete, swipe left to delete */
const SwipeableHistoryRow: React.FC<{
  title: string;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onOpenActions: () => void;
  onDelete: () => void;
}> = ({ title, isActive, isFirst, isLast, onSelect, onOpenActions, onDelete }) => {
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
      {...panResponder.panHandlers}
    >
      <Animated.View style={[styles.historyRowReveal, { backgroundColor }]} pointerEvents="none" />
      <Animated.View style={{ transform: [{ translateX }] }}>
        <View style={styles.historyRowContent}>
          <TouchableOpacity
            style={styles.historyTitleTouch}
            onPress={onSelect}
            onLongPress={onOpenActions}
            activeOpacity={0.7}
          >
            <Text style={styles.historyTitleText} numberOfLines={1}>
              {title}
            </Text>
          </TouchableOpacity>
          <Animated.View style={[styles.historyMenuWrap, { opacity: contentOpacity }]}>
            <TouchableOpacity
              style={styles.historyMenuBtn}
              onPress={onOpenActions}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Chat options"
            >
              <MoreVerticalIcon size={18} color="#8e8e93" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Animated.View>
      <Animated.View
        style={[styles.historyDeleteHint, { opacity: deleteOpacity, transform: [{ scale: deleteScale }] }]}
        pointerEvents="none"
      >
        <Text style={styles.historyDeleteText}>Delete</Text>
        <TrashIcon size={16} color="#ffffff" />
      </Animated.View>
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
  onQuickAction,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  /* The drawer is full-width, so the closed offset must equal the screen width —
     a larger value makes the 240ms slide finish in a few invisible frames. */
  const closedDrawerOffset = -Dimensions.get('window').width;
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; title: string } | null>(null);
  const [sessionActionTarget, setSessionActionTarget] = useState<{ id: string; title: string } | null>(null);
  const [sessionToRename, setSessionToRename] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [userName, setUserName] = useState('You');
  const [userInitials, setUserInitials] = useState('B');

  const slideAnim = useRef(new Animated.Value(closedDrawerOffset)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const wasOpenRef = useRef(false);
  const searchInputRef = useRef<any>(null);

  // Load user profile name & initials
  useEffect(() => {
    ConsentService.getLatestConsent()
      .then((consent) => {
        if (consent?.fullName) {
          setUserName(consent.fullName);
          const parts = consent.fullName.trim().split(/\s+/);
          const initials = parts
            .map((p) => p[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
          setUserInitials(initials || 'B');
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Keeps the drawer mounted for the length of the close animation, then drops it.
  const [isClosing, setIsClosing] = useState(false);

  const runClose = (done?: () => void) => {
    animateOnce(
      [
        Animated.timing(slideAnim, {
          toValue: closedDrawerOffset,
          duration: 230,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ],
      230,
      () => {
        // Native-driver animations can lose their completion callback when interrupted;
        // pin the closed state by hand so the drawer can never stay visible.
        slideAnim.setValue(closedDrawerOffset);
        fadeAnim.setValue(0);
        done?.();
      }
    );
  };

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      setIsClosing(false);
      animateOnce(
        [
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 290,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ],
        290,
        () => {
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
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  const handleClose = () => {
    // onClose runs first so the parent state can never be left behind by a lost callback.
    onClose();
    runClose();
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
        title={formattedTitle}
        isActive={isActive}
        isFirst={isFirst}
        isLast={isLast}
        onSelect={() => {
          onSelectSession(item.id);
          handleClose();
        }}
        onOpenActions={() => setSessionActionTarget({ id: item.id, title: formattedTitle })}
        onDelete={() => onDeleteSession(item.id)}
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
        <LinearGradient
          pointerEvents="none"
          colors={['#111111', '#111111', '#10131c', '#101e40']}
          locations={[0, 0.2, 0.54, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.4, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.drawerInner}>
          <ScrollView
            style={styles.sessionsList}
            contentContainerStyle={styles.drawerScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Top row: profile avatar (→ Settings) + New chat */}
            <View style={styles.topBar}>
              <TouchableOpacity
                style={styles.avatarBtn}
                onPress={() => {
                  if (onOpenSettings) {
                    onOpenSettings();
                    handleClose();
                  }
                }}
                activeOpacity={0.8}
                accessibilityLabel={userName}
              >
                <Text style={styles.avatarText}>{userInitials}</Text>
              </TouchableOpacity>

              <View style={styles.topBarRight}>
                <TouchableOpacity
                  style={styles.newChatPill}
                  onPress={() => {
                    onNewChat();
                    handleClose();
                  }}
                  activeOpacity={0.8}
                >
                  <PencilIcon size={16} color="#ffffff" />
                  <Text style={styles.newChatPillText}>New chat</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeDrawerBtn}
                  onPress={handleClose}
                  activeOpacity={0.75}
                  accessibilityLabel="Close menu"
                >
                  <CloseIcon size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Hero */}
            <Text style={styles.heroTitle}>
              Ask anything,{'\n'}build everything.
            </Text>

            {/* Search — inline */}
            <View style={styles.searchRow}>
              <View style={styles.searchPill}>
                <SearchIcon size={18} color="#8e8e93" />
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search chats"
                  placeholderTextColor="#8e8e93"
                  onFocus={() => setIsSearchActive(true)}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {inSearchMode ? (
                  <TouchableOpacity
                    style={styles.searchClearBtn}
                    onPress={searchQuery.length > 0 ? () => setSearchQuery('') : closeSearch}
                    activeOpacity={0.7}
                  >
                    <CloseIcon size={16} color="#8e8e93" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

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
              <>
                {/* Quick-start cards */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardsRow}
                >
                  {QUICK_CARDS.map(({ id, label, desc, draft }) => (
                    <TouchableOpacity
                      key={id}
                      style={styles.quickCard}
                      activeOpacity={0.8}
                      onPress={() => {
                        if (onQuickAction) {
                          onQuickAction(draft);
                        } else {
                          onNewChat();
                        }
                        handleClose();
                      }}
                      accessibilityLabel={label}
                    >
                      <LinearGradient
                        colors={['#111111', '#10131c', '#101e40']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <Text style={styles.quickCardLabel} numberOfLines={1}>
                        {label}
                      </Text>
                      <Text style={styles.quickCardDesc} numberOfLines={3}>
                        {desc}
                      </Text>
                      <View style={styles.quickCardArrow}>
                        <ArrowUpRightIcon size={14} color="#111111" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* History */}
                <View style={styles.historyHeaderRow}>
                  <Text style={styles.historyHeaderTitle}>History</Text>
                </View>

                {sessions.length === 0 ? (
                  <EmptyState
                    title="No chats yet"
                    description={'No data here yet. Start a conversation\nand it will appear in this history list.'}
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
              </>
            )}
          </ScrollView>

          {/* Connect PC — persistent footer, always visible while history scrolls */}
          <View style={[styles.connectRow, { marginBottom: 14 + insets.bottom }]}>
            <LinearGradient
              colors={['#111111', '#10131c', '#101e40']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.connectCapsule}
            >
              <TouchableOpacity
                style={styles.connectCapsuleMain}
                onPress={() => {
                  onOpenSync();
                  handleClose();
                }}
                activeOpacity={0.8}
                accessibilityLabel="Connect PC"
              >
                <LaptopIcon size={18} color="#ffffff" />
                <Text style={styles.connectCapsuleText}>Connect PC</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.connectCapsuleQr}
                onPress={() => {
                  onOpenSync({ scan: true });
                  handleClose();
                }}
                activeOpacity={0.7}
                accessibilityLabel="Scan QR Code"
              >
                <QrCodeIcon size={18} color="#ffffff" />
              </TouchableOpacity>
            </LinearGradient>
            <TouchableOpacity
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

      <Modal
        visible={!!sessionActionTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setSessionActionTarget(null)}
      >
        <TouchableOpacity style={styles.confirmModalOverlay} activeOpacity={1} onPress={() => setSessionActionTarget(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sessionActionsCard} onPress={() => {}}>
            <Text style={styles.sessionActionsTitle} numberOfLines={1}>{sessionActionTarget?.title}</Text>
            <TouchableOpacity
              style={styles.sessionActionRow}
              onPress={() => {
                if (!sessionActionTarget) return;
                setRenameValue(sessionActionTarget.title);
                setSessionToRename(sessionActionTarget);
                setSessionActionTarget(null);
              }}
              activeOpacity={0.7}
            >
              <PencilIcon size={18} color="#ffffff" />
              <Text style={styles.sessionActionText}>Rename chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sessionActionRow}
              onPress={() => {
                if (sessionActionTarget) setSessionToDelete(sessionActionTarget);
                setSessionActionTarget(null);
              }}
              activeOpacity={0.7}
            >
              <TrashIcon size={18} color="#ef4444" />
              <Text style={styles.sessionActionDeleteText}>Delete chat</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!sessionToRename}
        transparent
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
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setSessionToRename(null)} activeOpacity={0.7}>
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
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
              <View style={styles.confirmModalIconBox}>
                <TrashIcon size={18} color="#ef4444" />
              </View>
              <Text style={styles.confirmModalTitle}>Delete chat?</Text>
            </View>
            <Text style={styles.confirmModalMessage}>
              Permanently delete "{sessionToDelete?.title}"? All messages in this conversation will be removed. This cannot be undone.
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
                <Text style={styles.confirmDeleteBtnText}>Delete</Text>
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
    paddingTop: 6,
    paddingBottom: 20,
  },

  /* Top row */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#295294',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  newChatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9999,
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  newChatPillText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  closeDrawerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  /* Hero */
  heroTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 37,
    letterSpacing: -0.7,
    paddingHorizontal: 16,
    marginTop: 20,
  },

  /* Search */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 18,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 9999,
    backgroundColor: '#282828',
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

  /* Quick cards */
  cardsRow: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 4,
  },
  quickCard: {
    width: 150,
    height: 176,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#10131c',
    borderWidth: 1,
    borderColor: 'rgba(129, 166, 228, 0.16)',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  quickCardLabel: {
    minWidth: 0,
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  quickCardDesc: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  quickCardArrow: {
    alignSelf: 'flex-start',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },

  /* History */
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 28,
    marginBottom: 6,
  },
  historyHeaderTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  historyRow: {
    position: 'relative',
    overflow: 'hidden',
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
    paddingVertical: 14,
  },
  historyTitleTouch: {
    flex: 1,
    minWidth: 0,
  },
  historyTitleText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  historyMenuWrap: {
    flexShrink: 0,
  },
  historyMenuBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
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

  /* Connect PC capsule + separate Settings button (footer row) */
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
  },
  connectCapsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingLeft: 16,
    paddingRight: 7,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(129, 166, 228, 0.18)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  connectCapsuleMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
  },
  connectCapsuleText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  connectCapsuleQr: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#295294',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  connectCapsuleSettings: {
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
    maxWidth: 340,
    backgroundColor: '#121212',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 20,
  },
  sessionActionsCard: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#121212',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 8,
  },
  sessionActionsTitle: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sessionActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 8,
  },
  sessionActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  sessionActionDeleteText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  renameInput: {
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
    borderRadius: 8,
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
    marginBottom: 10,
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
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  confirmModalMessage: {
    color: '#a1a1aa',
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 20,
  },
  confirmModalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  confirmCancelBtnText: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmDeleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#ef4444',
  },
  confirmDeleteBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
