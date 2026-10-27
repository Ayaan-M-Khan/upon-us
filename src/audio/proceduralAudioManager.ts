/**
 * Impostor Protocol - Procedural Audio Manager
 * Web Audio API synthesizer for dynamic spaceship ambient acoustics and footsteps.
 * Real-time modulation of pitch, harmonic filters, and attenuation based on player coordinates and room materials.
 */

export interface FloorAcousticProfile {
  name: string;
  transientFreq: number;
  bodyStartFreq: number;
  bodyEndFreq: number;
  filterFreq: number;
  decayTime: number;
  metallicFactor: number;
  gain: number;
}

const ACOUSTIC_PROFILES: Record<string, FloorAcousticProfile> = {
  // Heavy industrial steel plating with deep low-end resonance
  engine_heavy: {
    name: 'Heavy Industrial Steel',
    transientFreq: 220,
    bodyStartFreq: 90,
    bodyEndFreq: 32,
    filterFreq: 450,
    decayTime: 0.08,
    metallicFactor: 0.3,
    gain: 0.12,
  },
  // Grated catwalk / metal corridors with crisp metallic clink
  corridor_grate: {
    name: 'Grated Metal Catwalk',
    transientFreq: 380,
    bodyStartFreq: 135,
    bodyEndFreq: 42,
    filterFreq: 850,
    decayTime: 0.055,
    metallicFactor: 0.65,
    gain: 0.09,
  },
  // Insulated conductive rubber-mat decking
  insulated_deck: {
    name: 'Conductive Rubber Decking',
    transientFreq: 190,
    bodyStartFreq: 155,
    bodyEndFreq: 58,
    filterFreq: 520,
    decayTime: 0.04,
    metallicFactor: 0.1,
    gain: 0.075,
  },
  // Hollow cargo containers and metal plates
  storage_hollow: {
    name: 'Hollow Cargo Hold',
    transientFreq: 260,
    bodyStartFreq: 105,
    bodyEndFreq: 38,
    filterFreq: 600,
    decayTime: 0.07,
    metallicFactor: 0.45,
    gain: 0.10,
  },
  // Smooth composite tile / sanitized polymer flooring
  polymer_tile: {
    name: 'Composite Polymer Tile',
    transientFreq: 280,
    bodyStartFreq: 140,
    bodyEndFreq: 48,
    filterFreq: 700,
    decayTime: 0.045,
    metallicFactor: 0.2,
    gain: 0.08,
  },
  // High-tech bridge & console deck
  bridge_console: {
    name: 'Console Room Deck',
    transientFreq: 320,
    bodyStartFreq: 130,
    bodyEndFreq: 45,
    filterFreq: 750,
    decayTime: 0.05,
    metallicFactor: 0.35,
    gain: 0.085,
  },
};

export class ProceduralAudioManager {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;
  private isLeftFoot: boolean = false;

  // Master Volume Controls
  public masterVolume: number = 0.8;
  public sfxVolume: number = 0.85;
  public ambientVolume: number = 0.45;

  // Ambient Engine Drone Nodes
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Electrical AC Buzz Nodes
  private elecOsc: OscillatorNode | null = null;
  private elecFilter: BiquadFilterNode | null = null;
  private elecGain: GainNode | null = null;

  // Life Support / Air Ventilation Nodes
  private ventSource: AudioBufferSourceNode | null = null;
  private ventFilter: BiquadFilterNode | null = null;
  private ventGain: GainNode | null = null;

  // Master Ambient Bus
  private ambientBus: GainNode | null = null;

  // Hull breathing LFO
  private lfoOsc: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  // Spatial reference coordinates (The Skeld layout)
  private readonly REACTOR_POS = { x: -49, z: -3 };
  private readonly ELEC_POS = { x: -20, z: 16 };
  private readonly O2_POS = { x: 25, z: -15 };
  private readonly SHIELDS_POS = { x: 37, z: 20 };

  // Current smoothed parameters
  private currentX: number = 0;
  private currentZ: number = -22;
  private currentRoom: string = 'Cafeteria';

