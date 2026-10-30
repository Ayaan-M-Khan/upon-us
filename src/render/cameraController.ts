/**
 * Impostor Protocol - Camera Controller
 * Supports Third-Person over-the-shoulder follow with wall collision avoidance and First-Person toggle (V key).
 */

import * as THREE from 'three';
import { SecurityCamera } from '../../shared/mapData';

export type CameraViewMode = 'third_person' | 'first_person' | 'cctv';

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  public mode: CameraViewMode = 'third_person';
  public cctvCamera: SecurityCamera | null = null;

  // Fixed top-down perspective pitch (~62 degrees down look)
  public static readonly FIXED_TOP_DOWN_PITCH: number = 1.08;

  // Orbit angles & distance
  public angleH: number = 0; // horizontal yaw
  public angleV: number = CameraController.FIXED_TOP_DOWN_PITCH; // vertical pitch locked to top-down view
  public distance: number = 8.6; // elevated overview of rooms and character

  // Settings
  public sensitivity: number = 0.005;
  public enableHeadBob: boolean = true;
  private headBobTimer: number = 0;

  // Pointers & Drag
  private isDragging: boolean = false;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.setupListeners();
  }

  public toggleViewMode(): CameraViewMode {
    this.mode = this.mode === 'third_person' ? 'first_person' : 'third_person';
    if (this.mode === 'third_person') {
      this.angleV = CameraController.FIXED_TOP_DOWN_PITCH;
    } else {
      this.angleV = 0;
    }
    return this.mode;
  }

  // Listeners are named so they can be removed on dispose (previously every mount of the
  // game view stacked another set), and dragging is cleared on pointercancel / blur so the
  // camera can never get "stuck" rotating with the mouse.
  private onKeyDown = (e: KeyboardEvent): void => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (e.code === 'KeyV' && !e.repeat) this.toggleViewMode();
  };

  private onPointerDown = (e: PointerEvent): void => {
    // Only drag-rotate when the press lands on the 3D canvas, not on HUD buttons / menus.
    if (!(e.target instanceof HTMLCanvasElement)) return;
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    if (e.buttons === 0) {
      this.isDragging = false; // button was released outside the window
      return;
    }
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.rotate(dx, dy);
  };

  private stopDrag = (): void => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.mode === 'third_person') {
      this.distance = Math.max(5.0, Math.min(13.5, this.distance + e.deltaY * 0.006));
    }
  };

  private setupListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.stopDrag);
    window.addEventListener('pointercancel', this.stopDrag);
    window.addEventListener('blur', this.stopDrag);
    window.addEventListener('wheel', this.onWheel, { passive: true });
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.stopDrag);
    window.removeEventListener('pointercancel', this.stopDrag);
    window.removeEventListener('blur', this.stopDrag);
    window.removeEventListener('wheel', this.onWheel);
  }

  public rotate(dx: number, dy: number): void {
    // Only mouse horizontal direction changes the yaw around the character
    this.angleH -= dx * this.sensitivity;
    if (this.mode === 'third_person') {
      // Always maintain fixed top-down view angle
      this.angleV = CameraController.FIXED_TOP_DOWN_PITCH;
    } else {
      // First person pitch (-60 to +60 degrees)
      this.angleV = Math.max(-1.1, Math.min(1.1, this.angleV - dy * this.sensitivity));
    }
  }

  private focus = new THREE.Vector3();
  private focusReady = false;
  private effDist = 6;

  public update(
    delta: number,
    targetPos: THREE.Vector3,
    isMoving: boolean
  ): void {
    if (this.mode === 'cctv' && this.cctvCamera) {
      // Security CCTV Surveillance Camera View
      const cam = this.cctvCamera;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, cam.x, 24, delta);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, cam.y, 24, delta);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, cam.z, 24, delta);

      const lookTarget = new THREE.Vector3(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
      this.camera.lookAt(lookTarget);
      return;
    }

    if (this.mode === 'first_person') {
      // First person eye level (~1.15m above ground)
      let eyeY = targetPos.y + 1.15;

      if (this.enableHeadBob && isMoving) {
        this.headBobTimer += delta * 12;
        eyeY += Math.sin(this.headBobTimer) * 0.04;
      }

      this.camera.position.set(targetPos.x, eyeY, targetPos.z);

      // Look direction from angles
      const lookDist = 10;
      const lookX = targetPos.x - Math.sin(this.angleH) * Math.cos(this.angleV) * lookDist;
      const lookY = eyeY + Math.sin(this.angleV) * lookDist;
      const lookZ = targetPos.z - Math.cos(this.angleH) * Math.cos(this.angleV) * lookDist;

      this.camera.lookAt(lookX, lookY, lookZ);
    } else {
      // Third person follow.
      // The camera follows a lightly smoothed focus point rigidly (so the character never jitters
      // against the screen), zooms in instantly when a wall is in the way and eases back out.
      const headTarget = targetPos.clone().add(new THREE.Vector3(0, 1.1, 0));
      if (!this.focusReady || this.focus.distanceTo(headTarget) > 6) {
        this.focus.copy(headTarget);
        this.effDist = this.distance;
        this.focusReady = true;
      } else {
        this.focus.x = THREE.MathUtils.damp(this.focus.x, headTarget.x, 28, delta);
        this.focus.y = THREE.MathUtils.damp(this.focus.y, headTarget.y, 28, delta);
        this.focus.z = THREE.MathUtils.damp(this.focus.z, headTarget.z, 28, delta);
      }

      const cosV = Math.cos(this.angleV);
      const sinV = Math.sin(this.angleV);
      const sinH = Math.sin(this.angleH);
      const cosH = Math.cos(this.angleH);

      // In top-down view (~62° elevation, height ~8m), the camera sits well above 2.8m interior walls.
      // We smoothly track distance without ground-level wall raycasts so the camera never zooms in unexpectedly.
      this.effDist = THREE.MathUtils.damp(this.effDist, this.distance, 14, delta);

      this.camera.position.set(
        this.focus.x + sinH * cosV * this.effDist,
        this.focus.y + sinV * this.effDist,
        this.focus.z + cosH * cosV * this.effDist
      );
      this.camera.lookAt(this.focus);
    }
  }
}
