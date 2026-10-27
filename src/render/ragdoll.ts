/**
 * Impostor Protocol - 3D Ragdoll Death Animation & Corpse Models
 * Features kinematic trajectory toss, splitting upper/lower torso, central bone extrusion,
 * bouncy ragdoll impact, cartoon blood splatter physics, and tactical 3D discovery beacons.
 */

import * as THREE from 'three';
import { PLAYER_COLORS } from '../../shared/constants';

/**
 * Authentic half-bean corpse model with severed cross-section and protruding vertebra bone.
 */
export class CorpseModel {
  public group: THREE.Group;
  public colorId: string;
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  constructor(colorId: string = 'red', rotationAngle: number = 0) {
    this.colorId = colorId;
    this.group = new THREE.Group();

    const colorConfig = PLAYER_COLORS.find((c) => c.id === colorId) || PLAYER_COLORS[0];
    const baseColor = new THREE.Color(colorConfig.hex);

    // 1. Lower Torso (Severed Half Bean)
    const lowerBodyGeo = new THREE.CylinderGeometry(0.48, 0.44, 0.45, 16);
    const lowerBodyMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.6,
      metalness: 0.1,
    });
    this.geometries.push(lowerBodyGeo);
    this.materials.push(lowerBodyMat);

    const lowerBodyMesh = new THREE.Mesh(lowerBodyGeo, lowerBodyMat);
    lowerBodyMesh.position.y = 0.25;
    lowerBodyMesh.castShadow = true;
    lowerBodyMesh.receiveShadow = true;
    this.group.add(lowerBodyMesh);

    // Rounded bottom cap
    const bottomCapGeo = new THREE.SphereGeometry(0.44, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    this.geometries.push(bottomCapGeo);
    const bottomCapMesh = new THREE.Mesh(bottomCapGeo, lowerBodyMat);
    bottomCapMesh.position.y = 0.05;
    this.group.add(bottomCapMesh);

    // 2. Severed Flesh Cross-Section Disc
    const fleshGeo = new THREE.CircleGeometry(0.46, 16);
    const fleshMat = new THREE.MeshStandardMaterial({
      color: 0x881337, // Deep crimson flesh
      roughness: 0.85,
    });
    this.geometries.push(fleshGeo);
    this.materials.push(fleshMat);

    const fleshMesh = new THREE.Mesh(fleshGeo, fleshMat);
    fleshMesh.rotation.x = -Math.PI / 2;
    fleshMesh.position.y = 0.476;
    this.group.add(fleshMesh);

    // Inner bone ring border
    const fleshRingGeo = new THREE.RingGeometry(0.12, 0.22, 16);
    const fleshRingMat = new THREE.MeshBasicMaterial({ color: 0x991b1b });
    this.geometries.push(fleshRingGeo);
    this.materials.push(fleshRingMat);
    const fleshRingMesh = new THREE.Mesh(fleshRingGeo, fleshRingMat);
    fleshRingMesh.rotation.x = -Math.PI / 2;
    fleshRingMesh.position.y = 0.478;
    this.group.add(fleshRingMesh);

    // 3. Iconic Protruding Central Vertebra Bone
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // Pristine bone white
      roughness: 0.35,
      metalness: 0.05,
    });
    this.materials.push(boneMat);

    // Bone shaft
    const boneShaftGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.5, 12);
    this.geometries.push(boneShaftGeo);
    const boneShaft = new THREE.Mesh(boneShaftGeo, boneMat);
    boneShaft.position.set(0, 0.7, 0);
    boneShaft.castShadow = true;
    this.group.add(boneShaft);

    // Bone double-sphere condyle head (the classic cartoon bone shape)
    const condyleGeo = new THREE.SphereGeometry(0.075, 10, 10);
    this.geometries.push(condyleGeo);

    const condyleL = new THREE.Mesh(condyleGeo, boneMat);
    condyleL.position.set(-0.055, 0.94, 0);
    this.group.add(condyleL);

    const condyleR = new THREE.Mesh(condyleGeo, boneMat);
    condyleR.position.set(0.055, 0.94, 0);
    this.group.add(condyleR);

    // 4. Severed Lower Legs (Splayed Out Flat)
    const legGeo = new THREE.CapsuleGeometry(0.16, 0.28, 10, 10);
    const legMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorConfig.hex).multiplyScalar(0.92),
      roughness: 0.7,
    });
    this.geometries.push(legGeo);
    this.materials.push(legMat);

    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(0.15, 0.12, 0.3);
    legL.rotation.set(Math.PI / 2.2, 0.3, 0);
    legL.castShadow = true;
    this.group.add(legL);

    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.15, 0.12, -0.3);
    legR.rotation.set(Math.PI / 2.2, -0.3, 0);
    legR.castShadow = true;
    this.group.add(legR);

    // 5. Contact Shadow
    const shadowGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.geometries.push(shadowGeo);
    this.materials.push(shadowMat);

    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.015;
    this.group.add(shadowMesh);

    // Slight resting tilt
    this.group.rotation.y = rotationAngle;
    this.group.rotation.z = -0.12;
  }

  public dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

