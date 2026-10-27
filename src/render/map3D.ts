/**
 * Impostor Protocol - 3D Spaceship Map (The Skeld)
 * Procedural 3D rooms, walls, corridors, props, space windows, and lighting.
 */

import * as THREE from 'three';
import {
  CAFETERIA_TABLE_CENTER,
  MAP_CORRIDORS,
  MAP_ROOMS_DETAIL,
  MAP_VENTS,
  MAP_WALLS,
  getRoomCenter,
  getRoomSpot,
} from '../../shared/mapData';

export class Map3D {
  public group: THREE.Group;
  public roomLights: THREE.PointLight[] = [];
  private starParticles: THREE.Points | null = null;

  constructor() {
    this.group = new THREE.Group();

    this.buildFloors();
    this.buildCorridors();
    this.buildWalls();
    this.buildRoomProps();
    this.buildOuterSpace();
  }

  private createFloorTexture(baseColorHex: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = baseColorHex;
      ctx.fillRect(0, 0, 128, 128);

      // Subtle panel grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 126, 126);

      // Rivets in corners
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(4, 4, 3, 3);
      ctx.fillRect(121, 4, 3, 3);
      ctx.fillRect(4, 121, 3, 3);
      ctx.fillRect(121, 121, 3, 3);
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
      const width = room.bounds.maxX - room.bounds.minX;
      const depth = room.bounds.maxZ - room.bounds.minZ;
      const centerX = (room.bounds.minX + room.bounds.maxX) / 2;
      const centerZ = (room.bounds.minZ + room.bounds.maxZ) / 2;

      const floorGeo = new THREE.BoxGeometry(width, 0.3, depth);
      const floorTex = this.createFloorTexture(room.floorHex);
      floorTex.repeat.set(Math.max(1, Math.round(width / 3)), Math.max(1, Math.round(depth / 3)));

      const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.5,
        metalness: 0.3,
      });

      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.position.set(centerX, -0.15, centerZ);
      floorMesh.receiveShadow = true;
      floorGroup.add(floorMesh);

      // Glowing room center point light
      const roomLight = new THREE.PointLight(new THREE.Color(room.color), 0.7, 18);
      roomLight.position.set(centerX, 2.5, centerZ);
      this.roomLights.push(roomLight);
      floorGroup.add(roomLight);
    }

    this.group.add(floorGroup);
  }

  private buildCorridors(): void {
    const corridorMat = new THREE.MeshStandardMaterial({
      color: 0x18202f,
      roughness: 0.6,
      metalness: 0.2,
    });

    for (const corr of MAP_CORRIDORS) {
      const width = corr.bounds.maxX - corr.bounds.minX;
      const depth = corr.bounds.maxZ - corr.bounds.minZ;
      const centerX = (corr.bounds.minX + corr.bounds.maxX) / 2;
      const centerZ = (corr.bounds.minZ + corr.bounds.maxZ) / 2;

      const corrGeo = new THREE.BoxGeometry(width, 0.28, depth);
      const corrMesh = new THREE.Mesh(corrGeo, corridorMat);
      corrMesh.position.set(centerX, -0.16, centerZ);
      corrMesh.receiveShadow = true;
      this.group.add(corrMesh);
    }
  }

  private buildWalls(): void {
    const wallGroup = new THREE.Group();
    const wallHeight = 2.8;
    const wallThickness = 0.45;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x243247,
      roughness: 0.5,
      metalness: 0.3,
    });

    const wallTrimMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.7,
      metalness: 0.4,
    });

    for (const wall of MAP_WALLS) {
      const dx = wall.x2 - wall.x1;
      const dz = wall.z2 - wall.z1;
      const length = Math.hypot(dx, dz);
      if (length < 0.01) continue;

      const angle = Math.atan2(dz, dx);
      const midX = (wall.x1 + wall.x2) / 2;
      const midZ = (wall.z1 + wall.z2) / 2;

      // Main wall body
      const wallGeo = new THREE.BoxGeometry(length + wallThickness, wallHeight, wallThickness);
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(midX, wallHeight / 2, midZ);
      wallMesh.rotation.y = -angle;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      wallGroup.add(wallMesh);

      // Top Trim
      const trimGeo = new THREE.BoxGeometry(length + wallThickness + 0.1, 0.15, wallThickness + 0.1);
      const trimMesh = new THREE.Mesh(trimGeo, wallTrimMat);
      trimMesh.position.set(midX, wallHeight, midZ);
      trimMesh.rotation.y = -angle;
      wallGroup.add(trimMesh);
    }

    this.group.add(wallGroup);
  }

  private buildRoomProps(): void {
    const propGroup = new THREE.Group();
    const T = CAFETERIA_TABLE_CENTER;

    // 1. Cafeteria Emergency Table & Button
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.6, 0.85, 24),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.3 })
    );
    table.position.set(T.x, 0.425, T.z);
    table.castShadow = true;
    table.receiveShadow = true;
    propGroup.add(table);

    const glassDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45, roughness: 0.1 })
    );
    glassDome.position.set(T.x, 0.85, T.z);
    propGroup.add(glassDome);

    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.38, 0.25, 16),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x7f1d1d, roughness: 0.3 })
    );
    button.position.set(T.x, 0.95, T.z);
    propGroup.add(button);

    // Extra cafeteria tables like the original's bench tables
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.4, roughness: 0.4 });
    for (const [bx, bz] of [[-8, -26], [8, -26], [-8, -18], [8, -18]]) {
      const bench = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.8, 16), benchMat);
      bench.position.set(bx, 0.4, bz);
      bench.castShadow = true;
      propGroup.add(bench);
    }

    // 2. Medbay scan pad
    const med = getRoomCenter('Medbay');
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.3, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.4 })
    );
    pad.position.set(med.x, 0.06, med.z);
    pad.receiveShadow = true;
    propGroup.add(pad);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0x2dd4bf, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(med.x, 0.13, med.z);
    propGroup.add(ring);

    // 3. Reactor core
    const rea = getRoomCenter('Reactor');
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 2.6, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.2 })
    );
    core.position.set(rea.x, 1.3, rea.z);
    core.castShadow = true;
    propGroup.add(core);
    const energyMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    for (const y of [0.8, 1.8]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 12, 24), energyMat);
      r.rotation.x = Math.PI / 2;
      r.position.set(rea.x, y, rea.z);
      propGroup.add(r);
    }

    // 4. Admin hologram table
    const adm = getRoomCenter('Admin');
    const adminTable = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.8, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    adminTable.position.set(adm.x, 0.4, adm.z);
    adminTable.castShadow = true;
    propGroup.add(adminTable);
    const holo = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    holo.rotation.x = -Math.PI / 2;
    holo.position.set(adm.x, 0.81, adm.z);
    propGroup.add(holo);

    // 5. Storage cargo crates
    const sto = getRoomCenter('Storage');
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
    const crateGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    for (const [dx, dz, dy, rot] of [[-1, -1, 0.7, 0], [-1, 1, 0.7, 0.3], [-1, 0, 2.1, -0.15], [2, -2, 0.7, 0.6], [3, 2, 0.7, 0.1]]) {
      const c = new THREE.Mesh(crateGeo, crateMat);
      c.position.set(sto.x + dx, dy, sto.z + dz);
      c.rotation.y = rot;
      c.castShadow = true;
      propGroup.add(c);
    }

    // 6. Navigation console
    const nav = getRoomCenter('Navigation');
    const navConsole = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.0, 5.0),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.3 })
    );
    navConsole.position.set(nav.x, 0.5, nav.z);
    navConsole.castShadow = true;
    propGroup.add(navConsole);

    // 7. Engines (big cylinders)
    for (const name of ['Upper Engine', 'Lower Engine']) {
      const c = getRoomCenter(name);
      const engine = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 4, 20),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 })
      );
      engine.rotation.z = Math.PI / 2;
      engine.position.set(c.x, 1.5, c.z);
      engine.castShadow = true;
      propGroup.add(engine);
    }

    // 8. Task consoles: one small console at each of the four stations in every room
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x1f2a3d, metalness: 0.5, roughness: 0.4 });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    for (const room of MAP_ROOMS_DETAIL) {
      for (let spot = 0; spot < 4; spot++) {
        const p = getRoomSpot(room.name, spot);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.5), consoleMat);
        box.position.set(p.x, 0.45, p.z);
        box.castShadow = true;
        propGroup.add(box);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), screenMat);
        screen.position.set(p.x, 0.62, p.z + 0.26);
        propGroup.add(screen);
      }
    }

    // 9. Vent grates
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, metalness: 0.6, roughness: 0.5 });
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.4 });
    for (const v of MAP_VENTS) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.3), ventMat);
      base.position.set(v.x, 0.05, v.z);
      propGroup.add(base);
      for (let i = -2; i <= 2; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.08), slatMat);
        slat.position.set(v.x, 0.12, v.z + i * 0.22);
        propGroup.add(slat);
      }
    }

    // 10. Security CCTV terminal desk with 4 monitor screens
    const sec = getRoomCenter('Security');
    const secDesk = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.9, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.4, metalness: 0.5 })
    );
    secDesk.position.set(sec.x, 0.45, sec.z);
    secDesk.castShadow = true;
    propGroup.add(secDesk);

    const cctvMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    for (let c = 0; c < 4; c++) {
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.35, 0.08), cctvMat);
      const col = c % 2;
      const row = Math.floor(c / 2);
      screen.position.set(sec.x - 0.35 + col * 0.7, 1.05 + row * 0.42, sec.z - 0.2);
      propGroup.add(screen);
    }

    // 11. Electrical Breaker Box
    const elec = getRoomCenter('Electrical');
    const breakerBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.6, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x422006, metalness: 0.6, roughness: 0.3 })
    );
    breakerBox.position.set(elec.x - 4, 1.5, elec.z);
    breakerBox.castShadow = true;
    propGroup.add(breakerBox);

    const switchLedMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    const switchLed = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.08), switchLedMat);
    switchLed.position.set(elec.x - 4, 1.9, elec.z + 0.18);
    propGroup.add(switchLed);

    this.group.add(propGroup);
    this.buildBlastDoors();
  }

  public blastDoors: { id: string; room: 'Cafeteria' | 'Storage'; mesh: THREE.Mesh; targetY: number }[] = [];

  private buildBlastDoors(): void {
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x78350f,
      emissiveIntensity: 0.4,
    });

    const doorSpecs: { id: string; room: 'Cafeteria' | 'Storage'; x: number; z: number; w: number; d: number }[] = [
      { id: 'caf_west', room: 'Cafeteria', x: -12, z: -25, w: 0.5, d: 4.2 },
      { id: 'caf_south', room: 'Cafeteria', x: 0, z: -14, w: 4.2, d: 0.5 },
      { id: 'caf_east', room: 'Cafeteria', x: 12, z: -26, w: 0.5, d: 4.2 },
      { id: 'storage_north', room: 'Storage', x: 0, z: 14, w: 4.2, d: 0.5 },
      { id: 'storage_west', room: 'Storage', x: -10, z: 18, w: 0.5, d: 4.2 },
      { id: 'storage_east', room: 'Storage', x: 8, z: 28, w: 0.5, d: 4.2 },
    ];

    for (const spec of doorSpecs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 2.7, spec.d), doorMat);
      mesh.position.set(spec.x, 4.2, spec.z); // Start retracted in ceiling
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.blastDoors.push({
        id: spec.id,
        room: spec.room,
        mesh,
        targetY: 4.2,
      });
    }
  }

  private buildOuterSpace(): void {
    // Starfield around the ship
    const starCount = 1200;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      const radius = 110 + Math.random() * 90;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;

      positions[i] = radius * Math.cos(phi) * Math.cos(theta);
      positions[i + 1] = radius * Math.sin(phi);
      positions[i + 2] = radius * Math.cos(phi) * Math.sin(theta);
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.6,
      transparent: true,
      opacity: 0.8,
      fog: false,
    });

    this.starParticles = new THREE.Points(starGeo, starMat);
    this.group.add(this.starParticles);
  }

  public update(delta: number, lockedDoors: ('Cafeteria' | 'Storage')[] = [], lightsSabotaged: boolean = false): void {
    if (this.starParticles) {
      this.starParticles.rotation.y += delta * 0.005;
    }

    // Animate blast doors
    for (const door of this.blastDoors) {
      const isLocked = lockedDoors.includes(door.room);
      door.targetY = isLocked ? 1.35 : 4.2;
      door.mesh.position.y = THREE.MathUtils.damp(door.mesh.position.y, door.targetY, 12, delta);
    }

    // Room lights dimming during lights sabotage
    const targetIntensity = lightsSabotaged ? 0.08 : 0.7;
    for (const light of this.roomLights) {
      light.intensity = THREE.MathUtils.damp(light.intensity, targetIntensity, 8, delta);
    }
  }
}
