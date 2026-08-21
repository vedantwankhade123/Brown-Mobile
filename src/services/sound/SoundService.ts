import { Platform } from 'react-native';

export type UltronSoundName = 'task-complete' | 'permission' | 'question';

export class SoundService {
  private static isSoundEnabled: boolean = true;

  public static setSoundEnabled(enabled: boolean) {
    this.isSoundEnabled = enabled;
  }

  public static getSoundEnabled(): boolean {
    return this.isSoundEnabled;
  }

  /**
   * Plays one of the Ultron agent notification sounds:
   * - 'task-complete': Plays when an agent task / inference finishes
   * - 'permission': Plays when Ultron prompts for permission / confirmation
   * - 'question': Plays when Ultron asks a question
   */
  public static async playSound(soundName: UltronSoundName): Promise<void> {
    if (!this.isSoundEnabled) return;

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Web audio playback using sound assets
        const audioPath = `assets/sounds/${soundName}.mp3`;
        const audio = new Audio(audioPath);
        audio.volume = 0.65;
        
        // Fallback acoustic chime synthesizer if sound file cannot be reached in local dev
        const playFallbackChime = () => {
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              
              if (soundName === 'task-complete') {
                osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
                osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.1); // E5
                osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.2); // G5
              } else if (soundName === 'permission') {
                osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
                osc.frequency.exponentialRampToValueAtTime(554.37, ctx.currentTime + 0.15); // C#5
              } else {
                osc.frequency.setValueAtTime(493.88, ctx.currentTime); // B4
                osc.frequency.exponentialRampToValueAtTime(587.33, ctx.currentTime + 0.15); // D5
              }
              
              gain.gain.setValueAtTime(0.2, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
              
              osc.start();
              osc.stop(ctx.currentTime + 0.35);
            }
          } catch {}
        };

        audio.play().catch(() => {
          playFallbackChime();
        });
      }
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
