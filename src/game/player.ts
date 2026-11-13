import * as THREE from 'three';
import type { Input } from '../core/input';
import { BOW, PLAYER } from '../data/gameplay';
import { WORLD } from '../data/world';
import type { Colliders } from './collision';
import { createRama, type RamaFigure } from './models';

/** Rama: movement, dodge, jump, swim, bow draw state and procedural animation. */
export class Player {
  readonly figure: RamaFigure = createRama();
  readonly pos = new THREE.Vector3();
  health: number = PLAYER.health;
  maxHealth: number = PLAYER.health;
  focus: number = PLAYER.focusMax;
  yaw = 0;
  velY = 0;
  grounded = true;
  swimming = false;
  /** 0..1 how far the bow is drawn. */
  draw = 0;
  drawing = false;
  aiming = false;
  focusActive = false;
  invulnerable = 0;
  dead = false;
  speed = 0;
  private dodgeT = 0;
  private dodgeCd = 0;
  private dodgeDir = new THREE.Vector3();
  private sinceDodge = 99;
  private walkPhase = 0;
  private hurtFlash = 0;

  get root(): THREE.Group {
    return this.figure.root;
  }

  get dodging(): boolean {
    return this.dodgeT > 0;
  }

  /** True when drawing now would trigger focus slow-motion. */
  get focusEligible(): boolean {
    return !this.grounded || this.sinceDodge < BOW.focusWindowAfterDodge;
  }

