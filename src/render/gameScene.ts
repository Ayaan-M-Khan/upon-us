/**
 * Impostor Protocol - Full 3D Game Scene
 * Spaceship map, local player controller, remote player interpolation, bodies, ghosts and camera.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BASE_PLAYER_SPEED,
  GameSettings,
  KILL_DISTANCE_M,
  REPORT_RANGE,
  TASK_RANGE,
  VENT_RANGE,
} from '../../shared/constants';
import { GAME_STATES } from '../../shared/constants';
import { GameStateSnapshot, SabotageType, TaskView } from '../../shared/events';
import {
  EMERGENCY_BUTTON_POS,
  EMERGENCY_BUTTON_RANGE,
  MAP_OBSTACLES,
  MAP_ROOMS_DETAIL,
  MAP_VENTS,
  MAP_WALLS,
  Rect,
  SECURITY_CAMERAS,
  SECURITY_DESK_POS,
  SECURITY_DESK_RANGE,
  detectRoom,
  hasLineOfSight,
} from '../../shared/mapData';
import { PLAYER_RADIUS, resolveMovementCollisions, resolveWallCollisions } from '../../shared/physics';
import { soundEngine } from '../audio';
import { net } from '../net';
import { CameraController } from './cameraController';
import { CrewmateModel } from './crewmateModel';
import { Map3D } from './map3D';

export interface InteractionContext {
  taskId: string | null;
  taskName: string | null;
  taskHold: number;
  taskStep: number;
  taskTotalSteps: number;
  killTargetId: string | null;
  reportBodyId: string | null;
  ventId: string | null;
  emergency: boolean;
  canUseCameras: boolean;
  sabotagePartId: number | null;
  sabotageType: SabotageType | null;
}

const EMPTY_CONTEXT: InteractionContext = {
  taskId: null,
  taskName: null,
  taskHold: 0,
  taskStep: 0,
  taskTotalSteps: 1,
  killTargetId: null,
  reportBodyId: null,
  ventId: null,
  emergency: false,
  canUseCameras: false,
  sabotagePartId: null,
  sabotageType: null,
};

/** Keys that should never be captured while the player is typing in chat, etc. */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);

