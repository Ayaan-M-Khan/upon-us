import { lineIntersectsWalls } from '../shared/physics';

export interface SpatialAudioParams {
  audible: boolean;
  volume: number;
  pan: number;
  cutoffFreq: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  public masterVolume: number = 0.4;
  public sfxVolume: number = 0.5;
  public ambientVolume: number = 0.18;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private sabotageAlarmOsc: OscillatorNode | null = null;
  private sabotageAlarmModulator: OscillatorNode | null = null;
  private sabotageAlarmModulation: GainNode | null = null;
  private sabotageAlarmFilter: BiquadFilterNode | null = null;
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
    if (now - last < 290) return; // realistic crewmate walk tempo
    this.lastFootstepTimes.set(id, now);

    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      let finalVol = 0.08 * this.masterVolume * this.sfxVolume;
      let pan = 0;
      let cutoff = 450; // Warm, cushioned boot step lowpass

      if (!isLocal) {
        const params = this.getSpatialParams(sourcePos, listenerPos, listenerYaw, 18);
        if (!params.audible) return;
        finalVol *= params.volume;
        pan = params.pan;
        cutoff = Math.min(cutoff, params.cutoffFreq);
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      const pitch = 72 + Math.random() * 18; // deep, muffled boot step
      osc.frequency.setValueAtTime(pitch, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.07);

      gain.gain.setValueAtTime(finalVol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

      this.connectSpatialChain(ctx, osc, gain, pan, cutoff);
      osc.start(t);
      osc.stop(t + 0.07);
    } catch {}
  }

  public playSpatialVent(
    sourcePos: { x: number; z: number },
    listenerPos: { x: number; z: number },
    listenerYaw: number
  ): void {
    try {
      const params = this.getSpatialParams(sourcePos, listenerPos, listenerYaw, 24);
      if (!params.audible) return;

      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const finalVol = 0.20 * this.masterVolume * this.sfxVolume * params.volume;

      // Warm metallic vent grate clank (triangle instead of sharp high frequency)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);

      gain.gain.setValueAtTime(finalVol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      this.connectSpatialChain(ctx, osc, gain, params.pan, Math.min(params.cutoffFreq, 500));
      osc.start(t);
      osc.stop(t + 0.16);

      // Subdued air suction whoosh (filtered)
      const whooshOsc = ctx.createOscillator();
      const whooshGain = ctx.createGain();
      whooshOsc.type = 'triangle';
      whooshOsc.frequency.setValueAtTime(240, t);
      whooshOsc.frequency.exponentialRampToValueAtTime(80, t + 0.2);

      whooshGain.gain.setValueAtTime(finalVol * 0.45, t);
      whooshGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      this.connectSpatialChain(ctx, whooshOsc, whooshGain, params.pan, Math.min(params.cutoffFreq, 420));
      whooshOsc.start(t);
      whooshOsc.stop(t + 0.2);
    } catch {}
  }

  public playKillStab(): void {
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.28);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, t);
      filter.frequency.exponentialRampToValueAtTime(250, t + 0.28);

