/**
 * Impostor Protocol - WebRTC Proximity Voice Chat System
 * Provides 3D spatial distance attenuation, wall occlusion muffling,
 * push-to-talk, voice activity detection (VAD), and ghost audio isolation.
 */

import { lineIntersectsWalls } from '../../shared/physics';
import { net } from '../net';

export interface VoicePeerState {
  id: string;
  distance: number;
  volumePct: number;
  isSpeaking: boolean;
  isOccluded: boolean;
}

export interface VoiceSystemState {
  isInitialized: boolean;
  isMicActive: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isPushToTalk: boolean;
  isTransmitting: boolean;
  micInputLevel: number; // 0 to 1
  micPermissionError: string | null;
  activePeers: VoicePeerState[];
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const MAX_HEAR_DISTANCE = 18; // meters
const FULL_VOLUME_DISTANCE = 3.5; // meters

interface RemoteAudioNode {
  stream: MediaStream;
  audioEl: HTMLAudioElement;
  source: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  filterNode: BiquadFilterNode;
}

export class ProximityVoiceManager {
  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteAudioNodes: Map<string, RemoteAudioNode> = new Map();
  private speakingPeers: Set<string> = new Set();

  private isMuted: boolean = false;
  private isDeafened: boolean = false;
  private isPushToTalk: boolean = true;
  private isPttPressed: boolean = false;
  private isTransmitting: boolean = false;
  private micLevel: number = 0;
  private micError: string | null = null;

  private localPos = { x: 0, z: -22 };
  private isLocalAlive: boolean = true;
  private isMeetingActive: boolean = false;
  private remotePlayers: Record<string, { x: number; z: number; isAlive: boolean; isBot?: boolean }> = {};

  private stateListeners: Set<(state: VoiceSystemState) => void> = new Set();
  private animationFrameId: number = 0;
  private unsubNetSignal: (() => void) | null = null;
  private unsubNetInit: (() => void) | null = null;
  private unsubNetSpeaking: (() => void) | null = null;

  constructor() {
    this.setupNetworkHooks();
    this.setupPttKeyListeners();
  }

  private setupNetworkHooks(): void {
    this.unsubNetSignal = net.onRtcSignal(async ({ senderId, signal }) => {
      await this.handleIncomingSignal(senderId, signal);
    });

    this.unsubNetInit = net.onRtcInitPeer(async ({ senderId }) => {
      await this.createPeerConnection(senderId, true);
    });

    this.unsubNetSpeaking = net.onVoiceSpeakingUpdate(({ playerId, isSpeaking }) => {
      if (isSpeaking) {
        this.speakingPeers.add(playerId);
      } else {
        this.speakingPeers.delete(playerId);
      }
      this.notifyState();
    });
  }

