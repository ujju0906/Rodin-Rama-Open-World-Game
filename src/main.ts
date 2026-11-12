import * as THREE from 'three';
import { Loop, nextFrame } from './core/loop';
import { loadSettings, saveSettings } from './core/settings';
import { ATMOSPHERE } from './data/atmosphere';
import { QUALITY, QUALITY_ORDER, type QualityName } from './data/quality';
import { SkyEnvironment } from './render/environment';
import { installHeightFog } from './render/fog';
import { createPost, type PostStack } from './render/post';
import { applyRendererQuality, createRenderer } from './render/renderer';
import { Sky } from './render/sky';
import { buildTestScene, heightAt } from './render/testScene';
import { FpsMeter } from './ui/fpsMeter';
import { LoadingScreen } from './ui/loadingScreen';

interface GameDebug {
  ready: boolean;
  started: boolean;
  fps: number;
  quality: QualityName;
  hour: number;
  setHour(h: number): void;
  setQuality(q: QualityName): void;
  setOrbit(angle: number): void;
  setCycle(on: boolean): void;
}
declare global {
  interface Window {
    __game: GameDebug;
  }
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const loading = new LoadingScreen();
  const settings = loadSettings();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hint = document.getElementById('hint')!;

  loading.setProgress(0.08, 'Kindling the light');
  await nextFrame();

  installHeightFog();
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.3, 4000);

  let qualityName: QualityName = 'medium';
  let quality = QUALITY[qualityName];

  loading.setProgress(0.22, 'Raising the sky');
  await nextFrame();

  const sky = new Sky(quality.cloudOctaves);
  scene.add(sky.mesh);
  const fog = new THREE.FogExp2(0xffffff, 0.01);
  scene.fog = fog;
  const env = new SkyEnvironment(renderer, scene, sky);

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -75;
  sun.shadow.camera.right = sun.shadow.camera.top = 75;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);

  // Bright disc used only as the source for god rays.
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(70, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  sunDisc.frustumCulled = false;
  scene.add(sunDisc);

  loading.setProgress(0.45, 'Growing the forest');
  await nextFrame();
  const world = buildTestScene(scene);

  loading.setProgress(0.7, 'Calling the mist');
  await nextFrame();

  let post: PostStack | null = null;
  const applyQuality = (name: QualityName): void => {
    qualityName = name;
    quality = QUALITY[name];
    applyRendererQuality(renderer, quality);
    sun.castShadow = quality.shadows;
    sun.shadow.mapSize.setScalar(quality.shadowMapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sky.setCloudOctaves(quality.cloudOctaves);
    world.rebuildScatter(quality.scatterDensity, renderer.getPixelRatio());
    post?.dispose();
    post = createPost(renderer, scene, camera, sunDisc, quality);
    resize();
    env.update(0, true);
    window.__game.quality = name;
  };

  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    post?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  // Clock and camera state.
  let hour: number = ATMOSPHERE.startHour;
  let cycle = true;
  let orbit = 0.9;
  let orbitAuto = true;
  let dragging = false;
  let dragX = 0;

  const meter = new FpsMeter();
  meter.visible = import.meta.env.DEV || params.has('fps');

  window.__game = {
    ready: false,
    started: false,
    fps: 0,
    quality: qualityName,
    hour,
    setHour: (h) => {
      hour = h;
    },
    setQuality: (q) => applyQuality(q),
    setOrbit: (a) => {
      orbit = a;
      orbitAuto = false;
    },
    setCycle: (on) => {
      cycle = on;
    },
  };

  const camPos = new THREE.Vector3();
  const update = (dt: number, elapsed: number): void => {
    if (cycle) hour = (hour + dt * ATMOSPHERE.cycleSpeed) % 24;
    sky.setHour(hour);
    const s = sky.state;

    // Slow cinematic orbit around the shrine.
    if (orbitAuto && !dragging) orbit += dt * 0.035;
    const radius = 27 + Math.sin(elapsed * 0.05) * 5;
    camPos.set(Math.cos(orbit) * radius, 0, Math.sin(orbit) * radius);
    camPos.y = Math.max(heightAt(camPos.x, camPos.z) + 2.2, 3.2 + Math.sin(elapsed * 0.07) * 1.2);
    camera.position.copy(camPos);
    camera.lookAt(world.focus.x, world.focus.y + 1.2, world.focus.z);

    sun.color.copy(s.lightColor);
    sun.intensity = s.lightIntensity;
    sun.target.position.copy(world.focus);
    sun.position.copy(world.focus).addScaledVector(s.lightDir, 180);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.95, 0.5, s.night);

    fog.color.copy(s.fogColor);
    fog.density = s.fogDensity;

    const sunUp = THREE.MathUtils.smoothstep(s.sunDir.y, -0.06, 0.08);
    sunDisc.position.copy(camera.position).addScaledVector(s.sunDir, 2600);
    (sunDisc.material as THREE.MeshBasicMaterial).color
      .copy(s.lightColor)
      .multiplyScalar(sunUp * (1 - s.night) * 2.4);

    sky.update(elapsed, camera);
    env.update(quality.envRefreshHours);
    world.update(dt, elapsed, s);

    renderer.info.reset();
    post!.render(dt);

    window.__game.fps = loop.fps;
    window.__game.hour = hour;
    meter.update(dt, {
      fps: loop.fps,
      ms: loop.frameMs,
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      quality: quality.label,
      hour,
    });
  };
  const loop = new Loop(update);

  // Pick a quality preset: URL (?quality=low) > saved setting > quick benchmark.
  const requested = (params.get('quality') ?? settings.quality) as QualityName | undefined;
  const sampleMs = async (frames: number): Promise<number> => {
    for (let i = 0; i < 8; i++) await nextFrame(); // let shaders compile
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) await nextFrame();
    return (performance.now() - t0) / frames;
  };

  applyQuality(requested && requested in QUALITY ? requested : 'medium');
  loop.start();
  if (!requested || !(requested in QUALITY)) {
    loading.setProgress(0.85, 'Measuring your machine');
    const medium = await sampleMs(30);
    if (medium > 26) {
      applyQuality('low');
    } else if (medium < 17.6) {
      applyQuality('ultra');
      const ultra = await sampleMs(24);
      if (ultra > 18.8) applyQuality('medium');
    }
  }

  loading.setProgress(1, 'Ready');
  window.__game.ready = true;
  await loading.waitForBegin();
  loading.hide();
  window.__game.started = true;
  hint.textContent =
    'Drag: look around   T: time flow   [ ]: change hour   1 2 3: quality   F: stats';
  setTimeout(() => (hint.style.transition = 'opacity 2s'), 0);
  setTimeout(() => (hint.style.opacity = '0'), 9000);

  // Dev / test-scene controls.
  window.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T') cycle = !cycle;
    else if (e.key === '[') hour = (hour + 23.5) % 24;
    else if (e.key === ']') hour = (hour + 0.5) % 24;
    else if (e.key === 'f' || e.key === 'F') meter.visible = !meter.visible;
    else if (e.key >= '1' && e.key <= '3') {
      const name = QUALITY_ORDER[Number(e.key) - 1]!;
      applyQuality(name);
      saveSettings({ ...loadSettings(), quality: name });
    }
  });
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    orbit -= (e.clientX - dragX) * 0.005;
    dragX = e.clientX;
  });
  canvas.addEventListener('pointerup', () => (dragging = false));
}

boot().catch((err: unknown) => {
  console.error(err);
  const label = document.getElementById('loading-label');
  if (label) label.textContent = 'Something went wrong while loading. Please reload.';
});
