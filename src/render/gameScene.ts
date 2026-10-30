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
  MAP_VENTS,
  SABOTAGE_REPAIR_POINTS,
  detectRoom,
  isFloorAt,
} from '../../shared/mapData';
import { findPath } from '../../shared/nav';
import { resolveWallCollisions } from '../../shared/physics';
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
  fixSabotageType: SabotageType | null;
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
  fixSabotageType: null,
};

/** Keys that should never be captured while the player is typing in chat, etc. */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
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
  private bodyModels: Map<string, CrewmateModel> = new Map();
  private ghostApplied: Set<string> = new Set();
  private remoteTargets: Map<string, { x: number; z: number; rotation: number; isMoving: boolean }> = new Map();
  private remotePosSeq: Map<string, number> = new Map();
  private taskMarkerGroup = new THREE.Group();
  private taskMarkerKey = '';
  private waypointGroup = new THREE.Group();
  private waypointRing: THREE.Mesh;
  private waypointTime = 0;
  private waypointPath: THREE.Line | null = null;

  private onRoomChangeCb?: (room: string) => void;

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
    this.scene.add(this.waypointGroup);
    this.waypointRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.1, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 })
    );
    this.waypointRing.rotation.x = -Math.PI / 2;
    this.waypointRing.position.y = 0.08;
    this.waypointGroup.add(this.waypointRing);
    const waypointBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.3, 2.4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    waypointBeam.position.y = 1.25;
    this.waypointGroup.add(waypointBeam);
    this.waypointGroup.visible = false;

    this.cameraController = new CameraController(this.camera);
    this.bindInputs();

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

  private onVisibility = (): void => {
    if (document.hidden) this.clearInput();
  };

  private bindInputs(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearInput);
    window.addEventListener('contextmenu', this.clearInput);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('resize', this.onResize);
  }

  public setJoystick(x: number, y: number): void {
    this.joystickVector = { x, y };
  }

  public setWaypoint(x: number, z: number): void {
    if (!isFloorAt(x, z)) return;
    this.waypointGroup.position.set(x, 0, z);
    this.waypointGroup.visible = true;
    if (this.waypointPath) {
      this.scene.remove(this.waypointPath);
      this.waypointPath.geometry.dispose();
      (this.waypointPath.material as THREE.Material).dispose();
    }
    const route = findPath(this.localPos, { x, z });
    const points = [this.localPos.clone().setY(0.08), ...route.map((p) => new THREE.Vector3(p.x, 0.08, p.z))];
    this.waypointPath = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({ color: 0x38bdf8, dashSize: 0.65, gapSize: 0.35, transparent: true, opacity: 0.7 })
    );
    this.waypointPath.computeLineDistances();
    this.scene.add(this.waypointPath);
  }

  public teleportToVent(ventId: string): void {
    const vent = MAP_VENTS.find((item) => item.id === ventId);
    if (!vent) return;
    this.localPos.set(vent.x, 0, vent.z);
    this.velocity.set(0, 0);
    this.isMoving = false;
  }

  // ---------------------------------------------------------------------------
  // Network snapshots
  // ---------------------------------------------------------------------------

  public handleSnapshot(snapshot: GameStateSnapshot): void {
    this.latest = snapshot;
    const activeIds = new Set<string>();

    for (const [id, player] of Object.entries(snapshot.players)) {
      activeIds.add(id);

      let model = this.playerModels.get(id);
      if (!model) {
        model = new CrewmateModel(player.colorId, player.hatId, player.name, player.isHost);
        this.playerModels.set(id, model);
        this.scene.add(model.group);
        model.group.position.set(player.x, 0, player.z);
        if (id !== this.localPlayerId) this.remotePosSeq.set(id, player.posSeq ?? 0);
      } else {
        model.setColor(player.colorId);
        model.setHat(player.hatId);
      }

      if (id === this.localPlayerId) {
        // Server-forced moves (kill teleport, meeting start, vents) and big desyncs snap us.
        const forced = (player.posSeq ?? 0) !== this.localPosSeq;
        const drift = Math.hypot(player.x - this.localPos.x, player.z - this.localPos.z);
        if (forced || drift > 4) {
          this.localPos.set(player.x, 0, player.z);
          this.localPosSeq = player.posSeq ?? 0;
          this.velocity.set(0, 0);
        }
      } else {
        const posSeq = player.posSeq ?? 0;
        const previousPosSeq = this.remotePosSeq.get(id);
        if (previousPosSeq !== undefined && previousPosSeq !== posSeq) {
          model.group.position.set(player.x, 0, player.z);
          this.remotePosSeq.set(id, posSeq);
        }
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
        this.remotePosSeq.delete(id);
        this.ghostApplied.delete(id);
      }
    }

    // Dead bodies lie where the player fell until the next meeting.
    const bodyIds = new Set((snapshot.bodies || []).map((b) => b.id));
    for (const b of snapshot.bodies || []) {
      if (this.bodyModels.has(b.id)) continue;
      const m = new CrewmateModel(b.colorId, 'none', '', false);
      if (m.nameTagMesh) m.nameTagMesh.visible = false;
      m.group.position.set(b.x, 0.5, b.z);
      m.group.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2);
      this.scene.add(m.group);
      this.bodyModels.set(b.id, m);
    }
    for (const [id, m] of this.bodyModels) {
      if (!bodyIds.has(id)) {
        this.scene.remove(m.group);
        m.dispose();
        this.bodyModels.delete(id);
      }
    }

    this.updateTaskMarkers(snapshot);
  }

  private updateTaskMarkers(snapshot: GameStateSnapshot): void {
    const tasks = snapshot.sabotage?.type === 'comms' ? [] : snapshot.you?.tasks.filter((t) => !t.done) || [];
    const key = `${snapshot.sabotage?.type || ''}:${tasks.map((t) => `${t.taskId}:${t.step}`).join('|')}`;
    if (key === this.taskMarkerKey) return;
    this.taskMarkerKey = key;

    for (const child of [...this.taskMarkerGroup.children]) {
      this.taskMarkerGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    for (const t of tasks) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.75 })
      );
      ring.position.set(t.x, 0.05, t.z);
      this.taskMarkerGroup.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8),
        new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.5 })
      );
      beam.position.set(t.x, 0.9, t.z);
      this.taskMarkerGroup.add(beam);
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
      if (snap.sabotage && you.role !== 'impostor') {
        const point = SABOTAGE_REPAIR_POINTS[snap.sabotage.type];
        if (point && Math.hypot(px - point.x, pz - point.z) <= 2.8) {
          ctx.fixSabotageType = snap.sabotage.type;
        }
      }

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
      }

      if (you.role === 'impostor' || you.role === 'engineer') {
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

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  private applyGhostLook(id: string, model: CrewmateModel, ghost: boolean): void {
    const has = this.ghostApplied.has(id);
    if (ghost === has) return;
    model.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== model.nameTagMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          m.transparent = ghost ? true : m.transparent;
          m.opacity = ghost ? 0.45 : 1;
          m.needsUpdate = true;
        });
      }
    });
    if (ghost) this.ghostApplied.add(id);
    else this.ghostApplied.delete(id);
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
    if (canMove) {
      if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;
      moveX += this.joystickVector.x;
      moveZ += this.joystickVector.y;
    } else if (Object.keys(this.keys).length) {
      // A menu/meeting took over: drop anything still "held" so nothing resumes by itself.
      this.keys = {};
    }

    const inputLen = Math.hypot(moveX, moveZ);
    let desiredVX = 0;
    let desiredVZ = 0;
    if (inputLen > 0.1) {
      const nx = moveX / Math.max(inputLen, 1);
      const nz = moveZ / Math.max(inputLen, 1);
      const yaw = this.cameraController.angleH;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const speed = BASE_PLAYER_SPEED * this.playerSpeedMultiplier;
      desiredVX = (nx * cos + nz * sin) * speed;
      desiredVZ = (-nx * sin + nz * cos) * speed;
    }
    const accel = inputLen > 0.1 ? 22 : 30;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desiredVX, accel, delta);
    this.velocity.y = THREE.MathUtils.damp(this.velocity.y, desiredVZ, accel, delta);
    if (inputLen <= 0.1 && Math.hypot(this.velocity.x, this.velocity.y) < 0.08) this.velocity.set(0, 0);

    this.isMoving = Math.hypot(this.velocity.x, this.velocity.y) > 0.3;
    if (this.isMoving) {
      // Sub-step the collision so a slow frame can never carry the player through a wall.
      const stepX = this.velocity.x * delta;
      const stepZ = this.velocity.y * delta;
      const steps = Math.max(1, Math.ceil(Math.hypot(stepX, stepZ) / 0.25));
      for (let i = 0; i < steps; i++) {
        let tx = this.localPos.x + stepX / steps;
        let tz = this.localPos.z + stepZ / steps;
        if (meAlive) {
          const r = resolveWallCollisions(tx, tz);
          tx = r.x;
          tz = r.z;
        }
        this.localPos.x = tx;
        this.localPos.z = tz;
      }

      // Turn smoothly toward where we are heading (shortest arc).
      const targetRot = Math.atan2(this.velocity.x, this.velocity.y);
      let dr = targetRot - this.localRotation;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      this.localRotation += dr * Math.min(1, delta * 16);

      const room = detectRoom(this.localPos.x, this.localPos.z);
      if (room !== this.currentRoom) {
        this.currentRoom = room;
        this.onRoomChangeCb?.(room);
      }
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
      localModel.updateAnimation(delta, this.isMoving, this.camera);

      const isFP = this.cameraController.mode === 'first_person';
      const hidden = isFP || inVent;
      localModel.bodyMesh.visible = !hidden;
      localModel.visorMesh.visible = !hidden;
      localModel.visorFrameMesh.visible = !hidden;
      localModel.backpackMesh.visible = !hidden;
      localModel.hatGroup.visible = !hidden;
      this.applyGhostLook(this.localPlayerId, localModel, !meAlive);
    }

    // 4. Remote players: interpolate, and hide ghosts from the living / vented impostors from everyone
    for (const [id, target] of this.remoteTargets) {
      const model = this.playerModels.get(id);
      if (!model) continue;
      const p = snap?.players[id];

      const dist = Math.hypot(model.group.position.x - target.x, model.group.position.z - target.z);
      if (dist > 20) {
        model.group.position.x = target.x;
        model.group.position.z = target.z;
      } else {
        model.group.position.x = THREE.MathUtils.damp(model.group.position.x, target.x, 14, delta);
        model.group.position.z = THREE.MathUtils.damp(model.group.position.z, target.z, 14, delta);
      }
      // Shortest-arc rotation so characters never spin the long way round.
      let dr = target.rotation - model.group.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      model.group.rotation.y += dr * Math.min(1, delta * 14);
      model.updateAnimation(delta, target.isMoving, this.camera);

      if (p) {
        model.group.visible = p.isAlive ? !p.inVent : !meAlive;
        this.applyGhostLook(id, model, !p.isAlive);
      }
    }

    // 5. Camera, light, ambience
    this.cameraController.update(delta, this.localPos, this.isMoving);
    const lightsOut = snap?.sabotage?.type === 'lights';
    this.keyLight.intensity = THREE.MathUtils.damp(this.keyLight.intensity, lightsOut ? 0.22 : 1.2, 4, delta);
    this.keyLight.position.set(this.localPos.x + 15, 30, this.localPos.z - 10);
    this.keyLight.target.position.set(this.localPos.x, 0, this.localPos.z);
    this.taskMarkerGroup.rotation.y += delta * 0.8;
    if (this.waypointGroup.visible) {
      this.waypointTime += delta;
      this.waypointRing.scale.setScalar(1 + Math.sin(this.waypointTime * 4) * 0.14);
      if (Math.hypot(this.localPos.x - this.waypointGroup.position.x, this.localPos.z - this.waypointGroup.position.z) < 1.4) {
        this.waypointGroup.visible = false;
        if (this.waypointPath) this.waypointPath.visible = false;
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

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearInput);
    window.removeEventListener('contextmenu', this.clearInput);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('resize', this.onResize);
    this.cameraController.dispose();
    this.waypointRing.geometry.dispose();
    (this.waypointRing.material as THREE.Material).dispose();
    const waypointBeam = this.waypointGroup.children[1] as THREE.Mesh;
    waypointBeam.geometry.dispose();
    (waypointBeam.material as THREE.Material).dispose();
    if (this.waypointPath) {
      this.waypointPath.geometry.dispose();
      (this.waypointPath.material as THREE.Material).dispose();
    }

    for (const model of this.playerModels.values()) model.dispose();
    for (const model of this.bodyModels.values()) model.dispose();
    this.playerModels.clear();
    this.bodyModels.clear();

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
