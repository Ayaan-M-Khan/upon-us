/**
 * Impostor Protocol - 3D Dropship Waiting Lobby Scene
 * Procedural spaceship waiting room, starfield, smooth third-person camera, and character sync.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { net } from '../net';
import { CrewmateModel } from './crewmateModel';
import { LobbyData, LobbyPlayer } from '../../shared/events';

export class DropshipLobbyScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private isDestroyed: boolean = false;
  private animationFrameId: number = 0;

  // Actors
  private localPlayerId: string = '';
  private playerModels: Map<string, CrewmateModel> = new Map();
  private playerTargets: Map<string, { x: number; z: number; rotation: number; isMoving: boolean }> = new Map();

  // Local movement
  private localPos: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private localRotation: number = 0;
  private isMoving: boolean = false;
  private keys: Record<string, boolean> = {};
  private joystickVector: { x: number; y: number } = { x: 0, y: 0 };
  private lastInputSendTime: number = 0;

  // Camera Orbit
  private cameraAngleH: number = 0; // Horizontal orbit
  private cameraAngleV: number = 0.45; // Vertical pitch (~25 degrees)
  private cameraDistance: number = 6.0;
  private isPointerDown: boolean = false;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;

  // Space background
  private starParticles: THREE.Points | null = null;
  private asteroids: THREE.Mesh[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060810);
    this.scene.fog = new THREE.FogExp2(0x060810, 0.035);

    // Camera
    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 100);
    this.camera.position.set(0, 4.5, 6);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // Studio Environment map
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Lighting
    this.setupLighting();

    // Build dropship interior & outer space
    this.buildDropshipInterior();
    this.buildOuterSpace();

    // Event listeners
    this.bindInputs();

    // Start render loop
    this.tick = this.tick.bind(this);
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  private setupLighting(): void {
    // Cool/warm hemisphere light
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.7);
    this.scene.add(hemiLight);

    // Key directional light with soft shadows
    const keyLight = new THREE.DirectionalLight(0xffedd5, 1.3);
    keyLight.position.set(4, 8, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    // Cockpit window glow
    const windowGlow = new THREE.PointLight(0x38bdf8, 1.2, 14);
    windowGlow.position.set(8.5, 2.5, 0);
    this.scene.add(windowGlow);

    // Interior overhead lights
    const interiorLight1 = new THREE.PointLight(0xfef08a, 0.8, 10);
    interiorLight1.position.set(-3, 3.8, 0);
    this.scene.add(interiorLight1);

    const interiorLight2 = new THREE.PointLight(0xfef08a, 0.8, 10);
    interiorLight2.position.set(3, 3.8, 0);
    this.scene.add(interiorLight2);
  }

  private buildDropshipInterior(): void {
    const dropshipGroup = new THREE.Group();

    // 1. Floor Plating (Metallic Dark Grey)
    const floorGeo = new THREE.BoxGeometry(16, 0.4, 8);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e2638,
      metalness: 0.5,
      roughness: 0.4,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    dropshipGroup.add(floor);

    // Center circular grate / waiting ring
    const ringGeo = new THREE.RingGeometry(1.6, 1.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    dropshipGroup.add(ring);

    // 2. Yellow/Black Hazard Stripes on Floor Borders
    const stripeGeo = new THREE.PlaneGeometry(15.6, 0.35);
    const stripeCanvas = document.createElement('canvas');
    stripeCanvas.width = 128;
    stripeCanvas.height = 16;
    const sCtx = stripeCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#eab308';
      sCtx.fillRect(0, 0, 128, 16);
      sCtx.fillStyle = '#18181b';
      for (let i = -16; i < 144; i += 24) {
        sCtx.beginPath();
        sCtx.moveTo(i, 0);
        sCtx.lineTo(i + 12, 16);
        sCtx.lineTo(i + 4, 16);
        sCtx.lineTo(i - 8, 0);
        sCtx.fill();
      }
    }
    const stripeTex = new THREE.CanvasTexture(stripeCanvas);
    stripeTex.wrapS = THREE.RepeatWrapping;
    stripeTex.repeat.set(16, 1);
    const stripeMat = new THREE.MeshBasicMaterial({ map: stripeTex });

    const stripeNorth = new THREE.Mesh(stripeGeo, stripeMat);
    stripeNorth.rotation.x = -Math.PI / 2;
    stripeNorth.position.set(0, 0.015, -3.75);
    dropshipGroup.add(stripeNorth);

    const stripeSouth = new THREE.Mesh(stripeGeo, stripeMat);
    stripeSouth.rotation.x = -Math.PI / 2;
    stripeSouth.position.set(0, 0.015, 3.75);
    dropshipGroup.add(stripeSouth);

    // 3. Walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x273449,
      metalness: 0.4,
      roughness: 0.5,
    });

    // North wall (Z = -4)
    const northWallGeo = new THREE.BoxGeometry(16, 4.5, 0.4);
    const northWall = new THREE.Mesh(northWallGeo, wallMat);
    northWall.position.set(0, 2.05, -4.1);
    northWall.receiveShadow = true;
    dropshipGroup.add(northWall);

    // The south wall used to stand between the camera and the crew (the camera orbits on that side),
    // which hid the player behind a grey slab. The dropship is now open on that side, like a stage.

    // West back wall (X = -8)
    const backWallGeo = new THREE.BoxGeometry(0.4, 4.5, 8);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(-8.1, 2.05, 0);
    backWall.receiveShadow = true;
    dropshipGroup.add(backWall);

    // East Cockpit Glass Viewport Frame (X = +8)
    const cockpitWallGeo = new THREE.BoxGeometry(0.5, 1.2, 8);
    const cockpitBottom = new THREE.Mesh(cockpitWallGeo, wallMat);
    cockpitBottom.position.set(8.1, 0.6, 0);
    dropshipGroup.add(cockpitBottom);

    const cockpitTop = new THREE.Mesh(cockpitWallGeo, wallMat);
    cockpitTop.position.set(8.1, 3.8, 0);
    dropshipGroup.add(cockpitTop);

    // Cockpit Window Glass
    const glassGeo = new THREE.PlaneGeometry(8, 2.2);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.2,
      depthWrite: false,
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(8.1, 2.2, 0);
    dropshipGroup.add(glass);

    // 4. Side Passenger Benches
    const benchGeo = new THREE.BoxGeometry(14, 0.45, 0.8);
    const benchMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.6,
      roughness: 0.3,
    });

    const benchNorth = new THREE.Mesh(benchGeo, benchMat);
    benchNorth.position.set(0, 0.25, -3.4);
    benchNorth.castShadow = true;
    benchNorth.receiveShadow = true;
    dropshipGroup.add(benchNorth);

    const benchSouth = new THREE.Mesh(benchGeo, benchMat);
    benchSouth.position.set(0, 0.25, 3.4);
    benchSouth.castShadow = true;
    benchSouth.receiveShadow = true;
    dropshipGroup.add(benchSouth);

    // 5. Ceiling Neon Strip Lights
    const neonGeo = new THREE.BoxGeometry(13, 0.08, 0.15);
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });

    const neonNorth = new THREE.Mesh(neonGeo, neonMat);
    neonNorth.position.set(0, 4.1, -2);
    dropshipGroup.add(neonNorth);

    const neonSouth = new THREE.Mesh(neonGeo, neonMat);
    neonSouth.position.set(0, 4.1, 2);
    dropshipGroup.add(neonSouth);

    this.scene.add(dropshipGroup);
  }

  private buildOuterSpace(): void {
    // Starfield particles
    const starGeo = new THREE.BufferGeometry();
    const starCount = 800;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      positions[i] = 12 + Math.random() * 40; // in front of the cockpit window
      positions[i + 1] = (Math.random() - 0.5) * 35;
      positions[i + 2] = (Math.random() - 0.5) * 50;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.25,
      transparent: true,
      opacity: 0.85,
    });
    this.starParticles = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starParticles);

    // Drifting Asteroids outside window
    const astMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.9,
      flatShading: true,
    });

    for (let i = 0; i < 4; i++) {
      const astGeo = new THREE.DodecahedronGeometry(1.2 + Math.random() * 1.5, 1);
      const ast = new THREE.Mesh(astGeo, astMat);
      ast.position.set(16 + i * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 16);
      this.asteroids.push(ast);
      this.scene.add(ast);
    }
  }

  // Named handlers so they can be removed on dispose, and held keys are cleared whenever focus is lost
  // (the same "stuck walking" bug the match scene had).
  private isTyping(e: Event): boolean {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }
  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTyping(e)) return;
    this.keys[e.code] = true;
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };
  private clearKeys = (): void => {
    this.keys = {};
    this.joystickVector = { x: 0, y: 0 };
    this.isPointerDown = false;
  };
  private onPointerDown = (e: PointerEvent): void => {
    this.isPointerDown = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };
  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isPointerDown) return;
    if (e.buttons === 0) {
      this.isPointerDown = false;
      return;
    }
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.cameraAngleH -= dx * 0.006;
    this.cameraAngleV = Math.max(0.1, Math.min(1.2, this.cameraAngleV + dy * 0.005));
  };
  private onPointerUp = (): void => {
    this.isPointerDown = false;
  };
  private onWheel = (e: WheelEvent): void => {
    this.cameraDistance = Math.max(3.5, Math.min(10, this.cameraDistance + e.deltaY * 0.005));
  };

  private bindInputs(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('visibilitychange', this.clearKeys);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  public setJoystick(x: number, y: number): void {
    this.joystickVector = { x, y };
  }

  public updateLobbyState(lobby: LobbyData, myId: string): void {
    this.localPlayerId = myId;

    // Synchronize player models
    const activeIds = new Set<string>();

    for (const player of lobby.players) {
      activeIds.add(player.id);
      let model = this.playerModels.get(player.id);

      if (!model) {
        model = new CrewmateModel(player.colorId, player.hatId, player.name, player.isHost);
        this.playerModels.set(player.id, model);
        this.scene.add(model.group);

        if (player.id === this.localPlayerId) {
          this.localPos.set(player.x, 0, player.z);
          model.group.position.copy(this.localPos);
        } else {
          model.group.position.set(player.x, 0, player.z);
        }
      } else {
        model.setColor(player.colorId);
        model.setHat(player.hatId);
        model.updateNameTag(player.name, player.isHost);
      }
    }

    // Remove disconnected players
    for (const [id, model] of this.playerModels) {
      if (!activeIds.has(id)) {
        this.scene.remove(model.group);
        model.dispose();
        this.playerModels.delete(id);
        this.playerTargets.delete(id);
      }
    }
  }

  public updateRemoteMovements(
    players: Record<string, { x: number; z: number; rotation: number; isMoving: boolean }>
  ): void {
    for (const [id, data] of Object.entries(players)) {
      if (id !== this.localPlayerId) {
        this.playerTargets.set(id, data);
      }
    }
  }

  private tick(): void {
    if (this.isDestroyed) return;

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();

    // 1. Process Local Movement
    let moveX = 0;
    let moveZ = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveZ -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveZ += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;

    // Add virtual joystick
    moveX += this.joystickVector.x;
    moveZ += this.joystickVector.y;

    const inputLen = Math.hypot(moveX, moveZ);
    this.isMoving = inputLen > 0.1;

    if (this.isMoving) {
      const normX = moveX / Math.max(inputLen, 1);
      const normZ = moveZ / Math.max(inputLen, 1);

      // Camera-relative movement
      const sin = Math.sin(this.cameraAngleH);
      const cos = Math.cos(this.cameraAngleH);

      const worldMoveX = normX * cos + normZ * sin;
      const worldMoveZ = -normX * sin + normZ * cos;

      const speed = 4.2; // units per second
      this.localPos.x += worldMoveX * speed * delta;
      this.localPos.z += worldMoveZ * speed * delta;

      // Dropship interior collision boundaries
      this.localPos.x = Math.max(-7.2, Math.min(7.2, this.localPos.x));
      this.localPos.z = Math.max(-3.0, Math.min(3.0, this.localPos.z));

      // Turn smoothly toward the direction of movement (shortest arc)
      let dr = Math.atan2(worldMoveX, worldMoveZ) - this.localRotation;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      this.localRotation += dr * Math.min(1, delta * 16);

      // Send input to server at ~20 Hz
      if (now - this.lastInputSendTime > 50) {
        this.lastInputSendTime = now;
        net.sendLobbyInput({
          x: this.localPos.x,
          z: this.localPos.z,
          rotation: this.localRotation,
          isMoving: true,
        });
      }
    } else if (now - this.lastInputSendTime > 150) {
      this.lastInputSendTime = now;
      net.sendLobbyInput({
        x: this.localPos.x,
        z: this.localPos.z,
        rotation: this.localRotation,
        isMoving: false,
      });
    }

    // 2. Update Local Model
    const localModel = this.playerModels.get(this.localPlayerId);
    if (localModel) {
      localModel.group.position.copy(this.localPos);
      localModel.group.rotation.y = this.localRotation;
      localModel.updateAnimation(delta, this.isMoving, this.camera);
    }

    // 3. Smoothly Interpolate Remote Players
    for (const [id, target] of this.playerTargets) {
      const model = this.playerModels.get(id);
      if (model && id !== this.localPlayerId) {
        model.group.position.x = THREE.MathUtils.damp(model.group.position.x, target.x, 14, delta);
        model.group.position.z = THREE.MathUtils.damp(model.group.position.z, target.z, 14, delta);
        model.group.rotation.y = THREE.MathUtils.damp(model.group.rotation.y, target.rotation, 14, delta);
        model.updateAnimation(delta, target.isMoving, this.camera);
      }
    }

    // 4. Update Third-Person Camera Position
    const targetLookAt = this.localPos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const camOffset = new THREE.Vector3(
      Math.sin(this.cameraAngleH) * Math.cos(this.cameraAngleV) * this.cameraDistance,
      Math.sin(this.cameraAngleV) * this.cameraDistance,
      Math.cos(this.cameraAngleH) * Math.cos(this.cameraAngleV) * this.cameraDistance
    );
    const targetCamPos = this.localPos.clone().add(camOffset);

    // Smooth camera damping
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamPos.x, 10, delta);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamPos.y, 10, delta);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamPos.z, 10, delta);
    this.camera.lookAt(targetLookAt);

    // 5. Space motion (stars and drifting asteroids)
    if (this.starParticles) {
      this.starParticles.rotation.x += delta * 0.015;
    }
    for (let i = 0; i < this.asteroids.length; i++) {
      const ast = this.asteroids[i];
      ast.rotation.x += delta * 0.2 * (i + 1);
      ast.rotation.y += delta * 0.15 * (i + 1);
      ast.position.x -= delta * (0.4 + i * 0.2);
      if (ast.position.x < 10) {
        ast.position.x = 45;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  private onResize = (): void => {
    if (!this.container || this.isDestroyed) return;
    const width = this.container.clientWidth;
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    // On desktop the crew panel covers the right ~27rem: shift the picture so the crew stays
    // centred in the free area instead of hiding behind the panel.
    const panel = width >= 768 ? 432 : 0;
    if (panel > 0) this.camera.setViewOffset(width, height, panel / 2, 0, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public dispose(): void {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animationFrameId);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    document.removeEventListener('visibilitychange', this.clearKeys);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);

    for (const model of this.playerModels.values()) {
      model.dispose();
    }
    this.playerModels.clear();

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
