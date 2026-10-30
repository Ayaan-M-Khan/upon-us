/**
 * Impostor Protocol - 3D Spaceship Map (The Skeld)
 * High-fidelity 3D spaceship environment recreating The Skeld with procedural deck plating,
 * modular bulkheads, room-specific industrial props, animated consoles, bio-scanners, and deep space cosmos.
 */

import * as THREE from 'three';
import {
  CAFETERIA_TABLE_CENTER,
  MAP_CORRIDORS,
  MAP_ROOMS_DETAIL,
  MAP_VENTS,
  MAP_WALLS,
  Rect,
  SECURITY_CAMERAS,
  getRoomCenter,
  getRoomSpot,
} from '../../shared/mapData';

export class Map3D {
  public group: THREE.Group;
  public roomLights: THREE.PointLight[] = [];
  private starParticles: THREE.Points | null = null;
  private dustParticles: THREE.Points | null = null;
  private animatedProps: Array<(delta: number, elapsed: number) => void> = [];
  private elapsed: number = 0;

  // Fog of war room shrouds (conceal rooms from outside)
  private roomShrouds: Map<string, {
    group: THREE.Group;
    material: THREE.MeshBasicMaterial;
    targetOpacity: number;
    currentOpacity: number;
  }> = new Map();

  // Wall security cameras
  public wallCameraLeds: THREE.MeshBasicMaterial[] = [];
  public isCamerasBeingWatched: boolean = false;

  constructor() {
    this.group = new THREE.Group();

    this.buildFloors();
    this.buildCorridors();
    this.buildWalls();
    this.buildOuterHull();
    this.buildRoomProps();
    this.buildRoomShrouds();
    this.buildOuterSpace();
  }

