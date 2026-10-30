/**
 * Impostor Protocol - Procedural 3D Crewmate Model
 * 3-12 part composite mesh with walking kinematics, visor, backpack, hats, and name tags.
 */

import * as THREE from 'three';
import { PLAYER_COLORS } from '../../shared/constants';

export class CrewmateModel {
  public group: THREE.Group;
  public avatarGroup: THREE.Group;
  public bodyMesh: THREE.Mesh;
  public visorMesh: THREE.Mesh;
  public visorFrameMesh: THREE.Mesh;
  public highlightMesh: THREE.Mesh;
  public highlightSecondaryMesh: THREE.Mesh;
  public backpackMesh: THREE.Mesh;
  public leftLeg: THREE.Group;
  public rightLeg: THREE.Group;
  public ghostTailGroup: THREE.Group;
  public slashBlade: THREE.Group;
  public hatGroup: THREE.Group;
  public nameTagMesh: THREE.Mesh | null = null;
  public shadowMesh: THREE.Mesh;

  public isGhost: boolean = false;
  public isKilling: boolean = false;
  public killAnimTimer: number = 0;
  public isDying: boolean = false;
  public deathAnimTimer: number = 0;
  public onDeathComplete?: () => void;

  private bodyMaterial: THREE.MeshStandardMaterial;
  private walkTime: number = 0;
  private currentHatId: string = 'none';

