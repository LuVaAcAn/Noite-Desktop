import type { AudioSettings, SoundEvent } from '@proyecto-noche/domain';

class NoiteSoundManager {
  private context: AudioContext | null = null;
  private settings: AudioSettings = { sfxEnabled: true, sfxVolume: 0.35, titleAmbienceEnabled: true, ambienceVolume: 0.15 };
  private ambience: { gain: GainNode; oscillators: OscillatorNode[] } | null = null;
  private unlocked = false;
  private lastPlayed = new Map<SoundEvent, number>();

  configure(settings: AudioSettings) {
    this.settings = settings;
    if (this.ambience) this.ambience.gain.gain.setTargetAtTime(settings.ambienceVolume * 0.12, this.ambience.gain.context.currentTime, 0.08);
  }

  async unlock() {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    this.unlocked = true;
  }

  play(event: SoundEvent) {
    if (!this.settings.sfxEnabled) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(event) ?? 0) < (event === 'move' ? 75 : 30)) return;
    this.lastPlayed.set(event, now);
    void this.unlock().then(() => {
      const context = this.context!;
      const frequencies: Record<SoundEvent, [number, number, number]> = {
        move: [320, 420, 0.045], confirm: [440, 720, 0.09], back: [360, 210, 0.08], dialog: [260, 520, 0.11], success: [520, 880, 0.18], error: [220, 130, 0.16], archive: [300, 170, 0.12], random: [180, 680, 0.07], controller: [380, 760, 0.2],
      };
      const [from, to, duration] = frequencies[event];
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = event === 'error' ? 'square' : event === 'move' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(from, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(to, context.currentTime + duration);
      gain.gain.setValueAtTime(Math.max(0.0001, this.settings.sfxVolume * 0.14), context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    }).catch(() => undefined);
  }

  startAmbience() {
    if (!this.settings.titleAmbienceEnabled || this.ambience || !this.unlocked) return;
    void this.unlock().then(() => {
      const context = this.context!;
      const gain = context.createGain();
      gain.gain.value = this.settings.ambienceVolume * 0.12;
      const oscillators = [110, 164.81, 220].map((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = index === 1 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index * 3;
        oscillator.connect(gain);
        oscillator.start();
        return oscillator;
      });
      gain.connect(context.destination);
      this.ambience = { gain, oscillators };
    }).catch(() => undefined);
  }

  stopAmbience() {
    if (!this.ambience) return;
    this.ambience.oscillators.forEach((oscillator) => oscillator.stop());
    this.ambience.gain.disconnect();
    this.ambience = null;
  }
}

export const soundManager = new NoiteSoundManager();
export function playSound(event: SoundEvent) { soundManager.play(event); }