  /** Position arrows leave from. */
  bowPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + 1.45, this.pos.z);
  }

  damage(amount: number): boolean {
    if (this.invulnerable > 0 || this.dead) return false;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.25;
    this.invulnerable = 0.35;
    if (this.health <= 0) this.dead = true;
    return true;
  }

  respawn(x: number, z: number, ground: number): void {
    this.pos.set(x, ground, z);
    this.health = this.maxHealth;
    this.focus = PLAYER.focusMax;
    this.dead = false;
    this.velY = 0;
    this.invulnerable = 2;
  }

  /** Returns true on the frame a dodge starts (for sound). */
  update(dt: number, input: Input, camYaw: number, col: Colliders, canAct: boolean): boolean {
    let dodged = false;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.sinceDodge += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    let mx = 0;
    let mz = 0;
    if (canAct && !this.dead) {
      mx = fx * input.moveY - fz * input.moveX;
      mz = fz * input.moveY + fx * input.moveX;
    }
    const moving = Math.hypot(mx, mz) > 0.05;
    this.swimming = col.inWater(this.pos.x, this.pos.z) && this.pos.y <= WORLD.waterLevel - 0.5;

    if (canAct && !this.dead && input.hit('control') && this.dodgeCd <= 0 && !this.swimming) {
      this.dodgeT = PLAYER.dodgeTime;
      this.dodgeCd = PLAYER.dodgeCooldown;
      this.invulnerable = Math.max(this.invulnerable, PLAYER.dodgeInvulnerable);
      if (moving) this.dodgeDir.set(mx, 0, mz).normalize();
      else this.dodgeDir.set(-fx, 0, -fz);
      dodged = true;
    }

    let speed = 0;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      speed = PLAYER.dodgeDistance / PLAYER.dodgeTime;
      this.pos.addScaledVector(this.dodgeDir, speed * dt);
      if (this.dodgeT <= 0) this.sinceDodge = 0;
    } else if (moving) {
      speed = this.swimming
        ? PLAYER.swimSpeed
        : this.drawing || this.aiming
          ? PLAYER.walk + 1
          : input.keys.has('shift')
            ? PLAYER.sprint
            : PLAYER.run;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
    }
    this.speed = speed;

    // Facing: towards the camera aim while using the bow, otherwise towards travel.
    const want =
      this.drawing || this.aiming ? camYaw + Math.PI : moving ? Math.atan2(mx, mz) : this.yaw;
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 14);

    // Vertical: jump, gravity, ground, swimming.
    if (canAct && !this.dead && input.hit(' ') && this.grounded && !this.swimming) {
      this.velY = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    col.resolve(this.pos, PLAYER.radius, this.pos.y);
    const ground = col.groundAt(this.pos.x, this.pos.z);
    const floor = Math.max(
      ground,
      col.inWater(this.pos.x, this.pos.z) ? WORLD.waterLevel - 1.25 : -99,
    );
    this.velY -= PLAYER.gravity * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= floor) {
      this.pos.y = floor;
      this.velY = 0;
      this.grounded = true;
    } else if (this.pos.y > floor + 0.15) {
      this.grounded = false;
    }

    // Focus meter.
    if (this.focusActive) this.focus = Math.max(0, this.focus - PLAYER.focusDrain * dt);
    else this.focus = Math.min(PLAYER.focusMax, this.focus + PLAYER.focusRegen * dt);

    this.animate(dt, speed);
    return dodged;
  }

  /** Vertical aim angle, set by the game from the camera. */
  aimPitch = 0;
  private aimBlend = 0;

  private animateRig(dt: number, speed: number): void {
    const f = this.figure;
    const rig = f.rig!;
    f.root.position.copy(this.pos);
    f.root.rotation.y = this.yaw;
    const rolling = this.dodgeT > 0;
    f.body.rotation.x = rolling
      ? (1 - this.dodgeT / PLAYER.dodgeTime) * Math.PI * 2
      : this.swimming
        ? 1.2
        : 0;
    f.body.position.y = rolling ? 0.75 : this.swimming ? 0.5 : 0;
    f.body.position.z = this.swimming ? -0.6 : 0;
    this.aimBlend += ((this.drawing || this.aiming ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 12);
    f.root.updateMatrixWorld(true);
    rig.update(dt, this.grounded || this.swimming ? speed : 1.2, this.yaw, {
      aim: rolling ? 0 : this.aimBlend,
      draw: this.draw,
      pitch: this.aimPitch,
    });

    // Kodanda follows the left hand: upright and facing the aim when raised, slung low otherwise.
    const hand = rig.worldPos('LeftHand', new THREE.Vector3());
    f.root.worldToLocal(hand);
    f.bow.position.copy(hand);
    // Raised and facing the aim while shooting; otherwise carried upright at his side.
    f.bow.rotation.set(
      THREE.MathUtils.lerp(0, -this.aimPitch, this.aimBlend),
      -Math.PI / 2,
      THREE.MathUtils.lerp(0.12, 0, this.aimBlend),
      'YXZ',
    );
    f.bow.position.y += THREE.MathUtils.lerp(0.18, 0, this.aimBlend);
    f.bow.visible = !rolling;
    f.nocked.visible = this.drawing;
    f.nocked.position.x = -0.1 - this.draw * 0.26;
    for (const m of f.skins) m.emissive.setRGB(this.hurtFlash * 3, 0, 0);
    f.root.visible = !(this.invulnerable > 0.4 && Math.floor(this.invulnerable * 14) % 2 === 0);
  }

  private animate(dt: number, speed: number): void {
    const f = this.figure;
    if (f.rig) {
      this.animateRig(dt, speed);
      return;
    }
    f.root.position.copy(this.pos);
    f.root.rotation.y = this.yaw;
    this.walkPhase += dt * (3 + speed * 1.5);
    const swing =
      this.grounded && !this.swimming
        ? Math.sin(this.walkPhase) * Math.min(1, speed / 5) * 0.75
        : 0;
    f.legL.rotation.x = swing;
    f.legR.rotation.x = -swing;
    f.body.position.y = this.grounded
      ? Math.abs(Math.cos(this.walkPhase)) * 0.04 * Math.min(1, speed / 5)
      : 0;
    f.body.rotation.x =
      this.dodgeT > 0
        ? (1 - this.dodgeT / PLAYER.dodgeTime) * Math.PI * 2
        : this.swimming
          ? 1.1
          : speed > 6
            ? 0.16
            : 0;
    f.body.position.y += this.dodgeT > 0 ? 0.45 : 0;
    if (!this.grounded && !this.swimming) {
      f.legL.rotation.x = 0.5;
      f.legR.rotation.x = -0.3;
    }
    const bowUp = this.drawing || this.aiming ? 1 : 0;
    const k = Math.min(1, dt * 12);
    // Left arm raises the bow forward; right arm pulls the string back.
    f.armL.rotation.x += ((bowUp ? -Math.PI / 2 : -swing * 0.8) - f.armL.rotation.x) * k;
    f.armL.rotation.z += ((bowUp ? 0.12 : 0.1) - f.armL.rotation.z) * k;
    f.armR.rotation.x +=
      ((bowUp ? -Math.PI / 2 + 0.2 + this.draw * 0.5 : swing * 0.8) - f.armR.rotation.x) * k;
    f.armR.rotation.z += ((bowUp ? -0.55 - this.draw * 0.5 : -0.1) - f.armR.rotation.z) * k;
    f.nocked.visible = this.drawing;
    f.nocked.position.x = 0.1 - this.draw * 0.28;
    f.string.scale.x = 1 + this.draw * 6;
    for (const m of f.skins) m.emissive.setRGB(this.hurtFlash * 3, 0, 0);
    f.root.visible = !(this.invulnerable > 0.4 && Math.floor(this.invulnerable * 14) % 2 === 0);
  }
}
