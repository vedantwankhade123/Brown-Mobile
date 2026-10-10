import { BrownButton as TouchableOpacity } from '../components/ButtonSurface';
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView,  StyleSheet, SafeAreaView, Alert } from 'react-native';
import { AssistantMemory } from '../services/storage/AssistantMemory';
import { ScreenHeader, useStickyHeader } from '../components/ScreenHeader';
import { PencilIcon, TrashIcon } from '../components/Icons';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
export const PreferencesScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [preferences, setPreferences] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const { onScroll, scrolled } = useStickyHeader();
  const inset = useKeyboardInset(0);
  useEffect(() => { AssistantMemory.list().then(setPreferences); }, []);
  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try { await AssistantMemory.edit(editing, draft); setPreferences(await AssistantMemory.list()); setEditing(null); }
    catch (error: any) { Alert.alert('Preference not saved', error.message); }
    finally { setBusy(false); }
  };
  const remove = async (value: string) => {
    if (busy) return;
    setBusy(true);
    try { await AssistantMemory.forget(value); setPreferences(await AssistantMemory.list()); if (editing === value) setEditing(null); }
    catch { Alert.alert('Could not remove preference', 'Please try again.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.screen}>
    <ScreenHeader overlay title="Preferences" onBack={onBack} scrolled={scrolled} />
    <ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 32 + inset }]}>
      <Text style={styles.hint}>Preferences you asked Brown to remember across chats.</Text>
      {!preferences.length && <View style={styles.card}><Text style={styles.text}>No saved preferences</Text><Text style={styles.hint}>Say “Remember that…” in a chat to add one.</Text></View>}
      {preferences.map(value => <View key={value} style={styles.card}>
        {editing === value ? <>
          <TextInput accessibilityLabel="Edit saved preference" style={styles.input} multiline maxLength={400} value={draft} onChangeText={setDraft} editable={!busy} autoFocus placeholderTextColor="#71717a" />
          <View style={styles.actions}><TouchableOpacity brownSurface style={styles.button} onPress={() => setEditing(null)} disabled={busy}><Text style={styles.text}>Cancel</Text></TouchableOpacity><TouchableOpacity brownSurface accessibilityLabel="Save preference" style={[styles.button, styles.save]} onPress={save} disabled={busy || !draft.trim()}><Text style={styles.saveText}>Save</Text></TouchableOpacity></View>
        </> : <>
          <Text style={styles.text}>{value}</Text>
          <View style={styles.actions}>
            <TouchableOpacity brownSurface accessibilityLabel="Edit preference" style={styles.button} disabled={busy} onPress={() => { setEditing(value); setDraft(value); }}><PencilIcon size={17} /><Text style={styles.text}>Edit</Text></TouchableOpacity>
            <TouchableOpacity brownSurface accessibilityLabel="Delete preference" style={styles.button} disabled={busy} onPress={() => remove(value)}><TrashIcon size={17} color="#e4e4e7" /><Text style={styles.text}>Delete</Text></TouchableOpacity>
          </View>
        </>}
      </View>)}
    </ScrollView>
  </SafeAreaView>;
};
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' }, content: { paddingTop: 82, paddingHorizontal: 16, gap: 14 },
  card: { backgroundColor: '#191919', borderRadius: 24, padding: 18, gap: 14 }, text: { color: '#e4e4e7', fontSize: 15, lineHeight: 23 },
  hint: { color: '#a1a1aa', fontSize: 13, lineHeight: 20 }, input: { backgroundColor: '#252525', color: '#ffffff', fontSize: 15, lineHeight: 23, padding: 14, borderRadius: 16, minHeight: 86 },
  actions: { flexDirection: 'row', gap: 10 }, button: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 44, borderRadius: 9999, backgroundColor: '#292929' }, save: { backgroundColor: '#ffffff' }, saveText: { color: '#111111', fontSize: 15, fontWeight: '600' },
});
