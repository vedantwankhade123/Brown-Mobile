import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY = '@brown_explicit_memory_v1';
const ENABLED = '@brown_memory_enabled_v1';
export class AssistantMemory {
  static async enabled(): Promise<boolean> { return (await AsyncStorage.getItem(ENABLED)) !== '0'; }
  static async setEnabled(value: boolean): Promise<void> { await AsyncStorage.setItem(ENABLED, value ? '1' : '0'); }
  static async list(): Promise<string[]> {
    try { const raw = JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); return Array.isArray(raw) ? raw.filter(v => typeof v === 'string').slice(0, 20) : []; } catch { return []; }
  }
  static async forget(value: string): Promise<void> { await AsyncStorage.setItem(KEY, JSON.stringify((await this.list()).filter(v => v !== value))); }
  static async edit(previous: string, next: string): Promise<void> {
    const value = next.trim();
    if (!value || value.length > 400) throw new Error('Enter a preference of 1–400 characters.');
    const saved = await this.list();
    if (!saved.includes(previous)) throw new Error('This preference was removed. Reopen the list.');
    if (saved.some(p => p !== previous && p.toLowerCase() === value.toLowerCase())) throw new Error('That preference is already saved.');
    await AsyncStorage.setItem(KEY, JSON.stringify(saved.map(p => p === previous ? value : p)));
  }
  static async clear(): Promise<void> { await AsyncStorage.removeItem(KEY); }
  static async merge(values: string[]): Promise<void> {
    const saved = await this.list();
    const known = new Set(saved.map(p => p.toLowerCase()));
    for (const value of values) {
      const next = value.trim();
      if (!next || next.length > 400) throw new Error('Invalid saved preference in backup.');
      if (!known.has(next.toLowerCase())) { saved.push(next); known.add(next.toLowerCase()); }
    }
    if (saved.length > 20) throw new Error('Saved memory is full. Remove a preference before restoring.');
    await AsyncStorage.setItem(KEY, JSON.stringify(saved));
  }
  static async preferences(): Promise<string[]> { return await this.enabled() ? this.list() : []; }
  /** Only an explicit standalone command stores memory; ordinary conversations are never mined. */
  static async directive(text: string): Promise<string | null> {
    const request = text.trim();
    if (/^(?:forget|clear|delete) (?:all (?:my )?(?:saved )?(?:memories|preferences)|everything you remember about me)[.!]?$/i.test(request)) { await this.clear(); return 'Cleared your saved preferences.'; }
    const remove = request.match(/^forget(?: that)?[ :]+(.+)$/i);
    if (remove) {
      const target = remove[1].trim(); const saved = await this.list();
      const match = saved.find(v => v.toLowerCase() === target.toLowerCase());
      if (!match) return 'That exact preference is not saved. You can review and remove preferences in Settings → Storage & Memory.';
      await this.forget(match); return 'Removed that saved preference.';
    }
    const add = request.match(/^(?:please )?remember(?: that)?[ :]+(.+)$/i);
    if (!add) return null;
    if (!(await this.enabled())) return 'Saved memory is off. Enable it in Settings → Storage & Memory to remember preferences across chats.';
    const fact = add[1].trim();
    if (fact.length > 400) return 'Please keep a saved preference under 400 characters.';
    const saved = await this.list();
    if (saved.some(v => v.toLowerCase() === fact.toLowerCase())) return 'That preference is already saved.';
    if (saved.length >= 20) return 'Saved memory is full. Remove a preference in Settings → Storage & Memory before adding another.';
    await AsyncStorage.setItem(KEY, JSON.stringify([...saved, fact]));
    return 'Saved for future chats. You can remove it in Settings → Storage & Memory.';
  }
}
