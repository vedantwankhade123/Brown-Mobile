import { BrownButton as TouchableOpacity } from './ButtonSurface';
import React from 'react';
import { View, Text,  StyleSheet } from 'react-native';
import { FolderIcon, RefreshIcon } from './Icons';
export const StorageLocationControl: React.FC<{ label: string; address: string; hint: string; onChoose: () => void | Promise<void>; onDefault: () => void | Promise<void> }> = ({ label, address, hint, onChoose, onDefault }) => (
  <View style={styles.group}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.hint}>{hint}</Text>
    <View style={styles.address}><FolderIcon size={18} color="#ffffff" /><Text selectable style={styles.path} numberOfLines={2} ellipsizeMode="middle">{address}</Text></View>
    <View style={styles.actions}>
    <TouchableOpacity brownSurface="light" style={styles.action} onPress={onChoose} accessibilityLabel={'Choose folder for ' + label}><FolderIcon size={18} /><Text style={styles.actionText}>Choose folder</Text></TouchableOpacity>
    <TouchableOpacity style={[styles.action, styles.resetAction]} onPress={onDefault} accessibilityLabel={'Use default folder for ' + label}><RefreshIcon size={16} color="#ffffff" /><Text style={styles.actionText}>Use default</Text></TouchableOpacity>
    </View>
  </View>
);
const styles = StyleSheet.create({
  group: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#363636', gap: 10 }, label: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  address: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111111', borderRadius: 12, padding: 12 },
  path: { flex: 1, color: '#ffffff', fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: 120, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10, backgroundColor: '#292929', borderRadius: 9999 },
  resetAction: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#666666' },
  actionText: { color: '#ffffff', fontSize: 13, fontWeight: '500', flexShrink: 1 }, hint: { color: '#ffffff', fontSize: 12, lineHeight: 18 },
});
