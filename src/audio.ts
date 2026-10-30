/**
 * Impostor Protocol - Web Audio Procedural Sound Engine
 * Zero external audio files required. All sound effects synthesized with Web Audio API.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  public masterVolume: number = 0.8;
  public sfxVolume: number = 0.8;
  public ambientVolume: number = 0.4;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private sabotageAlarmOsc: OscillatorNode | null = null;
  private sabotageAlarmModulator: OscillatorNode | null = null;
  private sabotageAlarmModulation: GainNode | null = null;
  private sabotageAlarmGain: GainNode | null = null;

  private initCtx(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public playClick(): void {
    try {
      const ctx = this.initCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.2 * this.masterVolume * this.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // Audio context policy fallback
    }
  }

  public playColorSelect(): void {
    try {
      const ctx = this.initCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.25 * this.masterVolume * this.sfxVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  }

  public playJoin(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.25);

      gain.gain.setValueAtTime(0.25 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  public playCountdownBeep(highPitch: boolean = false): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const freq = highPitch ? 880 : 440;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.3 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (highPitch ? 0.4 : 0.15));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + (highPitch ? 0.4 : 0.15));
    } catch {}
  }

  public playVentClank(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(72, now + 0.18);
      gain.gain.setValueAtTime(Math.max(0.001, 0.24 * this.masterVolume * this.sfxVolume), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {}
  }

  public playVentWhoosh(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.24);
      gain.gain.setValueAtTime(Math.max(0.001, 0.18 * this.masterVolume * this.sfxVolume), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch {}
  }

  public setSabotageAlarm(active: boolean): void {
    if (active) {
      if (this.sabotageAlarmOsc) return;
      try {
        const ctx = this.initCtx();
        const siren = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modulation = ctx.createGain();
        const gain = ctx.createGain();

        siren.type = 'sawtooth';
        siren.frequency.setValueAtTime(780, ctx.currentTime);
        modulator.type = 'triangle';
        modulator.frequency.setValueAtTime(1.1, ctx.currentTime);
        modulation.gain.setValueAtTime(250, ctx.currentTime);
        gain.gain.setValueAtTime(0.22 * this.masterVolume * this.sfxVolume, ctx.currentTime);

        modulator.connect(modulation);
        modulation.connect(siren.frequency);
        siren.connect(gain);
        gain.connect(ctx.destination);
        this.sabotageAlarmOsc = siren;
        this.sabotageAlarmModulator = modulator;
        this.sabotageAlarmModulation = modulation;
        this.sabotageAlarmGain = gain;
        siren.start();
        modulator.start();
      } catch {
        this.setSabotageAlarm(false);
      }
      return;
    }

    this.sabotageAlarmOsc?.stop();
    this.sabotageAlarmOsc?.disconnect();
    this.sabotageAlarmModulator?.stop();
    this.sabotageAlarmModulator?.disconnect();
    this.sabotageAlarmModulation?.disconnect();
    this.sabotageAlarmGain?.disconnect();
    this.sabotageAlarmOsc = null;
    this.sabotageAlarmModulator = null;
    this.sabotageAlarmModulation = null;
    this.sabotageAlarmGain = null;
  }

  public startShipHum(): void {
    try {
      if (this.ambientOsc) return;
      const ctx = this.initCtx();
      this.ambientOsc = ctx.createOscillator();
      this.ambientGain = ctx.createGain();

      this.ambientOsc.type = 'sawtooth';
      this.ambientOsc.frequency.setValueAtTime(65, ctx.currentTime);

      // Low pass filter to make it a deep spaceship interior drone
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, ctx.currentTime);

      this.ambientGain.gain.setValueAtTime(0.05 * this.masterVolume * this.ambientVolume, ctx.currentTime);

      this.ambientOsc.connect(filter);
      filter.connect(this.ambientGain);
      this.ambientGain.connect(ctx.destination);

      this.ambientOsc.start();
    } catch {}
  }

  public stopShipHum(): void {
    try {
      if (this.ambientOsc) {
        this.ambientOsc.stop();
        this.ambientOsc.disconnect();
        this.ambientOsc = null;
      }
    } catch {}
  }
}

export const soundEngine = new SoundEngine();
