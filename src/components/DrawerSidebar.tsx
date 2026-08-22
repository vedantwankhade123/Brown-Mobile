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
import {
  CloseIcon,
  SearchIcon,
  TrashIcon,
  SettingsIcon,
  LaptopIcon,
  PencilIcon,
  SparklesIcon,
  DocumentIcon,
} from './Icons';
import { ChatRepository } from '../services/storage/ChatRepository';
import { ConsentService } from '../services/storage/ConsentService';

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
 * Sidebar toggle/collapse icon matching desktop
 */
const SidebarToggleIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 18,
  color = '#ffffff',
}) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View
      style={{
        width: size,
        height: size,
        borderWidth: 1.5,
        borderColor: color,
        borderRadius: 4,
        position: 'relative',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: Math.round(size * 0.35),
          width: 1.5,
          backgroundColor: color,
        }}
      />
    </View>
  </View>
);

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

/**
 * Formats timestamps like "Aug 20 at 1:05 AM"
 */
function formatSessionDate(timestamp?: number): string {
  if (!timestamp) return 'Recently';
  const date = new Date(timestamp);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day} at ${timeStr}`;
}

const DRAWER_WIDTH = 290;

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
  const [userName, setUserName] = useState('Om Patil');
  const [userInitials, setUserInitials] = useState('OP');

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spotlightFadeAnim = useRef(new Animated.Value(0)).current;

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
          setUserInitials(initials || 'OP');
        }
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 240,
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
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
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
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(query) ||
      (s.lastMessagePreview && s.lastMessagePreview.toLowerCase().includes(query))
    );
  });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentSessions = filteredSessions.filter((s) => (s.updatedAt || s.createdAt) >= sevenDaysAgo);
  const olderSessions = filteredSessions.filter((s) => (s.updatedAt || s.createdAt) < sevenDaysAgo);

  return (
    <View style={styles.overlay} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={styles.backdropTouch}
          onPress={handleClose}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Sliding Drawer Container (#111113 Background) */}
      <Animated.View
        style={[
          styles.drawerContainer,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <SafeAreaView style={styles.drawerInner}>
          {/* Top Brand Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.topBrandBar}>
              <View style={styles.brandRow}>
                <Image
                  source={require('../../Assets/ultron-logo.png')}
                  style={styles.brandLogo}
                  resizeMode="contain"
                />
                <Text style={styles.brandTitle}>Ultron</Text>
                <View style={styles.betaPill}>
                  <Text style={styles.betaText}>BETA</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.collapseSidebarBtn}
                onPress={handleClose}
                activeOpacity={0.7}
                accessibilityLabel="Collapse sidebar"
              >
                <SidebarToggleIcon size={17} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* New Chat Pill */}
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

            {/* Search Chats Row */}
            <TouchableOpacity
              style={styles.searchChatsRow}
              onPress={() => setIsSpotlightOpen(true)}
              activeOpacity={0.7}
            >
              <SearchIcon size={16} color="#ffffff" />
              <Text style={styles.searchChatsText}>Search chats</Text>
            </TouchableOpacity>
          </View>

          {/* Recent Conversations List */}
          <ScrollView style={styles.sessionsList} showsVerticalScrollIndicator={false}>
            <Text style={styles.recentSectionTitle}>Recent</Text>
            {sessions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No saved chats yet.</Text>
              </View>
            ) : (
              sessions.map((item: ChatSession) => {
                const isActive = item.id === activeSessionId;
                const isHovered = item.id === hoveredSessionId;
                const formattedTitle = formatConversationTitle(item.title);
                const formattedDate = formatSessionDate(item.updatedAt || item.createdAt);
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
                      (isActive || isHovered) && styles.sessionItemActive,
                    ]}
                    onPress={() => {
                      onSelectSession(item.id);
                      handleClose();
                    }}
                    onLongPress={() => onDeleteSession(item.id)}
                    delayLongPress={450}
                    activeOpacity={0.8}
                    {...hoverHandlers}
                  >
                    <View style={styles.sessionContent}>
                      <Text style={styles.sessionTitle} numberOfLines={1}>
                        {formattedTitle}
                      </Text>
                      <Text style={styles.sessionDate} numberOfLines={1}>
                        {formattedDate}
                      </Text>
                    </View>

                    {(isHovered || isActive) && (
                      <TouchableOpacity
                        style={styles.deleteActionBtn}
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          onDeleteSession(item.id);
                        }}
                        activeOpacity={0.7}
                        accessibilityLabel="Delete chat"
                      >
                        <TrashIcon size={13} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Bottom Footer with Desktop Sync & User Profile */}
          <View style={styles.drawerFooter}>
            {/* Desktop Sync Row */}
            <TouchableOpacity
              style={styles.desktopSyncBtn}
              onPress={() => {
                onOpenSync();
                handleClose();
              }}
              activeOpacity={0.7}
            >
              <LaptopIcon size={18} color="#ffffff" />
              <Text style={styles.desktopSyncBtnText}>Desktop Sync</Text>
            </TouchableOpacity>

            {/* User Profile Bar */}
            <View style={styles.userProfileBar}>
              <View style={styles.userProfileLeft}>
                <View style={styles.userAvatarBadge}>
                  <Text style={styles.userAvatarInitials}>{userInitials}</Text>
                </View>
                <Text style={styles.userNameText} numberOfLines={1}>
                  {userName}
                </Text>
              </View>

              {onOpenSettings && (
                <TouchableOpacity
                  style={styles.settingsGearBtn}
                  onPress={() => {
                    onOpenSettings();
                    handleClose();
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Settings"
                >
                  <SettingsIcon size={19} color="#ffffff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* Spotlight Search Modal */}
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

            <ScrollView style={styles.spotlightResultsScroll} showsVerticalScrollIndicator={false}>
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
    backgroundColor: '#70A4F8',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4,
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
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  topBrandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  betaPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  betaText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  collapseSidebarBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  newChatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginBottom: 8,
  },
  newChatPillText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchChatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  searchChatsText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  sessionsList: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  recentSectionTitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    borderRadius: 10,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sessionItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  sessionContent: {
    flex: 1,
    marginRight: 6,
  },
  sessionTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  sessionDate: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11.5,
    marginTop: 2,
  },
  deleteActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  drawerFooter: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    gap: 10,
  },
  desktopSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  desktopSyncBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
  },
  userProfileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  userProfileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  userAvatarBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitials: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  userNameText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  settingsGearBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
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
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  spotlightResultItemHovered: {
    backgroundColor: '#27272a',
  },
  spotlightItemIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  spotlightItemTextCol: {
    flex: 1,
  },
  spotlightItemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spotlightItemTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  spotlightItemDate: {
    color: '#71717a',
    fontSize: 11,
  },
  spotlightItemPreview: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 2,
  },
  spotlightEmptyBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  spotlightEmptyText: {
    color: '#71717a',
    fontSize: 13,
  },
});
