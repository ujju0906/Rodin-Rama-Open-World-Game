import * as THREE from 'three';
import { VIEWPOINTS, WORLD } from '../data/world';

/**
 * Free camera for exploring the region before the hero exists (Phase 3 replaces it).
 * Drag to look, WASD to move, Q/E down/up, Shift to go fast, V for the next viewpoint.
 * Until the first input it drifts slowly, which doubles as the title-screen camera.
 */
export class FlyCamera {
  yaw = 0;
  pitch = 0;
  readonly position = new THREE.Vector3();
  viewIndex = 0;
  private keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private idle = true;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    this.setView(0);
  }

  attach(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if ('wasdqe'.includes(k)) this.idle = false;
      if (k === 'v') this.setView((this.viewIndex + 1) % VIEWPOINTS.length);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.idle = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture is refused while the pointer is locked; dragging still works */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.lastX) * 0.004;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - (e.clientY - this.lastY) * 0.004));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    canvas.addEventListener('pointerup', () => (this.dragging = false));
    canvas.addEventListener('pointercancel', () => (this.dragging = false));
  }

  setView(i: number, idle = true): void {
    const v = VIEWPOINTS[i]!;
    this.viewIndex = i;
    this.position.set(v.x, this.groundAt(v.x, v.z) + v.h, v.z);
    this.yaw = v.yaw;
    this.pitch = v.pitch;
    this.idle = idle;
  }

  update(dt: number, elapsed: number): void {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    if (this.idle) {
      this.yaw += Math.sin(elapsed * 0.11) * dt * 0.035;
      this.position.addScaledVector(forward, dt * 0.35);
    } else {
      const speed = (this.keys.has('shift') ? 42 : 9) * dt;
      const k = this.keys;
      if (k.has('w')) this.position.addScaledVector(forward, speed);
      if (k.has('s')) this.position.addScaledVector(forward, -speed);
      if (k.has('d')) this.position.addScaledVector(right, speed);
      if (k.has('a')) this.position.addScaledVector(right, -speed);
      if (k.has('e')) this.position.y += speed;
      if (k.has('q')) this.position.y -= speed;
    }
    const lim = WORLD.size / 2 - 8;
    this.position.x = Math.max(-lim, Math.min(lim, this.position.x));
    this.position.z = Math.max(-lim, Math.min(lim, this.position.z));
    const floor = Math.max(this.groundAt(this.position.x, this.position.z), WORLD.waterLevel) + 1.6;
    this.position.y = Math.min(260, Math.max(floor, this.position.y));
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