interface RagdollParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  splatted: boolean;
}

/**
 * Dynamic 3D ragdoll death animation.
 * Simulates physical impulse toss, tumbling split, bone emergence, bounce, and blood splatter.
 */
export class RagdollDeathAnimation {
  public group: THREE.Group;
  public isFinished: boolean = false;

  private upperTorso: THREE.Group;
  private lowerCorpse: CorpseModel;
  private particles: RagdollParticle[] = [];

  // Upper torso kinematics
  private upperPos: THREE.Vector3;
  private upperVel: THREE.Vector3;
  private upperRot: THREE.Euler;
  private upperRotVel: THREE.Vector3;

  private age: number = 0;
  private duration: number = 2.2;
  private settled: boolean = false;

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(
    x: number,
    z: number,
    colorId: string,
    impulseX: number = 0,
    impulseZ: number = 0
  ) {
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    const colorConfig = PLAYER_COLORS.find((c) => c.id === colorId) || PLAYER_COLORS[0];
    const baseColor = new THREE.Color(colorConfig.hex);

    // 1. Lower corpse (settling in place)
    this.lowerCorpse = new CorpseModel(colorId, Math.atan2(impulseX, impulseZ));
    this.group.add(this.lowerCorpse.group);

    // 2. Upper Torso Group (Tumbles through the air with impulse toss)
    this.upperTorso = new THREE.Group();

    // Top dome + half bean
    const upperBodyGeo = new THREE.CapsuleGeometry(0.48, 0.45, 14, 14);
    const upperBodyMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.6,
      metalness: 0.1,
    });
    this.geometries.push(upperBodyGeo);
    this.materials.push(upperBodyMat);
    const upperBodyMesh = new THREE.Mesh(upperBodyGeo, upperBodyMat);
    upperBodyMesh.position.y = 0.35;
    upperBodyMesh.castShadow = true;
    this.upperTorso.add(upperBodyMesh);

    // Severed bottom lid of upper torso (crimson)
    const upperFleshGeo = new THREE.CircleGeometry(0.46, 14);
    const upperFleshMat = new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.85 });
    this.geometries.push(upperFleshGeo);
    this.materials.push(upperFleshMat);
    const upperFleshMesh = new THREE.Mesh(upperFleshGeo, upperFleshMat);
    upperFleshMesh.rotation.x = Math.PI / 2;
    upperFleshMesh.position.y = 0.12;
    this.upperTorso.add(upperFleshMesh);

    // Visor Frame & Glass
    const visorFrameGeo = new THREE.CapsuleGeometry(0.24, 0.35, 10, 10);
    const visorFrameMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    this.geometries.push(visorFrameGeo);
    this.materials.push(visorFrameMat);
    const visorFrame = new THREE.Mesh(visorFrameGeo, visorFrameMat);
    visorFrame.rotation.x = Math.PI / 2;
    visorFrame.position.set(0.38, 0.45, 0);
    visorFrame.scale.set(1, 0.6, 1.25);
    this.upperTorso.add(visorFrame);

    const visorGlassGeo = new THREE.CapsuleGeometry(0.22, 0.33, 10, 10);
    const visorGlassMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      roughness: 0.1,
      metalness: 0.4,
      emissive: 0x083344,
      emissiveIntensity: 0.3,
    });
    this.geometries.push(visorGlassGeo);
    this.materials.push(visorGlassMat);
    const visorGlass = new THREE.Mesh(visorGlassGeo, visorGlassMat);
    visorGlass.rotation.x = Math.PI / 2;
    visorGlass.position.set(0.41, 0.45, 0);
    visorGlass.scale.set(1, 0.55, 1.2);
    this.upperTorso.add(visorGlass);

    // Backpack
    const backpackGeo = new THREE.BoxGeometry(0.35, 0.5, 0.6);
    const backpackMat = new THREE.MeshStandardMaterial({
      color: baseColor.clone().multiplyScalar(0.88),
      roughness: 0.7,
    });
    this.geometries.push(backpackGeo);
    this.materials.push(backpackMat);
    const backpackMesh = new THREE.Mesh(backpackGeo, backpackMat);
    backpackMesh.position.set(-0.38, 0.4, 0);
    backpackMesh.castShadow = true;
    this.upperTorso.add(backpackMesh);

    this.group.add(this.upperTorso);

    // Initial kinematics for upper torso
    this.upperPos = new THREE.Vector3(0, 0.7, 0);
    this.upperTorso.position.copy(this.upperPos);

    // Impulse toss physics
    const tossSpeed = Math.hypot(impulseX, impulseZ) > 0.1 ? 1.0 : 2.0;
    const normX = impulseX !== 0 ? impulseX : (Math.random() - 0.5) * 2;
    const normZ = impulseZ !== 0 ? impulseZ : (Math.random() - 0.5) * 2;
    this.upperVel = new THREE.Vector3(
      normX * tossSpeed + (Math.random() - 0.5) * 0.8,
      4.2 + Math.random() * 0.8, // upward arc
      normZ * tossSpeed + (Math.random() - 0.5) * 0.8
    );

    this.upperRot = new THREE.Euler(0, 0, 0);
    this.upperRotVel = new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 14
    );

    // 3. Blood Splatter Particles
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0x991b1b });
    this.materials.push(bloodMat);

    const bloodCount = 20;
    for (let i = 0; i < bloodCount; i++) {
      const size = 0.04 + Math.random() * 0.05;
      const pGeo = new THREE.DodecahedronGeometry(size, 0);
      this.geometries.push(pGeo);
      const pMesh = new THREE.Mesh(pGeo, bloodMat);
      pMesh.position.set(
        (Math.random() - 0.5) * 0.3,
        0.5 + Math.random() * 0.2,
        (Math.random() - 0.5) * 0.3
      );
      this.group.add(pMesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        mesh: pMesh,
        vx: Math.cos(angle) * speed + normX * 0.6,
        vy: 2.0 + Math.random() * 3.0,
        vz: Math.sin(angle) * speed + normZ * 0.6,
        splatted: false,
      });
    }
  }

  public update(dt: number): boolean {
    this.age += dt;

    // 1. Update Upper Torso Kinematics
    if (!this.settled) {
      const gravity = -14.0;
      this.upperVel.y += gravity * dt;

      this.upperPos.x += this.upperVel.x * dt;
      this.upperPos.y += this.upperVel.y * dt;
      this.upperPos.z += this.upperVel.z * dt;

      // Ground collision
      const groundY = 0.25;
      if (this.upperPos.y <= groundY) {
        this.upperPos.y = groundY;
        if (Math.abs(this.upperVel.y) > 0.8) {
          // Bounce with damping
          this.upperVel.y = -this.upperVel.y * 0.38;
          this.upperVel.x *= 0.65;
          this.upperVel.z *= 0.65;
          this.upperRotVel.multiplyScalar(0.6);
        } else {
          // Settled on ground
          this.upperVel.set(0, 0, 0);
          this.upperRotVel.set(0, 0, 0);
          this.settled = true;
        }
      }

      // Tumbling rotation
      this.upperRot.x += this.upperRotVel.x * dt;
      this.upperRot.y += this.upperRotVel.y * dt;
      this.upperRot.z += this.upperRotVel.z * dt;

      this.upperTorso.position.copy(this.upperPos);
      this.upperTorso.rotation.copy(this.upperRot);
    }

    // 2. Update Blood Splatter Particles
    const pGravity = -16.0;
    for (const p of this.particles) {
      if (p.splatted) continue;
      p.vy += pGravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      if (p.mesh.position.y <= 0.02) {
        p.mesh.position.y = 0.02;
        p.splatted = true;
        // Flatten into cartoon splatter puddle
        p.mesh.scale.set(2.2, 0.08, 2.2);
        p.mesh.rotation.x = -Math.PI / 2;
      }
    }

    // 3. Fade Upper Torso towards the end of duration (resting corpse remains)
    if (this.age > 1.4) {
      const fadeRatio = Math.max(0, 1 - (this.age - 1.4) / (this.duration - 1.4));
      this.upperTorso.scale.setScalar(Math.max(0.001, fadeRatio));
    }

    if (this.age >= this.duration) {
      this.isFinished = true;
    }

    return this.isFinished;
  }

  public dispose(): void {
    this.lowerCorpse.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/**
 * 3D Tactical Holographic Sonar Beacon spawned over a sighted dead body.
 */
export class BodyDiscoveryBeacon {
  public group: THREE.Group;
  public isFinished: boolean = false;
  private age: number = 0;
  private maxAge: number = 7.0;

  private rings: { mesh: THREE.Mesh; initialScale: number; speed: number; mat: THREE.MeshBasicMaterial }[] = [];
  private beaconPillar: THREE.Mesh;
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  constructor(x: number, z: number, colorId: string = 'red') {
    this.group = new THREE.Group();
    this.group.position.set(x, 0.05, z);

    const colorConfig = PLAYER_COLORS.find((c) => c.id === colorId) || PLAYER_COLORS[0];
    const beaconColor = new THREE.Color(colorConfig.hex);

    // 1. Vertical Hologram Light Beam
    const pillarGeo = new THREE.CylinderGeometry(0.12, 0.35, 3.2, 16);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.geometries.push(pillarGeo);
    this.materials.push(pillarMat);

    this.beaconPillar = new THREE.Mesh(pillarGeo, pillarMat);
    this.beaconPillar.position.y = 1.6;
    this.group.add(this.beaconPillar);

    // 2. Expanding Ground Sonar Wave Rings
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.RingGeometry(0.4, 0.55, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.geometries.push(ringGeo);
      this.materials.push(ringMat);

      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.03 + i * 0.01;
      this.group.add(ringMesh);

      this.rings.push({
        mesh: ringMesh,
        initialScale: 0.2 + i * 0.4,
        speed: 1.2,
        mat: ringMat,
      });
    }

    // 3. Floating Warning Diamond
    const diamondGeo = new THREE.OctahedronGeometry(0.3, 0);
    const diamondMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
    });
    this.geometries.push(diamondGeo);
    this.materials.push(diamondMat);

    const diamondMesh = new THREE.Mesh(diamondGeo, diamondMat);
    diamondMesh.position.y = 3.2;
    this.group.add(diamondMesh);
  }

  public update(dt: number): boolean {
    this.age += dt;

    // Pulse beacon pillar
    const pulse = 0.35 + Math.sin(this.age * 8) * 0.2;
    (this.beaconPillar.material as THREE.MeshBasicMaterial).opacity = pulse;

    // Expand sonar rings
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const progress = ((this.age * r.speed + i * 0.33) % 1.0);
      const scale = 0.3 + progress * 4.2;
      r.mesh.scale.set(scale, scale, 1);
      r.mat.opacity = (1 - progress) * 0.75;
    }

    if (this.age >= this.maxAge) {
      this.isFinished = true;
    }
    return this.isFinished;
  }

  public dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
