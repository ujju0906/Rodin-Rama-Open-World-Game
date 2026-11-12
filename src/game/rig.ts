import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Skinned, animated humanoid shared by Rama, the rakshasas and Tataka.
 * The mesh and its idle / walk / run clips come from one GLB (see CREDITS.md);
 * each character re-colours it and attaches its own garments and props to the bones.
 * When a bespoke model exists, swap `public/models/figure.glb` (Mixamo bone names).
 */
let source: GLTF | null = null;

export async function loadRig(): Promise<boolean> {
  try {
    source = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/figure.glb`);
    return true;
  } catch (err) {
    console.warn('Character model failed to load; using simple figures instead.', err);
    return false;
  }
}

export const rigReady = (): boolean => source !== null;

export interface RigPose {
  /** 0..1: bow arm raised towards the aim direction. */
  aim?: number;
  /** 0..1: string hand pulled back. */
  draw?: number;
  /** 0..1: weapon arm raised to strike. */
  attack?: number;
  /** Vertical aim angle in radians (positive = up). */
  pitch?: number;
}

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();

export class Rig {
  readonly scene: THREE.Object3D;
  readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction;
  private readonly bones = new Map<string, THREE.Bone>();
  private blend = 0;

  constructor(skin: number, joints: number, jointGlow?: THREE.Color) {
    const src = source!;
    this.scene = cloneSkinned(src.scene);
    const skinMat = new THREE.MeshStandardMaterial({
      color: skin,
      roughness: 0.55,
      metalness: 0.05,
    });
    const jointMat = new THREE.MeshStandardMaterial({
      color: joints,
      roughness: 0.35,
      metalness: jointGlow ? 0.2 : 0.9,
    });
    if (jointGlow) jointMat.emissive.copy(jointGlow);
    this.materials.push(skinMat, jointMat);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Bone) this.bones.set(o.name.replace('mixamorig', ''), o);
      if (o instanceof THREE.SkinnedMesh) {
        const name = (o.material as THREE.Material).name;
        o.material = name.includes('Joints') ? jointMat : skinMat;
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.scene);
    const clip = (n: string): THREE.AnimationAction => {
      const a = this.mixer.clipAction(THREE.AnimationClip.findByName(src.animations, n)!);
      a.play();
      return a;
    };
    this.idle = clip('idle');
    this.walk = clip('walk');
    this.run = clip('run');
    this.mixer.setTime(Math.random() * 3);
  }

  bone(name: string): THREE.Bone {
    return this.bones.get(name)!;
  }

  /** Parents a prop to a bone. The skeleton is in centimetres, so props are scaled up by 100. */
  attach(bone: string, prop: THREE.Object3D, x = 0, y = 0, z = 0): void {
    const holder = new THREE.Group();
    holder.scale.setScalar(100);
    holder.position.set(x * 100, y * 100, z * 100);
    holder.add(prop);
    this.bone(bone).add(holder);
  }

  /** Turns a bone so that it points along a world direction, blended by `weight`. */
  private point(name: string, child: string, dir: THREE.Vector3, weight: number): void {
    if (weight <= 0.001) return;
    const b = this.bone(name);
    const c = this.bone(child);
    b.updateWorldMatrix(true, true);
    b.getWorldPosition(vA);
    c.getWorldPosition(vB);
    vB.sub(vA).normalize();
    qA.setFromUnitVectors(vB, vC.copy(dir).normalize());
    b.parent!.getWorldQuaternion(qB);
    // New local rotation = parent^-1 * delta * parent * local
    qC.copy(qB).invert().multiply(qA).multiply(qB).multiply(b.quaternion);
    b.quaternion.slerp(qC, weight);
  }

  /** Advances the animation. `speed` is ground speed in m/s; `facing` is the figure's yaw. */
  update(dt: number, speed: number, facing: number, pose: RigPose = {}): void {
    const moving = THREE.MathUtils.clamp(speed / 1.6, 0, 1);
    const running = THREE.MathUtils.clamp((speed - 2.6) / 2.6, 0, 1);
    this.blend += (running - this.blend) * Math.min(1, dt * 8);
    this.idle.setEffectiveWeight(1 - moving);
    this.walk.setEffectiveWeight(moving * (1 - this.blend));
    this.run.setEffectiveWeight(moving * this.blend);
    this.walk.timeScale = THREE.MathUtils.clamp(speed / 1.7, 0.6, 1.8);
    this.run.timeScale = THREE.MathUtils.clamp(speed / 5.5, 0.8, 1.6);
    this.mixer.update(dt);

    const aim = pose.aim ?? 0;
    const attack = pose.attack ?? 0;
    if (aim <= 0.001 && attack <= 0.001) return;
    const pitch = pose.pitch ?? 0;
    const fwd = new THREE.Vector3(
      Math.sin(facing) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(facing) * Math.cos(pitch),
    );
    const right = new THREE.Vector3(-Math.cos(facing), 0, Math.sin(facing));
    const up = new THREE.Vector3(0, 1, 0);
    if (aim > 0) {
      const draw = pose.draw ?? 0;
      // Bow arm: straight out along the aim, slightly to the left.
      const bowDir = fwd.clone().addScaledVector(right, -0.22);
      this.point('LeftArm', 'LeftForeArm', bowDir, aim);
      this.point('LeftForeArm', 'LeftHand', bowDir, aim);
      // String arm: elbow out and back, hand drawn to the cheek.
      this.point(
        'RightArm',
        'RightForeArm',
        fwd
          .clone()
          .multiplyScalar(0.35 - draw * 0.8)
          .addScaledVector(right, 0.85)
          .addScaledVector(up, 0.12),
        aim,
      );
      this.point(
        'RightForeArm',
        'RightHand',
        fwd
          .clone()
          .multiplyScalar(1 - draw * 0.5)
          .addScaledVector(right, -0.9)
          .addScaledVector(up, 0.1),
        aim,
      );
    }
    if (attack > 0) {
      const swing = fwd
        .clone()
        .multiplyScalar(0.2 + attack * 1.2)
        .addScaledVector(up, 1.2 - attack * 1.5)
        .addScaledVector(right, 0.3);
      this.point('RightArm', 'RightForeArm', swing, Math.min(1, attack * 3));
      this.point('RightForeArm', 'RightHand', swing, Math.min(1, attack * 3));
    }
  }

  /** World position of a bone (for props that are not parented, like the bow). */
  worldPos(name: string, out: THREE.Vector3): THREE.Vector3 {
    return this.bone(name).getWorldPosition(out);
  }
}
