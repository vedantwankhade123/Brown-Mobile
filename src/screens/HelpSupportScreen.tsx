import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Linking,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader, useStickyHeader } from '../components/ScreenHeader';
import { InstagramIcon, MailIcon } from '../components/Icons';
import {
  HELP_CONTACT,
  HELP_DOC_INTRODUCTION,
  HELP_DOC_UPDATED,
  HELP_SECTIONS,
  HelpBlock,
} from '../content/HelpDocuments';
import { ErrorLogService } from '../services/diagnostics/ErrorLogService';

type SendState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'done'; message: string }
  | { phase: 'failed'; message: string };

const BlockView: React.FC<{ block: HelpBlock }> = ({ block }) => {
  if (block.type === 'p') return <Text selectable style={styles.body}>{block.text}</Text>;
  if (block.type === 'h') return <Text style={styles.subHeading}>{block.text}</Text>;
  if (block.type === 'code') return (
    <View style={styles.codeBox}>
      <Text selectable style={styles.codeText}>{block.text}</Text>
    </View>
  );
  return (
    <View style={styles.listBlock}>
      {block.items.map((item, index) => (
        <View key={`${index}-${item.slice(0, 16)}`} style={styles.listRow}>
          <Text style={[styles.listBullet, block.ordered && styles.listNumber]}>
            {block.ordered ? `${index + 1}.` : '•'}
          </Text>
          <Text selectable style={styles.body}>{item}</Text>
        </View>
      ))}
    </View>
  );
};

