import { lineIntersectsWalls } from '../shared/physics';

export interface SpatialAudioParams {
  audible: boolean;
  volume: number;
  pan: number;
  cutoffFreq: number;
}

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

  // Footstep throttle tracker
  private lastFootstepTimes: Map<string, number> = new Map();

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

  /**
   * Calculates realistic proximity audio parameters:
   * 1. Distance rolloff (smooth polynomial curve)
   * 2. Wall occlusion (muffled lowpass filter and 65% volume attenuation when walls block line of sight)
   * 3. Stereo panning based on source angle relative to listener orientation
   */
  public getSpatialParams(
    sourcePos: { x: number; z: number },
    listenerPos: { x: number; z: number },
    listenerYaw: number,
    maxDistance: number = 24
  ): SpatialAudioParams {
    const dx = sourcePos.x - listenerPos.x;
    const dz = sourcePos.z - listenerPos.z;
    const dist = Math.hypot(dx, dz);

    if (dist >= maxDistance) {
      return { audible: false, volume: 0, pan: 0, cutoffFreq: 20000 };
    }

    // Distance attenuation curve
    let distanceGain = Math.max(0, 1 - dist / maxDistance);
    distanceGain = Math.pow(distanceGain, 1.55);

    // Wall occlusion check using continuous map line-of-sight
    let cutoffFreq = 20000;
    if (dist > 1.2) {
      const wallHit = lineIntersectsWalls(listenerPos.x, listenerPos.z, sourcePos.x, sourcePos.z);
      if (wallHit.hit) {
        distanceGain *= 0.35; // 65% attenuation through bulkheads
        cutoffFreq = 380;     // Muffled lowpass filter
      }
    }

    // Calculate relative horizontal panning angle against listener yaw
    const sourceAngle = Math.atan2(dx, -dz);
    let relAngle = sourceAngle - listenerYaw;
    relAngle = Math.atan2(Math.sin(relAngle), Math.cos(relAngle));
    const pan = Math.max(-1, Math.min(1, Math.sin(relAngle)));

    return {
      audible: distanceGain > 0.005,
      volume: distanceGain,
      pan,
      cutoffFreq,
    };
  }

  private connectSpatialChain(
    ctx: AudioContext,
    sourceNode: AudioNode,
    gainNode: GainNode,
    pan: number,
    cutoffFreq: number
  ): void {
    if (cutoffFreq < 18000) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoffFreq, ctx.currentTime);
      sourceNode.connect(filter);
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, ctx.currentTime);
        filter.connect(panner);
        panner.connect(gainNode);
      } else {
        filter.connect(gainNode);
      }
    } else {
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, ctx.currentTime);
        sourceNode.connect(panner);
        panner.connect(gainNode);
      } else {
        sourceNode.connect(gainNode);
      }
    }
    gainNode.connect(ctx.destination);
  }

  public playSpatialFootstep(
    id: string,
    sourcePos: { x: number; z: number },
    listenerPos: { x: number; z: number },
    listenerYaw: number,
    isLocal: boolean = false
  ): void {
    const now = performance.now();
    const last = this.lastFootstepTimes.get(id) || 0;
    if (now - last < 280) return; // realistic crewmate walk tempo
    this.lastFootstepTimes.set(id, now);

    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      let finalVol = 0.16 * this.masterVolume * this.sfxVolume;
      let pan = 0;
      let cutoff = 20000;

      if (!isLocal) {
        const params = this.getSpatialParams(sourcePos, listenerPos, listenerYaw, 20);
        if (!params.audible) return;
        finalVol *= params.volume;
        pan = params.pan;
        cutoff = params.cutoffFreq;
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      const pitch = 95 + Math.random() * 30; // low frequency boot stomp
      osc.frequency.setValueAtTime(pitch, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.08);

      gain.gain.setValueAtTime(finalVol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      this.connectSpatialChain(ctx, osc, gain, pan, cutoff);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch {}
  }

  public playSpatialVent(
    sourcePos: { x: number; z: number },
    listenerPos: { x: number; z: number },
    listenerYaw: number
  ): void {
    try {
      const params = this.getSpatialParams(sourcePos, listenerPos, listenerYaw, 28);
      if (!params.audible) return;

      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const finalVol = 0.42 * this.masterVolume * this.sfxVolume * params.volume;

      // Heavy metallic vent grate clank
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.16);

      gain.gain.setValueAtTime(finalVol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      this.connectSpatialChain(ctx, osc, gain, params.pan, params.cutoffFreq);
      osc.start(t);
      osc.stop(t + 0.18);

      // Air suction whoosh
      const whooshOsc = ctx.createOscillator();
      const whooshGain = ctx.createGain();
      whooshOsc.type = 'sawtooth';
      whooshOsc.frequency.setValueAtTime(300, t);
      whooshOsc.frequency.exponentialRampToValueAtTime(100, t + 0.24);

      whooshGain.gain.setValueAtTime(finalVol * 0.7, t);
      whooshGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      this.connectSpatialChain(ctx, whooshOsc, whooshGain, params.pan, Math.min(params.cutoffFreq, 600));
      whooshOsc.start(t);
      whooshOsc.stop(t + 0.24);
    } catch {}
  }

  public playKillStab(): void {
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(680, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.32);

      gain.gain.setValueAtTime(0.48 * this.masterVolume * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.32);
    } catch {}
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
    } catch {}
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

  public playTaskComplete(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 major chord arpeggio
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.22 * this.masterVolume * this.sfxVolume, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } catch {}
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

  public playVentClank(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);

      gain.gain.setValueAtTime(0.35 * this.masterVolume * this.sfxVolume, now);
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
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.22);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.22);

      gain.gain.setValueAtTime(0.28 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }

  public playReportSiren(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;

      // 1. Heavy bass impact thump
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.6);
      subGain.gain.setValueAtTime(0.5 * this.masterVolume * this.sfxVolume, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.7);

      // 2. High-urgency dual klaxon siren sweep
      const sirenOsc = ctx.createOscillator();
      const sirenGain = ctx.createGain();
      sirenOsc.type = 'sawtooth';
      sirenGain.gain.setValueAtTime(0.28 * this.masterVolume * this.sfxVolume, now);

      // Oscillate pitch up and down like an emergency siren
      sirenOsc.frequency.setValueAtTime(480, now);
      sirenOsc.frequency.linearRampToValueAtTime(880, now + 0.35);
      sirenOsc.frequency.linearRampToValueAtTime(480, now + 0.7);
      sirenOsc.frequency.linearRampToValueAtTime(880, now + 1.05);
      sirenGain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);

      sirenOsc.connect(filter);
      filter.connect(sirenGain);
      sirenGain.connect(ctx.destination);

      sirenOsc.start(now);
      sirenOsc.stop(now + 1.25);
    } catch {}
  }

  public playSabotageAlarm(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.linearRampToValueAtTime(640, now + 0.18);
      osc.frequency.linearRampToValueAtTime(380, now + 0.36);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);

      gain.gain.setValueAtTime(0.24 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {}
  }

  public playSabotageFixed(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const notes = [587.33, 739.99, 880.0]; // D5, F#5, A5 uplifting triad
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        gain.gain.setValueAtTime(0.22 * this.masterVolume * this.sfxVolume, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.3);
      });
    } catch {}
  }
}

export const soundEngine = new SoundEngine();
