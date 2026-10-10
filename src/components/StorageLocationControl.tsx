import { BrownButton as TouchableOpacity } from './ButtonSurface';
import React from 'react';
import { View, Text,  StyleSheet } from 'react-native';
import { FolderIcon, RefreshIcon } from './Icons';
export const StorageLocationControl: React.FC<{ label: string; address: string; hint: string; onChoose: () => void | Promise<void>; onDefault: () => void | Promise<void> }> = ({ label, address, hint, onChoose, onDefault }) => (
  <View style={styles.group}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.address}><FolderIcon size={18} color="#a1a1aa" /><Text selectable style={styles.path} numberOfLines={2} ellipsizeMode="middle">{address}</Text></View>
    <TouchableOpacity brownSurface="light" style={styles.action} onPress={onChoose} accessibilityLabel={'Choose folder for ' + label}><FolderIcon size={18} /><Text style={styles.actionText}>Choose folder</Text></TouchableOpacity>
    <TouchableOpacity brownSurface="light" style={styles.action} onPress={onDefault} accessibilityLabel={'Use default folder for ' + label}><RefreshIcon size={18} /><Text style={styles.actionText}>Use default</Text></TouchableOpacity>
    <Text style={styles.hint}>{hint}</Text>
  </View>
);
const styles = StyleSheet.create({
  group: { marginTop: 18, gap: 10 }, label: { color: '#d4d4d8', fontSize: 14, fontWeight: '600' },
  address: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111111', borderRadius: 16, padding: 14 },
  path: { flex: 1, color: '#e4e4e7', fontSize: 13, lineHeight: 20 },
  action: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 16, backgroundColor: '#292929', borderRadius: 9999 },
  actionText: { color: '#ffffff', fontSize: 14, fontWeight: '500' }, hint: { color: '#71717a', fontSize: 12, lineHeight: 18 },
});
