/**
 * Impostor Protocol - Procedural 3D Crewmate Model
 * 3-12 part composite mesh with walking kinematics, visor, backpack, hats, and name tags.
 */

import * as THREE from 'three';
import { PLAYER_COLORS } from '../../shared/constants';

export class CrewmateModel {
  public group: THREE.Group;
  public bodyMesh: THREE.Mesh;
  public visorMesh: THREE.Mesh;
  public visorFrameMesh: THREE.Mesh;
  public backpackMesh: THREE.Mesh;
  public leftLeg: THREE.Group;
  public rightLeg: THREE.Group;
  public hatGroup: THREE.Group;
  public nameTagMesh: THREE.Mesh | null = null;
  public shadowMesh: THREE.Mesh;

  private bodyMaterial: THREE.MeshStandardMaterial;
  private walkTime: number = 0;
  private currentHatId: string = 'none';

  constructor(colorId: string = 'red', hatId: string = 'none', playerName: string = 'Player', isHost: boolean = false) {
    this.group = new THREE.Group();

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
    this.group.add(this.bodyMesh);

    // 3. Backpack (Oxygen Tank)
    const backpackGeo = new THREE.BoxGeometry(0.35, 0.6, 0.65);
    const backpackMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorConfig.hex).multiplyScalar(0.9),
      roughness: 0.7,
      metalness: 0.05,
    });
    this.backpackMesh = new THREE.Mesh(backpackGeo, backpackMat);
    this.backpackMesh.position.set(-0.4, 0.95, 0); // Sits on back (pointing -X)
    this.backpackMesh.castShadow = true;
    this.group.add(this.backpackMesh);

    // 4. Visor Frame
    const visorFrameGeo = new THREE.CapsuleGeometry(0.24, 0.35, 12, 12);
    const visorFrameMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.8,
    });
    this.visorFrameMesh = new THREE.Mesh(visorFrameGeo, visorFrameMat);
    this.visorFrameMesh.rotation.x = Math.PI / 2;
    this.visorFrameMesh.position.set(0.38, 1.05, 0);
    this.visorFrameMesh.scale.set(1, 0.6, 1.25);
    this.group.add(this.visorFrameMesh);

    // 5. Visor Glass (Glossy Cyan with highlight)
    const visorGeo = new THREE.CapsuleGeometry(0.22, 0.33, 12, 12);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      roughness: 0.1,
      metalness: 0.4,
      emissive: 0x083344,
      emissiveIntensity: 0.3,
    });
    this.visorMesh = new THREE.Mesh(visorGeo, visorMat);
    this.visorMesh.rotation.x = Math.PI / 2;
    this.visorMesh.position.set(0.41, 1.05, 0);
    this.visorMesh.scale.set(1, 0.55, 1.2);
    this.group.add(this.visorMesh);

    // Visor Reflection Highlight Dot
    const highlightGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
    highlightMesh.position.set(0.5, 1.15, 0.08);
    highlightMesh.scale.set(0.5, 0.8, 1.5);
    this.group.add(highlightMesh);

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
    this.group.add(this.leftLeg);

    // Right leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0, 0.4, -0.22);
    const rightLegMesh = new THREE.Mesh(legGeo, legMat);
    rightLegMesh.position.y = -0.15;
    rightLegMesh.castShadow = true;
    this.rightLeg.add(rightLegMesh);
    this.group.add(this.rightLeg);

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
    this.group.add(this.shadowMesh);

    // 8. Hat Group
    this.hatGroup = new THREE.Group();
    this.hatGroup.position.set(0, 1.55, 0);
    this.group.add(this.hatGroup);

    // Apply hat
    this.setHat(hatId);

    // 9. Floating Name Tag
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
    }
  }

  public updateNameTag(name: string, isHost: boolean = false): void {
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
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.roundRect(16, 12, 224, 40, 20);
    ctx.fill();

    // Border
    ctx.strokeStyle = isHost ? '#fbbf24' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const displayName = isHost ? `👑 ${name}` : name;
    ctx.fillText(displayName, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const tagGeo = new THREE.PlaneGeometry(1.6, 0.4);
    const tagMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    this.nameTagMesh = new THREE.Mesh(tagGeo, tagMat);
    this.nameTagMesh.position.y = 2.15;
    this.nameTagMesh.renderOrder = 999;
    this.group.add(this.nameTagMesh);
  }

  public updateAnimation(delta: number, isMoving: boolean, camera?: THREE.Camera): void {
    if (isMoving) {
      this.walkTime += delta * 12;
      const legSwing = Math.sin(this.walkTime) * 0.45;
      this.leftLeg.rotation.z = legSwing;
      this.rightLeg.rotation.z = -legSwing;

      // Subtle body bob
      this.bodyMesh.position.y = 0.95 + Math.abs(Math.sin(this.walkTime * 2)) * 0.05;
      this.backpackMesh.position.y = 0.95 + Math.abs(Math.sin(this.walkTime * 2)) * 0.05;
      this.visorMesh.position.y = 1.05 + Math.abs(Math.sin(this.walkTime * 2)) * 0.05;
      this.visorFrameMesh.position.y = 1.05 + Math.abs(Math.sin(this.walkTime * 2)) * 0.05;
      this.hatGroup.position.y = 1.55 + Math.abs(Math.sin(this.walkTime * 2)) * 0.05;
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
      this.hatGroup.position.y = 1.55 + breath;
    }

    // Billboard name tag to face camera
    if (this.nameTagMesh && camera) {
      this.nameTagMesh.quaternion.copy(camera.quaternion);
    }
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
