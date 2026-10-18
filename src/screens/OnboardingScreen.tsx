import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrownButton, ButtonSurface } from '../components/ButtonSurface';
import { AnimatedModal } from '../components/AnimatedModal';
import { BrownLogo } from '../components/BrownLogo';
import { AndroidIcon, CheckIcon, ChevronDownIcon, CloseIcon, MicIcon } from '../components/Icons';
import { LegalDocumentScreen } from './LegalDocumentScreen';
import { LegalDocumentId } from '../content/LegalDocuments';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useReducedMotion } from '../utils/useReducedMotion';
import { useBackLayer } from '../utils/backStack';
import { revealValues } from '../utils/motion';
import { completeMobileOnboarding, getOnboardingVoiceChoice, resumeOnboardingVoiceSetup, saveOnboardingVoiceChoice, VoiceChoice } from '../services/onboarding/OnboardingSetup';
import { DeviceProfiler } from '../services/modelManager/DeviceProfiler';
import { ModelDownloader } from '../services/modelManager/Downloader';
import { KOKORO_VOICES, KokoroVoiceId } from '../services/voice/KokoroTtsService';

const portraits = {
  af_heart: require('../../Assets/personas/heart_sound.png'), am_michael: require('../../Assets/personas/michael_sound.png'),
  bm_george: require('../../Assets/personas/george_sound.png'), bm_lewis: require('../../Assets/personas/lewis_sound.png'),
};
const voiceDetails: Record<KokoroVoiceId, string> = {
  af_heart: 'American · Female', am_michael: 'American · Male', bm_george: 'British · Male', bm_lewis: 'British · Male',
};
type CheckState = { status: 'idle' | 'checking' | 'ready' | 'unavailable'; message: string };
type Props = { onComplete: () => void; isActive?: boolean };