export class GameScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private keyLight!: THREE.DirectionalLight;
  private isDestroyed = false;
  private animationFrameId = 0;

  // Components
  public map3D: Map3D;
  public cameraController: CameraController;

  // Local player
  public localPlayerId: string = '';
  public localPos: THREE.Vector3 = new THREE.Vector3(0, 0, -22);
  public localRotation = 0;
  public isMoving = false;
  public currentRoom = 'Cafeteria';
  public playerSpeedMultiplier = 1.0;
  private velocity = new THREE.Vector2(0, 0);
  private localPosSeq = -1;

  /** Set by the UI while a task is being worked on, a menu is open, etc. */
  public movementLocked = false;
  public latest: GameStateSnapshot | null = null;
  private killDistance: number;

  // Input
  private keys: Record<string, boolean> = {};
  private joystickVector = { x: 0, y: 0 };
  private inputSeq = 0;
  private lastInputSendTime = 0;

  // Actors
  private playerModels: Map<string, CrewmateModel> = new Map();
  private bodyModels: Map<string, THREE.Group> = new Map();
  private ghostApplied: Set<string> = new Set();
  private prevVentStates: Map<string, boolean> = new Map();
  private remoteTargets: Map<string, { x: number; z: number; rotation: number; isMoving: boolean }> = new Map();
  private actorLastSeen: Map<string, number> = new Map();
  private taskMarkerGroup = new THREE.Group();
  private taskMarkerKey = '';
  private activeTaskMarkers: Array<{
    task: TaskView;
    group: THREE.Group;
    beaconMesh: THREE.Mesh;
    iconGroup: THREE.Group;
    ringMesh: THREE.Mesh;
    billboardMesh: THREE.Mesh;
  }> = [];
  private sabotageMarkerGroup = new THREE.Group();
  private sabotageMarkerKey = '';
  private activeSabotageMarkers: Array<{
    partId: number;
    group: THREE.Group;
    beaconMesh: THREE.Mesh;
    ringMesh: THREE.Mesh;
    iconGroup: THREE.Group;
    billboardMesh: THREE.Mesh;
    pointLight: THREE.PointLight;
  }> = [];
  private taskAnimTime = 0;
  private killUnsub?: () => void;
  private slashEffects: Array<{ group: THREE.Group; life: number; maxLife: number }> = [];

  // Visual Wireframe Hitbox Debug Mode
  public showHitboxes = false;
  private hitboxGroup!: THREE.Group;
  private playerHitboxMesh!: THREE.LineSegments;
  private playerHitboxMat!: THREE.LineBasicMaterial;
  private isCurrentlyColliding = false;

  // Security CCTV Surveillance System
  public isViewingCameras = false;
  public activeCameraIndex = 0;

  private onRoomChangeCb?: (room: string) => void;

  public toggleSecurityCameras(enable?: boolean): boolean {
    const next = enable !== undefined ? enable : !this.isViewingCameras;
    this.isViewingCameras = next;
    this.movementLocked = next;

    if (this.isViewingCameras) {
      soundEngine.playClick();
      this.cameraController.mode = 'cctv';
      this.cameraController.cctvCamera = SECURITY_CAMERAS[this.activeCameraIndex] || SECURITY_CAMERAS[0];
    } else {
      this.cameraController.mode = 'third_person';
      this.cameraController.cctvCamera = null;
    }
    return this.isViewingCameras;
  }

  public setSecurityCameraFeed(index: number): void {
    if (index >= 0 && index < SECURITY_CAMERAS.length) {
      this.activeCameraIndex = index;
      soundEngine.playClick();
      if (this.isViewingCameras) {
        this.cameraController.cctvCamera = SECURITY_CAMERAS[index];
      }
    }
  }

  /**
   * Line-of-sight & Fog of War actor visibility test:
   * Prevents players from seeing through walls into other rooms.
   */
  public canSeeActor(
    lx: number, lz: number, lRoom: string,
    tx: number, tz: number,
    isGhost: boolean, isTargetAlive: boolean,
    camZone?: Rect
  ): boolean {
    if (isGhost) return true; // Ethereal ghosts have complete sight
    if (!isTargetAlive) return false; // Living crewmates cannot see dead ghosts

    // If watching security cameras, check if target is inside active camera sector
    if (camZone) {
      if (tx >= camZone.minX && tx <= camZone.maxX && tz >= camZone.minZ && tz <= camZone.maxZ) {
        return true;
      }
    }

    const d = Math.hypot(tx - lx, tz - lz);
    if (d > 24) return false; // Fog of war max visual horizon

    const targetRoom = detectRoom(tx, tz);
    if (lRoom === targetRoom) {
      // In same room: check line of sight against internal partition walls
      return hasLineOfSight(lx, lz, tx, tz);
    }

    // If target is inside an enclosed room and local player is outside that room:
    if (targetRoom !== 'Corridor') {
      const r = MAP_ROOMS_DETAIL.find((m) => m.name === targetRoom);
      if (r) {
        let minDist = Infinity;
        for (const b of r.rects) {
          const dx = Math.max(0, b.minX - lx, lx - b.maxX);
          const dz = Math.max(0, b.minZ - lz, lz - b.maxZ);
          const dist = Math.hypot(dx, dz);
          if (dist < minDist) minDist = dist;
        }
        // Outside 4.8m peeking radius: room occlusion box completely conceals target
        if (minDist >= 4.8) return false;
      }
    }

    // If local player is inside an enclosed room and target is outside in corridor:
    if (lRoom !== 'Corridor' && targetRoom === 'Corridor') {
      const r = MAP_ROOMS_DETAIL.find((m) => m.name === lRoom);
      if (r) {
        let minDist = Infinity;
        for (const b of r.rects) {
          const dx = Math.max(0, b.minX - tx, tx - b.maxX);
          const dz = Math.max(0, b.minZ - tz, tz - b.maxZ);
          const dist = Math.hypot(dx, dz);
          if (dist < minDist) minDist = dist;
        }
        if (minDist >= 4.8) return false;
      }
    }

    // If both are in different enclosed rooms, they cannot see each other
    if (lRoom !== 'Corridor' && targetRoom !== 'Corridor' && lRoom !== targetRoom) {
      return false;
    }

    // Clear doorway or corridor sightline
    return hasLineOfSight(lx, lz, tx, tz);
  }

  constructor(container: HTMLElement, settings: GameSettings, myId: string, onRoomChange?: (room: string) => void) {
    this.container = container;
    this.localPlayerId = myId;
    this.playerSpeedMultiplier = settings.playerSpeed || 1.0;
    this.killDistance = KILL_DISTANCE_M[settings.killDistance] ?? KILL_DISTANCE_M.Short;
    this.onRoomChangeCb = onRoomChange;
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060814);
    this.scene.fog = new THREE.FogExp2(0x060814, 0.012);

    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 320);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.setupLighting();

    this.map3D = new Map3D();
    this.scene.add(this.map3D.group);
    this.scene.add(this.taskMarkerGroup);
    this.scene.add(this.sabotageMarkerGroup);

    // Build visual wireframe hitboxes (walls & items)
    this.buildHitboxWireframes();

    this.cameraController = new CameraController(this.camera);
    this.bindInputs();

    this.killUnsub = net.onPlayerKilled((data) => {
      this.handlePlayerKilledAnimation(data);
    });

    if (import.meta.env?.DEV) (window as unknown as { __gameScene?: GameScene }).__gameScene = this; // dev-only test hook
    this.tick = this.tick.bind(this);
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  private setupLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.7));

    // The shadow-casting light follows the player so shadows stay sharp on the large map.
    this.keyLight = new THREE.DirectionalLight(0xffedd5, 1.2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 90;
    this.keyLight.shadow.camera.left = -30;
    this.keyLight.shadow.camera.right = 30;
    this.keyLight.shadow.camera.top = 30;
    this.keyLight.shadow.camera.bottom = -30;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);
  }

  // ---------------------------------------------------------------------------
  // Input (the "stuck moving in one direction" fix lives here)
  // ---------------------------------------------------------------------------
  // Keys got stuck because a keyup was never seen (alt-tab, clicking a HUD button,
  // pressing Tab, opening a menu) and the anonymous listeners were never removed.
  // Now: held keys are cleared whenever focus is lost or a UI state takes over,
  // the movement vector is rebuilt from the held keys every frame, and every
  // listener is removed on dispose.

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return;
    if (MOVE_KEYS.has(e.code)) {
      this.keys[e.code] = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (MOVE_KEYS.has(e.code)) this.keys[e.code] = false;
  };

  public clearInput = (): void => {
    this.keys = {};
    this.joystickVector = { x: 0, y: 0 };
  };

  private onBlur = (): void => {
    // Only clear input if document is truly hidden (tab switch/minimized).
    // Internal React re-renders, room changes, or iframe active-element shifts must NEVER drop held keys!
    if (typeof document !== 'undefined' && document.hidden) {
      this.clearInput();
    }
  };

  private onVisibility = (): void => {
    if (document.hidden) this.clearInput();
  };

  private bindInputs(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('resize', this.onResize);
  }

  public setJoystick(x: number, y: number): void {
    this.joystickVector = { x, y };
  }

  // ---------------------------------------------------------------------------
  // Network snapshots
  // ---------------------------------------------------------------------------

  public handleSnapshot(snapshot: GameStateSnapshot): void {
    this.latest = snapshot;
    const activeIds = new Set<string>();

    for (const [id, player] of Object.entries(snapshot.players)) {
      activeIds.add(id);

      const wasInVent = this.prevVentStates.get(id) ?? false;
      const isInVent = !!player.inVent;
      if (isInVent !== wasInVent) {
        this.prevVentStates.set(id, isInVent);
        soundEngine.playSpatialVent({ x: player.x, z: player.z }, this.localPos, this.cameraController.angleH);
      }

      let model = this.playerModels.get(id);
      if (!model) {
        model = new CrewmateModel(player.colorId, player.hatId, player.name, player.isHost);
        this.playerModels.set(id, model);
        this.scene.add(model.group);
        model.group.position.set(player.x, 0, player.z);
      } else {
        model.setColor(player.colorId);
        model.setHat(player.hatId);
      }

      if (id === this.localPlayerId) {
        // Server-forced moves (kill teleport, meeting start, vents) snap us and reset sequence.
        const forced = (player.posSeq ?? 0) !== this.localPosSeq;
        const drift = Math.hypot(player.x - this.localPos.x, player.z - this.localPos.z);
        if (forced) {
          this.localPos.set(player.x, 0, player.z);
          this.localPosSeq = player.posSeq ?? 0;
          this.velocity.set(0, 0);
        } else if (drift > 6.0) {
          // Large network lag: smoothly nudge toward server without killing player momentum
          this.localPos.lerp(new THREE.Vector3(player.x, 0, player.z), 0.3);
        }
      } else {
        this.remoteTargets.set(id, {
          x: player.x,
          z: player.z,
          rotation: player.rotation,
          isMoving: player.isMoving,
        });
      }
    }

    for (const [id, model] of this.playerModels) {
      if (!activeIds.has(id)) {
        this.scene.remove(model.group);
        model.dispose();
        this.playerModels.delete(id);
        this.remoteTargets.delete(id);
        this.ghostApplied.delete(id);
      }
    }

    // Dead bodies lie where the player fell until the next meeting.
    const bodyIds = new Set((snapshot.bodies || []).map((b) => b.id));
    for (const b of snapshot.bodies || []) {
      if (this.bodyModels.has(b.id)) continue;
      const corpse = CrewmateModel.createDeadBody(b.colorId);
      corpse.position.set(b.x, 0, b.z);
      this.scene.add(corpse);
      this.bodyModels.set(b.id, corpse);
    }
    for (const [id, m] of this.bodyModels) {
      if (!bodyIds.has(id)) {
        this.scene.remove(m);
        m.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            if (Array.isArray(o.material)) o.material.forEach((mat) => mat.dispose());
            else if (o.material) o.material.dispose();
          }
        });
        this.bodyModels.delete(id);
      }
    }

    this.updateTaskMarkers(snapshot);
    this.updateSabotageMarkers(snapshot);
  }

  private updateTaskMarkers(snapshot: GameStateSnapshot): void {
    const tasks = snapshot.you?.tasks.filter((t) => !t.done) || [];
    const key = tasks.map((t) => `${t.taskId}:${t.step}`).join('|');
    if (key === this.taskMarkerKey) return;
    this.taskMarkerKey = key;

    // Dispose old markers
    for (const marker of this.activeTaskMarkers) {
      this.taskMarkerGroup.remove(marker.group);
      marker.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if ('map' in m && m.map) m.map.dispose();
              m.dispose();
            });
          } else if (obj.material) {
            if ('map' in obj.material && obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
    }
    this.activeTaskMarkers = [];

    // Shared geometries and materials for performance
    const beaconGeo = new THREE.CylinderGeometry(0.48, 0.48, 2.8, 16);
    const stemGeo = new THREE.CylinderGeometry(0.07, 0.12, 0.46, 16);
    const dotGeo = new THREE.SphereGeometry(0.07, 12, 12);
    const ringGeo = new THREE.TorusGeometry(0.72, 0.05, 8, 24);

    for (const t of tasks) {
      const group = new THREE.Group();
      group.position.set(t.x, 0, t.z);

      // 0. Pulsating Yellow Beacon Light Column (2.8m high)
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.position.y = 1.4;
      group.add(beaconMesh);

      // 1. Ground Torus Ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.75,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.06;
      group.add(ringMesh);

      // 2. Floating Animated '!' Exclamation Mark Icon
      const iconGroup = new THREE.Group();
      iconGroup.position.y = 1.95;

      const markMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.2,
      });

      const stemMesh = new THREE.Mesh(stemGeo, markMat);
      stemMesh.position.y = 0.32;
      stemMesh.castShadow = true;
      iconGroup.add(stemMesh);

      const dotMesh = new THREE.Mesh(dotGeo, markMat);
      dotMesh.position.y = 0.02;
      dotMesh.castShadow = true;
      iconGroup.add(dotMesh);

      group.add(iconGroup);

      // 3. Proximity Billboard Prompt [E] <Task Name>
      const promptTex = this.createTaskPromptTexture(t.name, t.step, t.totalSteps);
      const billboardGeo = new THREE.PlaneGeometry(1.6, 0.4);
      const billboardMat = new THREE.MeshBasicMaterial({
        map: promptTex,
        transparent: true,
        depthTest: false,
      });
      const billboardMesh = new THREE.Mesh(billboardGeo, billboardMat);
      billboardMesh.position.y = 2.45;
      billboardMesh.renderOrder = 999;
      billboardMesh.visible = false;
      group.add(billboardMesh);

      this.taskMarkerGroup.add(group);
      this.activeTaskMarkers.push({
        task: t,
        group,
        beaconMesh,
        iconGroup,
        ringMesh,
        billboardMesh,
      });
    }
  }

  private updateSabotageMarkers(snapshot: GameStateSnapshot): void {
    const sab = snapshot.sabotage;
    const parts = sab ? sab.parts.filter((p) => !p.resolved) : [];
    const key = sab ? `${sab.type}:${parts.map((p) => p.id).join(',')}` : 'none';
    if (key === this.sabotageMarkerKey) return;
    this.sabotageMarkerKey = key;

    // Dispose old sabotage markers
    for (const marker of this.activeSabotageMarkers) {
      this.sabotageMarkerGroup.remove(marker.group);
      marker.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else if (obj.material) obj.material.dispose();
        }
      });
    }
    this.activeSabotageMarkers = [];

    if (!sab || parts.length === 0) return;

    // Geometries for emergency RED beacon
    const beaconGeo = new THREE.CylinderGeometry(0.7, 0.7, 3.2, 16);
    const ringGeo = new THREE.TorusGeometry(0.9, 0.08, 8, 24);
    const boxGeo = new THREE.BoxGeometry(0.24, 0.45, 0.12);
    const crossGeo = new THREE.BoxGeometry(0.45, 0.24, 0.12);

    for (const p of parts) {
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);

      // 1. Pulsating Emergency Red Vertical Beacon Beam
      const beaconMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.position.y = 1.6;
      group.add(beaconMesh);

      // 2. Pulsing Ground Hazard Ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.85,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.06;
      group.add(ringMesh);

      // 3. Floating Animated Red Emergency Icon
      const iconGroup = new THREE.Group();
      iconGroup.position.y = 2.1;

      const alertMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xff0000,
        emissiveIntensity: 1.6,
        roughness: 0.2,
      });
      const iconBar1 = new THREE.Mesh(boxGeo, alertMat);
      iconGroup.add(iconBar1);
      const iconBar2 = new THREE.Mesh(crossGeo, alertMat);
      iconGroup.add(iconBar2);
      group.add(iconGroup);

      // 4. Proximity Billboard Prompt [E] REPAIR SABOTAGE
      const promptTex = this.createSabotagePromptTexture(p.name, sab.type);
      const billboardGeo = new THREE.PlaneGeometry(2.1, 0.5);
      const billboardMat = new THREE.MeshBasicMaterial({
        map: promptTex,
        transparent: true,
        depthTest: false,
      });
      const billboardMesh = new THREE.Mesh(billboardGeo, billboardMat);
      billboardMesh.position.y = 2.65;
      billboardMesh.renderOrder = 999;
      billboardMesh.visible = false;
      group.add(billboardMesh);

      // 5. Emergency Red Point Light
      const pointLight = new THREE.PointLight(0xef4444, 2.5, 8);
      pointLight.position.set(0, 1.8, 0);
      group.add(pointLight);

      this.sabotageMarkerGroup.add(group);
      this.activeSabotageMarkers.push({
        partId: p.id,
        group,
        beaconMesh,
        ringMesh,
        iconGroup,
        billboardMesh,
        pointLight,
      });
    }
  }

  private createSabotagePromptTexture(partName: string, type: SabotageType): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 440;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.clearRect(0, 0, 440, 96);

    ctx.fillStyle = 'rgba(24, 4, 8, 0.94)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 424, 80, 16);
    ctx.fill();

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.roundRect(20, 22, 50, 52, 10);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('E', 45, 48);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 23px Fredoka, Nunito, sans-serif';
    ctx.fillText('REPAIR ' + type.toUpperCase(), 82, 38);

    ctx.fillStyle = '#fca5a5';
    ctx.font = '600 16px Fredoka, Nunito, sans-serif';
    ctx.fillText(partName, 82, 66);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createTaskPromptTexture(taskName: string, step: number, totalSteps: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.clearRect(0, 0, 384, 96);

    // Background rounded pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 368, 80, 16);
    ctx.fill();

    // Cyan border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Key badge [E]
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(20, 22, 50, 52, 10);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('E', 45, 48);

    // Task Name & Step
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 23px Fredoka, Nunito, sans-serif';
    const label = taskName.length > 18 ? taskName.slice(0, 16) + '...' : taskName;
    ctx.fillText(label, 82, 38);

    // Subtext step counter
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 17px Fredoka, Nunito, sans-serif';
    ctx.fillText(`Step ${step + 1} of ${totalSteps}`, 82, 66);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  public teleportToVent(ventId: string): void {
    const vent = MAP_VENTS.find((v) => v.id === ventId);
    if (!vent) return;
    this.localPos.set(vent.x, 0, vent.z);
    this.velocity.set(0, 0);
    this.isMoving = false;
    const room = detectRoom(vent.x, vent.z);
    if (room !== this.currentRoom) {
      this.currentRoom = room;
      this.onRoomChangeCb?.(room);
    }
  }

  /** What the local player could do right now (drives the HUD buttons). */
  public computeContext(): InteractionContext {
    const snap = this.latest;
    const me = snap?.players[this.localPlayerId];
    if (!snap || !me || !snap.you || snap.state !== GAME_STATES.PLAYING) return EMPTY_CONTEXT;
    const you = snap.you;
    const px = this.localPos.x;
    const pz = this.localPos.z;
    const ctx: InteractionContext = { ...EMPTY_CONTEXT };

    if (you.ventId) return ctx; // in a vent: only the vent controls apply

    let best = TASK_RANGE;
    for (const t of you.tasks) {
      if (t.done) continue;
      const d = Math.hypot(px - t.x, pz - t.z);
      if (d <= best) {
        best = d;
        ctx.taskId = t.taskId;
        ctx.taskName = t.name;
        ctx.taskHold = t.hold;
        ctx.taskStep = t.step;
        ctx.taskTotalSteps = t.totalSteps;
      }
    }

    if (me.isAlive) {
      let bd = REPORT_RANGE;
      for (const b of snap.bodies || []) {
        const d = Math.hypot(px - b.x, pz - b.z);
        if (d <= bd) {
          bd = d;
          ctx.reportBodyId = b.id;
        }
      }

      const d = Math.hypot(px - EMERGENCY_BUTTON_POS.x, pz - EMERGENCY_BUTTON_POS.z);
      ctx.emergency = d <= EMERGENCY_BUTTON_RANGE && you.emergencyLeft > 0 && you.emergencyCooldownMs <= 0;

      // Security CCTV console desk proximity
      const distToSecurity = Math.hypot(px - SECURITY_DESK_POS.x, pz - SECURITY_DESK_POS.z);
      ctx.canUseCameras = distToSecurity <= SECURITY_DESK_RANGE;

      // Sabotage repair console proximity
      if (snap.sabotage && me.isAlive) {
        for (const part of snap.sabotage.parts) {
          if (part.resolved) continue;
          const dist = Math.hypot(px - part.x, pz - part.z);
          if (dist <= 3.8) {
            ctx.sabotagePartId = part.id;
            ctx.sabotageType = snap.sabotage.type;
            break;
          }
        }
      }

      if (you.role === 'impostor') {
        let kd = this.killDistance;
        const mates = new Set(you.teammates.map((t) => t.id));
        for (const p of Object.values(snap.players)) {
          if (p.id === this.localPlayerId || !p.isAlive || p.inVent || mates.has(p.id)) continue;
          const dist = Math.hypot(px - p.x, pz - p.z);
          if (dist <= kd) {
            kd = dist;
            ctx.killTargetId = p.id;
          }
        }
        let vd = VENT_RANGE;
        for (const v of MAP_VENTS) {
          const dist = Math.hypot(px - v.x, pz - v.z);
          if (dist <= vd) {
            vd = dist;
            ctx.ventId = v.id;
          }
        }
      }
    }
    return ctx;
  }

  public toggleWireframeHitboxes(): boolean {
    this.showHitboxes = !this.showHitboxes;
    if (this.hitboxGroup) {
      this.hitboxGroup.visible = this.showHitboxes;
    }
    soundEngine.playClick();
    return this.showHitboxes;
  }

  private buildHitboxWireframes(): void {
    this.hitboxGroup = new THREE.Group();
    this.hitboxGroup.visible = this.showHitboxes;

    // 1. Wall segments wireframe bounds (Green)
    const wallLineMat = new THREE.LineBasicMaterial({
      color: 0x22c55e,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const wallBufferMat = new THREE.LineBasicMaterial({
      color: 0x16a34a,
      depthTest: false,
      transparent: true,
      opacity: 0.5,
    });

    for (const wall of MAP_WALLS) {
      const dx = wall.x2 - wall.x1;
      const dz = wall.z2 - wall.z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;

      const midX = (wall.x1 + wall.x2) / 2;
      const midZ = (wall.z1 + wall.z2) / 2;
      const angle = Math.atan2(dz, dx);

      // Main wall boundary box
      const boxGeo = new THREE.BoxGeometry(len, 2.2, 0.12);
      const edges = new THREE.EdgesGeometry(boxGeo);
      const wire = new THREE.LineSegments(edges, wallLineMat);
      wire.position.set(midX, 1.1, midZ);
      wire.rotation.y = -angle;
      wire.renderOrder = 9999;
      this.hitboxGroup.add(wire);

      // Floor clearance corridor lines showing PLAYER_RADIUS buffer
      const floorPlane = new THREE.PlaneGeometry(len, PLAYER_RADIUS * 2);
      const floorEdges = new THREE.EdgesGeometry(floorPlane);
      const floorWire = new THREE.LineSegments(floorEdges, wallBufferMat);
      floorWire.rotation.x = Math.PI / 2;
      floorWire.rotation.z = -angle;
      floorWire.position.set(midX, 0.04, midZ);
      floorWire.renderOrder = 9998;
      this.hitboxGroup.add(floorWire);
    }

    // 2. Obstacles wireframe bounds (Machinery & Items)
    // Circles: Yellow (0xfacc15), Boxes: Bright Orange (0xf97316)
    const circleObsMat = new THREE.LineBasicMaterial({
      color: 0xfacc15,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const circleBufferMat = new THREE.LineBasicMaterial({
      color: 0xeab308,
      depthTest: false,
      transparent: true,
      opacity: 0.5,
    });
    const boxObsMat = new THREE.LineBasicMaterial({
      color: 0xf97316,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });

    for (const obs of MAP_OBSTACLES) {
      if (obs.type === 'circle') {
        const cylGeo = new THREE.CylinderGeometry(obs.radius, obs.radius, 1.8, 24);
        const cylEdges = new THREE.EdgesGeometry(cylGeo);
        const cylWire = new THREE.LineSegments(cylEdges, circleObsMat);
        cylWire.position.set(obs.x, 0.9, obs.z);
        cylWire.renderOrder = 9999;
        this.hitboxGroup.add(cylWire);

        // Ground ring with PLAYER_RADIUS buffer
        const ringGeo = new THREE.RingGeometry(obs.radius + PLAYER_RADIUS - 0.04, obs.radius + PLAYER_RADIUS, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.35,
          depthTest: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(obs.x, 0.05, obs.z);
        ring.renderOrder = 9998;
        this.hitboxGroup.add(ring);
      } else if (obs.type === 'box') {
        const w = (obs.maxX ?? obs.x) - (obs.minX ?? obs.x);
        const d = (obs.maxZ ?? obs.z) - (obs.minZ ?? obs.z);
        const cx = ((obs.minX ?? obs.x) + (obs.maxX ?? obs.x)) / 2;
        const cz = ((obs.minZ ?? obs.z) + (obs.maxZ ?? obs.z)) / 2;

        const boxGeo = new THREE.BoxGeometry(w, 1.8, d);
        const boxEdges = new THREE.EdgesGeometry(boxGeo);
        const boxWire = new THREE.LineSegments(boxEdges, boxObsMat);
        boxWire.position.set(cx, 0.9, cz);
        boxWire.renderOrder = 9999;
        this.hitboxGroup.add(boxWire);

        // Ground buffer outline
        const bufferGeo = new THREE.BoxGeometry(w + PLAYER_RADIUS * 2, 0.04, d + PLAYER_RADIUS * 2);
        const bufferEdges = new THREE.EdgesGeometry(bufferGeo);
        const bufferWire = new THREE.LineSegments(bufferEdges, circleBufferMat);
        bufferWire.position.set(cx, 0.05, cz);
        bufferWire.renderOrder = 9998;
        this.hitboxGroup.add(bufferWire);
      }
    }

    // 3. Local Player Collision Hitbox (Cyan when clear, Red when colliding)
    const playerCylGeo = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, 1.7, 16);
    const playerEdges = new THREE.EdgesGeometry(playerCylGeo);
    this.playerHitboxMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    this.playerHitboxMesh = new THREE.LineSegments(playerEdges, this.playerHitboxMat);
    this.playerHitboxMesh.position.set(this.localPos.x, 0.85, this.localPos.z);
    this.playerHitboxMesh.renderOrder = 10000;
    this.hitboxGroup.add(this.playerHitboxMesh);

    this.scene.add(this.hitboxGroup);
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  private applyGhostLook(id: string, model: CrewmateModel, ghost: boolean): void {
    const has = this.ghostApplied.has(id);
    if (ghost === has) return;
    model.setGhostMode(ghost);
    if (ghost) this.ghostApplied.add(id);
    else this.ghostApplied.delete(id);
  }

  private handlePlayerKilledAnimation(data: { victimId: string; killerId?: string; x?: number; z?: number }): void {
    const isMeVictim = data.victimId === this.localPlayerId;
    const isMeKiller = data.killerId === this.localPlayerId;
    const px = data.x ?? this.playerModels.get(data.victimId)?.group.position.x ?? this.localPos.x;
    const pz = data.z ?? this.playerModels.get(data.victimId)?.group.position.z ?? this.localPos.z;

    // If I am not the killer or victim, only play sound & animate if I can witness it
    if (!isMeVictim && !isMeKiller) {
      const snap = this.latest;
      const meAlive = snap?.players[this.localPlayerId]?.isAlive ?? true;
      const canSee = this.canSeeActor(
        this.localPos.x, this.localPos.z, this.currentRoom,
        px, pz,
        !meAlive, true
      );
      if (!canSee) return; // Silent kill! Not visible to other rooms.
    }

    // 1. Impactful kill stab audio
    soundEngine.playKillStab();

    // 2. Animate the killer (lunge & blade slash)
    if (data.killerId) {
      const killer = this.playerModels.get(data.killerId);
      if (killer) {
        killer.triggerKillAnimation();
      }
    }

    // 3. Animate the victim (collapse & rising ethereal ghost soul)
    const victim = this.playerModels.get(data.victimId);
    if (victim) {
      victim.triggerDeathAnimation(() => {
        this.applyGhostLook(data.victimId, victim, true);
      });
    }

    // 4. 3D glowing red slash particle burst at kill location
    this.spawnKillSlashParticles(px, pz);

    // 5. If YOU were the one killed, trigger red kill vignette flash
    if (data.victimId === this.localPlayerId) {
      this.triggerLocalKillFlash();
      const localModel = this.playerModels.get(this.localPlayerId);
      if (localModel) {
        localModel.triggerDeathAnimation(() => {
          this.applyGhostLook(this.localPlayerId, localModel, true);
        });
      }
    }
  }

  private spawnKillSlashParticles(x: number, z: number): void {
    const fxGroup = new THREE.Group();
    fxGroup.position.set(x, 1.1, z);

    // Expanding glowing red slash ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.5, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    fxGroup.add(ring);

    // Dynamic blood / spark particles
    const particleCount = 14;
    const pGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const ang = (i / particleCount) * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.45;
      positions[i * 3] = Math.cos(ang) * r;
      positions[i * 3 + 1] = (Math.random() - 0.2) * 0.5;
      positions[i * 3 + 2] = Math.sin(ang) * r;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xd90429,
      size: 0.35,
      transparent: true,
      opacity: 0.95,
    });
    const points = new THREE.Points(pGeo, pMat);
    fxGroup.add(points);

    this.scene.add(fxGroup);
    this.slashEffects.push({ group: fxGroup, life: 0.6, maxLife: 0.6 });
  }

  private triggerLocalKillFlash(): void {
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.inset = '0';
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '50';
    flash.style.background = 'radial-gradient(circle, rgba(239,68,68,0.5) 0%, rgba(185,28,28,0.85) 100%)';
    flash.style.mixBlendMode = 'hard-light';
    flash.style.transition = 'opacity 0.8s ease-out';
    flash.style.opacity = '1';
    this.container.appendChild(flash);
    setTimeout(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 800);
    }, 180);
  }

  private tick(): void {
    if (this.isDestroyed) return;

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();
    const snap = this.latest;
    const me = snap?.players[this.localPlayerId];
    const meAlive = me ? me.isAlive : true;
    const inVent = !!snap?.you?.ventId;
    const canMove = !!snap && snap.state === GAME_STATES.PLAYING && !this.movementLocked && !inVent;

    // 1. Local movement: rebuilt from the keys held *this frame* and eased with a short velocity ramp.
    let moveX = 0;
    let moveZ = 0;
    const isSprinting = canMove && (this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const sprintMultiplier = isSprinting ? 1.35 : 1.0;

    if (canMove) {
      if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;
      moveX += this.joystickVector.x;
      moveZ += this.joystickVector.y;
    } else if (snap && snap.state !== GAME_STATES.PLAYING && Object.keys(this.keys).length) {
      // A meeting or game-over took over: drop anything still held
      this.keys = {};
    }

    const inputLen = Math.hypot(moveX, moveZ);
    let desiredVX = 0;
    let desiredVZ = 0;
    if (inputLen > 0.05) {
      const nx = moveX / Math.max(inputLen, 1);
      const nz = moveZ / Math.max(inputLen, 1);
      const yaw = this.cameraController.angleH;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const speed = BASE_PLAYER_SPEED * this.playerSpeedMultiplier * sprintMultiplier;
      desiredVX = (nx * cos + nz * sin) * speed;
      desiredVZ = (-nx * sin + nz * cos) * speed;
    }

    // High-responsiveness acceleration (36) and instant crisp braking (44)
    const accel = inputLen > 0.05 ? 36 : 44;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desiredVX, accel, delta);
    this.velocity.y = THREE.MathUtils.damp(this.velocity.y, desiredVZ, accel, delta);
    if (inputLen <= 0.05 && Math.hypot(this.velocity.x, this.velocity.y) < 0.05) {
      this.velocity.set(0, 0);
    }

    let movedDistTotal = 0;
    const hasVelocity = Math.hypot(this.velocity.x, this.velocity.y) > 0.12;

    this.isCurrentlyColliding = false;
    if (canMove && hasVelocity) {
      const stepX = this.velocity.x * delta;
      const stepZ = this.velocity.y * delta;
      const stepHypot = Math.hypot(stepX, stepZ);
      const steps = Math.max(1, Math.ceil(stepHypot / 0.18));

      for (let i = 0; i < steps; i++) {
        const targetX = this.localPos.x + stepX / steps;
        const targetZ = this.localPos.z + stepZ / steps;

        if (meAlive) {
          const res = resolveMovementCollisions(this.localPos.x, this.localPos.z, targetX, targetZ);
          if (res.collided) this.isCurrentlyColliding = true;
          const actualDx = res.x - this.localPos.x;
          const actualDz = res.z - this.localPos.z;
          movedDistTotal += Math.hypot(actualDx, actualDz);
          this.localPos.x = res.x;
          this.localPos.z = res.z;
        } else {
          // Ghosts phase freely through walls
          movedDistTotal += stepHypot / steps;
          this.localPos.x = targetX;
          this.localPos.z = targetZ;
        }
      }

      this.isMoving = movedDistTotal > 0.001;
      if (this.isMoving) {
        if (canMove && !inVent && meAlive) {
          soundEngine.playSpatialFootstep(
            this.localPlayerId,
            this.localPos,
            this.localPos,
            this.cameraController.angleH,
            true
          );
        }

        // Turn smoothly toward actual heading direction (shortest arc)
        const targetRot = Math.atan2(this.velocity.x, this.velocity.y);
        let dr = targetRot - this.localRotation;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        this.localRotation += dr * Math.min(1, delta * 20);

        const room = detectRoom(this.localPos.x, this.localPos.z);
        if (room !== this.currentRoom) {
          this.currentRoom = room;
          this.onRoomChangeCb?.(room);
        }
      }
    } else {
      this.isMoving = false;
    }

    // Dynamic FOV for sprint sensation
    const targetFov = isSprinting ? 64 : 60;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 12, delta);
      this.camera.updateProjectionMatrix();
    }

    // 2. Send position (20 Hz while moving, 5 Hz idle)
    if (canMove) {
      const interval = this.isMoving ? 50 : 200;
      if (now - this.lastInputSendTime > interval) {
        this.lastInputSendTime = now;
        net.sendPlayerInput({
          seq: ++this.inputSeq,
          x: this.localPos.x,
          z: this.localPos.z,
          rotation: this.localRotation,
          isMoving: this.isMoving,
        });
      }
    }

    // 3. Local model
    const localModel = this.playerModels.get(this.localPlayerId);
    if (localModel) {
      localModel.group.position.copy(this.localPos);
      localModel.group.rotation.y = this.localRotation;
      localModel.updateAnimation(delta * (isSprinting ? 1.4 : 1.0), this.isMoving, this.camera);

      const isFP = this.cameraController.mode === 'first_person';
      const hidden = isFP || inVent;
      localModel.bodyMesh.visible = !hidden;
      localModel.visorMesh.visible = !hidden;
      localModel.visorFrameMesh.visible = !hidden;
      localModel.backpackMesh.visible = !hidden;
      localModel.hatGroup.visible = !hidden;
      this.applyGhostLook(this.localPlayerId, localModel, !meAlive);
    }

    // Update Fog of War Room Visibility and Active Security Camera Zone
    const activeCamZone = this.isViewingCameras ? SECURITY_CAMERAS[this.activeCameraIndex]?.zone : undefined;
    this.map3D.isCamerasBeingWatched = this.isViewingCameras;
    this.map3D.setRoomVisibility(this.currentRoom, !meAlive, activeCamZone, { x: this.localPos.x, z: this.localPos.z });

    // 4. Remote players: interpolate, and hide ghosts from the living / vented impostors / players behind walls in other rooms
    for (const [id, target] of this.remoteTargets) {
      const model = this.playerModels.get(id);
      if (!model) continue;
      const p = snap?.players[id];

      const dist = Math.hypot(model.group.position.x - target.x, model.group.position.z - target.z);
      if (dist > 8) {
        model.group.position.x = target.x;
        model.group.position.z = target.z;
      } else {
        model.group.position.x = THREE.MathUtils.damp(model.group.position.x, target.x, 18, delta);
        model.group.position.z = THREE.MathUtils.damp(model.group.position.z, target.z, 18, delta);
      }
      // Shortest-arc rotation so characters never spin the long way round.
      let dr = target.rotation - model.group.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      model.group.rotation.y += dr * Math.min(1, delta * 18);
      model.updateAnimation(delta, target.isMoving, this.camera);

      if (p) {
        const canSee = this.canSeeActor(
          this.localPos.x, this.localPos.z, this.currentRoom,
          model.group.position.x, model.group.position.z,
          !meAlive, p.isAlive, activeCamZone
        );
        const lastSeen = this.actorLastSeen.get(id) ?? 0;
        if (canSee) {
          this.actorLastSeen.set(id, now);
        }
        // Grace period (280ms) prevents abrupt flickering/popping at doorframes
        const isRecentlyVisible = canSee || (now - lastSeen < 280);
        model.group.visible = p.isAlive ? (!p.inVent && isRecentlyVisible) : (!meAlive);
        if (model.nameTagMesh) model.nameTagMesh.visible = model.group.visible;
        this.applyGhostLook(id, model, !p.isAlive);

        if (p.isAlive && !p.inVent && target.isMoving && isRecentlyVisible) {
          soundEngine.playSpatialFootstep(
            id,
            model.group.position,
            this.localPos,
            this.cameraController.angleH,
            false
          );
        }
      }
    }

    // Dead body visibility based on Fog of War & line of sight
    for (const corpse of this.bodyModels.values()) {
      const canSeeBody = this.canSeeActor(
        this.localPos.x, this.localPos.z, this.currentRoom,
        corpse.position.x, corpse.position.z,
        !meAlive, true, activeCamZone
      );
      corpse.visible = canSeeBody;
    }

    // 5. Camera, light, ambience
    this.cameraController.update(delta, this.localPos, this.isMoving);
    this.keyLight.position.set(this.localPos.x + 15, 30, this.localPos.z - 10);
    this.keyLight.target.position.set(this.localPos.x, 0, this.localPos.z);

    // Dynamic sabotage lighting
    const sab = this.latest?.sabotage;
    const isImpostor = this.latest?.you?.role === 'impostor';
    if (sab?.lightsOut) {
      if (isImpostor) {
        // Impostors have enhanced night-vision visor
        this.keyLight.intensity = 0.95;
        this.keyLight.color.setHex(0xfecaca);
        (this.scene.fog as THREE.FogExp2).density = 0.015;
      } else {
        // Crewmates have pitch-black restricted visibility
        this.keyLight.intensity = 0.22;
        this.keyLight.color.setHex(0x64748b);
        (this.scene.fog as THREE.FogExp2).density = 0.048;
      }
    } else if (sab?.isCritical) {
      // Pulsing red klaxon emergency lighting
      const pulse = 0.5 + Math.sin(Date.now() * 0.008) * 0.45;
      this.keyLight.intensity = 0.8 + pulse * 0.4;
      this.keyLight.color.setRGB(1.0, 0.35 * (1 - pulse), 0.35 * (1 - pulse));
      (this.scene.fog as THREE.FogExp2).density = 0.018;
    } else {
      // Standard Skeld lighting
      this.keyLight.intensity = 1.2;
      this.keyLight.color.setHex(0xffedd5);
      (this.scene.fog as THREE.FogExp2).density = 0.012;
    }

    // Update visual wireframe hitboxes (player position & collision alert)
    if (this.showHitboxes && this.playerHitboxMesh) {
      this.playerHitboxMesh.position.set(this.localPos.x, 0.85, this.localPos.z);
      if (this.isCurrentlyColliding) {
        this.playerHitboxMat.color.setHex(0xef4444); // Red when contacting hitbox
      } else {
        this.playerHitboxMat.color.setHex(0x38bdf8); // Cyan when clear
      }
    }
    
    // 6. Active Task 3D Indicators (Animated Icon bobbing/spinning, proximity billboard)
    this.taskAnimTime += delta;

    // Animate Yellow Task Markers
    for (const marker of this.activeTaskMarkers) {
      marker.iconGroup.rotation.y += delta * 2.2;
      marker.iconGroup.position.y = 1.95 + Math.sin(this.taskAnimTime * 3.5 + marker.task.x) * 0.12;

      const d = Math.hypot(this.localPos.x - marker.task.x, this.localPos.z - marker.task.z);
      const isNearby = d <= TASK_RANGE;
      marker.billboardMesh.visible = isNearby;

      const ringMat = marker.ringMesh.material as THREE.MeshBasicMaterial;
      const beaconMat = marker.beaconMesh.material as THREE.MeshBasicMaterial;
      const pulse = 1.0 + Math.sin(this.taskAnimTime * 4.0) * 0.12;
      marker.beaconMesh.scale.set(pulse, 1, pulse);
      beaconMat.opacity = 0.22 + Math.sin(this.taskAnimTime * 3.0) * 0.1;

      if (isNearby) {
        marker.billboardMesh.quaternion.copy(this.camera.quaternion);
        marker.ringMesh.scale.set(pulse, pulse, 1);
        ringMat.color.setHex(0x38bdf8);
        ringMat.opacity = 0.9;
      } else {
        marker.ringMesh.scale.set(1, 1, 1);
        ringMat.color.setHex(0xfacc15);
        ringMat.opacity = 0.55 + Math.sin(this.taskAnimTime * 2.5) * 0.2;
      }
    }

    // Animate Emergency Red Sabotage Markers
    const sabAlarmPulse = Math.sin(this.taskAnimTime * 9.0);
    for (const marker of this.activeSabotageMarkers) {
      marker.iconGroup.rotation.y += delta * 3.8;
      marker.iconGroup.position.y = 2.1 + Math.sin(this.taskAnimTime * 6.0) * 0.18;

      const beaconMat = marker.beaconMesh.material as THREE.MeshBasicMaterial;
      const ringMat = marker.ringMesh.material as THREE.MeshBasicMaterial;

      const emergencyScale = 1.0 + sabAlarmPulse * 0.22;
      marker.beaconMesh.scale.set(emergencyScale, 1, emergencyScale);
      beaconMat.opacity = 0.45 + sabAlarmPulse * 0.25;

      marker.ringMesh.scale.set(1.0 + sabAlarmPulse * 0.16, 1.0 + sabAlarmPulse * 0.16, 1);
      ringMat.opacity = 0.7 + sabAlarmPulse * 0.25;

      marker.pointLight.intensity = 2.2 + sabAlarmPulse * 1.5;

      const d = Math.hypot(this.localPos.x - marker.group.position.x, this.localPos.z - marker.group.position.z);
      const isNearby = d <= 4.0;
      marker.billboardMesh.visible = isNearby;
      if (isNearby) {
        marker.billboardMesh.quaternion.copy(this.camera.quaternion);
      }
    }

    // 7. Dynamic 3D Slash Particles & Expanding Energy Rings
    for (let i = this.slashEffects.length - 1; i >= 0; i--) {
      const fx = this.slashEffects[i];
      fx.life -= delta;
      const p = Math.max(0, fx.life / fx.maxLife);
      fx.group.scale.setScalar(1 + (1 - p) * 1.8);
      fx.group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material) {
          const mat = o.material as THREE.Material;
          mat.opacity = p * 0.9;
        } else if (o instanceof THREE.Points && o.material) {
          const mat = o.material as THREE.PointsMaterial;
          mat.opacity = p * 0.95;
        }
      });
      if (fx.life <= 0) {
        this.scene.remove(fx.group);
        fx.group.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
            o.geometry.dispose();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else if (o.material) o.material.dispose();
          }
        });
        this.slashEffects.splice(i, 1);
      }
    }

    this.map3D.update(delta);

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  private onResize = (): void => {
    if (!this.container || this.isDestroyed) return;
    const width = this.container.clientWidth;
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public dispose(): void {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animationFrameId);

    this.killUnsub?.();

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearInput);
    window.removeEventListener('contextmenu', this.clearInput);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('resize', this.onResize);
    this.cameraController.dispose();

    for (const fx of this.slashEffects) {
      this.scene.remove(fx.group);
      fx.group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else if (o.material) o.material.dispose();
        }
      });
    }
    this.slashEffects = [];

    for (const marker of this.activeTaskMarkers) {
      marker.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if ('map' in m && m.map) m.map.dispose();
              m.dispose();
            });
          } else if (obj.material) {
            if ('map' in obj.material && obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
    }
    this.activeTaskMarkers = [];

    for (const marker of this.activeSabotageMarkers) {
      this.sabotageMarkerGroup.remove(marker.group);
      marker.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if ('map' in m && m.map) m.map.dispose();
              m.dispose();
            });
          } else if (obj.material) {
            if ('map' in obj.material && obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
    }
    this.activeSabotageMarkers = [];

    for (const model of this.playerModels.values()) model.dispose();
    for (const corpse of this.bodyModels.values()) {
      this.scene.remove(corpse);
      corpse.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else if (o.material) o.material.dispose();
        }
      });
    }
    this.playerModels.clear();
    this.bodyModels.clear();

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
