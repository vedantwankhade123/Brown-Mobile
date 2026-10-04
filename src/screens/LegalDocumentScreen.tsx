import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader, useStickyHeader } from '../components/ScreenHeader';
import { LEGAL_DOCUMENTS, LEGAL_REVISION, LegalDocumentId } from '../content/LegalDocuments';

export const LegalDocumentScreen: React.FC<{ document: LegalDocumentId; onBack: () => void }> = ({ document, onBack }) => {
  const scrollRef = useRef<{ scrollTo: (options: { y: number; animated?: boolean }) => void } | null>(null);
  const positions = useRef<Record<string, number>>({});
  const content = LEGAL_DOCUMENTS[document];
  const { onScroll, scrolled } = useStickyHeader();
  const [headerHeight, setHeaderHeight] = useState(64);
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header} onLayout={(event: any) => setHeaderHeight(event.nativeEvent.layout.height)}>
        <ScreenHeader title={content.title} onBack={onBack} scrolled={scrolled} />
      </View>
      <ScrollView ref={scrollRef} key={document} contentContainerStyle={[styles.content, { paddingTop: headerHeight + 24 }]} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>Updated {LEGAL_REVISION}</Text>
          <Text accessibilityRole="header" style={styles.documentTitle}>{content.title}</Text>
          <Text style={styles.introduction}>{content.introduction}</Text>
        </View>
        <View style={styles.contents}>
          <Text style={styles.contentsTitle}>Contents</Text>
          {content.sections.map((section,index) => <TouchableOpacity key={section.title} accessibilityRole="link" onPress={() => scrollRef.current?.scrollTo({y:Math.max(0,(positions.current[section.title] || 0)-headerHeight-12),animated:true})}><Text style={styles.contentsLink}>{index+1}. {section.title}</Text></TouchableOpacity>)}
        </View>
        {content.sections.map((section, index) => (
          <View key={section.title} style={styles.section} onLayout={(event: any) => {positions.current[section.title] = event.nativeEvent.layout.y;}}>
            <Text accessibilityRole="header" style={styles.title}>{index+1}. {section.title}</Text>
            {section.paragraphs.map(paragraph => <Text key={paragraph} selectable style={styles.body}>{paragraph}</Text>)}
          </View>
        ))}
        <TouchableOpacity accessibilityRole="link" accessibilityLabel="Email Brown support" onPress={() => Linking.openURL('mailto:contact@usebrown.online').catch(() => {})} style={styles.contact}>
          <Text style={styles.contactTitle}>Questions?</Text>
          <Text style={styles.contactAddress}>contact@usebrown.online</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000000' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  content: { paddingHorizontal: 28, paddingBottom: 80, width: '100%', maxWidth: 780, alignSelf: 'center' },
  intro: { marginBottom: 0 },
  eyebrow: { color: '#a8a8a8', fontSize: 14, marginBottom: 18 },
  documentTitle: { fontSize: 42, lineHeight: 46, fontWeight: '500', letterSpacing: -1.8, color: '#f4f4f4', marginBottom: 28 },
  introduction: { color: '#c8c8c8', fontSize: 18, lineHeight: 31, fontWeight: '400' },
  contents: { marginTop: 42, marginBottom: 56, paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#303030' },
  contentsTitle: { color: '#f4f4f4', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  contentsLink: { color: '#f4f4f4', fontSize: 16, lineHeight: 25, marginBottom: 9, textDecorationLine: 'underline' },
  section: { marginBottom: 48 },
  title: { color: '#f4f4f4', fontSize: 24, lineHeight: 32, fontWeight: '600', letterSpacing: -0.5, marginBottom: 20 },
  body: { color: '#cccccc', fontSize: 16, lineHeight: 30, marginBottom: 18 },
  contact: { paddingTop: 28, borderTopWidth: 1, borderColor: '#303030', alignItems: 'center' },
  contactTitle: { textAlign: 'center', color: '#f4f4f4', fontSize: 16, fontWeight: '500', marginBottom: 12 },
  contactAddress: { textAlign: 'center', color: '#cccccc', fontSize: 14, textDecorationLine: 'underline' },
});