export const HelpSupportScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { onScroll, scrolled } = useStickyHeader();
  const [headerHeight, setHeaderHeight] = useState(64);
  const scrollRef = useRef<{ scrollTo: (opts: { y: number; animated?: boolean }) => void } | null>(null);
  const sectionLayouts = useRef<Record<string, number>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [sendState, setSendState] = useState<SendState>({ phase: 'idle' });

  useEffect(() => {
    let mounted = true;
    ErrorLogService.count()
      .then((count) => { if (mounted) setPendingCount(count); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const goToSection = useCallback((id: string) => {
    const y = sectionLayouts.current[id];
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - headerHeight - 12), animated: true });
  }, [headerHeight]);

  const openLink = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  const handleSendLogs = useCallback(async () => {
    if (sendState.phase === 'sending') return;
    setSendState({ phase: 'sending' });
    const result = await ErrorLogService.send();
    if (result.status === 'sent') {
      setSendState({ phase: 'done', message: `Sent ${result.count} diagnostic ${result.count === 1 ? 'log' : 'logs'}. Thank you for helping improve Brown.` });
      setPendingCount(0);
    } else if (result.status === 'empty') {
      setSendState({ phase: 'done', message: 'No cached error logs to send — the app has been running cleanly.' });
    } else if (result.status === 'cooldown') {
      const seconds = Math.max(1, Math.ceil(result.retryInMs / 1000));
      setSendState({ phase: 'failed', message: `Reports are limited to one per minute. Try again in ${seconds}s.` });
    } else {
      setSendState({ phase: 'failed', message: result.message });
    }
  }, [sendState.phase]);

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header} onLayout={(event: any) => setHeaderHeight(event.nativeEvent.layout.height)}>
        <ScreenHeader title="Help & Support" onBack={onBack} scrolled={scrolled} />
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>Updated {HELP_DOC_UPDATED}</Text>
          <Text accessibilityRole="header" style={styles.documentTitle}>Help & Support</Text>
          <Text style={styles.introduction}>{HELP_DOC_INTRODUCTION}</Text>
        </View>

        <View style={styles.contents} accessibilityRole="list" accessibilityLabel="Documentation contents">
          <Text style={styles.contentsTitle}>Contents</Text>
          {HELP_SECTIONS.map((section, index) => (
            <TouchableOpacity
              key={section.id}
              style={styles.contentsRow}
              onPress={() => goToSection(section.id)}
              activeOpacity={0.6}
              accessibilityRole="link"
            >
              <Text style={styles.contentsNumber}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.contentsLink}>{section.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {HELP_SECTIONS.map((section, index) => (
          <View
            key={section.id}
            style={styles.section}
            onLayout={(event: any) => { sectionLayouts.current[section.id] = event.nativeEvent.layout.y; }}
          >
<Text accessibilityRole="header" style={styles.title}>{index+1}. {section.title}</Text>
            {section.blocks.map((block, blockIndex) => (
              <BlockView key={`${section.id}-${blockIndex}`} block={block} />
            ))}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.title}>Contact Support</Text>
          <TouchableOpacity
            style={styles.contactCard}
            onPress={() => openLink(`mailto:${HELP_CONTACT.email}`)}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel="Email Brown support"
          >
            <View style={styles.contactIconBox}>
              <MailIcon size={18} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>Support email</Text>
              <Text style={styles.contactValue}>{HELP_CONTACT.email}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.contactCard}
            onPress={() => openLink(HELP_CONTACT.instagramUrl)}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel="Open Brown Instagram"
          >
            <View style={styles.contactIconBox}>
              <InstagramIcon size={18} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>Instagram</Text>
              <Text style={styles.contactValue}>{HELP_CONTACT.instagramHandle}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.title, styles.diagnosticTitle]}>Send Diagnostic Logs</Text>
          <View style={styles.diagnosticCard}>
            <Text style={styles.body}>
              If Brown crashed or misbehaved, you can share a sanitized error report with the
              developer. Reports contain only device specs, app version, error timestamps, and
              code stack traces — never your prompts, chats, or personal data.
            </Text>
            <View style={styles.diagnosticMetaRow}>
              <Text style={styles.diagnosticMeta}>
                {pendingCount > 0
                  ? `${pendingCount} cached ${pendingCount === 1 ? 'log' : 'logs'} on this device`
                  : 'No cached error logs'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.sendButton, sendState.phase === 'sending' && styles.sendButtonDisabled]}
              onPress={handleSendLogs}
              disabled={sendState.phase === 'sending'}
              activeOpacity={0.85}
              accessibilityLabel="Send error log"
            >
              {sendState.phase === 'sending' ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.sendButtonText}>Send Error Log</Text>
              )}
            </TouchableOpacity>
            {sendState.phase === 'done' ? (
              <Text style={styles.statusDone}>{sendState.message}</Text>
            ) : null}
            {sendState.phase === 'failed' ? (
              <Text style={styles.statusFailed}>{sendState.message}</Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel="Open full documentation on the Brown website"
          onPress={() => openLink(HELP_CONTACT.docsUrl)}
          style={styles.websiteLink}
        >
          <Text style={styles.websiteLinkText}>Full documentation — usebrown.online</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000000' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  content: { paddingHorizontal: 28, paddingBottom: 80, width: '100%', maxWidth: 880, alignSelf: 'center' },
  documentTitle: { color: '#f4f4f4', fontSize: 42, lineHeight: 46, fontWeight: '500', letterSpacing: -1.8, marginBottom: 28 },
  intro: { marginBottom: 0 },
  eyebrow: { color: '#a8a8a8', fontSize: 14, marginBottom: 18 },
  introduction: { color: '#c8c8c8', fontSize: 18, lineHeight: 31, fontWeight: '400' },

  contents: { paddingVertical: 24, marginTop: 42, marginBottom: 56, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#303030' },
  contentsTitle: { color: '#f4f4f5', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  contentsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  contentsNumber: { color: '#cccccc', fontSize: 16, width: 24 },
  contentsLink: { color: '#f4f4f4', fontSize: 16, lineHeight: 25, flex: 1, textDecorationLine: 'underline' },

  section: { marginBottom: 56 },
  number: { color: '#717174', fontSize: 12, marginBottom: 7, fontWeight: '600' },
  title: { color: '#f4f4f4', fontSize: 24, lineHeight: 34, fontWeight: '600', letterSpacing: -0.5, marginBottom: 20 },
  subHeading: { color: '#eeeeee', fontSize: 19, lineHeight: 29, fontWeight: '500', marginTop: 24, marginBottom: 12 },
  body: { color: '#cccccc', fontSize: 16, lineHeight: 30, marginBottom: 18, flexShrink: 1 },
  listBlock: { marginBottom: 12 },
  listRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  listBullet: { color: '#ffffff', fontSize: 26, lineHeight: 30, minWidth: 18, textAlign: 'center' },
  listNumber: { fontSize: 16 },
  codeBox: { backgroundColor: '#111111', borderWidth: 1, borderColor: '#333333', borderRadius: 6, padding: 20, marginVertical: 20 },
  codeText: { color: '#a5b4fc', fontSize: 12.5, lineHeight: 20, fontFamily: 'monospace' },

  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, marginBottom: 10 },
  contactIconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#232329', alignItems: 'center', justifyContent: 'center' },
  contactLabel: { color: '#929294', fontSize: 12, fontWeight: '600', marginBottom: 3, letterSpacing: 0.3 },
  contactValue: { color: '#f4f4f5', fontSize: 15, fontWeight: '500' },

  diagnosticTitle: { textAlign: 'center', marginBottom: 10 },
  diagnosticCard: { paddingTop: 0, paddingBottom: 20 },
  diagnosticMetaRow: { marginBottom: 14 },
  diagnosticMeta: { color: '#929294', fontSize: 13 },
  sendButton: { backgroundColor: '#f4f4f5', borderRadius: 9999, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: '#000000', fontSize: 15, fontWeight: '600' },
  statusDone: { color: '#4ade80', fontSize: 13, lineHeight: 19, marginTop: 12 },
  statusFailed: { color: '#f87171', fontSize: 13, lineHeight: 19, marginTop: 12 },

  websiteLink: { alignItems: 'center', paddingVertical: 8 },
  websiteLinkText: { color: '#eeeeee', fontSize: 14, textDecorationLine: 'underline' },
});