  constructor() {
    this.handleInteraction = this.handleInteraction.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.handleInteraction, { passive: true });
      window.addEventListener('keydown', this.handleInteraction, { passive: true });
      window.addEventListener('touchstart', this.handleInteraction, { passive: true });
    }
  }

  private handleInteraction(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Generates a looping procedural white/pink noise buffer for life support and air ventilation.
   */
  private createNoiseBuffer(ctx: AudioContext, seconds: number = 3): AudioBuffer {
    const bufferSize = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink noise filtering approximation for soft ambient air rush
      lastOut = (lastOut * 0.95) + (white * 0.05);
      data[i] = (lastOut * 3.5 + white * 0.3) * 0.2;
    }
    return buffer;
  }

  /**
   * Starts procedural ambient ship hum with engine, electrical grid, and ventilation layers.
   */
  public startShipHum(): void {
    if (this.isRunning) return;

    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Master Ambient Bus
      this.ambientBus = ctx.createGain();
      this.ambientBus.gain.setValueAtTime(this.ambientVolume * this.masterVolume, now);
      this.ambientBus.connect(ctx.destination);

      // 1. ENGINE CORE DRONE (Low Sawtooth + Sub-Sine)
      this.engineOsc = ctx.createOscillator();
      this.engineSubOsc = ctx.createOscillator();
      this.engineFilter = ctx.createBiquadFilter();
      this.engineGain = ctx.createGain();

      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(58, now);

      this.engineSubOsc.type = 'sine';
      this.engineSubOsc.frequency.setValueAtTime(29, now);

      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(140, now);
      this.engineFilter.Q.setValueAtTime(2.2, now);

      this.engineGain.gain.setValueAtTime(0.08, now);

      this.engineOsc.connect(this.engineFilter);
      this.engineSubOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ambientBus);

      this.engineOsc.start(now);
      this.engineSubOsc.start(now);

      // 2. ELECTRICAL AC GRID BUZZ (60 Hz / 120 Hz with Bandpass Resonance)
      this.elecOsc = ctx.createOscillator();
      this.elecFilter = ctx.createBiquadFilter();
      this.elecGain = ctx.createGain();

      this.elecOsc.type = 'sawtooth';
      this.elecOsc.frequency.setValueAtTime(60, now);

      this.elecFilter.type = 'bandpass';
      this.elecFilter.frequency.setValueAtTime(180, now);
      this.elecFilter.Q.setValueAtTime(3.5, now);

      this.elecGain.gain.setValueAtTime(0.02, now);

      this.elecOsc.connect(this.elecFilter);
      this.elecFilter.connect(this.elecGain);
      this.elecGain.connect(this.ambientBus);

      this.elecOsc.start(now);

      // 3. LIFE SUPPORT & AIR VENTILATION NOISE
      const noiseBuffer = this.createNoiseBuffer(ctx, 3);
      this.ventSource = ctx.createBufferSource();
      this.ventSource.buffer = noiseBuffer;
      this.ventSource.loop = true;

      this.ventFilter = ctx.createBiquadFilter();
      this.ventFilter.type = 'bandpass';
      this.ventFilter.frequency.setValueAtTime(820, now);
      this.ventFilter.Q.setValueAtTime(1.8, now);

      this.ventGain = ctx.createGain();
      this.ventGain.gain.setValueAtTime(0.03, now);

      this.ventSource.connect(this.ventFilter);
      this.ventFilter.connect(this.ventGain);
      this.ventGain.connect(this.ambientBus);

      this.ventSource.start(now);

      // 4. SUBTLE HULL BREATHING LFO (0.2 Hz slow modulation of engine filter)
      this.lfoOsc = ctx.createOscillator();
      this.lfoGain = ctx.createGain();

      this.lfoOsc.type = 'sine';
      this.lfoOsc.frequency.setValueAtTime(0.22, now);
      this.lfoGain.gain.setValueAtTime(18, now); // Modulate filter cutoff by ±18Hz

      this.lfoOsc.connect(this.lfoGain);
      this.lfoGain.connect(this.engineFilter.frequency);
      this.lfoOsc.start(now);

      this.isRunning = true;
      // Immediately apply initial position acoustics
      this.updatePlayerPosition(this.currentX, this.currentZ, this.currentRoom);
    } catch {
      // Audio context autoplay fallback
    }
  }

  /**
   * Dynamically adjusts the pitch, filter cutoff, and attenuation of the ship hum
   * based on the player's 2D position in the ship.
   */
  public updatePlayerPosition(x: number, z: number, room: string = 'Cafeteria'): void {
    this.currentX = x;
    this.currentZ = z;
    this.currentRoom = room;

    if (!this.isRunning || !this.ctx || this.ctx.state === 'suspended') return;

    try {
      const now = this.ctx.currentTime;
      const rampTime = 0.25; // Smooth exponential time constant

      // Distance to Reactor / Engine core (West side)
      const distReactor = Math.hypot(x - this.REACTOR_POS.x, z - this.REACTOR_POS.z);
      // Normalized proximity [0..1]
      const proxReactor = Math.max(0, Math.min(1, 1 - distReactor / 65));

      // 1. ENGINE PITCH & ATTENUATION:
      // At Reactor/Engines: pitch rises from 48Hz up to 84Hz; filter cutoff opens up from 95Hz to 320Hz
      const enginePitch = 48 + proxReactor * 36;
      const filterCutoff = 95 + proxReactor * 225;
      const engineVolume = 0.035 + proxReactor * 0.14;

      if (this.engineOsc) {
        this.engineOsc.frequency.setTargetAtTime(enginePitch, now, rampTime);
      }
      if (this.engineSubOsc) {
        this.engineSubOsc.frequency.setTargetAtTime(enginePitch * 0.5, now, rampTime);
      }
      if (this.engineFilter) {
        this.engineFilter.frequency.setTargetAtTime(filterCutoff, now, rampTime);
      }
      if (this.engineGain) {
        this.engineGain.gain.setTargetAtTime(engineVolume, now, rampTime);
      }

      // 2. ELECTRICAL BUZZ PITCH & ATTENUATION:
      // Loudest near Electrical room and Shields
      const distElec = Math.hypot(x - this.ELEC_POS.x, z - this.ELEC_POS.z);
      const distShields = Math.hypot(x - this.SHIELDS_POS.x, z - this.SHIELDS_POS.z);
      const proxElec = Math.max(0, Math.min(1, 1 - Math.min(distElec, distShields) / 28));

      const elecVolume = proxElec * 0.085;
      const elecFilterFreq = 160 + proxElec * 90;

      if (this.elecGain) {
        this.elecGain.gain.setTargetAtTime(elecVolume, now, rampTime);
      }
      if (this.elecFilter) {
        this.elecFilter.frequency.setTargetAtTime(elecFilterFreq, now, rampTime);
      }

      // 3. O2 & LIFE SUPPORT VENTILATION:
      // Louder near O2 room and Medbay
      const distO2 = Math.hypot(x - this.O2_POS.x, z - this.O2_POS.z);
      const proxO2 = Math.max(0, Math.min(1, 1 - distO2 / 32));
      const ventVolume = 0.02 + proxO2 * 0.07;
      const ventFilterFreq = 720 + proxO2 * 280;

      if (this.ventGain) {
        this.ventGain.gain.setTargetAtTime(ventVolume, now, rampTime);
      }
      if (this.ventFilter) {
        this.ventFilter.frequency.setTargetAtTime(ventFilterFreq, now, rampTime);
      }

      // Master ambient volume update
      if (this.ambientBus) {
        this.ambientBus.gain.setTargetAtTime(this.ambientVolume * this.masterVolume, now, rampTime);
      }
    } catch {}
  }

  /**
   * Resolves the acoustic floor material based on the player's current room name.
   */
  public getRoomAcousticProfile(roomName: string): FloorAcousticProfile {
    const lower = (roomName || '').toLowerCase();
    if (lower.includes('reactor') || lower.includes('engine')) {
      return ACOUSTIC_PROFILES.engine_heavy;
    }
    if (lower.includes('electrical') || lower.includes('shield')) {
      return ACOUSTIC_PROFILES.insulated_deck;
    }
    if (lower.includes('storage') || lower.includes('cargo')) {
      return ACOUSTIC_PROFILES.storage_hollow;
    }
    if (lower.includes('cafeteria') || lower.includes('admin') || lower.includes('medbay')) {
      return ACOUSTIC_PROFILES.polymer_tile;
    }
    if (lower.includes('weapon') || lower.includes('navigation') || lower.includes('security') || lower.includes('comm')) {
      return ACOUSTIC_PROFILES.bridge_console;
    }
    // Default to metallic corridor grating
    return ACOUSTIC_PROFILES.corridor_grate;
  }

  /**
   * Synthesizes a procedural footstep with dynamically adjusted pitch, stereo pan, and attenuation
   * based on the player's position, room acoustics, and movement speed.
   */
  public playFootstep(
    x: number,
    z: number,
    room: string = 'Cafeteria',
    speedMultiplier: number = 1.0,
    alive: boolean = true
  ): void {
    if (!alive) return; // Ghosts glide silently without footsteps

    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const profile = this.getRoomAcousticProfile(room);

      // Alternating left and right foot stereo panning
      this.isLeftFoot = !this.isLeftFoot;
      const panOffset = this.isLeftFoot ? -0.16 : 0.16;

      // Speed multiplier dynamic pitch & volume scaling
      const speedScale = Math.max(0.6, Math.min(2.5, speedMultiplier));
      const speedPitchBonus = Math.pow(speedScale, 0.32);
      const randomPitchVar = 1.0 + (Math.random() - 0.5) * 0.12;

      const bodyStart = profile.bodyStartFreq * speedPitchBonus * randomPitchVar;
      const bodyEnd = profile.bodyEndFreq * speedPitchBonus;
      const stepDuration = Math.max(0.035, profile.decayTime / Math.sqrt(speedScale));

      // 1. Primary Low-End Footstep Thump (Body)
      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(bodyStart, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(10, bodyEnd), now + stepDuration);

      const stepVolume = profile.gain * this.masterVolume * this.sfxVolume * (0.9 + Math.random() * 0.2);
      bodyGain.gain.setValueAtTime(stepVolume, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + stepDuration);

      // 2. High-Frequency Surface Transient / Heel Click
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = profile.metallicFactor > 0.4 ? 'triangle' : 'sine';
      const clickFreq = profile.transientFreq * randomPitchVar;
      clickOsc.frequency.setValueAtTime(clickFreq, now);
      clickOsc.frequency.exponentialRampToValueAtTime(clickFreq * 0.4, now + 0.025);

      const clickVolume = stepVolume * (0.35 + profile.metallicFactor * 0.6);
      clickGain.gain.setValueAtTime(clickVolume, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      // 3. Acoustic Low-Pass Filter shaping room resonance
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(profile.filterFreq, now);

      bodyOsc.connect(filter);
      clickOsc.connect(filter);

      // 4. Stereo Panning for alternating foot depth
      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(panOffset, now);
        filter.connect(bodyGain);
        filter.connect(clickGain);
        bodyGain.connect(panner);
        clickGain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        filter.connect(bodyGain);
        filter.connect(clickGain);
        bodyGain.connect(ctx.destination);
        clickGain.connect(ctx.destination);
      }

      bodyOsc.start(now);
      clickOsc.start(now);
      bodyOsc.stop(now + stepDuration + 0.01);
      clickOsc.stop(now + 0.03);
    } catch {
      // Audio context policy fallback
    }
  }

  /**
   * Stops procedural ambient ship audio and releases nodes.
   */
  public stopShipHum(): void {
    if (!this.isRunning) return;
    try {
      if (this.engineOsc) {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
        this.engineOsc = null;
      }
      if (this.engineSubOsc) {
        this.engineSubOsc.stop();
        this.engineSubOsc.disconnect();
        this.engineSubOsc = null;
      }
      if (this.elecOsc) {
        this.elecOsc.stop();
        this.elecOsc.disconnect();
        this.elecOsc = null;
      }
      if (this.ventSource) {
        this.ventSource.stop();
        this.ventSource.disconnect();
        this.ventSource = null;
      }
      if (this.lfoOsc) {
        this.lfoOsc.stop();
        this.lfoOsc.disconnect();
        this.lfoOsc = null;
      }
      if (this.ambientBus) {
        this.ambientBus.disconnect();
        this.ambientBus = null;
      }
      this.isRunning = false;
    } catch {}
  }

  public setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.ambientBus && this.ctx) {
      this.ambientBus.gain.setTargetAtTime(this.ambientVolume * this.masterVolume, this.ctx.currentTime, 0.1);
    }
  }

  public setAmbientVolume(v: number): void {
    this.ambientVolume = Math.max(0, Math.min(1, v));
    if (this.ambientBus && this.ctx) {
      this.ambientBus.gain.setTargetAtTime(this.ambientVolume * this.masterVolume, this.ctx.currentTime, 0.1);
    }
  }

  public setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
  }

  public dispose(): void {
    this.stopShipHum();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.handleInteraction);
      window.removeEventListener('keydown', this.handleInteraction);
      window.removeEventListener('touchstart', this.handleInteraction);
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const proceduralAudio = new ProceduralAudioManager();