  private setupPttKeyListeners(): void {
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (e.code === 'KeyV' && !this.isPttPressed && this.isPushToTalk) {
        this.isPttPressed = true;
        this.updateMicTrackState();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyV' && this.isPttPressed && this.isPushToTalk) {
        this.isPttPressed = false;
        this.updateMicTrackState();
      }
    });
  }

  public async startMicrophone(): Promise<boolean> {
    try {
      if (this.localStream) return true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.localStream = stream;
      this.micError = null;

      // Initialize local Web Audio context
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.micSource = this.audioCtx.createMediaStreamSource(stream);
      this.micAnalyser = this.audioCtx.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micSource.connect(this.micAnalyser);

      // Start VAD & level loop
      this.startVadLoop();
      this.updateMicTrackState();
      this.notifyState();

      return true;
    } catch (err: any) {
      console.warn('[ProximityVoice] Failed to access microphone:', err);
      this.micError = err?.message || 'Microphone access denied or unavailable';
      this.notifyState();
      return false;
    }
  }

  public toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.updateMicTrackState();
    this.notifyState();
  }

  public toggleDeafen(): void {
    this.isDeafened = !this.isDeafened;
    // Mute/unmute all remote audio elements
    for (const node of this.remoteAudioNodes.values()) {
      node.audioEl.muted = this.isDeafened;
    }
    this.notifyState();
  }

  public togglePushToTalk(): void {
    this.isPushToTalk = !this.isPushToTalk;
    this.isPttPressed = false;
    this.updateMicTrackState();
    this.notifyState();
  }

  public setPushToTalkActive(pressed: boolean): void {
    if (!this.isPushToTalk) return;
    this.isPttPressed = pressed;
    this.updateMicTrackState();
  }

  private updateMicTrackState(): void {
    if (!this.localStream) return;

    const shouldTransmit =
      !this.isMuted &&
      (!this.isPushToTalk || this.isPttPressed);

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = shouldTransmit;
    });

    if (this.isTransmitting !== shouldTransmit) {
      this.isTransmitting = shouldTransmit;
      net.sendVoiceSpeaking(shouldTransmit);
      this.notifyState();
    }
  }

  private startVadLoop(): void {
    const dataArray = new Uint8Array(128);

    const checkLevel = () => {
      if (this.micAnalyser && this.localStream) {
        this.micAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 110);
        this.micLevel = normalized;

        if (!this.isPushToTalk && !this.isMuted) {
          const speakingNow = normalized > 0.08;
          if (speakingNow !== this.isTransmitting) {
            this.isTransmitting = speakingNow;
            net.sendVoiceSpeaking(speakingNow);
            this.notifyState();
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(checkLevel);
    };

    checkLevel();
  }

  // --------------------------------------------------------------------------
  // WebRTC Mesh Connections
  // --------------------------------------------------------------------------

  public syncActivePeers(remotePlayerIds: string[]): void {
    const myId = net.getSocketId();
    if (!myId) return;

    // Filter to human remote players only (exclude self and bots)
    const validRemoteHumans = remotePlayerIds.filter(
      (id) => id !== myId && !id.startsWith('bot_')
    );

    // Clean up disconnected peers
    for (const [peerId, pc] of this.peerConnections) {
      if (!validRemoteHumans.includes(peerId)) {
        pc.close();
        this.peerConnections.delete(peerId);
        const node = this.remoteAudioNodes.get(peerId);
        if (node) {
          node.audioEl.pause();
          node.audioEl.srcObject = null;
          node.audioEl.remove();
          this.remoteAudioNodes.delete(peerId);
        }
      }
    }

    // Connect to newly discovered human peers
    for (const peerId of validRemoteHumans) {
      if (!this.peerConnections.has(peerId)) {
        // Politeness protocol: smaller socket ID initiates connection
        if (myId < peerId) {
          this.createPeerConnection(peerId, true);
        } else {
          net.initRtcPeer(peerId);
        }
      }
    }
  }

  private async createPeerConnection(peerId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    if (this.peerConnections.has(peerId)) {
      return this.peerConnections.get(peerId)!;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnections.set(peerId, pc);

    // Add local mic audio track
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        net.sendRtcSignal(peerId, { candidate: event.candidate });
      }
    };

    // Receive incoming audio track
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.attachRemoteAudio(peerId, remoteStream);
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        net.sendRtcSignal(peerId, { sdp: pc.localDescription });
      } catch (err) {
        console.warn('[ProximityVoice] Offer creation failed for', peerId, err);
      }
    }

    return pc;
  }

  private async handleIncomingSignal(senderId: string, signal: any): Promise<void> {
    let pc = this.peerConnections.get(senderId);
    if (!pc) {
      pc = await this.createPeerConnection(senderId, false);
    }

    try {
      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          net.sendRtcSignal(senderId, { sdp: pc.localDescription });
        }
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.warn('[ProximityVoice] Failed handling signal from', senderId, err);
    }
  }

  private attachRemoteAudio(peerId: string, stream: MediaStream): void {
    if (this.remoteAudioNodes.has(peerId)) return;

    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const audioEl = new Audio();
    audioEl.srcObject = stream;
    audioEl.muted = this.isDeafened;
    audioEl.autoplay = true;

    const source = this.audioCtx.createMediaStreamSource(stream);
    const filterNode = this.audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(20000, this.audioCtx.currentTime);

    const gainNode = this.audioCtx.createGain();
    gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

    source.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    this.remoteAudioNodes.set(peerId, {
      stream,
      audioEl,
      source,
      gainNode,
      filterNode,
    });
  }

  // --------------------------------------------------------------------------
  // Spatial Audio & Distance Attenuation Engine
  // --------------------------------------------------------------------------

  public updateSpatialPositions(
    localPos: { x: number; z: number },
    players: Record<string, { x: number; z: number; isAlive: boolean; isBot?: boolean }>,
    isLocalAlive: boolean,
    isMeetingActive: boolean
  ): void {
    this.localPos = localPos;
    this.remotePlayers = players;
    this.isLocalAlive = isLocalAlive;
    this.isMeetingActive = isMeetingActive;

    const now = this.audioCtx?.currentTime || 0;

    for (const [peerId, node] of this.remoteAudioNodes) {
      const target = players[peerId];
      if (!target) {
        node.gainNode.gain.setTargetAtTime(0, now, 0.05);
        continue;
      }

      // Ghost isolation rules:
      // - If local is ALIVE and remote is DEAD: completely inaudible (0 volume)
      if (isLocalAlive && !target.isAlive) {
        node.gainNode.gain.setTargetAtTime(0, now, 0.05);
        continue;
      }

      // In Emergency Meeting: everyone alive is heard at 100% volume regardless of distance
      if (isMeetingActive) {
        if (target.isAlive || !isLocalAlive) {
          node.gainNode.gain.setTargetAtTime(1.0, now, 0.08);
          node.filterNode.frequency.setTargetAtTime(20000, now, 0.08);
        } else {
          node.gainNode.gain.setTargetAtTime(0, now, 0.05);
        }
        continue;
      }

      // During active gameplay: 3D Euclidean distance attenuation
      const dist = Math.hypot(localPos.x - target.x, localPos.z - target.z);

      if (dist > MAX_HEAR_DISTANCE) {
        // Beyond audible radius
        node.gainNode.gain.setTargetAtTime(0, now, 0.08);
        continue;
      }

      // Smooth inverse linear falloff
      let volume = 1.0;
      if (dist > FULL_VOLUME_DISTANCE) {
        volume = Math.max(
          0,
          1 - (dist - FULL_VOLUME_DISTANCE) / (MAX_HEAR_DISTANCE - FULL_VOLUME_DISTANCE)
        );
      }

      // Wall occlusion check (raycast intersection with ship bulkheads)
      const occluded = lineIntersectsWalls(localPos.x, localPos.z, target.x, target.z).hit;
      if (occluded) {
        // Attenuate volume and muffle high frequencies through steel walls
        volume *= 0.35;
        node.filterNode.frequency.setTargetAtTime(650, now, 0.1);
      } else {
        node.filterNode.frequency.setTargetAtTime(20000, now, 0.1);
      }

      node.gainNode.gain.setTargetAtTime(volume, now, 0.08);
    }

    this.notifyState();
  }

  // --------------------------------------------------------------------------
  // State Observation
  // --------------------------------------------------------------------------

  public getState(): VoiceSystemState {
    const peerStates: VoicePeerState[] = [];

    for (const [id, target] of Object.entries(this.remotePlayers)) {
      if (id === net.getSocketId() || target.isBot) continue;

      const dist = Math.hypot(this.localPos.x - target.x, this.localPos.z - target.z);
      const isSpeaking = this.speakingPeers.has(id);
      const occluded = lineIntersectsWalls(this.localPos.x, this.localPos.z, target.x, target.z).hit;

      let volPct = 0;
      if (this.isMeetingActive) {
        volPct = 100;
      } else if (dist <= FULL_VOLUME_DISTANCE) {
        volPct = occluded ? 35 : 100;
      } else if (dist <= MAX_HEAR_DISTANCE) {
        volPct = Math.round(
          (1 - (dist - FULL_VOLUME_DISTANCE) / (MAX_HEAR_DISTANCE - FULL_VOLUME_DISTANCE)) *
            (occluded ? 35 : 100)
        );
      }

      peerStates.push({
        id,
        distance: Math.round(dist * 10) / 10,
        volumePct: volPct,
        isSpeaking,
        isOccluded: occluded,
      });
    }

    return {
      isInitialized: !!this.localStream,
      isMicActive: !!this.localStream,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      isPushToTalk: this.isPushToTalk,
      isTransmitting: this.isTransmitting,
      micInputLevel: this.micLevel,
      micPermissionError: this.micError,
      activePeers: peerStates,
    };
  }

  public subscribe(cb: (state: VoiceSystemState) => void): () => void {
    this.stateListeners.add(cb);
    cb(this.getState());
    return () => this.stateListeners.delete(cb);
  }

  private notifyState(): void {
    const state = this.getState();
    this.stateListeners.forEach((cb) => cb(state));
  }

  public isPeerSpeaking(peerId: string): boolean {
    return this.speakingPeers.has(peerId);
  }

  public dispose(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.unsubNetSignal?.();
    this.unsubNetInit?.();
    this.unsubNetSpeaking?.();

    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();

    for (const node of this.remoteAudioNodes.values()) {
      node.audioEl.pause();
      node.audioEl.srcObject = null;
      node.audioEl.remove();
    }
    this.remoteAudioNodes.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

export const proximityVoice = new ProximityVoiceManager();
