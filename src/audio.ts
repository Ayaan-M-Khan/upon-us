/**
 * Impostor Protocol - Web Audio Procedural Sound Engine
 * Zero external audio files required. All sound effects synthesized with Web Audio API.
 */

import { proceduralAudio } from './audio/proceduralAudioManager';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public masterVolume: number = 0.8;
  public sfxVolume: number = 0.8;
  public ambientVolume: number = 0.4;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;

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

  public setAmbientVolume(v: number): void {
    this.ambientVolume = Math.max(0, Math.min(1, v));
    proceduralAudio.setAmbientVolume(this.ambientVolume);
  }

  public setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    proceduralAudio.setMasterVolume(this.masterVolume);
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

  public playChatMessage(scope: 'team' | 'proximity' | 'impostor' | 'haunt' = 'team'): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (scope === 'impostor') {
        // Ominous low tech chirp
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.1);
        gain.gain.setValueAtTime(0.2 * this.masterVolume * this.sfxVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      } else if (scope === 'haunt') {
        // Ethereal ghost whisper chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);
        gain.gain.setValueAtTime(0.18 * this.masterVolume * this.sfxVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      } else if (scope === 'proximity') {
        // Soft sonar spatial radar chirp
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.08);
        gain.gain.setValueAtTime(0.25 * this.masterVolume * this.sfxVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      } else {
        // High-tech radio transmission ping
        osc.type = 'sine';
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.exponentialRampToValueAtTime(920, now + 0.06);
        gain.gain.setValueAtTime(0.2 * this.masterVolume * this.sfxVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }

  public startShipHum(): void {
    proceduralAudio.setMasterVolume(this.masterVolume);
    proceduralAudio.setAmbientVolume(this.ambientVolume);
    proceduralAudio.setSfxVolume(this.sfxVolume);
    proceduralAudio.startShipHum();
  }

  public updateShipHum(x: number, z: number, room: string = 'Cafeteria'): void {
    proceduralAudio.updatePlayerPosition(x, z, room);
  }

  public playAlarmSiren(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.35);

      gain.gain.setValueAtTime(0.35 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {}
  }

  public playSwitchToggle(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.setValueAtTime(400, now + 0.02);

      gain.gain.setValueAtTime(0.25 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {}
  }

  public playDoorLock(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);

      gain.gain.setValueAtTime(0.4 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch {}
  }

  public playEmergencyAlarm(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      // Two alternating dissonant tones
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.setValueAtTime(660, now + 0.2);
      osc1.frequency.setValueAtTime(880, now + 0.4);
      osc1.frequency.setValueAtTime(660, now + 0.6);

      osc2.frequency.setValueAtTime(890, now);
      osc2.frequency.setValueAtTime(670, now + 0.2);
      osc2.frequency.setValueAtTime(890, now + 0.4);
      osc2.frequency.setValueAtTime(670, now + 0.6);

      gain.gain.setValueAtTime(0.35 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.85);
      osc2.stop(now + 0.85);
    } catch {}
  }

  public playReportSting(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.45);

      sub.type = 'triangle';
      sub.frequency.setValueAtTime(120, now);
      sub.frequency.exponentialRampToValueAtTime(45, now + 0.55);

      gain.gain.setValueAtTime(0.45 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      osc.connect(gain);
      sub.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      sub.start(now);
      osc.stop(now + 0.55);
      sub.stop(now + 0.55);
    } catch {}
  }

  public playVentClank(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      // Metallic resonant double hit
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);

      gain.gain.setValueAtTime(0.35 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch {}
  }

  public playFootstep(
    x?: number,
    z?: number,
    room: string = 'Cafeteria',
    speedMultiplier: number = 1.0,
    alive: boolean = true
  ): void {
    if (x !== undefined && z !== undefined) {
      proceduralAudio.playFootstep(x, z, room, speedMultiplier, alive);
      return;
    }
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(120 + Math.random() * 30, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.04);

      gain.gain.setValueAtTime(0.08 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }

  public playTaskSuccess(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.28 * this.masterVolume * this.sfxVolume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.22);
      });
    } catch {}
  }

  public playMiniGameBeep(freq: number = 600): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.2 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch {}
  }

  public playMiniGameError(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.setValueAtTime(110, now + 0.1);

      gain.gain.setValueAtTime(0.3 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  public playDeathStab(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;

      // 1. Sharp knife slice / impale sweep
      const sliceOsc = ctx.createOscillator();
      const sliceGain = ctx.createGain();
      sliceOsc.type = 'sawtooth';
      sliceOsc.frequency.setValueAtTime(1400, now);
      sliceOsc.frequency.exponentialRampToValueAtTime(160, now + 0.16);

      sliceGain.gain.setValueAtTime(0.45 * this.masterVolume * this.sfxVolume, now);
      sliceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      sliceOsc.connect(sliceGain);
      sliceGain.connect(ctx.destination);
      sliceOsc.start(now);
      sliceOsc.stop(now + 0.22);

      // 2. Heavy flesh crunch / low impact thud
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(130, now);
      thudOsc.frequency.exponentialRampToValueAtTime(32, now + 0.4);

      thudGain.gain.setValueAtTime(0.55 * this.masterVolume * this.sfxVolume, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.45);
    } catch {}
  }

  public playBodyDiscoveredSting(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;

      // Dramatic dual-pitch warning stinger
      const pitches = [440, 660, 880];
      pitches.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.07;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, start);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.25, start + 0.15);

        gain.gain.setValueAtTime(0.35 * this.masterVolume * this.sfxVolume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.25);
      });

      // Low ominous brass swell
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(110, now);
      sub.frequency.exponentialRampToValueAtTime(65, now + 0.6);

      subGain.gain.setValueAtTime(0.4 * this.masterVolume * this.sfxVolume, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.65);
    } catch {}
  }

  public stopShipHum(): void {
    proceduralAudio.stopShipHum();
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
export { proceduralAudio };
