import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

export type UltronSoundName = 'task-complete' | 'permission' | 'question';

const STORAGE_PREFIX = '@brown_sound_';
const VOLUME = 0.65;

// Same three chimes the desktop plays from Assets/sounds/ — bundled with the app.
const SOUND_SOURCES: Record<UltronSoundName, any> = {
  'task-complete': require('../../../Assets/sounds/task-complete.mp3'),
  permission: require('../../../Assets/sounds/permission.mp3'),
  question: require('../../../Assets/sounds/question.mp3'),
};

const ALL_SOUNDS: UltronSoundName[] = ['task-complete', 'permission', 'question'];

export class SoundService {
  private static enabled: Record<UltronSoundName, boolean> = {
    'task-complete': true,
    permission: true,
    question: true,
  };
  private static nativePlayers: Partial<Record<UltronSoundName, any>> = {};
  private static modeConfigured = false;

  /** Load the persisted per-chime toggles once at boot. */
  public static async init(): Promise<void> {
    try {
      const values = await Promise.all(
        ALL_SOUNDS.map((name) => AsyncStorage.getItem(`${STORAGE_PREFIX}${name}`))
      );
      ALL_SOUNDS.forEach((name, i) => {
        this.enabled[name] = values[i] !== 'false';
      });
    } catch {}
  }

  public static isSoundEnabled(soundName: UltronSoundName): boolean {
    return this.enabled[soundName];
  }

  public static async setSoundEnabled(
    soundName: UltronSoundName,
    enabled: boolean
  ): Promise<void> {
    this.enabled[soundName] = enabled;
    try {
      await AsyncStorage.setItem(`${STORAGE_PREFIX}${soundName}`, enabled ? 'true' : 'false');
    } catch {}
  }

  /**
   * Plays one of the Brown agent notification sounds:
   * - 'task-complete': an agent task / reply finished
   * - 'permission': a permission / confirmation prompt
   * - 'question': the assistant asks a question
   */
  public static async playSound(soundName: UltronSoundName): Promise<void> {
    if (!this.enabled[soundName]) return;

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        this.playWeb(soundName);
        return;
      }

      if (Platform.OS !== 'web') {
        let player = this.nativePlayers[soundName];
        if (!player) {
          if (!this.modeConfigured) {
            this.modeConfigured = true;
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: false,
              playThroughEarpieceAndroid: false,
            }).catch(() => {});
          }
          player = (await Audio.Sound.createAsync(SOUND_SOURCES[soundName], {
            shouldPlay: false,
          })).sound;
          await player.setVolumeAsync(VOLUME);
          this.nativePlayers[soundName] = player;
        }
        await player.setPositionAsync(0);
        await player.playAsync();
        Vibration.vibrate(35);
      }
    } catch {
      const broken = this.nativePlayers[soundName];
      delete this.nativePlayers[soundName];
      broken?.unloadAsync().catch(() => {});
    }
  }

  private static playWeb(soundName: UltronSoundName) {
    try {
      const audioPath = `assets/sounds/${soundName}.mp3`;
      // `Audio` here is the expo-av import — the DOM player must be taken from window.
      const audio = new window.Audio(audioPath);
      audio.volume = VOLUME;
      audio.play().catch(() => {
        SoundService.playFallbackChime(soundName);
      });
    } catch {}
  }

  // Synthesised triad so web dev still has audio feedback when the file is unreachable.
  private static playFallbackChime(soundName: UltronSoundName) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (soundName === 'task-complete') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.1);
        osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.2);
      } else if (soundName === 'permission') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(554.37, ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(493.88, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(587.33, ctx.currentTime + 0.15);
      }

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }

  public static async playCompletion(): Promise<void> {
    return this.playSound('task-complete');
  }

  public static async playPermission(): Promise<void> {
    return this.playSound('permission');
  }

  public static async playQuestion(): Promise<void> {
    return this.playSound('question');
  }
}
