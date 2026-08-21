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
  Image,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { ChatSession } from '../types/chat';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';
import {
  PlusIcon,
  TrashIcon,
  DownloadIcon,
  LaptopIcon,
  SettingsIcon,
  SearchIcon,
  CloseIcon,
  PencilIcon,
  SparklesIcon,
  DocumentIcon,
} from './Icons';
import { ChatRepository } from '../services/storage/ChatRepository';

interface DrawerSidebarProps {
  isOpen: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSync: () => void;
  onOpenSettings?: () => void;
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
      // Preserve standard short acronyms (e.g., AI, PDF, API, SQL)
      if (word.length <= 4 && word === word.toUpperCase() && /^[A-Z0-9]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Formats dates into human-readable timestamps matching the spotlight reference UI:
 * e.g. "Sun, 12:27 AM", "Jan 8", "Nov 25, 2025"
 */
function formatSessionDate(timestamp?: number): string {
  if (!timestamp) return 'Recently';
  const now = new Date();
  const date = new Date(timestamp);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  } else if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

const DRAWER_WIDTH = 300;

export const DrawerSidebar: React.FC<DrawerSidebarProps> = ({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onOpenSync,
  onOpenSettings,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [hoveredSpotlightId, setHoveredSpotlightId] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spotlightFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      setIsSpotlightOpen(false);
      setSearchQuery('');
      setHoveredSessionId(null);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isSpotlightOpen) {
      Animated.timing(spotlightFadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(spotlightFadeAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start();
    }
  }, [isSpotlightOpen]);

  if (!isOpen && (fadeAnim as any)._value === 0) return null;

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  // Filter sessions based on spotlight search input
  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(query) ||
      (s.lastMessagePreview && s.lastMessagePreview.toLowerCase().includes(query))
    );
  });

  const handleDownloadSession = async (session: ChatSession) => {
    try {
      const repo = new ChatRepository();
      const messages = await repo.getMessagesForSession(session.id);
      if (!messages || messages.length === 0) {
        Alert.alert('Empty Chat', 'No messages found to download.');
        return;
      }

      const formattedDate = new Date(session.createdAt || Date.now()).toLocaleDateString();
      const markdown = [
        `# ${session.title}`,
        `Date: ${formattedDate}`,
        `Model: ${session.modelId || 'Ultron AI'}`,
        `Messages: ${messages.length}`,
        `\n---\n`,
        ...messages.map((m: any) => {
          const speaker = m.role === 'user' ? 'User' : 'Ultron';
          return `### ${speaker}\n${m.content}\n`;
        }),
      ].join('\n');

      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${session.title.replace(/[^a-z0-9_-]/gi, '_')}.md`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        Alert.alert(
          'Chat Exported',
          `"${session.title}" (${messages.length} messages) ready to export.`,
          [{ text: 'OK' }]
        );
      }
    } catch (err: any) {
      Alert.alert('Download Error', err?.message || 'Failed to download chat transcript.');
    }
  };

  // Split sessions into "Last 7 days" and "Older"
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentSessions = filteredSessions.filter((s) => (s.updatedAt || s.createdAt) >= sevenDaysAgo);
  const olderSessions = filteredSessions.filter((s) => (s.updatedAt || s.createdAt) < sevenDaysAgo);

  return (
    <View style={styles.overlay} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Animated Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.backdropTouch}
          onPress={handleClose}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Animated Sliding Drawer Container (#1A1A1A Background) */}
      <Animated.View
        style={[
          styles.drawerContainer,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <SafeAreaView style={styles.drawerInner}>
          {/* Top Brand Header with Ultron Logo, Ultron Name & Top-Right Cross Button */}
          <View style={styles.drawerHeader}>
            <View style={styles.topBrandBar}>
              <View style={styles.brandRow}>
                <Image
                  source={require('../../Assets/ultron-logo.png')}
                  style={styles.brandLogo}
                  resizeMode="contain"
                />
                <Text style={styles.brandTitle}>Ultron</Text>
                <Text style={styles.betaText}>BETA</Text>
              </View>

              {/* Close / Cross Button without Background */}
              <TouchableOpacity
                style={styles.closeCrossBtn}
                onPress={handleClose}
                activeOpacity={0.7}
                accessibilityLabel="Close sidebar"
              >
                <CloseIcon size={18} color="#a1a1aa" />
              </TouchableOpacity>
            </View>

            {/* Actions Row: New Chat Button + Spotlight Search Button without Background */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.newChatBtn}
                onPress={() => {
                  onNewChat();
                  handleClose();
                }}
                activeOpacity={0.8}
              >
                <PlusIcon size={16} color="#000000" />
                <Text style={styles.newChatText}>New Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.searchToggleBtn}
                onPress={() => setIsSpotlightOpen(true)}
                activeOpacity={0.7}
                accessibilityLabel="Search conversations"
              >
                <SearchIcon size={18} color="#a1a1aa" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Recent Conversations List with Hover Effects */}
          <ScrollView style={styles.sessionsList} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionHeader}>Recent Conversations</Text>
            {sessions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No saved chats yet.</Text>
              </View>
            ) : (
              sessions.map((item: ChatSession) => {
                const isActive = item.id === activeSessionId;
                const isHovered = item.id === hoveredSessionId;
                const showActions = isHovered || isActive;
                const formattedTitle = formatConversationTitle(item.title);
                const hoverHandlers =
                  Platform.OS === 'web'
                    ? ({
                        onMouseEnter: () => setHoveredSessionId(item.id),
                        onMouseLeave: () => setHoveredSessionId(null),
                      } as any)
                    : {};
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.sessionItem,
                      isActive && styles.sessionItemActive,
                      isHovered && styles.sessionItemHovered,
                    ]}
                    onPress={() => {
                      onSelectSession(item.id);
                      handleClose();
                    }}
                    onLongPress={() => onDeleteSession(item.id)}
                    delayLongPress={450}
                    activeOpacity={0.85}
                    {...hoverHandlers}
                  >
                    <View style={styles.sessionContent}>
                      <Text
                        style={[
                          styles.sessionTitle,
                          (isActive || isHovered) && styles.sessionTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {formattedTitle}
                      </Text>
                      {item.lastMessagePreview ? (
                        <Text style={styles.sessionPreview} numberOfLines={1}>
                          {item.lastMessagePreview}
                        </Text>
                      ) : null}
                    </View>

                    {/* Action buttons (Download/Export & Delete) shown on hover or active */}
                    <View style={[styles.sessionActionsGroup, !showActions && styles.sessionActionsHidden]}>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          handleDownloadSession(item);
                        }}
                        activeOpacity={0.7}
                        accessibilityLabel="Download / Export chat"
                      >
                        <DownloadIcon size={14} color="#a1a1aa" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionIconBtn, styles.deleteActionBtn]}
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          onDeleteSession(item.id);
                        }}
                        activeOpacity={0.7}
                        accessibilityLabel="Delete chat"
                      >
                        <TrashIcon size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Bottom Footer with Desktop Sync & Settings Button */}
          <View style={styles.drawerFooter}>
            <TouchableOpacity
              style={styles.footerActionBtn}
              onPress={() => {
                onOpenSync();
                handleClose();
              }}
              activeOpacity={0.7}
            >
              <LaptopIcon size={22} color="#ffffff" />
              <Text style={styles.footerActionTitle}>Desktop Sync</Text>
            </TouchableOpacity>

            {onOpenSettings && (
              <TouchableOpacity
                style={[styles.footerActionBtn, styles.settingsBtn]}
                onPress={() => {
                  onOpenSettings();
                  handleClose();
                }}
                activeOpacity={0.7}
              >
                <SettingsIcon size={22} color="#ffffff" />
                <Text style={styles.footerActionTitle}>Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* ========================================================================= */}
      {/* SPOTLIGHT SEARCH MODAL (Matching Reference Screenshot 1:1 for Mobile)     */}
      {/* ========================================================================= */}
      <Modal
        visible={isSpotlightOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSpotlightOpen(false)}
      >
        <TouchableOpacity
          style={styles.spotlightModalOverlay}
          activeOpacity={1}
          onPress={() => setIsSpotlightOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.spotlightCard}
            onPress={() => {}}
          >
            {/* Top Search Input Row */}
            <View style={styles.spotlightInputRow}>
              <SearchIcon size={18} color="#a1a1aa" />
              <TextInput
                style={[
                  styles.spotlightSearchInput,
                  Platform.OS === 'web' ? ({ outline: 'none', border: 'none' } as any) : {},
                ]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search conversations..."
                placeholderTextColor="#71717a"
                autoFocus
              />
              <TouchableOpacity
                style={styles.spotlightCloseIconBtn}
                onPress={() => setIsSpotlightOpen(false)}
                activeOpacity={0.7}
              >
                <CloseIcon size={16} color="#a1a1aa" />
              </TouchableOpacity>
            </View>

            {/* "New Chat" Action Button Bar */}
            <TouchableOpacity
              style={styles.spotlightNewChatRow}
              onPress={() => {
                setIsSpotlightOpen(false);
                onNewChat();
                handleClose();
              }}
              activeOpacity={0.7}
            >
              <PencilIcon size={15} color="#ffffff" />
              <Text style={styles.spotlightNewChatText}>New chat</Text>
            </TouchableOpacity>

            {/* Grouped Results List: Last 7 days & Older */}
            <ScrollView style={styles.spotlightResultsScroll} showsVerticalScrollIndicator={false}>
              {/* Section 1: Last 7 Days */}
              {recentSessions.length > 0 && (
                <View style={styles.spotlightSectionBlock}>
                  <Text style={styles.spotlightSectionTitle}>Last 7 days</Text>
                  {recentSessions.map((item) => {
                    const isHovered = hoveredSpotlightId === item.id;
                    const formattedTitle = formatConversationTitle(item.title);
                    const formattedDate = formatSessionDate(item.updatedAt || item.createdAt);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.spotlightResultItem,
                          isHovered && styles.spotlightResultItemHovered,
                        ]}
                        onPress={() => {
                          setIsSpotlightOpen(false);
                          onSelectSession(item.id);
                          handleClose();
                        }}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web'
                          ? ({
                              onMouseEnter: () => setHoveredSpotlightId(item.id),
                              onMouseLeave: () => setHoveredSpotlightId(null),
                            } as any)
                          : {})}
                      >
                        <View style={styles.spotlightItemIconBox}>
                          <DocumentIcon size={17} color="#60a5fa" />
                        </View>
                        <View style={styles.spotlightItemTextCol}>
                          <View style={styles.spotlightItemHeaderRow}>
                            <Text style={styles.spotlightItemTitle} numberOfLines={1}>
                              {formattedTitle}
                            </Text>
                            <Text style={styles.spotlightItemDate}>{formattedDate}</Text>
                          </View>
                          <Text style={styles.spotlightItemPreview} numberOfLines={1}>
                            {item.lastMessagePreview || 'No messages in this chat yet'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Section 2: Older */}
              {olderSessions.length > 0 && (
                <View style={styles.spotlightSectionBlock}>
                  <Text style={styles.spotlightSectionTitle}>Older</Text>
                  {olderSessions.map((item) => {
                    const isHovered = hoveredSpotlightId === item.id;
                    const formattedTitle = formatConversationTitle(item.title);
                    const formattedDate = formatSessionDate(item.updatedAt || item.createdAt);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.spotlightResultItem,
                          isHovered && styles.spotlightResultItemHovered,
                        ]}
                        onPress={() => {
                          setIsSpotlightOpen(false);
                          onSelectSession(item.id);
                          handleClose();
                        }}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web'
                          ? ({
                              onMouseEnter: () => setHoveredSpotlightId(item.id),
                              onMouseLeave: () => setHoveredSpotlightId(null),
                            } as any)
                          : {})}
                      >
                        <View style={styles.spotlightItemIconBox}>
                          <SparklesIcon size={16} color="#c084fc" />
                        </View>
                        <View style={styles.spotlightItemTextCol}>
                          <View style={styles.spotlightItemHeaderRow}>
                            <Text style={styles.spotlightItemTitle} numberOfLines={1}>
                              {formattedTitle}
                            </Text>
                            <Text style={styles.spotlightItemDate}>{formattedDate}</Text>
                          </View>
                          <Text style={styles.spotlightItemPreview} numberOfLines={1}>
                            {item.lastMessagePreview || 'No messages in this chat yet'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {filteredSessions.length === 0 && (
                <View style={styles.spotlightEmptyBox}>
                  <Text style={styles.spotlightEmptyText}>No matching conversations found.</Text>
                </View>
              )}
            </ScrollView>
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
    width: DRAWER_WIDTH,
    maxWidth: '85%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  drawerInner: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  drawerHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  topBrandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 22,
    height: 22,
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  betaText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: 1,
    textTransform: 'uppercase',
  },
  closeCrossBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newChatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 9999,
    paddingVertical: 9,
  },
  newChatText: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '700',
  },
  searchToggleBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  sessionsList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  sectionHeader: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#71717a',
    fontSize: 13,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sessionItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  sessionItemHovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sessionContent: {
    flex: 1,
    paddingVertical: 2,
  },
  sessionTitle: {
    color: '#d4d4d8',
    fontSize: 13.5,
    fontWeight: '500',
  },
  sessionTitleActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  sessionPreview: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  deleteSessionBtn: {
    padding: 6,
    backgroundColor: 'transparent',
  },
  sessionActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
  },
  sessionActionsHidden: {
    opacity: 0,
  },
  actionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  deleteActionBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  drawerFooter: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    gap: 6,
  },
  footerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#212124',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  settingsBtn: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  footerActionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Spotlight Search Modal Styles */
  spotlightModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  spotlightCard: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#18181b',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    maxHeight: '85%',
  },
  spotlightInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  spotlightSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: 0,
  },
  spotlightCloseIconBtn: {
    padding: 4,
  },
  spotlightNewChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#27272a',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 12,
    marginBottom: 8,
  },
  spotlightNewChatText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  spotlightResultsScroll: {
    maxHeight: 380,
  },
  spotlightSectionBlock: {
    marginTop: 12,
  },
  spotlightSectionTitle: {
    color: '#71717a',
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  spotlightResultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'transparent',
    marginBottom: 3,
  },
  spotlightResultItemHovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  spotlightItemIconBox: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 10,
  },
  spotlightItemTextCol: {
    flex: 1,
  },
  spotlightItemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  spotlightItemTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
  },
  spotlightItemDate: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '500',
  },
  spotlightItemPreview: {
    color: '#a1a1aa',
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  spotlightEmptyBox: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  spotlightEmptyText: {
    color: '#71717a',
    fontSize: 13,
  },
});