  /**
   * Procedural sci-fi deck plating texture with panel bevels, corner rivets,
   * and room-specific tactical deck stencils (crosshairs, hazard stripes, medical cross, etc.).
   */
  private createFloorTexture(baseColorHex: string, roomName?: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Base floor color
      ctx.fillStyle = baseColorHex;
      ctx.fillRect(0, 0, 256, 256);

      // Sci-fi 4-quadrant deck panels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, 120, 120);
      ctx.strokeRect(132, 4, 120, 120);
      ctx.strokeRect(4, 132, 120, 120);
      ctx.strokeRect(132, 132, 120, 120);

      // Outer seam border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 252);

      // Corner rivets
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      const rivets = [
        [10, 10], [118, 10], [10, 118], [118, 118],
        [138, 10], [246, 10], [138, 118], [246, 118],
        [10, 138], [118, 138], [10, 246], [118, 246],
        [138, 138], [246, 138], [138, 246], [246, 246],
      ];
      for (const [rx, ry] of rivets) {
        ctx.fillRect(rx - 2, ry - 2, 4, 4);
      }

      // Room-specific tactical deck markings
      if (roomName === 'Storage') {
        // Yellow & Black hazard caution chevrons
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        for (let i = -100; i < 356; i += 40) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 20, 0);
          ctx.lineTo(i + 20 - 60, 256);
          ctx.lineTo(i - 60, 256);
          ctx.closePath();
          ctx.fill();
        }
      } else if (roomName === 'Medbay') {
        // Turquoise medical cross
        ctx.fillStyle = 'rgba(45, 212, 191, 0.2)';
        ctx.fillRect(116, 80, 24, 96);
        ctx.fillRect(80, 116, 96, 24);
      } else if (roomName === 'Reactor') {
        // Radiation trefoil / hazard ring
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(128, 128, 64, 0, Math.PI * 2);
        ctx.stroke();
      } else if (roomName === 'Weapons') {
        // Tactical crosshair circle
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.25)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(128, 128, 70, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(128, 40); ctx.lineTo(128, 216);
        ctx.moveTo(40, 128); ctx.lineTo(216, 128);
        ctx.stroke();
      } else if (roomName === 'Shields') {
        // Hexagonal energy node conduits
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
          const angle = (a * Math.PI) / 3;
          const hx = 128 + Math.cos(angle) * 75;
          const hy = 128 + Math.sin(angle) * 75;
          if (a === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildFloors(): void {
    const floorGroup = new THREE.Group();

    for (const room of MAP_ROOMS_DETAIL) {
      const floorTexBase = this.createFloorTexture(room.floorHex, room.name);
      room.rects.forEach((r, idx) => {
        const width = r.maxX - r.minX;
        const depth = r.maxZ - r.minZ;
        const floorTex = floorTexBase.clone();
        floorTex.needsUpdate = true;
        floorTex.repeat.set(Math.max(1, Math.round(width / 3.5)), Math.max(1, Math.round(depth / 3.5)));

        const floorMat = new THREE.MeshStandardMaterial({
          map: floorTex,
          roughness: 0.45,
          metalness: 0.35,
        });

        // The second rectangle of a chamfered room sits a hair lower to avoid z-fighting
        const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, depth), floorMat);
        floorMesh.position.set((r.minX + r.maxX) / 2, -0.15 - idx * 0.002, (r.minZ + r.maxZ) / 2);
        floorMesh.receiveShadow = true;
        floorGroup.add(floorMesh);
      });

      // Atmospheric room center point light with calibrated color from room identity
      const roomLight = new THREE.PointLight(new THREE.Color(room.color), 0.85, 20, 1.2);
      roomLight.position.set(room.labelPos.x, 2.7, room.labelPos.z);
      this.roomLights.push(roomLight);
      floorGroup.add(roomLight);
    }

    this.group.add(floorGroup);
  }

  private buildCorridors(): void {
    const corridorGroup = new THREE.Group();
    const corridorMat = new THREE.MeshStandardMaterial({
      color: 0x141b29,
      roughness: 0.5,
      metalness: 0.35,
    });

    const runnerMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.8,
    });

    for (const corr of MAP_CORRIDORS) {
      const width = corr.bounds.maxX - corr.bounds.minX;
      const depth = corr.bounds.maxZ - corr.bounds.minZ;
      const centerX = (corr.bounds.minX + corr.bounds.maxX) / 2;
      const centerZ = (corr.bounds.minZ + corr.bounds.maxZ) / 2;

      // Base corridor slab
      const corrGeo = new THREE.BoxGeometry(width, 0.28, depth);
      const corrMesh = new THREE.Mesh(corrGeo, corridorMat);
      corrMesh.position.set(centerX, -0.16, centerZ);
      corrMesh.receiveShadow = true;
      corridorGroup.add(corrMesh);

      // Recessed neon blue guidance tracks running along corridor center
      const isHorizontal = width >= depth;
      const trackGeo = isHorizontal
        ? new THREE.PlaneGeometry(width - 0.4, 0.16)
        : new THREE.PlaneGeometry(0.16, depth - 0.4);
      const trackMesh = new THREE.Mesh(trackGeo, runnerMat);
      trackMesh.rotation.x = -Math.PI / 2;
      trackMesh.position.set(centerX, 0.005, centerZ);
      corridorGroup.add(trackMesh);
    }

    this.group.add(corridorGroup);
  }

  private buildWalls(): void {
    const wallGroup = new THREE.Group();
    const wallHeight = 2.8;
    const wallThickness = 0.45;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.4,
    });

    const wallBaseTrimMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.7,
      metalness: 0.5,
    });

    const wallCapMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.5,
    });

    // Glowing cyan/amber sci-fi LED conduit running horizontally along bulkheads
    const conduitMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });

    // Overhead industrial pipes running along wall tops
    const bluePipeMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35, metalness: 0.6 });
    const orangePipeMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.35, metalness: 0.6 });

    let wallIdx = 0;
    for (const wall of MAP_WALLS) {
      wallIdx++;
      const dx = wall.x2 - wall.x1;
      const dz = wall.z2 - wall.z1;
      const length = Math.hypot(dx, dz);
      if (length < 0.01) continue;

      const angle = Math.atan2(dz, dx);
      const midX = (wall.x1 + wall.x2) / 2;
      const midZ = (wall.z1 + wall.z2) / 2;

      // 1. Main wall bulkhead
      const wallGeo = new THREE.BoxGeometry(length + wallThickness, wallHeight, wallThickness);
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(midX, wallHeight / 2, midZ);
      wallMesh.rotation.y = -angle;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      wallGroup.add(wallMesh);

      // 2. Reinforced lower baseboard trim
      const baseTrimGeo = new THREE.BoxGeometry(length + wallThickness + 0.08, 0.35, wallThickness + 0.1);
      const baseTrimMesh = new THREE.Mesh(baseTrimGeo, wallBaseTrimMat);
      baseTrimMesh.position.set(midX, 0.175, midZ);
      baseTrimMesh.rotation.y = -angle;
      wallGroup.add(baseTrimMesh);

      // 3. Top bulkhead casing
      const trimGeo = new THREE.BoxGeometry(length + wallThickness + 0.1, 0.2, wallThickness + 0.14);
      const trimMesh = new THREE.Mesh(trimGeo, wallCapMat);
      trimMesh.position.set(midX, wallHeight, midZ);
      trimMesh.rotation.y = -angle;
      wallGroup.add(trimMesh);

      // 4. Horizontal illuminated data conduit line at waist height (y = 1.35)
      if (length > 1.2) {
        const conduitGeo = new THREE.BoxGeometry(length - 0.2, 0.06, wallThickness + 0.04);
        const conduitMesh = new THREE.Mesh(conduitGeo, conduitMat);
        conduitMesh.position.set(midX, 1.35, midZ);
        conduitMesh.rotation.y = -angle;
        wallGroup.add(conduitMesh);
      }

      // 5. Overhead industrial utility pipes running along top of every 2nd wall segment
      if (length > 2.0 && wallIdx % 2 === 0) {
        const pipeMat = wallIdx % 4 === 0 ? orangePipeMat : bluePipeMat;
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, length, 12), pipeMat);
        pipe.rotation.z = Math.PI / 2;
        pipe.rotation.y = -angle;
        pipe.position.set(midX, wallHeight - 0.25, midZ);
        wallGroup.add(pipe);
      }
    }

    this.group.add(wallGroup);
  }

  private buildOuterHull(): void {
    const hullGroup = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // dark armored hull plating
      metalness: 0.8,
      roughness: 0.25,
    });
    const hullTrimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.2,
    });
    const plasmaGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
    });
    const thrusterCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });

    // 1. WEST STERN: Ion Thruster Nacelles and Glowing Blue Plasma Cones (matching Skeld reference)
    for (const zPos of [-20, 20]) {
      // Cylindrical engine cowlings at the rear of Upper & Lower Engine
      const cowling = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.1, 4.5, 24), hullTrimMat);
      cowling.rotation.z = Math.PI / 2;
      cowling.position.set(-47.5, 1.4, zPos);
      cowling.castShadow = true;
      hullGroup.add(cowling);

      // Nozzle ring
      const nozzle = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.25, 12, 28), hullMat);
      nozzle.rotation.y = Math.PI / 2;
      nozzle.position.set(-49.8, 1.4, zPos);
      hullGroup.add(nozzle);

      // Glowing blue ion plasma exhaust plume
      const plumeGeo = new THREE.ConeGeometry(2.6, 7.5, 20, 1, true);
      const plume = new THREE.Mesh(plumeGeo, plasmaGlowMat);
      plume.rotation.z = Math.PI / 2;
      plume.position.set(-53.5, 1.4, zPos);
      hullGroup.add(plume);

      // Core white-hot thrust flare
      const coreFlare = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4.0, 16, 1, true), thrusterCoreMat);
      coreFlare.rotation.z = Math.PI / 2;
      coreFlare.position.set(-51.5, 1.4, zPos);
      hullGroup.add(coreFlare);

      // Animate thruster flame pulsing
      this.animatedProps.push((_dt, elapsed) => {
        const pulse = 1.0 + Math.sin(elapsed * 12 + zPos) * 0.08;
        plume.scale.set(pulse, 1.0 + Math.sin(elapsed * 18) * 0.05, pulse);
        plasmaGlowMat.opacity = 0.75 + Math.sin(elapsed * 14) * 0.15;
      });
    }

    // West stern armor plate connecting the two engines behind Reactor
    const sternPlating = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.6, 46), hullMat);
    sternPlating.position.set(-48, 1.8, 0);
    sternPlating.receiveShadow = true;
    hullGroup.add(sternPlating);

    // 2. EAST NOSE: Navigation Starship Cockpit Nose Frame
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.3,
    });
    const noseWedge = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 4.8, 7.0, 4), noseMat);
    noseWedge.rotation.z = -Math.PI / 2;
    noseWedge.rotation.y = Math.PI / 4;
    noseWedge.position.set(55.5, 1.6, -4.0);
    hullGroup.add(noseWedge);

    // Wide panoramic cockpit glass viewport
    const cockpitGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.2),
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        metalness: 0.1,
        side: THREE.DoubleSide,
      })
    );
    cockpitGlass.rotation.y = -Math.PI / 2;
    cockpitGlass.position.set(52.2, 1.6, -4.0);
    hullGroup.add(cockpitGlass);

    // 3. DECONTAMINATION AIRLOCK ARCHES: Iconic yellow/black hazard arches between Reactor & Engines
    const archMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
    const mistMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 });

    for (const [ax, az] of [[-39, -12], [-39, 12]]) {
      // Vertical pillars
      for (const dx of [-1.8, 1.8]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.8, 0.45), archMat);
        pillar.position.set(ax + dx, 1.4, az);
        hullGroup.add(pillar);

        // Hazard yellow band
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.48), stripeMat);
        band.position.set(ax + dx, 1.8, az);
        hullGroup.add(band);
      }
      // Top overhead beam
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.4, 0.45), archMat);
      beam.position.set(ax, 2.7, az);
      hullGroup.add(beam);

      // Decontamination steam spray mist plane
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), mistMat);
      mist.position.set(ax, 1.3, az);
      hullGroup.add(mist);
    }

    this.group.add(hullGroup);
  }

  private buildRoomProps(): void {
    const propGroup = new THREE.Group();
    const T = CAFETERIA_TABLE_CENTER;

    // -------------------------------------------------------------------------
    // 1. CAFETERIA: Central Emergency Table, Button, Dining Tables & Food Counter
    // -------------------------------------------------------------------------
    // Emergency table base
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.7, 0.85, 32),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.3 })
    );
    table.position.set(T.x, 0.425, T.z);
    table.castShadow = true;
    table.receiveShadow = true;
    propGroup.add(table);

    // Glowing perimeter ring embedded in floor around emergency table
    const tablePerimeterRing = new THREE.Mesh(
      new THREE.RingGeometry(3.1, 3.3, 32),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    tablePerimeterRing.rotation.x = -Math.PI / 2;
    tablePerimeterRing.position.set(T.x, 0.01, T.z);
    propGroup.add(tablePerimeterRing);

    // Glass safety shield dome
    const glassDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.4,
        roughness: 0.1,
        metalness: 0.1,
      })
    );
    glassDome.position.set(T.x, 0.85, T.z);
    propGroup.add(glassDome);

    // Iconic Red Emergency Button
    const buttonMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xb91c1c,
      emissiveIntensity: 0.6,
      roughness: 0.25,
    });
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.25, 24), buttonMat);
    button.position.set(T.x, 0.95, T.z);
    propGroup.add(button);

    // 4 Cafeteria dining tables: Iconic round tables with cyan-blue surfaces and metal stools
    const tableTopMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // iconic vibrant blue/cyan surface from The Skeld
      metalness: 0.2,
      roughness: 0.35,
    });
    const tableRimMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // slate-grey metal protective bevel rim
      metalness: 0.7,
      roughness: 0.3,
    });
    const tablePedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.35,
    });
    const stoolSeatMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      metalness: 0.3,
      roughness: 0.45,
    });
    const stoolBaseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.4,
    });
    const trayMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
    const burgerMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });

    const tableCoords = [
      [-5.8, -22.5], [5.8, -22.5],
      [-5.8, -13.5], [5.8, -13.5],
    ];
    for (const [bx, bz] of tableCoords) {
      // Round table pedestal base
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.85, 0.7, 16), tablePedestalMat);
      pedestal.position.set(bx, 0.35, bz);
      pedestal.castShadow = true;
      propGroup.add(pedestal);

      // Protective metallic rim
      const tableRim = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.88, 0.08, 28), tableRimMat);
      tableRim.position.set(bx, 0.72, bz);
      tableRim.castShadow = true;
      propGroup.add(tableRim);

      // Cyan-blue tabletop
      const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.06, 28), tableTopMat);
      tableTop.position.set(bx, 0.76, bz);
      tableTop.receiveShadow = true;
      propGroup.add(tableTop);

      // 4 surrounding circular stools
      const stoolAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      for (const ang of stoolAngles) {
        const sx = bx + Math.cos(ang) * 2.35;
        const sz = bz + Math.sin(ang) * 2.35;
        const stoolLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.38, 8), stoolBaseMat);
        stoolLeg.position.set(sx, 0.19, sz);
        propGroup.add(stoolLeg);

        const stoolSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.08, 16), stoolSeatMat);
        stoolSeat.position.set(sx, 0.42, sz);
        stoolSeat.castShadow = true;
        propGroup.add(stoolSeat);
      }

      // Food tray on table
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.45), trayMat);
      tray.position.set(bx - 0.4, 0.80, bz - 0.2);
      propGroup.add(tray);

      const burger = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12), burgerMat);
      burger.position.set(bx - 0.4, 0.86, bz - 0.2);
      propGroup.add(burger);
    }

    // North wall food dispenser counter (accurately placed along north Cafeteria bulkhead)
    const dispenser = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 1.1, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.3 })
    );
    dispenser.position.set(0, 0.55, -24.4);
    dispenser.castShadow = true;
    propGroup.add(dispenser);

    // Food wells on counter
    for (const dx of [-1.8, -0.6, 0.6, 1.8]) {
      const well = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.06, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 })
      );
      well.position.set(dx, 1.12, -24.4);
      propGroup.add(well);
    }

    // Cafeteria Upper-Right Trash Chute
    const trashChuteCaf = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.4, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 })
    );
    trashChuteCaf.position.set(7.8, 0.7, -24.5);
    propGroup.add(trashChuteCaf);

    const trashHandleCaf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 })
    );
    trashHandleCaf.rotation.z = Math.PI / 2;
    trashHandleCaf.position.set(7.8, 0.9, -24.3);
    propGroup.add(trashHandleCaf);

    // -------------------------------------------------------------------------
    // 2. WEAPONS: Dual Heavy Lasers, Targeting Cockpit Chair & Holographic Screens
    // -------------------------------------------------------------------------
    const wpn = getRoomCenter('Weapons');

    // Dual laser cannon barrels protruding through Eastern hull into space
    const cannonMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
    const cannonGlowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    for (const dz of [-2.0, 2.0]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 3.6, 16), cannonMat);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(wpn.x + 5.2, 1.25, wpn.z + dz);
      barrel.castShadow = true;
      propGroup.add(barrel);

      const muzzleGlow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 16), cannonGlowMat);
      muzzleGlow.rotation.y = Math.PI / 2;
      muzzleGlow.position.set(wpn.x + 7.0, 1.25, wpn.z + dz);
      propGroup.add(muzzleGlow);
    }

    // Central gunner targeting chair & control station facing East
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    const seatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.4, 16), chairMat);
    seatBase.position.set(wpn.x, 0.2, wpn.z);
    propGroup.add(seatBase);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.16), chairMat);
    seatBack.position.set(wpn.x - 0.3, 0.75, wpn.z);
    propGroup.add(seatBack);

    // Dual holographic HUD targeting screens
    const hudMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    const hudScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), hudMat);
    hudScreen.position.set(wpn.x + 1.4, 1.3, wpn.z);
    hudScreen.rotation.y = -Math.PI / 2;
    propGroup.add(hudScreen);

    // -------------------------------------------------------------------------
    // 3. NAVIGATION: Rotating Holographic Star Map, Cockpit Helm & Pilot Chairs
    // -------------------------------------------------------------------------
    const nav = getRoomCenter('Navigation');

    // Central Star Map Table
    const navTable = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.6, 0.75, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
    );
    navTable.position.set(nav.x, 0.375, nav.z);
    navTable.castShadow = true;
    propGroup.add(navTable);

    // Holographic rotating celestial star globe
    const holoHedgeMat = new THREE.MeshBasicMaterial({ color: 0xec4899, wireframe: true, transparent: true, opacity: 0.85 });
    const starGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.65, 14, 10), holoHedgeMat);
    starGlobe.position.set(nav.x, 1.25, nav.z);
    propGroup.add(starGlobe);

    const orbitRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.82, 24), holoHedgeMat);
    orbitRing.rotation.x = Math.PI / 3;
    orbitRing.position.set(nav.x, 1.25, nav.z);
    propGroup.add(orbitRing);

    this.animatedProps.push((delta) => {
      starGlobe.rotation.y += delta * 0.8;
      starGlobe.rotation.x += delta * 0.3;
      orbitRing.rotation.z += delta * 0.5;
    });

    // Bow pilot steering console & twin pilot bucket seats facing East
    const helm = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.95, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.3 })
    );
    helm.position.set(nav.x + 3.2, 0.475, nav.z);
    helm.castShadow = true;
    propGroup.add(helm);

    for (const dz of [-1.2, 1.2]) {
      const pilotSeat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), chairMat);
      pilotSeat.position.set(nav.x + 2.2, 0.3, nav.z + dz);
      propGroup.add(pilotSeat);
    }

    // -------------------------------------------------------------------------
    // 4. SHIELDS: Sunk Glowing Energy Core & Shield Charging Terminals
    // -------------------------------------------------------------------------
    const shd = getRoomCenter('Shields');

    // Sunken circular shield generator core
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 });
    const shieldWell = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.15, 32), coreMat);
    shieldWell.position.set(shd.x, 0.05, shd.z);
    shieldWell.receiveShadow = true;
    propGroup.add(shieldWell);

    // Pulsing cyan forcefield rings
    const shieldRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const shieldRing1 = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 24), shieldRingMat);
    shieldRing1.rotation.x = -Math.PI / 2;
    shieldRing1.position.set(shd.x, 0.08, shd.z);
    propGroup.add(shieldRing1);

    const shieldRing2 = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 24), shieldRingMat);
    shieldRing2.rotation.x = -Math.PI / 2;
    shieldRing2.position.set(shd.x, 0.08, shd.z);
    propGroup.add(shieldRing2);

    this.animatedProps.push((delta, elapsed) => {
      shieldRing1.rotation.z += delta * 0.9;
      shieldRing2.rotation.z -= delta * 0.6;
      shieldRingMat.opacity = 0.65 + Math.sin(elapsed * 4) * 0.25;
    });

    // Wall shield power cells on South bulkhead
    const cellMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const cellGlowMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    for (const [cx, cz] of [[shd.x - 3.8, shd.z - 2], [shd.x - 3.8, shd.z], [shd.x - 3.8, shd.z + 2]]) {
      const cell = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.8), cellMat);
      cell.position.set(cx, 0.65, cz);
      cell.castShadow = true;
      propGroup.add(cell);

      const cellLight = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), cellGlowMat);
      cellLight.rotation.y = Math.PI / 2;
      cellLight.position.set(cx + 0.26, 0.75, cz);
      propGroup.add(cellLight);
    }

    // -------------------------------------------------------------------------
    // 5. COMMUNICATIONS: Server Racks & Waveform Telemetry Terminals
    // -------------------------------------------------------------------------
    const com = getRoomCenter('Communications');

    // Server racks with status lights
    const serverMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });
    const ledGreen = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const ledAmber = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    for (let i = -1.2; i <= 1.2; i += 1.2) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 1.4), serverMat);
      rack.position.set(com.x - 3.2, 1.1, com.z + i);
      rack.castShadow = true;
      propGroup.add(rack);

      // Status indicator rows
      for (let y = 0.5; y <= 1.8; y += 0.4) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.8), y % 0.8 === 0 ? ledGreen : ledAmber);
        led.position.set(com.x - 2.73, y, com.z + i);
        propGroup.add(led);
      }
    }

    // Main telemetry desk
    const commsDesk = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.85, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.3 })
    );
    commsDesk.position.set(com.x + 1.2, 0.425, com.z);
    commsDesk.castShadow = true;
    propGroup.add(commsDesk);

    // -------------------------------------------------------------------------
    // 6. STORAGE: Iconic Center Cargo Crate Stack, Fuel Tanks & Trash Compactor
    // (Matching The Skeld poster layout exactly in the center of Storage)
    // -------------------------------------------------------------------------
    const sto = getRoomCenter('Storage');
    const crateMatOlive = new THREE.MeshStandardMaterial({ color: 0x3f4a2b, roughness: 0.8 }); // Iconic olive drab green crate
    const crateMatBrown = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }); // Cargo brown crate
    const crateMatSteel = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 }); // Metal container

    // Center crate cluster stack: 6 crates bottom tier, 3 crates upper tier
    const storageCrates = [
      // Bottom tier
      [-1.1, -1.0, 0.75, 0.02, crateMatOlive, 1.5],
      [0.6, -1.0, 0.75, -0.05, crateMatBrown, 1.5],
      [-1.1, 0.6, 0.75, -0.03, crateMatSteel, 1.5],
      [0.6, 0.6, 0.75, 0.04, crateMatOlive, 1.5],
      [2.2, -0.2, 0.65, 0.12, crateMatBrown, 1.3],
      [-2.6, -0.1, 0.65, -0.08, crateMatSteel, 1.3],
      // Upper tier (stacked)
      [-0.3, -0.2, 2.15, 0.05, crateMatOlive, 1.35],
      [1.1, 0.3, 2.05, -0.06, crateMatBrown, 1.25],
      [-0.8, 0.5, 2.05, 0.08, crateMatSteel, 1.25],
    ] as const;

    for (const [cx, cz, cy, rot, mat, size] of storageCrates) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
      c.position.set(sto.x + cx, cy, sto.z + cz);
      c.rotation.y = rot;
      c.castShadow = true;
      propGroup.add(c);

      // Yellow/black hazard symbol marker on front face of container
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(size * 0.45, size * 0.45),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
      );
      decal.position.set(sto.x + cx, cy, sto.z + cz + size * 0.51);
      propGroup.add(decal);
    }

    // Cylindrical orange fuel tanks in top-left of Storage
    const fuelMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.6, roughness: 0.3 });
    const fuelCapMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
    for (const [fx, fz] of [[-5.5, 17.0], [-5.5, 18.8], [-4.2, 17.9]]) {
      const fuelTank = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.5, 16), fuelMat);
      fuelTank.position.set(fx, 0.75, fz);
      fuelTank.castShadow = true;
      propGroup.add(fuelTank);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 12), fuelCapMat);
      cap.position.set(fx, 1.55, fz);
      propGroup.add(cap);
    }

    // South wall Trash Compactor Chute with hazard chevrons and red pull lever
    const trashCompactor = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.4 })
    );
    trashCompactor.position.set(sto.x, 0.8, sto.z + 5.6);
    trashCompactor.castShadow = true;
    propGroup.add(trashCompactor);

    const compactorLever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.4, roughness: 0.3 })
    );
    compactorLever.position.set(sto.x + 0.6, 1.1, sto.z + 5.25);
    compactorLever.rotation.x = 0.4;
    propGroup.add(compactorLever);

    // -------------------------------------------------------------------------
    // 7. ELECTRICAL: Blind Corner Partition, Distributor Generator & Wire Panels
    // -------------------------------------------------------------------------
    const ele = getRoomCenter('Electrical');

    // Iconic central divider wall (the blind corner hallway in Among Us)
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 2.6, 5.6),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    divider.position.set(ele.x - 0.5, 1.3, ele.z + 0.5);
    divider.castShadow = true;
    propGroup.add(divider);

    // Yellow hazard warning stripe along divider base
    const dividerStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.3, 5.62),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 })
    );
    dividerStripe.position.set(ele.x - 0.5, 0.15, ele.z + 0.5);
    propGroup.add(dividerStripe);

    // High voltage distributor generator in top-left with copper coils
    const genMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.25 });
    const generator = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.7, 2.0), genMat);
    generator.position.set(ele.x - 4.2, 0.85, ele.z - 2.5);
    generator.castShadow = true;
    propGroup.add(generator);

    // Glowing electrical coil
    const coilMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 12, 24), coilMat);
    coil.position.set(ele.x - 4.2, 1.85, ele.z - 2.5);
    coil.rotation.x = Math.PI / 2;
    propGroup.add(coil);

    // Circuit breaker racks on East wall with hanging colored wires
    const breakerBoxMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 });
    const breaker = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.5, 3.4), breakerBoxMat);
    breaker.position.set(ele.x + 4.8, 1.25, ele.z);
    propGroup.add(breaker);

    // -------------------------------------------------------------------------
    // 8. REACTOR: Massive Fusion Core, Dual Coolant Manifolds & Airlock Arches
    // -------------------------------------------------------------------------
    const rea = getRoomCenter('Reactor');

    // Dual reactor containment columns (North & South manifolds)
    const columnMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.25 });
    for (const dz of [-4.5, 4.5]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 2.7, 24), columnMat);
      col.position.set(rea.x - 1.5, 1.35, rea.z + dz);
      col.castShadow = true;
      propGroup.add(col);

      // Warning hazard ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 8, 24), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(rea.x - 1.5, 1.35, rea.z + dz);
      propGroup.add(ring);
    }

    // Central radioactive fusion core
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 2.7, 28),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 })
    );
    core.position.set(rea.x + 1.8, 1.35, rea.z);
    core.castShadow = true;
    propGroup.add(core);

    const energyMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.14, 12, 32), energyMat);
    r1.rotation.x = Math.PI / 2;
    r1.position.set(rea.x + 1.8, 0.85, rea.z);
    propGroup.add(r1);

    const r2 = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.14, 12, 32), energyMat);
    r2.rotation.x = Math.PI / 2;
    r2.position.set(rea.x + 1.8, 1.85, rea.z);
    propGroup.add(r2);

    this.animatedProps.push((delta) => {
      r1.rotation.z += delta * 0.7;
      r2.rotation.z -= delta * 0.7;
    });

    // -------------------------------------------------------------------------
    // 9. ENGINES (Upper Engine & Lower Engine): Ion Thrusters & Plasma Chambers
    // -------------------------------------------------------------------------
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.25 });
    const plasmaGlowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    for (const name of ['Upper Engine', 'Lower Engine']) {
      const c = getRoomCenter(name);
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 4.5, 24), engineMat);
      engine.rotation.z = Math.PI / 2;
      engine.position.set(c.x, 1.5, c.z);
      engine.castShadow = true;
      propGroup.add(engine);

      // Cyan plasma exhaust intake ring
      const exhaust = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.14, 12, 24), plasmaGlowMat);
      exhaust.rotation.y = Math.PI / 2;
      exhaust.position.set(c.x - 2.25, 1.5, c.z);
      propGroup.add(exhaust);
    }

    // -------------------------------------------------------------------------
    // 10. SECURITY: CCTV Surveillance Bank & Security Desk
    // -------------------------------------------------------------------------
    const sec = getRoomCenter('Security');

    const secDesk = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.85, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.35 })
    );
    secDesk.position.set(sec.x - 0.8, 0.425, sec.z - 2.2);
    secDesk.castShadow = true;
    propGroup.add(secDesk);

    // 4 CCTV Camera Monitors (showing the 4 ship corridors)
    const monitorMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    for (const [mx, mz] of [[-0.9, -0.1], [-0.3, -0.1], [0.3, -0.1], [0.9, -0.1]]) {
      const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.36), monitorMat);
      mon.position.set(sec.x - 0.8 + mx, 1.15, sec.z - 2.2 + mz);
      mon.rotation.x = -Math.PI / 8;
      propGroup.add(mon);
    }

    // -------------------------------------------------------------------------
    // 11. MEDBAY: Examination Beds, Bio-Scanner Platform with Animated Laser
    // -------------------------------------------------------------------------
    const med = getRoomCenter('Medbay');

    // 3 Medical examination beds with teal mattresses and white pillows
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 });
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
    const bedFrameMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.3 });

    // 3 Medical examination beds tucked snugly flush against East bulkhead for wide 8m+ clear passage
    for (let i = -1.8; i <= 1.8; i += 1.8) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.85), bedFrameMat);
      frame.position.set(med.x + 3.8, 0.25, med.z + i);
      frame.castShadow = true;
      propGroup.add(frame);

      const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.72), bedMat);
      mattress.position.set(med.x + 3.8, 0.55, med.z + i);
      propGroup.add(mattress);

      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.55), pillowMat);
      pillow.position.set(med.x + 4.3, 0.68, med.z + i);
      propGroup.add(pillow);
    }

    // Elevated bio-scanner circular pad
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.4, 0.15, 32),
      new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.4, roughness: 0.3 })
    );
    pad.position.set(med.x - 2.5, 0.075, med.z);
    pad.receiveShadow = true;
    propGroup.add(pad);

    const padRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 32),
      new THREE.MeshBasicMaterial({ color: 0x2dd4bf, side: THREE.DoubleSide })
    );
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.set(med.x - 2.5, 0.16, med.z);
    propGroup.add(padRing);

    // Animated vertical laser scan beam
    const scanBeamMat = new THREE.MeshBasicMaterial({
      color: 0x2dd4bf,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const scanBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 24), scanBeamMat);
    scanBeam.position.set(med.x - 2.5, 0.8, med.z);
    propGroup.add(scanBeam);

    this.animatedProps.push((_delta, elapsed) => {
      scanBeam.position.y = 0.3 + Math.abs(Math.sin(elapsed * 2.5)) * 1.4;
      scanBeamMat.opacity = 0.5 + Math.sin(elapsed * 6) * 0.25;
    });

    // -------------------------------------------------------------------------
    // 12. O2: Life-Support Hydroponic Greenhouse Dome & Oxygen Tanks
    // -------------------------------------------------------------------------
    const o2 = getRoomCenter('O2');

    // Central cylindrical glass greenhouse with alien flora
    const domeBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.4, 0.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x14532d, metalness: 0.4, roughness: 0.4 })
    );
    domeBase.position.set(o2.x, 0.2, o2.z);
    domeBase.castShadow = true;
    propGroup.add(domeBase);

    const domeGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 1.8, 24),
      new THREE.MeshPhysicalMaterial({ color: 0x4ade80, transparent: true, opacity: 0.35, roughness: 0.1 })
    );
    domeGlass.position.set(o2.x, 1.2, o2.z);
    propGroup.add(domeGlass);

    // Alien foliage trunk & leaves
    const foliage = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8, emissive: 0x052e16 })
    );
    foliage.position.set(o2.x, 1.3, o2.z);
    propGroup.add(foliage);

    // Wall oxygen cylinder tanks
    const o2TankMat = new THREE.MeshStandardMaterial({ color: 0x059669, metalness: 0.6, roughness: 0.3 });
    for (const [tx, tz] of [[o2.x - 2.8, o2.z - 1.5], [o2.x - 2.8, o2.z + 1.5]]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 16), o2TankMat);
      tank.position.set(tx, 0.9, tz);
      tank.castShadow = true;
      propGroup.add(tank);
    }

    // -------------------------------------------------------------------------
    // 13. ADMIN: Tactical Green Conference Table & Burgundy Carpet
    // -------------------------------------------------------------------------
    const adm = getRoomCenter('Admin');

    // Burgundy carpet floor inlay
    const carpetMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.85 });
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 4.4), carpetMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(adm.x, 0.008, adm.z);
    carpet.receiveShadow = true;
    propGroup.add(carpet);

    // Iconic green tactical conference table
    const tableBaseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    const tableTopMatGreen = new THREE.MeshStandardMaterial({ color: 0x059669, metalness: 0.25, roughness: 0.4 });

    const adminTableBase = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.65, 2.2), tableBaseMat);
    adminTableBase.position.set(adm.x, 0.325, adm.z);
    adminTableBase.castShadow = true;
    propGroup.add(adminTableBase);

    const adminTableTop = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 2.4), tableTopMatGreen);
    adminTableTop.position.set(adm.x, 0.71, adm.z);
    adminTableTop.castShadow = true;
    propGroup.add(adminTableTop);

    // Holographic ship schematic display
    const holo = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 1.8),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    holo.rotation.x = -Math.PI / 2;
    holo.position.set(adm.x, 0.78, adm.z);
    propGroup.add(holo);

    // Card swipe terminal on table edge
    const cardSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.06, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 })
    );
    cardSlot.position.set(adm.x, 0.79, adm.z + 1.1);
    propGroup.add(cardSlot);

    // -------------------------------------------------------------------------
    // 14. DEDICATED 3D TASK STATIONS: Distinctive interactable objects for each task
    // -------------------------------------------------------------------------
    for (const room of MAP_ROOMS_DETAIL) {
      for (let spot = 0; spot < 4; spot++) {
        const p = getRoomSpot(room.name, spot);
        this.buildTaskStation(room.name, spot, p.x, p.z, propGroup);
      }
    }

    // -------------------------------------------------------------------------
    // 15. VENT GRATES: High-tech angled louvers with subtle interior glow
    // -------------------------------------------------------------------------
    const ventBaseMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.8, roughness: 0.3 });
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 });
    const ventGlowMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.4 });

    for (const v of MAP_VENTS) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.3), ventBaseMat);
      base.position.set(v.x, 0.05, v.z);
      propGroup.add(base);

      // Subtle under-grate ambient glow
      const ventGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), ventGlowMat);
      ventGlow.rotation.x = -Math.PI / 2;
      ventGlow.position.set(v.x, 0.06, v.z);
      propGroup.add(ventGlow);

      for (let i = -2; i <= 2; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.08), slatMat);
        slat.position.set(v.x, 0.12, v.z + i * 0.22);
        propGroup.add(slat);
      }
    }

    // 16. Physical Wall Security Cameras with blinking red recording indicators
    this.buildWallCameras(propGroup);

    this.group.add(propGroup);
  }

  private buildOuterSpace(): void {
    const spaceGroup = new THREE.Group();

    // 1. Deep Space Starfield with multi-colored stars
    const starCount = 2400;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const palette = [
      new THREE.Color(0xffffff), // Bright white
      new THREE.Color(0x93c5fd), // Ice blue
      new THREE.Color(0xfde047), // Warm amber
      new THREE.Color(0xc084fc), // Violet
    ];

    for (let i = 0; i < starCount; i++) {
      const idx = i * 3;
      const radius = 120 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;

      positions[idx] = radius * Math.cos(phi) * Math.cos(theta);
      positions[idx + 1] = radius * Math.sin(phi);
      positions[idx + 2] = radius * Math.cos(phi) * Math.sin(theta);

      const col = palette[Math.floor(Math.random() * palette.length)];
      colors[idx] = col.r;
      colors[idx + 1] = col.g;
      colors[idx + 2] = col.b;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.75,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      fog: false,
    });

    this.starParticles = new THREE.Points(starGeo, starMat);
    spaceGroup.add(this.starParticles);

    // 2. Distant Cosmic Nebula Clouds (purple/magenta haze)
    const nebulaCount = 600;
    const nebPositions = new Float32Array(nebulaCount * 3);
    const nebColors = new Float32Array(nebulaCount * 3);
    const nebCol1 = new THREE.Color(0x7e22ce); // Purple
    const nebCol2 = new THREE.Color(0x0284c7); // Deep Cyan

    for (let i = 0; i < nebulaCount; i++) {
      const idx = i * 3;
      const dist = 140 + Math.random() * 50;
      const angle = 0.5 + (Math.random() - 0.5) * 1.2;
      const elevation = -0.2 + (Math.random() - 0.5) * 0.8;

      nebPositions[idx] = dist * Math.cos(elevation) * Math.cos(angle);
      nebPositions[idx + 1] = dist * Math.sin(elevation) + (Math.random() - 0.5) * 20;
      nebPositions[idx + 2] = dist * Math.cos(elevation) * Math.sin(angle);

      const c = Math.random() > 0.5 ? nebCol1 : nebCol2;
      nebColors[idx] = c.r;
      nebColors[idx + 1] = c.g;
      nebColors[idx + 2] = c.b;
    }

    const nebGeo = new THREE.BufferGeometry();
    nebGeo.setAttribute('position', new THREE.BufferAttribute(nebPositions, 3));
    nebGeo.setAttribute('color', new THREE.BufferAttribute(nebColors, 3));

    const nebMat = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      fog: false,
      blending: THREE.AdditiveBlending,
    });

    const nebula = new THREE.Points(nebGeo, nebMat);
    spaceGroup.add(nebula);

    // 3. Giant Distant Ringed Gas Giant Planet visible in the viewport background
    const planetGroup = new THREE.Group();
    planetGroup.position.set(130, 35, -110);

    const planetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(18, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0x4c1d95,
        roughness: 0.8,
        emissive: 0x2e1065,
        emissiveIntensity: 0.3,
      })
    );
    planetGroup.add(planetMesh);

    // Planetary rings
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(24, 38, 32),
      new THREE.MeshBasicMaterial({
        color: 0x818cf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      })
    );
    ringMesh.rotation.x = Math.PI / 2.8;
    ringMesh.rotation.y = Math.PI / 6;
    planetGroup.add(ringMesh);

    spaceGroup.add(planetGroup);

    // 4. Subtle Cosmic Dust / Micro-Meteorites drifting past the ship hull
    const dustCount = 300;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i += 3) {
      dustPositions[i] = (Math.random() - 0.5) * 140;
      dustPositions[i + 1] = Math.random() * 20 - 5;
      dustPositions[i + 2] = (Math.random() - 0.5) * 100;
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.4,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    this.dustParticles = new THREE.Points(dustGeo, dustMat);
    spaceGroup.add(this.dustParticles);

    this.group.add(spaceGroup);
  }

  /**
   * Builds distinct, tactile 3D interactable task station models corresponding to each task type.
   */
  private buildTaskStation(roomName: string, spot: number, x: number, z: number, propGroup: THREE.Group): void {
    const stationGroup = new THREE.Group();
    stationGroup.position.set(x, 0, z);

    const metalDark = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.35 });
    const metalTrim = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
    const screenCyan = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const screenGreen = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const screenAmber = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    // 1. FIX WIRING: Admin (spot 3), Electrical (spot 1), Storage (spot 0)
    if (
      (roomName === 'Admin' && spot === 3) ||
      (roomName === 'Electrical' && spot === 1) ||
      (roomName === 'Storage' && spot === 0)
    ) {
      // Junction box body
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.35), metalDark);
      box.position.y = 0.475;
      box.castShadow = true;
      stationGroup.add(box);

      // Angled open access door
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.05), metalTrim);
      door.position.set(0.45, 0.475, 0.22);
      door.rotation.y = 0.8;
      stationGroup.add(door);

      // 4 colored wires spanning from left to right terminals
      const wireColors = [0xef4444, 0x3b82f6, 0xeab308, 0xec4899];
      for (let i = 0; i < 4; i++) {
        const wireMat = new THREE.MeshStandardMaterial({ color: wireColors[i], roughness: 0.5 });
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.65, 10), wireMat);
        wire.rotation.z = Math.PI / 2;
        wire.position.set(0, 0.2 + i * 0.18, 0.12);
        stationGroup.add(wire);

        // Terminal contact screws
        const screwMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 });
        for (const dx of [-0.34, 0.34]) {
          const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8), screwMat);
          screw.rotation.x = Math.PI / 2;
          screw.position.set(dx, 0.2 + i * 0.18, 0.18);
          stationGroup.add(screw);
        }
      }

      // Amber warning light on top
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), screenAmber);
      led.position.set(0, 0.98, 0);
      stationGroup.add(led);
    }
    // 2. SWIPE CARD: Admin (spot 0)
    else if (roomName === 'Admin' && spot === 0) {
      // Pedestal stand
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.65), metalDark);
      pedestal.position.y = 0.45;
      pedestal.castShadow = true;
      stationGroup.add(pedestal);

      // Angled scanner top panel
      const scannerTop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.6), metalTrim);
      scannerTop.position.set(0, 0.92, 0);
      scannerTop.rotation.x = -0.25;
      stationGroup.add(scannerTop);

      // Glowing green card swipe channel slot
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.12), screenGreen);
      slot.position.set(0, 0.95, 0.05);
      slot.rotation.x = -0.25;
      stationGroup.add(slot);

      // Keypad buttons
      const keypad = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0x64748b }));
      keypad.position.set(-0.16, 0.95, -0.12);
      keypad.rotation.x = -Math.PI / 2 - 0.25;
      stationGroup.add(keypad);
    }
    // 3. DOWNLOAD / UPLOAD DATA: Weapons (spot 0), Admin (spot 1)
    else if ((roomName === 'Weapons' && spot === 0) || (roomName === 'Admin' && spot === 1)) {
      // Server terminal
      const server = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.15, 0.65), metalDark);
      server.position.y = 0.575;
      server.castShadow = true;
      stationGroup.add(server);

      // Curved screen
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.45), screenCyan);
      screen.position.set(0, 0.85, 0.33);
      stationGroup.add(screen);

      // Floating holographic data packet symbol
      const holoDiskMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.8 });
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16), holoDiskMat);
      disk.position.set(0, 1.4, 0);
      stationGroup.add(disk);

      this.animatedProps.push((delta) => {
        disk.rotation.y += delta * 1.5;
      });
    }
    // 4. FUEL ENGINES: Storage (spot 1), Upper Engine (spot 0), Lower Engine (spot 3)
    else if (
      (roomName === 'Storage' && spot === 1) ||
      (roomName === 'Upper Engine' && spot === 0) ||
      (roomName === 'Lower Engine' && spot === 3)
    ) {
      // Heavy fuel station base
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.65), new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.5, roughness: 0.4 }));
      base.position.y = 0.4;
      base.castShadow = true;
      stationGroup.add(base);

      // Transparent vertical fuel level tube
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.6, 16),
        new THREE.MeshPhysicalMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.6, roughness: 0.1 })
      );
      tube.position.set(-0.2, 0.9, 0.15);
      stationGroup.add(tube);

      // Brass pressure gauge
      const gauge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.25 })
      );
      gauge.rotation.x = Math.PI / 2;
      gauge.position.set(0.18, 0.95, 0.3);
      stationGroup.add(gauge);

      // Coiled fuel hose
      const hose = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.04, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
      );
      hose.position.set(0.2, 0.45, 0.34);
      stationGroup.add(hose);
    }
    // 5. CLEAR ASTEROIDS: Weapons (spot 3)
    else if (roomName === 'Weapons' && spot === 3) {
      // Console
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.7), metalDark);
      base.position.y = 0.425;
      stationGroup.add(base);

      // Green radar sweep display
      const radar = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), screenGreen);
      radar.position.set(0, 0.75, 0.36);
      stationGroup.add(radar);

      // Dual flight control sticks
      const stickMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
      for (const dx of [-0.26, 0.26]) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 8), stickMat);
        stick.rotation.x = -0.3;
        stick.position.set(dx, 0.98, 0.2);
        stationGroup.add(stick);
      }
    }
    // 6. PRIME SHIELDS: Shields (spot 1)
    else if (roomName === 'Shields' && spot === 1) {
      // Octagonal shields matrix console
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 0.85, 8), metalDark);
      base.position.y = 0.425;
      stationGroup.add(base);

      // 7 Honeycomb shield cell pads
      const cellMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        const cell = new THREE.Mesh(new THREE.CircleGeometry(0.09, 6), cellMat);
        cell.rotation.x = -Math.PI / 2;
        cell.position.set(Math.cos(ang) * 0.32, 0.86, Math.sin(ang) * 0.32);
        stationGroup.add(cell);
      }
      const centerCell = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), cellMat);
      centerCell.rotation.x = -Math.PI / 2;
      centerCell.position.set(0, 0.86, 0);
      stationGroup.add(centerCell);
    }
    // 7. UNLOCK MANIFOLDS / START REACTOR: Reactor (spot 1 & 3)
    else if (roomName === 'Reactor' && (spot === 1 || spot === 3)) {
      const consoleBase = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.55), metalDark);
      consoleBase.position.y = 0.475;
      stationGroup.add(consoleBase);

      // Glowing keypad grid
      const padMat = new THREE.MeshBasicMaterial({ color: spot === 1 ? 0xef4444 : 0x38bdf8 });
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const key = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), padMat);
          key.position.set(-0.16 + c * 0.16, 0.75 - r * 0.15, 0.28);
          stationGroup.add(key);
        }
      }
    }
    // 8. SUBMIT SCAN / INSPECT SAMPLE: Medbay (spot 0, 1, 2)
    else if (roomName === 'Medbay') {
      if (spot === 2) {
        // Bio-scan pad
        const scanPlate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.7, 0.75, 0.12, 24),
          new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.5, roughness: 0.3 })
        );
        scanPlate.position.y = 0.06;
        stationGroup.add(scanPlate);

        const scanRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 24), screenGreen);
        scanRing.rotation.x = -Math.PI / 2;
        scanRing.position.y = 0.13;
        stationGroup.add(scanRing);
      } else {
        // Centrifuge / sample station
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.6), metalTrim);
        bench.position.y = 0.425;
        stationGroup.add(bench);

        // Rotating test tube carousel
        const carousel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16),
          new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6, roughness: 0.3 })
        );
        carousel.position.set(0, 0.92, 0);
        stationGroup.add(carousel);

        // Test tubes
        const reagentColors = [0xef4444, 0x3b82f6, 0x10b981];
        for (let i = 0; i < 3; i++) {
          const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8),
            new THREE.MeshBasicMaterial({ color: reagentColors[i] })
          );
          const a = (i * Math.PI * 2) / 3;
          tube.position.set(Math.cos(a) * 0.12, 0.99, Math.sin(a) * 0.12);
          stationGroup.add(tube);
        }
      }
    }
    // 9. CLEAN O2 FILTER: O2 (spot 2)
    else if (roomName === 'O2' && spot === 2) {
      const duct = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 0.5), metalDark);
      duct.position.y = 0.475;
      stationGroup.add(duct);

      // Acrylic inspection window with leaf debris
      const windowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.45),
        new THREE.MeshPhysicalMaterial({ color: 0x86efac, transparent: true, opacity: 0.5, roughness: 0.1 })
      );
      windowMesh.position.set(0, 0.65, 0.26);
      stationGroup.add(windowMesh);
    }
    // 10. EMPTY GARBAGE: Cafeteria (spot 1), Storage (spot 3)
    else if ((roomName === 'Cafeteria' && spot === 1) || (roomName === 'Storage' && spot === 3)) {
      const chute = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.45), metalDark);
      chute.position.y = 0.6;
      stationGroup.add(chute);

      // Big red pull-down mechanical lever
      const leverBase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.1), metalTrim);
      leverBase.position.set(0.3, 0.85, 0.26);
      stationGroup.add(leverBase);

      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 })
      );
      handle.rotation.z = Math.PI / 4;
      handle.position.set(0.35, 0.95, 0.28);
      stationGroup.add(handle);
    }
    // 11. ALIGN ENGINE OUTPUT: Upper Engine (spot 3), Lower Engine (spot 1)
    else if (roomName.includes('Engine') && (spot === 1 || spot === 3)) {
      const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.55), metalDark);
      consoleMesh.position.y = 0.45;
      stationGroup.add(consoleMesh);

      // Laser alignment crosshair screen
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.4), screenCyan);
      screen.position.set(0, 0.65, 0.28);
      stationGroup.add(screen);

      // Throttle slider knob
      const knob = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 })
      );
      knob.position.set(0.25, 0.7, 0.3);
      stationGroup.add(knob);
    }
    // 12. CALIBRATE DISTRIBUTOR / DIVERT POWER: Electrical (spot 2, 3), Weapons (spot 1)
    else if ((roomName === 'Electrical' && (spot === 2 || spot === 3)) || (roomName === 'Weapons' && spot === 1)) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.5), metalDark);
      panel.position.y = 0.525;
      stationGroup.add(panel);

      // 3 Calibration dials
      const dialMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      for (let d = 0; d < 3; d++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.11, 16), dialMat);
        ring.position.set(-0.2 + d * 0.2, 0.75, 0.26);
        stationGroup.add(ring);
      }
    }
    // 13. CHART COURSE / STABILIZE STEERING: Navigation (spot 0, 2)
    else if (roomName === 'Navigation' && (spot === 0 || spot === 2)) {
      const navDesk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.6), metalTrim);
      navDesk.position.y = 0.425;
      stationGroup.add(navDesk);

      const starChart = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), screenCyan);
      starChart.rotation.x = -0.3;
      starChart.position.set(0, 0.75, 0.2);
      stationGroup.add(starChart);
    }
    // 14. DEFAULT STANDARD INTERACTIVE WORKSTATION
    else {
      const consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.45), metalDark);
      consoleMesh.position.y = 0.475;
      consoleMesh.castShadow = true;
      stationGroup.add(consoleMesh);

      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), screenCyan);
      screen.position.set(0, 0.65, 0.23);
      stationGroup.add(screen);
    }

    propGroup.add(stationGroup);
  }

  private createShroudTexture(roomName: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Dark frosted occluder background
      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, 256, 256);

      // Subtle cybernetic tactical grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 256; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }

      // Vignette border
      const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
      grad.addColorStop(0, 'rgba(6, 8, 20, 0.92)');
      grad.addColorStop(1, 'rgba(2, 3, 8, 1.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      // Room name tactical badge in center
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.font = 'bold 20px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`[ ${roomName.toUpperCase()} ]`, 128, 128);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildRoomShrouds(): void {
    const shroudGroup = new THREE.Group();
    const shroudHeight = 2.65; // Covers full height of room from floor (0) to top of bulkhead walls (2.65)

    for (const r of MAP_ROOMS_DETAIL) {
      const roomGroup = new THREE.Group();
      const shroudMat = new THREE.MeshBasicMaterial({
        color: 0x060814,
        transparent: true,
        opacity: 0.98,
        depthWrite: true,
        side: THREE.FrontSide,
      });

      for (const b of r.rects) {
        const w = b.maxX - b.minX;
        const d = b.maxZ - b.minZ;
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;

        // Volumetric 3D Box covering entire room space
        const geo = new THREE.BoxGeometry(w, shroudHeight, d);
        const mesh = new THREE.Mesh(geo, shroudMat);
        mesh.position.set(cx, shroudHeight / 2, cz);
        mesh.renderOrder = 250;
        roomGroup.add(mesh);
      }

      shroudGroup.add(roomGroup);
      this.roomShrouds.set(r.name, {
        group: roomGroup,
        material: shroudMat,
        targetOpacity: 0.98,
        currentOpacity: 0.98,
      });
    }

    this.group.add(shroudGroup);
  }

  private buildWallCameras(propGroup: THREE.Group): void {
    const camMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.1 });

    for (const cam of SECURITY_CAMERAS) {
      const camGroup = new THREE.Group();
      camGroup.position.set(cam.x, 2.3, cam.z);

      // Camera casing
      const casing = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.24, 0.45), camMat);
      camGroup.add(casing);

      // Lens cylinder
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 16), lensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.z = 0.24;
      camGroup.add(lens);

      // Pulsing red recording LED
      const ledMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), ledMat);
      led.position.set(0.12, 0.08, 0.24);
      camGroup.add(led);
      this.wallCameraLeds.push(ledMat);

      // Mount bracket
      const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), camMat);
      bracket.position.set(0, 0.2, -0.1);
      camGroup.add(bracket);

      camGroup.lookAt(cam.lookAt.x, 1.2, cam.lookAt.z);
      propGroup.add(camGroup);
    }
  }

  public setRoomVisibility(currentRoom: string, isGhost: boolean, cameraActiveZone?: Rect, playerPos?: { x: number; z: number }): void {
    const PEEK_RADIUS = 4.8; // Distance around character to peek into rooms
    for (const [name, shroud] of this.roomShrouds) {
      if (isGhost) {
        // Ethereal ghosts see through all walls and roofs
        shroud.targetOpacity = 0.12;
      } else if (name === currentRoom) {
        // You are inside this room - fully transparent view!
        shroud.targetOpacity = 0.0;
      } else {
        // Check if camera feed is viewing this room
        let inCamView = false;
        if (cameraActiveZone) {
          const r = MAP_ROOMS_DETAIL.find((m) => m.name === name);
          if (r) {
            inCamView = r.rects.some(
              (b) =>
                !(b.maxX < cameraActiveZone.minX || b.minX > cameraActiveZone.maxX ||
                  b.maxZ < cameraActiveZone.minZ || b.minZ > cameraActiveZone.maxZ)
            );
          }
        }
        if (inCamView) {
          shroud.targetOpacity = 0.0;
        } else if (playerPos) {
          // Check proximity to room boundaries (peeking radius)
          const r = MAP_ROOMS_DETAIL.find((m) => m.name === name);
          let minDist = Infinity;
          if (r) {
            for (const b of r.rects) {
              const dx = Math.max(0, b.minX - playerPos.x, playerPos.x - b.maxX);
              const dz = Math.max(0, b.minZ - playerPos.z, playerPos.z - b.maxZ);
              const dist = Math.hypot(dx, dz);
              if (dist < minDist) minDist = dist;
            }
          }
          if (minDist <= 0.2) {
            shroud.targetOpacity = 0.0;
          } else if (minDist < PEEK_RADIUS) {
            // Near doorway/entrance: smoothly fade opacity from 0.12 (at door) up to 0.98 (at 4.8m)
            const factor = minDist / PEEK_RADIUS;
            shroud.targetOpacity = THREE.MathUtils.clamp(0.12 + Math.pow(factor, 1.4) * 0.86, 0.12, 0.98);
          } else {
            // Outside peek radius: solid volumetric black box covering room completely
            shroud.targetOpacity = 0.98;
          }
        } else {
          shroud.targetOpacity = 0.98;
        }
      }
    }
  }

  public update(delta: number): void {
    this.elapsed += delta;

    if (this.starParticles) {
      this.starParticles.rotation.y += delta * 0.003;
    }

    if (this.dustParticles) {
      // Gently drift dust particles
      const pos = this.dustParticles.geometry.attributes.position;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += delta * 0.8;
        if (arr[i] > 70) arr[i] = -70;
      }
      pos.needsUpdate = true;
    }

    // Run active prop animations
    for (const anim of this.animatedProps) {
      anim(delta, this.elapsed);
    }

    // 1. Smoothly fade room shrouds
    for (const shroud of this.roomShrouds.values()) {
      if (Math.abs(shroud.currentOpacity - shroud.targetOpacity) > 0.005) {
        shroud.currentOpacity = THREE.MathUtils.damp(shroud.currentOpacity, shroud.targetOpacity, 12, delta);
        shroud.material.opacity = shroud.currentOpacity;
        shroud.material.depthWrite = shroud.currentOpacity > 0.75;
        shroud.group.visible = shroud.currentOpacity > 0.01;
      }
    }

    // 2. Blink wall camera recording LEDs when cameras are active
    if (this.wallCameraLeds.length > 0) {
      const isBlink = this.isCamerasBeingWatched && Math.sin(this.elapsed * 6) > 0;
      const ledColor = isBlink ? 0xef4444 : (this.isCamerasBeingWatched ? 0x7f1d1d : 0x334155);
      for (const ledMat of this.wallCameraLeds) {
        ledMat.color.setHex(ledColor);
      }
    }
  }
}
