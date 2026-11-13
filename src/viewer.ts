import * as THREE from 'three';
import { createDeer, createRakshasa, createTataka } from './game/models';
import { Player } from './game/player';
import { loadRig } from './game/rig';
import { Vimana } from './game/vimana';

/** Developer page: the characters side by side under plain light, for checking models and poses. */
async function main(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x52606e);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a3a2a, 2.2));
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.5);
  sun.position.set(-4, 6, 6);
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x3b4a2c }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot === '1') {
    camera.position.set(-2.9, 1.5, 6.2);
    camera.lookAt(-2.9, 1.05, 0);
  } else {
    camera.position.set(1.3, 1.3, 4.6);
    camera.lookAt(1.3, 1.0, 0);
  }

  await loadRig();
  type Posable = { animate(dt: number, speed: number): void };
  const make = (x: number, yaw: number, set: (p: Player) => void): Player => {
    const p = new Player();
    p.pos.set(x, 0, 0);
    p.yaw = yaw;
    set(p);
    scene.add(p.root);
    return p;
  };
  const players = [
    make(-4.6, 0.25, () => undefined),
    make(-2.9, Math.PI / 2 + 0.5, (p) => {
      p.drawing = true;
      p.draw = 0.85;
    }),
    make(-1.2, Math.PI + 0.5, () => undefined),
  ];
  const grunt = createRakshasa('grunt');
  grunt.root.position.set(0.5, 0, 0);
  grunt.root.rotation.y = -0.3;
  grunt.root.scale.setScalar(1.15);
  const archer = createRakshasa('archer');
  archer.root.position.set(2.1, 0, 0);
  archer.root.rotation.y = -0.6;
  const tataka = createTataka();
  tataka.root.position.set(4.6, 0, -3);
  tataka.root.rotation.y = -0.35;
  tataka.root.scale.setScalar(2.2);
  const deer = createDeer();
  deer.root.position.set(-0.6, 0, 1.2);
  deer.root.rotation.y = 1.9;
  const vimana = new Vimana();
  vimana.park(9.5, 1.2, -6);
  scene.add(grunt.root, archer.root, tataka.root, deer.root, vimana.group);

  let t = 0;
  const frame = (): void => {
    t += 1 / 60;
    players.forEach((p, i) => (p as unknown as Posable).animate(1 / 60, i === 2 ? 6 : 0));
    for (const [f, pose, speed] of [
      [grunt, { attack: 0.5 + 0.5 * Math.sin(t * 2) }, 0],
      [archer, { aim: 1 }, 0],
      [tataka, {}, 1.2],
    ] as const) {
      f.root.updateMatrixWorld(true);
      f.rig?.update(1 / 60, speed, f.root.rotation.y, pose);
    }
    renderer.render(scene, camera);
    (window as unknown as { __frames: number }).__frames = t;
    requestAnimationFrame(frame);
  };
  frame();
}
void main();
