import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text, ScrollView } from 'react-native';
import { Header } from '../components/Header';
import { ChatBubble } from '../components/ChatBubble';
import { MessageInput } from '../components/MessageInput';
import type { ChatMessage } from '../types/chat';

const noop = () => {};
class MessageBoundary extends React.Component<{ children: React.ReactNode; content: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('[phone-preview] message rendering failed', error); }
  componentDidUpdate(previous: Readonly<{ children: React.ReactNode; content: string }>) {
    if (this.state.failed && previous.content !== this.props.content) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <Text style={{ color: '#fff', padding: 20 }}>{this.props.content || 'Waiting for the response…'}</Text> : this.props.children;
  }
}
function DesktopChatPreview() {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [hint, setHint] = useState('Open Chat on your phone to preview');
  const follow = useRef(true);
  const scroll = useRef<any>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'brown-phone-preview') return;
      const incoming = event.data.snapshot;
      setSnapshot(incoming ? { ...incoming, messages: Array.isArray(incoming.messages) ? incoming.messages.filter((m: any) => m && (m.role === 'assistant' || m.role === 'user')).map((m: any) => ({ ...m, content: String(m.content || '') })) : [] } : null);
      setHint(String(event.data.hint || '')); follow.current = event.data.follow !== false;
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'brown-phone-preview-ready' }, '*');
    return () => { window.removeEventListener('message', receive); };
  }, []);
  const model = snapshot?.model ? { id: snapshot.model, name: snapshot.model, provider: 'ollama' } as any : null;
  if (!snapshot) return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
    <img src="../../../Assets/Brown%20Logos/brown-white-transparent-logo.png" alt="Brown" style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: 22 }} />
    <Text style={{ color: '#fafafa', fontFamily: 'Outfit_600SemiBold', fontSize: 30, lineHeight: 38, marginBottom: 12 }}>Brown</Text>
    <Text style={{ color: '#d4d4d8', fontFamily: 'Outfit_500Medium', fontSize: 17, lineHeight: 24, textAlign: 'center', marginBottom: 8 }}>Waiting for connection</Text>
    <Text numberOfLines={1} style={{ color: '#c4c4c9', fontFamily: 'Outfit_400Regular', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 350 }}>{hint}</Text>
  </View>;
  return <View style={{ flex: 1, backgroundColor: '#000000' }}>
    <View style={{ height: 52 }} accessibilityElementsHidden />
    <View pointerEvents="none" ref={(node: any) => node?.setAttribute?.('inert', '')}><Header onOpenSidebar={noop} onOpenSettings={noop} /></View>
    <ScrollView nativeID="preview-chat-scroll" ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }} onContentSizeChange={() => { if (follow.current) scroll.current?.scrollToEnd({ animated: false }); }}>
      {!snapshot ? <Text style={{ color: '#a8adb5', fontSize: 14, lineHeight: 23, paddingHorizontal: 28, paddingVertical: 40, textAlign: 'center' }}>{hint}</Text> : snapshot.messages?.length ? snapshot.messages.map((message: ChatMessage, index: number) => <View key={message.id || index} pointerEvents="none"><MessageBoundary content={message.content}><ChatBubble message={{ ...message, isStreaming: snapshot.generating && index === snapshot.messages.length - 1 && message.role === 'assistant' && !message.content }} onCopy={() => false} onSpeak={noop} /></MessageBoundary></View>) : <Text style={{ color: '#fff', fontSize: 24, padding: 30 }}>How can I help?</Text>}
      {snapshot?.generating && snapshot.messages?.[snapshot.messages.length - 1]?.role !== 'assistant' && <MessageBoundary content=""><ChatBubble message={{ id: 'preview-thinking', sessionId: '', role: 'assistant', timestamp: 0, content: '', isStreaming: true }} /></MessageBoundary>}
    </ScrollView>
    <View pointerEvents="none" ref={(node: any) => node?.setAttribute?.('inert', '')}><MessageInput activeModel={model} models={[]} onSendMessage={noop} onStopGeneration={noop} onVoicePress={noop} isGenerating={snapshot?.generating === true} isListening={false} disabled /></View>
    <View style={{ height: 22, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 108, height: 4, borderRadius: 4, backgroundColor: '#eee' }} /></View>
  </View>;
}
createRoot(document.getElementById('root')!).render(<DesktopChatPreview />);