  constructor(colorId: string = 'red', hatId: string = 'none', playerName: string = 'Player', isHost: boolean = false) {
    this.group = new THREE.Group();

    // avatarGroup holds all visual meshes rotated -90 deg (-PI/2)
    // so the visor naturally points along +Z, matching standard movement angle Math.atan2(dx, dz).
    this.avatarGroup = new THREE.Group();
    this.avatarGroup.rotation.y = -Math.PI / 2;
    this.group.add(this.avatarGroup);

    const colorConfig = PLAYER_COLORS.find((c) => c.id === colorId) || PLAYER_COLORS[0];

    // 1. Body Material (Chunky Toon Suit)
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorConfig.hex),
      roughness: 0.6,
      metalness: 0.1,
    });

    // 2. Main Bean Body (Capsule)
    const bodyGeo = new THREE.CapsuleGeometry(0.5, 0.7, 16, 16);
    this.bodyMesh = new THREE.Mesh(bodyGeo, this.bodyMaterial);
    this.bodyMesh.position.y = 0.95;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.avatarGroup.add(this.bodyMesh);

    // 3. Backpack (Oxygen Tank)
    const backpackGeo = new THREE.BoxGeometry(0.35, 0.6, 0.65);
    const backpackMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorConfig.hex).multiplyScalar(0.9),
      roughness: 0.7,
      metalness: 0.05,
    });
    this.backpackMesh = new THREE.Mesh(backpackGeo, backpackMat);
    this.backpackMesh.position.set(-0.4, 0.95, 0); // Sits on back (pointing -X in avatar local space)
    this.backpackMesh.castShadow = true;
    this.avatarGroup.add(this.backpackMesh);

    // 4. Visor Frame (Enlarged authentic oval/rectangle stadium pill)
    const visorFrameGeo = new THREE.CapsuleGeometry(0.24, 0.44, 16, 16);
    const visorFrameMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
    });
    this.visorFrameMesh = new THREE.Mesh(visorFrameGeo, visorFrameMat);
    this.visorFrameMesh.rotation.x = Math.PI / 2;
    this.visorFrameMesh.position.set(0.35, 1.05, 0);
    this.visorFrameMesh.scale.set(0.84, 1.10, 1.04);
    this.avatarGroup.add(this.visorFrameMesh);

    // 5. Visor Glass (Enlarged Glossy Sky-Cyan Window with deep bevel)
    const visorGeo = new THREE.CapsuleGeometry(0.22, 0.42, 16, 16);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      roughness: 0.12,
      metalness: 0.35,
      emissive: 0x0369a1,
      emissiveIntensity: 0.32,
    });
    this.visorMesh = new THREE.Mesh(visorGeo, visorMat);
    this.visorMesh.rotation.x = Math.PI / 2;
    this.visorMesh.position.set(0.39, 1.05, 0);
    this.visorMesh.scale.set(0.82, 1.06, 1.02);
    this.avatarGroup.add(this.visorMesh);

    // 5b. Visor Curved Glossy Reflection Pill (Iconic Among Us sheen)
    const highlightGeo = new THREE.CapsuleGeometry(0.04, 0.22, 10, 10);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    this.highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
    this.highlightMesh.rotation.x = Math.PI / 2;
    this.highlightMesh.rotation.z = -0.12;
    this.highlightMesh.position.set(0.485, 1.16, 0.14);
    this.avatarGroup.add(this.highlightMesh);

    // Accent secondary reflection dot
    const highlightSecGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const highlightSecMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    this.highlightSecondaryMesh = new THREE.Mesh(highlightSecGeo, highlightSecMat);
    this.highlightSecondaryMesh.position.set(0.48, 1.13, 0.30);
    this.avatarGroup.add(this.highlightSecondaryMesh);

    // 6. Stubby Legs
    const legGeo = new THREE.CapsuleGeometry(0.18, 0.3, 12, 12);
    const legMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorConfig.hex).multiplyScalar(0.95),
      roughness: 0.7,
    });

    // Left leg
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(0, 0.4, 0.22);
    const leftLegMesh = new THREE.Mesh(legGeo, legMat);
    leftLegMesh.position.y = -0.15;
    leftLegMesh.castShadow = true;
    this.leftLeg.add(leftLegMesh);
    this.avatarGroup.add(this.leftLeg);

    // Right leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0, 0.4, -0.22);
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.y = -0.15;
    rightLegMesh.castShadow = true;
    this.rightLeg.add(rightLegMesh);
    this.avatarGroup.add(this.rightLeg);

    // 7. Ground Contact Shadow
    const shadowGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.02;
    this.avatarGroup.add(this.shadowMesh);

    // 8. Ghostly Wavy Tail (hovering phantom body when dead)
    this.ghostTailGroup = new THREE.Group();
    this.ghostTailGroup.position.set(0, 0.45, 0);
    this.ghostTailGroup.visible = false;

    const tailUpperGeo = new THREE.CylinderGeometry(0.48, 0.35, 0.4, 16);
    const tailMat = this.bodyMaterial.clone();
    tailMat.transparent = true;
    tailMat.opacity = 0.55;
    tailMat.depthWrite = false;
    tailMat.emissive.set(0x06b6d4);
    tailMat.emissiveIntensity = 0.35;
    const tailUpper = new THREE.Mesh(tailUpperGeo, tailMat);
    tailUpper.position.y = -0.15;
    this.ghostTailGroup.add(tailUpper);

    const tailMidGeo = new THREE.ConeGeometry(0.35, 0.55, 14);
    const tailMid = new THREE.Mesh(tailMidGeo, tailMat);
    tailMid.position.set(-0.1, -0.45, 0);
    tailMid.rotation.z = 0.35; // curved backward
    this.ghostTailGroup.add(tailMid);

    // Ethereal tail wisps at bottom
    for (const dz of [-0.15, 0, 0.15]) {
      const wispGeo = new THREE.ConeGeometry(0.12, 0.35, 8);
      const wisp = new THREE.Mesh(wispGeo, tailMat);
      wisp.position.set(-0.25, -0.72, dz);
      wisp.rotation.z = 0.5;
      this.ghostTailGroup.add(wisp);
    }
    this.avatarGroup.add(this.ghostTailGroup);

    // 9. Impostor Strike Blade (for kill animation)
    this.slashBlade = new THREE.Group();
    this.slashBlade.position.set(0.55, 0.95, 0.2);
    this.slashBlade.visible = false;

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0xef4444,
      emissiveIntensity: 0.6,
    });
    const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.04), bladeMat);
    bladeMesh.rotation.z = -Math.PI / 4;
    this.slashBlade.add(bladeMesh);

    // Glowing red slash trail arc
    const slashArcMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const slashArc = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.65, 16, 1, 0, Math.PI * 0.75), slashArcMat);
    slashArc.rotation.y = Math.PI / 2;
    slashArc.position.set(0.2, 0, 0);
    this.slashBlade.add(slashArc);
    this.avatarGroup.add(this.slashBlade);

    // 10. Hat Group
    this.hatGroup = new THREE.Group();
    this.hatGroup.position.set(0, 1.55, 0);
    this.avatarGroup.add(this.hatGroup);

    // Apply hat
    this.setHat(hatId);

    // 11. Floating Name Tag (added to root group so it remains upright and camera-aligned)
    this.updateNameTag(playerName, isHost);
  }

  public setColor(colorId: string): void {
    const colorConfig = PLAYER_COLORS.find((c) => c.id === colorId) || PLAYER_COLORS[0];
    this.bodyMaterial.color.set(colorConfig.hex);
    (this.backpackMesh.material as THREE.MeshStandardMaterial).color.set(
      new THREE.Color(colorConfig.hex).multiplyScalar(0.9)
    );
  }

  public setHat(hatId: string): void {
    if (this.currentHatId === hatId && this.hatGroup.children.length > 0) return;
    this.currentHatId = hatId;

    // Clear existing hat meshes
    while (this.hatGroup.children.length > 0) {
      const child = this.hatGroup.children[0];
      this.hatGroup.remove(child);
    }

    if (hatId === 'tophat') {
      const brimGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16);
      const brimMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 });
      const brim = new THREE.Mesh(brimGeo, brimMat);
      this.hatGroup.add(brim);

      const crownGeo = new THREE.CylinderGeometry(0.28, 0.3, 0.45, 16);
      const crown = new THREE.Mesh(crownGeo, brimMat);
      crown.position.y = 0.25;
      this.hatGroup.add(crown);

      // Red ribbon
      const ribbonGeo = new THREE.CylinderGeometry(0.29, 0.295, 0.08, 16);
      const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.4 });
      const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon.position.y = 0.08;
      this.hatGroup.add(ribbon);
    } else if (hatId === 'beanie') {
      const beanieGeo = new THREE.SphereGeometry(0.38, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const beanieMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.9 });
      const beanie = new THREE.Mesh(beanieGeo, beanieMat);
      this.hatGroup.add(beanie);

      // Pom pom
      const pomGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const pomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      const pom = new THREE.Mesh(pomGeo, pomMat);
      pom.position.y = 0.4;
      this.hatGroup.add(pom);
    } else if (hatId === 'horns') {
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
      const hornGeo = new THREE.ConeGeometry(0.1, 0.35, 8);

      const leftHorn = new THREE.Mesh(hornGeo, hornMat);
      leftHorn.position.set(0, 0.15, 0.25);
      leftHorn.rotation.x = 0.4;
      this.hatGroup.add(leftHorn);

      const rightHorn = new THREE.Mesh(hornGeo, hornMat);
      rightHorn.position.set(0, 0.15, -0.25);
      rightHorn.rotation.x = -0.4;
      this.hatGroup.add(rightHorn);
    } else if (hatId === 'goggles') {
      const strapGeo = new THREE.TorusGeometry(0.48, 0.04, 8, 24);
      const strapMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
      const strap = new THREE.Mesh(strapGeo, strapMat);
      strap.rotation.x = Math.PI / 2;
      strap.position.y = -0.15;
      this.hatGroup.add(strap);

      const lensGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12);
      const lensMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.2 });

      const leftLens = new THREE.Mesh(lensGeo, lensMat);
      leftLens.rotation.z = Math.PI / 2;
      leftLens.position.set(0.45, -0.15, 0.18);
      this.hatGroup.add(leftLens);

      const rightLens = new THREE.Mesh(lensGeo, lensMat);
      rightLens.rotation.z = Math.PI / 2;
      rightLens.position.set(0.45, -0.15, -0.18);
      this.hatGroup.add(rightLens);
    } else if (hatId === 'flower') {
      const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x22c55e });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 0.1;
      this.hatGroup.add(stem);

      const centerGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const centerMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });
      const center = new THREE.Mesh(centerGeo, centerMat);
      center.position.y = 0.22;
      this.hatGroup.add(center);

      // Petals
      const petalMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e });
      for (let i = 0; i < 5; i++) {
        const petalGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const petal = new THREE.Mesh(petalGeo, petalMat);
        const angle = (i / 5) * Math.PI * 2;
        petal.position.set(Math.cos(angle) * 0.16, 0.22, Math.sin(angle) * 0.16);
        petal.scale.set(1, 0.4, 1);
        this.hatGroup.add(petal);
      }
    } else if (hatId === 'crown') {
      // Golden Royal Crown
      const crownBaseGeo = new THREE.CylinderGeometry(0.32, 0.3, 0.14, 16, 1, true);
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.85,
        roughness: 0.2,
      });
      const crownBase = new THREE.Mesh(crownBaseGeo, goldMat);
      crownBase.position.y = 0.07;
      this.hatGroup.add(crownBase);

      // 5 Crown Points
      const pointGeo = new THREE.ConeGeometry(0.08, 0.2, 5);
      const rubyMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.1, metalness: 0.5 });
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const pt = new THREE.Mesh(pointGeo, goldMat);
        pt.position.set(Math.cos(ang) * 0.3, 0.22, Math.sin(ang) * 0.3);
        this.hatGroup.add(pt);

        // Center ruby jewel on front
        if (i === 0) {
          const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), rubyMat);
          jewel.position.set(Math.cos(ang) * 0.32, 0.08, Math.sin(ang) * 0.32);
          this.hatGroup.add(jewel);
        }
      }
    } else if (hatId === 'halo') {
      // Angel Glowing Halo
      const haloGeo = new THREE.TorusGeometry(0.34, 0.045, 12, 32);
      const haloMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 0.9,
        roughness: 0.1,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, 0.35, 0);
      this.hatGroup.add(halo);
    } else if (hatId === 'chef') {
      // Chef Toque
      const brimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 16), brimMat);
      brim.position.y = 0.05;
      this.hatGroup.add(brim);

      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), brimMat);
      puff.position.y = 0.32;
      puff.scale.set(0.9, 1.15, 0.9);
      this.hatGroup.add(puff);
    } else if (hatId === 'party') {
      // Festive Party Cone
      const coneGeo = new THREE.ConeGeometry(0.24, 0.52, 16);
      const partyMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.4 });
      const cone = new THREE.Mesh(coneGeo, partyMat);
      cone.position.set(0, 0.26, 0);
      cone.rotation.z = -0.15;
      this.hatGroup.add(cone);

      // Pom on top
      const pomMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), pomMat);
      pom.position.set(-0.04, 0.53, 0);
      this.hatGroup.add(pom);
    } else if (hatId === 'ninja') {
      // Shinobi Black Headband with Tails
      const bandMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 24), bandMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.05;
      this.hatGroup.add(band);

      // Metal forehead plate
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.03), plateMat);
      plate.position.set(0.46, -0.05, 0);
      plate.rotation.y = Math.PI / 2;
      this.hatGroup.add(plate);

      // Trailing ribbons behind head
      const ribbonGeo = new THREE.BoxGeometry(0.06, 0.35, 0.02);
      const ribbon1 = new THREE.Mesh(ribbonGeo, bandMat);
      ribbon1.position.set(-0.46, -0.22, 0.08);
      ribbon1.rotation.z = 0.3;
      this.hatGroup.add(ribbon1);
      const ribbon2 = new THREE.Mesh(ribbonGeo, bandMat);
      ribbon2.position.set(-0.46, -0.24, -0.08);
      ribbon2.rotation.z = 0.45;
      this.hatGroup.add(ribbon2);
    } else if (hatId === 'cowboy') {
      // Leather Cowboy Stetson
      const leatherMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 20), leatherMat);
      brim.position.y = 0.02;
      brim.scale.set(1.15, 1, 0.9);
      this.hatGroup.add(brim);

      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.32, 16), leatherMat);
      crown.position.y = 0.18;
      crown.scale.set(1, 1, 0.85);
      this.hatGroup.add(crown);
    } else if (hatId === 'egg') {
      // Fried Egg Sunny Side Up
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
      const eggWhite = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 16), whiteMat);
      eggWhite.position.set(0.04, 0.03, 0.02);
      eggWhite.scale.set(1.1, 1, 0.9);
      this.hatGroup.add(eggWhite);

      const yolkMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.15 });
      const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), yolkMat);
      yolk.position.set(0.06, 0.1, 0.02);
      yolk.scale.set(1, 0.6, 1);
      this.hatGroup.add(yolk);
    }
  }

  public updateNameTag(
    nameOrOptions: string | { name: string; isHost?: boolean; isLocal?: boolean; isDead?: boolean; isImpostor?: boolean; isBot?: boolean },
    isHostParam: boolean = false
  ): void {
    const name = typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions.name;
    const isHost = typeof nameOrOptions === 'string' ? isHostParam : (nameOrOptions.isHost ?? false);
    const isImpostor = typeof nameOrOptions === 'object' && nameOrOptions.isImpostor;

    if (this.nameTagMesh) {
      this.group.remove(this.nameTagMesh);
      if (this.nameTagMesh.material instanceof THREE.Material) {
        this.nameTagMesh.material.dispose();
      }
      this.nameTagMesh = null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 64);

    // Pill background
    ctx.fillStyle = isImpostor ? 'rgba(88, 28, 28, 0.85)' : 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.roundRect(16, 12, 224, 40, 20);
    ctx.fill();

    // Border
    ctx.strokeStyle = isHost ? '#fbbf24' : isImpostor ? '#ef4444' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Text
    ctx.fillStyle = isImpostor ? '#fca5a5' : '#ffffff';
    ctx.font = 'bold 24px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const displayName = isHost ? `👑 ${name}` : name;
    ctx.fillText(displayName, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    // Create a nametag container group matching the character's facing direction
    const tagGroup = new THREE.Group();
    tagGroup.position.set(0, 2.15, 0);
    // Slight upward tilt (~16 deg) for optimal reading from third-person perspective
    tagGroup.rotation.set(-0.28, 0, 0);

    const tagGeo = new THREE.PlaneGeometry(1.6, 0.4);
    const tagMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    // Front-facing panel (matches character facing direction)
    const frontMesh = new THREE.Mesh(tagGeo, tagMat);
    frontMesh.renderOrder = 999;
    tagGroup.add(frontMesh);

    // Back-facing panel (allows reading cleanly from behind without inverted/backwards text)
    const backMesh = new THREE.Mesh(tagGeo, tagMat);
    backMesh.rotation.y = Math.PI;
    backMesh.renderOrder = 999;
    tagGroup.add(backMesh);

    this.nameTagMesh = tagGroup as unknown as THREE.Mesh;
    this.group.add(this.nameTagMesh);
  }

  public setGhostMode(isGhost: boolean): void {
    this.isGhost = isGhost;
    this.leftLeg.visible = !isGhost;
    this.rightLeg.visible = !isGhost;
    this.shadowMesh.visible = !isGhost;
    this.ghostTailGroup.visible = isGhost;

    // Translucent ethereal ghost materials
    const alpha = isGhost ? 0.52 : 1.0;
    this.bodyMaterial.transparent = isGhost;
    this.bodyMaterial.opacity = alpha;
    this.bodyMaterial.depthWrite = !isGhost;
    this.bodyMaterial.emissive.set(isGhost ? 0x06b6d4 : 0x000000);
    this.bodyMaterial.emissiveIntensity = isGhost ? 0.35 : 0;
    this.bodyMaterial.needsUpdate = true;

    const bpMat = this.backpackMesh.material as THREE.MeshStandardMaterial;
    bpMat.transparent = isGhost;
    bpMat.opacity = alpha;
    bpMat.depthWrite = !isGhost;
    bpMat.needsUpdate = true;

    const vMat = this.visorMesh.material as THREE.MeshStandardMaterial;
    vMat.transparent = isGhost;
    vMat.opacity = isGhost ? 0.65 : 1.0;
    vMat.depthWrite = !isGhost;
    vMat.needsUpdate = true;

    const vfMat = this.visorFrameMesh.material as THREE.MeshStandardMaterial;
    vfMat.transparent = isGhost;
    vfMat.opacity = alpha;
    vfMat.depthWrite = !isGhost;
    vfMat.needsUpdate = true;

    if (this.highlightMesh) this.highlightMesh.visible = !isGhost;
    if (this.highlightSecondaryMesh) this.highlightSecondaryMesh.visible = !isGhost;
  }

  public triggerKillAnimation(): void {
    this.isKilling = true;
    this.killAnimTimer = 0.55;
    this.slashBlade.visible = true;
  }

  public triggerDeathAnimation(onComplete?: () => void): void {
    this.isDying = true;
    this.deathAnimTimer = 0.95;
    this.onDeathComplete = onComplete;
  }

  public updateAnimation(delta: number, isMoving: boolean, _camera?: THREE.Camera): void {
    // 1. Killer Strike Animation
    if (this.isKilling) {
      this.killAnimTimer -= delta;
      const progress = 1 - Math.max(0, this.killAnimTimer / 0.55);

      if (progress < 0.35) {
        // Sudden aggressive lunge forward and slice downward
        const t = progress / 0.35;
        this.avatarGroup.position.x = Math.sin(t * Math.PI) * 0.85;
        this.avatarGroup.rotation.x = Math.sin(t * Math.PI) * 0.3;
        this.slashBlade.rotation.x = -t * Math.PI * 1.8;
      } else {
        // Recoil smoothly back into idle position
        this.avatarGroup.position.x = THREE.MathUtils.lerp(this.avatarGroup.position.x, 0, delta * 12);
        this.avatarGroup.rotation.x = THREE.MathUtils.lerp(this.avatarGroup.rotation.x, 0, delta * 12);
      }

      if (this.killAnimTimer <= 0) {
        this.isKilling = false;
        this.slashBlade.visible = false;
        this.avatarGroup.position.set(0, 0, 0);
        this.avatarGroup.rotation.set(0, -Math.PI / 2, 0);
      }
      return;
    }

    // 2. Victim Death & Ghost Emergence Animation
    if (this.isDying) {
      this.deathAnimTimer -= delta;
      const progress = 1 - Math.max(0, this.deathAnimTimer / 0.95);

      if (progress < 0.45) {
        // Struck back: shudder and collapse to the deck
        const t = progress / 0.45;
        this.avatarGroup.rotation.z = -t * (Math.PI / 2);
        this.avatarGroup.position.y = (1 - t) * 0.95 + 0.18;
      } else {
        // Ghost soul emerges: rises upward out of the fallen position
        if (!this.isGhost) this.setGhostMode(true);
        const t = (progress - 0.45) / 0.55;
        this.avatarGroup.rotation.z = THREE.MathUtils.lerp(this.avatarGroup.rotation.z, 0, t);
        this.avatarGroup.position.y = THREE.MathUtils.lerp(0.18, 1.45, t);
      }

      if (this.deathAnimTimer <= 0) {
        this.isDying = false;
        this.avatarGroup.rotation.set(0, -Math.PI / 2, 0);
        this.setGhostMode(true);
        this.onDeathComplete?.();
      }
      return;
    }

    // 3. Ghost Mode: Ethereal floating hover and waving phantom tail
    if (this.isGhost) {
      this.walkTime += delta * (isMoving ? 7 : 3.5);
      const hover = Math.sin(this.walkTime * 2.5) * 0.14;
      this.avatarGroup.position.y = 1.35 + hover;

      // Gentle forward tilt when moving, undulating tail
      const tilt = isMoving ? 0.25 : 0.05;
      this.avatarGroup.rotation.x = THREE.MathUtils.lerp(this.avatarGroup.rotation.x, tilt, delta * 6);
      this.ghostTailGroup.rotation.z = Math.sin(this.walkTime * 3) * 0.28;
      this.ghostTailGroup.rotation.x = (isMoving ? 0.4 : 0.12) + Math.cos(this.walkTime * 2.2) * 0.15;
      return;
    }

    // 4. Alive Living Mode: Normal leg kinematics and breathing
    if (isMoving) {
      this.walkTime += delta * 12;
      const legSwing = Math.sin(this.walkTime) * 0.45;
      this.leftLeg.rotation.z = legSwing;
      this.rightLeg.rotation.z = -legSwing;

      // Subtle body bob
      const bob = Math.abs(Math.sin(this.walkTime * 2)) * 0.05;
      this.bodyMesh.position.y = 0.95 + bob;
      this.backpackMesh.position.y = 0.95 + bob;
      this.visorMesh.position.y = 1.05 + bob;
      this.visorFrameMesh.position.y = 1.05 + bob;
      if (this.highlightMesh) this.highlightMesh.position.y = 1.16 + bob;
      if (this.highlightSecondaryMesh) this.highlightSecondaryMesh.position.y = 1.13 + bob;
      this.hatGroup.position.y = 1.55 + bob;
    } else {
      // Idle breathing sway
      this.walkTime += delta * 2;
      this.leftLeg.rotation.z = THREE.MathUtils.lerp(this.leftLeg.rotation.z, 0, 0.2);
      this.rightLeg.rotation.z = THREE.MathUtils.lerp(this.rightLeg.rotation.z, 0, 0.2);

      const breath = Math.sin(this.walkTime) * 0.02;
      this.bodyMesh.position.y = 0.95 + breath;
      this.backpackMesh.position.y = 0.95 + breath;
      this.visorMesh.position.y = 1.05 + breath;
      this.visorFrameMesh.position.y = 1.05 + breath;
      if (this.highlightMesh) this.highlightMesh.position.y = 1.16 + breath;
      if (this.highlightSecondaryMesh) this.highlightSecondaryMesh.position.y = 1.13 + breath;
      this.hatGroup.position.y = 1.55 + breath;
    }
  }

  /**
   * Procedural Authentic Among Us Dead Body:
   * Cut-in-half crewmate torso on the deck with the iconic white bone sticking straight up
   * and a dark-red pool of blood on the floor plating.
   */
  public static createDeadBody(colorId: string): THREE.Group {
    const group = new THREE.Group();
    const colorConfig = PLAYER_COLORS.find((c) => c.id === colorId) || PLAYER_COLORS[0];

    // Dark-red blood puddle decal on the floor deck
    const bloodMat = new THREE.MeshBasicMaterial({
      color: 0x7f1d1d,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const bloodPuddle = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), bloodMat);
    bloodPuddle.rotation.x = -Math.PI / 2;
    bloodPuddle.position.y = 0.01;
    group.add(bloodPuddle);

    // Cut half bean body (lower waist/torso cut horizontally)
    const lowerBodyGeo = new THREE.CylinderGeometry(0.48, 0.46, 0.45, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorConfig.hex),
      roughness: 0.6,
      metalness: 0.1,
    });
    const lowerBody = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lowerBody.position.y = 0.225;
    lowerBody.castShadow = true;
    group.add(lowerBody);

    // Bloody cut top surface (dark red meat cross section)
    const meatMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.35,
      metalness: 0.1,
    });
    const meatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 16), meatMat);
    meatTop.position.y = 0.46;
    group.add(meatTop);

    // The iconic Among Us bone sticking straight up from the cut center!
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.1,
    });
    const boneShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.55, 12), boneMat);
    boneShaft.position.y = 0.72;
    boneShaft.castShadow = true;
    group.add(boneShaft);

    // Dual bone cartilage knobs on top
    for (const dx of [-0.075, 0.075]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), boneMat);
      knob.position.set(dx, 0.98, 0);
      knob.castShadow = true;
      group.add(knob);
    }

    // Stubby legs lying on the deck
    const legGeo = new THREE.CapsuleGeometry(0.18, 0.28, 10, 10);
    const legMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorConfig.hex).multiplyScalar(0.95),
      roughness: 0.7,
    });
    for (const dz of [-0.22, 0.22]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(0, 0.12, dz);
      leg.rotation.x = Math.PI / 2;
      group.add(leg);
    }

    // Backpack lying beside the torso
    const bpGeo = new THREE.BoxGeometry(0.35, 0.4, 0.55);
    const bpMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorConfig.hex).multiplyScalar(0.9),
      roughness: 0.7,
    });
    const bp = new THREE.Mesh(bpGeo, bpMat);
    bp.position.set(-0.38, 0.2, 0);
    group.add(bp);

    return group;
  }

  public dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    });
  }
}