      // Smooth attack ramp to prevent digital transient pop
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18 * this.masterVolume * this.sfxVolume, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.28);
    } catch {}
  }

  public playClick(): void {
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, t);
      osc.frequency.exponentialRampToValueAtTime(680, t + 0.04);

      gain.gain.setValueAtTime(0.07 * this.masterVolume * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.04);
    } catch {}
  }

  public playColorSelect(): void {
    try {
      const ctx = this.initCtx();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, t);
      osc.frequency.exponentialRampToValueAtTime(580, t + 0.06);

      gain.gain.setValueAtTime(0.10 * this.masterVolume * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.06);
    } catch {}
  }

  public playJoin(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(460, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.22);

      gain.gain.setValueAtTime(0.12 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }

  public playCountdownBeep(highPitch: boolean = false): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const freq = highPitch ? 660 : 440;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.12 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (highPitch ? 0.3 : 0.12));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + (highPitch ? 0.3 : 0.12));
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
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        // Mellow triangle wave with warm lowpass filtering instead of harsh piercing sawtooth
        siren.type = 'triangle';
        siren.frequency.setValueAtTime(460, ctx.currentTime);
        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(0.85, ctx.currentTime);
        modulation.gain.setValueAtTime(80, ctx.currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(650, ctx.currentTime);

        gain.gain.setValueAtTime(0.07 * this.masterVolume * this.sfxVolume, ctx.currentTime);

        modulator.connect(modulation);
        modulation.connect(siren.frequency);
        siren.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        this.sabotageAlarmOsc = siren;
        this.sabotageAlarmModulator = modulator;
        this.sabotageAlarmModulation = modulation;
        this.sabotageAlarmFilter = filter;
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
    this.sabotageAlarmFilter?.disconnect();
    this.sabotageAlarmGain?.disconnect();
    this.sabotageAlarmOsc = null;
    this.sabotageAlarmModulator = null;
    this.sabotageAlarmModulation = null;
    this.sabotageAlarmFilter = null;
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

        gain.gain.setValueAtTime(0.10 * this.masterVolume * this.sfxVolume, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.32);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.32);
      });
    } catch {}
  }

  public startShipHum(): void {
    try {
      if (this.ambientOsc) return;
      const ctx = this.initCtx();
      this.ambientOsc = ctx.createOscillator();
      this.ambientGain = ctx.createGain();

      this.ambientOsc.type = 'sine';
      this.ambientOsc.frequency.setValueAtTime(50, ctx.currentTime);

      // Low pass filter to make it a deep, soothing spaceship interior drone
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(85, ctx.currentTime);

      this.ambientGain.gain.setValueAtTime(0.025 * this.masterVolume * this.ambientVolume, ctx.currentTime);

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
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.14);

      gain.gain.setValueAtTime(0.14 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch {}
  }

  public playVentWhoosh(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.18);

      gain.gain.setValueAtTime(0.12 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {}
  }

  public playReportSiren(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;

      // 1. Soft low-end impact thump
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(110, now);
      subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.5);
      subGain.gain.setValueAtTime(0.22 * this.masterVolume * this.sfxVolume, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.55);

      // 2. Urgent yet softened emergency klaxon sweep
      const sirenOsc = ctx.createOscillator();
      const sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.setValueAtTime(0.12 * this.masterVolume * this.sfxVolume, now);

      // Oscillate pitch smoothly
      sirenOsc.frequency.setValueAtTime(380, now);
      sirenOsc.frequency.linearRampToValueAtTime(620, now + 0.3);
      sirenOsc.frequency.linearRampToValueAtTime(380, now + 0.6);
      sirenOsc.frequency.linearRampToValueAtTime(620, now + 0.9);
      sirenGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750, now);

      sirenOsc.connect(filter);
      filter.connect(sirenGain);
      sirenGain.connect(ctx.destination);

      sirenOsc.start(now);
      sirenOsc.stop(now + 1.1);
    } catch {}
  }

  public playSabotageAlarm(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.linearRampToValueAtTime(520, now + 0.16);
      osc.frequency.linearRampToValueAtTime(320, now + 0.32);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, now);

      gain.gain.setValueAtTime(0.09 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.38);
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
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.10 * this.masterVolume * this.sfxVolume, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.28);
      });
    } catch {}
  }

  public playShieldApplied(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      [659.25, 830.61, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.10 * this.masterVolume * this.sfxVolume, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.38);
      });
    } catch {}
  }

  public playShieldDeflect(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.28);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);

      gain.gain.setValueAtTime(0.15 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {}
  }

  public playPoisonStab(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.24);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, now);

      gain.gain.setValueAtTime(0.12 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  public playDissolve(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.45;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.2));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, now);
      filter.Q.setValueAtTime(2.0, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.45);
    } catch {}
  }

  public playShapeshift(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.4);
      gain.gain.setValueAtTime(0.12 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.42);
    } catch {}
  }

  public playDetectiveClear(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.10 * this.masterVolume * this.sfxVolume, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.3);
      });
    } catch {}
  }

  public playDetectiveDanger(): void {
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.setValueAtTime(212, now + 0.14);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, now);

      gain.gain.setValueAtTime(0.14 * this.masterVolume * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {}
  }
}

export const soundEngine = new SoundEngine();