/** Desktop's welcome → name → voice → offline AI flow, with Android-native setup. */
export const OnboardingScreen: React.FC<Props> = ({ onComplete, isActive = true }) => {
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<VoiceChoice>({ enabled: true, voiceId: 'af_heart' });
  const [voiceMenu, setVoiceMenu] = useState(false);
  const [legal, setLegal] = useState<LegalDocumentId | null>(null);
  const [hubSelected, setHubSelected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<CheckState>({ status: 'idle', message: 'Check device support' });
  const [hub, setHub] = useState<CheckState>({ status: 'idle', message: 'Check connection' });
  const mounted = useRef(true);
  const finishing = useRef(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const offset = useRef(new Animated.Value(0)).current;
  const scroll = useRef<{ scrollToEnd(options: { animated: boolean }): void } | null>(null);
  const keyboardInset = useKeyboardInset(0);
  const reduced = useReducedMotion();
  const selected = KOKORO_VOICES.find(voice => voice.voiceId === choice.voiceId) || KOKORO_VOICES[0];

  useEffect(() => {
    mounted.current = true;
    getOnboardingVoiceChoice().then(saved => { if (mounted.current) setChoice(saved); }).catch(() => {});
    return () => { mounted.current = false; abort.current?.abort(); if (readyTimer.current) clearTimeout(readyTimer.current); };
  }, []);
  useEffect(() => {
    if (!isActive) return;
    revealValues([{ value: opacity, from: reduced ? 1 : 0, to: 1 }, { value: offset, from: reduced ? 0 : 10, to: 0 }], reduced ? 0 : 240, undefined, false);
  }, [step, isActive, reduced]);

  const go = (next: number) => { if (finishing.current) return; Keyboard.dismiss(); setError(''); setVoiceMenu(false); setStep(next); };
  useBackLayer(isActive && step > 0, () => { if (!finishing.current) go(step - 1); return true; });

  const checkDevice = async () => {
    setDevice({ status: 'checking', message: 'Checking this phone…' });
    try {
      const rn = require('react-native');
      const available = Boolean(rn.NativeModules?.RNLlama || rn.TurboModuleRegistry?.get?.('RNLlama') || (globalThis as any).llamaInitContext);
      const hardware = await DeviceProfiler.detect();
      const downloads = ModelDownloader.getInstance();
      await downloads.whenReady();
      const count = downloads.getDownloadedIds().length;
      if (mounted.current) setDevice({ status: available ? 'ready' : 'unavailable', message: available
        ? `${hardware.totalRamGb} GB RAM · ${count ? `${count} model${count === 1 ? '' : 's'} installed` : 'Ready for models'}`
        : 'Local AI unavailable' });
    } catch {
      if (mounted.current) setDevice({ status: 'unavailable', message: 'Check failed · tap to retry' });
    }
  };
  const checkHub = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setHub({ status: 'checking', message: 'Checking connection…' });
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch('https://huggingface.co/api/models?limit=1', { signal: controller.signal });
      if (!response.ok) throw new Error('Download host unavailable');
      if (mounted.current && abort.current === controller) setHub({ status: 'ready', message: 'Connected · ready for models' });
    } catch {
      if (mounted.current && abort.current === controller) setHub({ status: 'unavailable', message: 'Offline · tap to retry' });
    } finally { clearTimeout(timer); }
  };
  useEffect(() => {
    if (step === 3 && isActive) { void checkDevice(); void checkHub(); }
    return () => { abort.current?.abort(); };
  }, [step, isActive]);

  const next = async () => {
    if (step === 1) {
      if (!fullName.trim()) { setError('Please enter your name.'); return; }
      go(2);
    } else if (step === 2) {
      try { await saveOnboardingVoiceChoice(choice); go(3); }
      catch { setError('Could not save your voice choice. Please try again.'); }
    }
  };
  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true; setBusy(true); setError(''); Keyboard.dismiss();
    try {
      await completeMobileOnboarding(fullName, choice, hubSelected);
      if (!mounted.current) return;
      setStep(4);
      readyTimer.current = setTimeout(() => {
        if (!mounted.current) return;
        onComplete();
        resumeOnboardingVoiceSetup().catch(() => Alert.alert('Voice setup paused', 'Your setup is saved. You can continue using Brown and retry from Downloads in the main app.'));
      }, reduced ? 0 : 650);
    } catch (cause) {
      if (!mounted.current) return;
      finishing.current = false; setBusy(false);
      setError(cause instanceof Error ? cause.message : 'Could not save setup. Please try again.');
    }
  };
  const statusIcon = (state: CheckState) => state.status === 'checking'
    ? <ActivityIndicator size="small" color="#eeeeee" />
    : state.status === 'ready' ? <CheckIcon size={17} color="#eeeeee" /> : <Text style={styles.retryIcon}>↻</Text>;

  return <SafeAreaView edges={['top', 'bottom']} style={styles.page}>
    <View style={[styles.body, keyboardInset > 0 && { paddingBottom: keyboardInset }]}>
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={[styles.scrollContent, step === 2 && styles.voiceScroll, keyboardInset > 0 && { paddingVertical: 16 }]}
        onLayout={() => { if (keyboardInset > 0) scroll.current?.scrollToEnd({ animated: false }); }}
        onContentSizeChange={() => { if (keyboardInset > 0) scroll.current?.scrollToEnd({ animated: false }); }}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.content, step === 2 && styles.voiceContent, { opacity, transform: [{ translateY: offset }] }]}>
          {step !== 4 && <BrownLogo size={step === 2 ? 88 : 72} style={[styles.logo, step === 2 && styles.voiceLogo]} />}
          {step === 0 ? <>
            <Text style={styles.welcome} accessibilityRole="header">Welcome to Brown AI</Text>
            <BrownButton brownSurface style={[styles.primary, { marginTop: 0 }]} onPress={() => go(1)} accessibilityLabel="Get started"><Text style={styles.primaryText}>Get Started</Text></BrownButton>
          </> : step === 4 ? <View style={styles.readyBrand}>
            <BrownLogo size={96} />
            <Text style={styles.wordmark}>Brown</Text>
          </View> : <>
            <Text style={[styles.heading, step === 2 && styles.voiceHeading]} accessibilityRole="header">{step === 1 ? 'What should I call you?' : step === 2 ? 'Choose your voice' : 'Set up offline AI'}</Text>
            {step === 1 && <TextInput value={fullName} onChangeText={(value: string) => { setFullName(value); setError(''); }}
              accessibilityLabel="Name" placeholder="Name" placeholderTextColor="#8e8e93" autoComplete="off" autoCorrect={false} autoFocus
              autoCapitalize="words" maxLength={80} returnKeyType="next" onSubmitEditing={() => void next()} style={styles.nameInput} />}
            {step === 2 && <View style={styles.voiceGroup}>
              <View style={[styles.engineCard, styles.voiceEngineCard]}>
                <View style={[styles.componentIcon, styles.voiceMic]}><MicIcon size={19} color="#ffffff" /></View>
                <View style={styles.componentCopy}><Text style={[styles.componentTitle, styles.voiceTitle]}>Kokoro Neural Voice Engine</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.componentDetail, styles.voiceSubtitle]}>{choice.enabled ? `Engine + ${selected.label} after setup.` : 'Optional · offline text-to-speech'}</Text></View>
                <Pressable style={[styles.selection, styles.voiceSelection, choice.enabled && styles.selectedChoice, !choice.enabled && styles.unselected]} onPress={() => setChoice(previous => ({ ...previous, enabled: !previous.enabled }))}
                  accessibilityRole="checkbox" accessibilityState={{ checked: choice.enabled }} accessibilityLabel="Set up Kokoro voice after onboarding">{choice.enabled && <CheckIcon size={16} color="#292929" />}</Pressable>
              </View>
              <View pointerEvents="none" style={styles.voiceDivider} />
              <Pressable style={styles.voiceTrigger} onPress={() => setVoiceMenu(true)} accessibilityRole="button" accessibilityState={{ expanded: voiceMenu }} accessibilityLabel={`Choose a voice, ${selected.label} selected`}>
                <Image source={portraits[choice.voiceId]} style={styles.portrait} /><View style={styles.componentCopy}><Text style={[styles.componentTitle, styles.voiceTitle]}>{selected.label}</Text><Text style={[styles.componentDetail, styles.voiceMetadata]}>{voiceDetails[choice.voiceId]}</Text></View><ChevronDownIcon size={17} color="#ffffff" />
              </Pressable>
            </View>}
            {step === 3 && <View style={styles.components}>
              <Pressable style={[styles.engineCard, styles.setupCard]} disabled={device.status === 'checking'} onPress={() => void checkDevice()} accessibilityRole="button" accessibilityLabel="Check on-device AI support">
                <View style={[styles.componentIcon, styles.setupIcon]}><AndroidIcon size={21} color="#eeeeee" /></View><View style={styles.componentCopy}><Text numberOfLines={1} style={[styles.componentTitle, styles.setupText]}>On-device AI</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.componentDetail, styles.setupText]}>{device.message}</Text></View><View style={styles.selection}>{statusIcon(device)}</View>
              </Pressable>
              <Pressable style={[styles.engineCard, styles.setupCard]} disabled={hub.status === 'checking'} onPress={() => void checkHub()} accessibilityRole="button" accessibilityLabel="Check Hugging Face connection">
                <View style={[styles.componentIcon, styles.setupIcon]}><Image source={require('../../Assets/hf-logo.png')} style={styles.hubLogo} /></View><View style={styles.componentCopy}><Text numberOfLines={1} style={[styles.componentTitle, styles.setupText]}>Hugging Face</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.componentDetail, styles.setupText]}>{hub.message}</Text></View><Pressable style={[styles.selection, hubSelected && styles.selectedChoice, !hubSelected && styles.unselected]} onPress={() => setHubSelected(value => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: hubSelected }} accessibilityLabel="Check Hugging Face after setup">{hubSelected && <CheckIcon size={17} color="#292929" />}</Pressable>
              </Pressable>
              <Text style={styles.note}>Optional setup. Add models later to chat offline.</Text>
            </View>}
            {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            <BrownButton brownSurface style={[styles.primary, step === 2 && styles.voiceContinue]} disabled={busy} onPress={() => void (step === 3 ? finish() : next())} accessibilityLabel={step === 3 ? 'Finish setup' : 'Continue'}>{busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{step === 3 ? 'Finish' : 'Continue'}</Text>}</BrownButton>
            {step > 1 && <Pressable style={[styles.back, busy && { opacity: 0.45 }]} disabled={busy} onPress={() => go(step - 1)} accessibilityRole="button" accessibilityLabel="Back">{({ pressed }: { pressed: boolean }) => <>{pressed && <ButtonSurface />}<Text style={styles.backText}>Back</Text></>}</Pressable>}
          </>}
        </Animated.View>
      </ScrollView>
      {keyboardInset === 0 && step !== 2 && <View style={styles.legal}>
        <Text style={styles.legalCopy}>By continuing, you agree to our</Text>
        <View style={styles.legalLinks}>
          <Pressable accessibilityRole="link" accessibilityLabel="Terms of Service" onPress={() => setLegal('terms')} style={styles.legalTarget}><Text style={styles.legalLink}>Terms of Service</Text></Pressable>
          <Text style={styles.legalCopy}> · </Text>
          <Pressable accessibilityRole="link" accessibilityLabel="Privacy Policy" onPress={() => setLegal('privacy')} style={styles.legalTarget}><Text style={styles.legalLink}>Privacy Policy</Text></Pressable>
        </View>
      </View>}
    </View>
    <AnimatedModal visible={voiceMenu && isActive} transparent animationType="fade"
      transition={{ enterDuration: 280, exitDuration: 200, distance: 12, scaleFrom: 0.98 }}
      onRequestClose={() => setVoiceMenu(false)}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setVoiceMenu(false)} accessibilityLabel="Close voice selection" />
        <View style={styles.voiceMenu} accessibilityViewIsModal>
          <View style={styles.menuHeader}><Text style={styles.menuTitle}>Choose your voice</Text><BrownButton brownSurface style={styles.close} onPress={() => setVoiceMenu(false)} accessibilityLabel="Close voice selection"><CloseIcon size={18} color="#ffffff" /></BrownButton></View>
          <ScrollView showsVerticalScrollIndicator={false}>{KOKORO_VOICES.map(voice => <Pressable key={voice.voiceId} style={[styles.voiceOption, choice.voiceId === voice.voiceId && styles.voiceOptionSelected]}
            accessibilityRole="radio" accessibilityState={{ checked: choice.voiceId === voice.voiceId }} accessibilityLabel={`Select ${voice.label}, ${voiceDetails[voice.voiceId]}`}
            onPress={() => { setChoice(previous => ({ ...previous, voiceId: voice.voiceId })); setVoiceMenu(false); }}>
            <ButtonSurface radius={32} /><Image source={portraits[voice.voiceId]} style={[styles.portrait, styles.optionPortrait]} /><View style={styles.componentCopy}><Text style={styles.voiceName}>{voice.label}</Text><Text style={styles.voiceDetail}>{voiceDetails[voice.voiceId]}</Text></View><View style={[styles.voiceCheck, choice.voiceId === voice.voiceId && styles.voiceCheckSelected]}><CheckIcon size={18} color={choice.voiceId === voice.voiceId ? '#333333' : '#d0d0d0'} /></View>
          </Pressable>)}</ScrollView>
        </View>
      </View>
    </AnimatedModal>
    <AnimatedModal visible={!!legal && isActive} animationType="slide" onRequestClose={() => setLegal(null)}>{legal && <LegalDocumentScreen document={legal} onBack={() => setLegal(null)} />}</AnimatedModal>
  </SafeAreaView>;
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000000' }, body: { flex: 1 }, scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }, content: { width: '100%', maxWidth: 340, alignSelf: 'center', alignItems: 'center' },
  logo: { marginBottom: 18 }, welcome: { color: '#f3f4f6', fontSize: 28, fontWeight: '600', letterSpacing: -0.8, textAlign: 'center', marginBottom: 14 }, heading: { color: '#f3f4f6', fontSize: 23, fontWeight: '600', letterSpacing: -0.5, textAlign: 'center', marginBottom: 18 }, readyBrand: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: 8 }, wordmark: { color: '#ffffff', fontSize: 38, lineHeight: 46, fontWeight: '600', textAlign: 'center', includeFontPadding: false },
  primary: { width: '100%', minHeight: 48, borderRadius: 999, justifyContent: 'center', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, marginTop: 12 }, primaryText: { color: '#ffffff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  nameInput: { width: '100%', minHeight: 52, borderWidth: 1, borderColor: '#ffffff', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12, fontSize: 17, color: '#ffffff', backgroundColor: 'transparent' },
  back: { width: '100%', minHeight: 52, borderRadius: 999, borderWidth: 1, borderColor: '#ffffff', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12, marginTop: 10, overflow: 'hidden' }, backText: { color: '#ffffff', fontSize: 18, fontWeight: '500' },
  voiceGroup: { width: '100%', borderRadius: 28, overflow: 'hidden', backgroundColor: '#444444' }, components: { width: '100%', gap: 10 }, engineCard: { width: '100%', backgroundColor: '#292929', borderWidth: 1, borderColor: '#404040', borderRadius: 32, padding: 8, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 2 },
  componentIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#3a3a3a', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, componentCopy: { flex: 1, minWidth: 0 }, componentTitle: { color: '#eeeeee', fontSize: 13, fontWeight: '600' }, componentDetail: { color: '#b8b8bd', fontSize: 11, lineHeight: 16, marginTop: 3 },
  setupCard: { minHeight: 0, padding: 6 },
  setupText: { color: '#ffffff' },
  selectedChoice: { backgroundColor: '#ffffff' },
  setupIcon: { width: 44, height: 44, borderRadius: 22 },
  selection: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#484848', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, unselected: { opacity: 0.45, borderWidth: 1, borderColor: '#aaaaaa' }, retryIcon: { color: '#eeeeee', fontSize: 24 }, hubLogo: { width: 23, height: 23, resizeMode: 'contain' },
  voiceScroll: { paddingHorizontal: 28, paddingVertical: 28 }, voiceContent: { maxWidth: 340 }, voiceLogo: { marginBottom: 20 }, voiceHeading: { fontSize: 25, marginBottom: 12 },
  voiceMic: { backgroundColor: '#292929' }, voiceTitle: { color: '#ffffff', fontSize: 14 }, voiceSubtitle: { color: '#ffffff', fontSize: 12, lineHeight: 16, marginTop: 2 }, voiceMetadata: { color: '#ffffff', fontSize: 12, marginTop: 2 }, voiceSelection: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#484848' }, voiceContinue: { minHeight: 52, marginTop: 12 },
  voiceEngineCard: { minHeight: 72, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, backgroundColor: 'transparent', borderWidth: 0 },
  voiceDivider: { height: 1, alignSelf: 'stretch', marginHorizontal: 12, backgroundColor: '#ffffff' },
  voiceTrigger: { width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, marginTop: 0, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, minHeight: 72 }, portrait: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#000000' },
  note: { color: '#98989f', textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 14, paddingHorizontal: 6 }, error: { color: '#f87171', textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: 12 },
  legal: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 14, paddingBottom: 18, maxWidth: 460, alignSelf: 'center' },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  legalCopy: { color: '#ffffff', fontSize: 11, lineHeight: 17, textAlign: 'center' }, legalTarget: { minHeight: 28, justifyContent: 'center' }, legalLink: { color: '#ffffff', fontSize: 11, lineHeight: 17, textDecorationLine: 'underline' },
  modalRoot: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', padding: 24 }, voiceMenu: { width: '100%', maxWidth: 388, maxHeight: '80%', alignSelf: 'center', backgroundColor: 'transparent' },
  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingLeft: 4 }, menuTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600' }, close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  voiceOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 32, overflow: 'hidden', padding: 6, marginBottom: 8, minHeight: 64, backgroundColor: '#343434', borderWidth: 1, borderColor: '#888888' }, optionPortrait: { width: 44, height: 44, borderRadius: 22, borderColor: '#999999' }, voiceOptionSelected: { borderColor: '#c8c8ce' }, voiceName: { color: '#ffffff', fontSize: 15, fontWeight: '600' }, voiceDetail: { color: '#dddddd', fontSize: 12, marginTop: 3 }, voiceCheck: { width: 46, height: 46, borderRadius: 23, flexShrink: 0, backgroundColor: '#242426', borderWidth: 1, borderColor: '#999999', alignItems: 'center', justifyContent: 'center' }, voiceCheckSelected: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
});
