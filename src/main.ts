import * as THREE from 'three';
import { Loop, nextFrame } from './core/loop';
import { loadSettings, saveSettings } from './core/settings';
import { ATMOSPHERE } from './data/atmosphere';
import { QUALITY, type QualityName } from './data/quality';
import { SkyEnvironment } from './render/environment';
import { installHeightFog } from './render/fog';
import { createPost, type PostStack } from './render/post';
import { applyRendererQuality, createRenderer } from './render/renderer';
import { Sky } from './render/sky';
import { GameAudio } from './core/audio';
import { Input } from './core/input';
import { FlyCamera } from './game/flyCamera';
import { Game } from './game/game';
import { Hud } from './ui/hud';
import { World } from './render/world';
import { VIEWPOINTS } from './data/world';
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
  setView(i: number): void;
  setRain(amount: number): void;
  stats(): { trees: number; ferns: number; calls: number; tris: number };
  play: Game['debug'];
  photo(on: boolean): void;
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
  sun.shadow.camera.left = sun.shadow.camera.bottom = -95;
  sun.shadow.camera.right = sun.shadow.camera.top = 95;
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

  const world = new World();
  await world.build(scene, (f, label) => loading.setProgress(f, label));
  const fly = new FlyCamera(camera, (x, z) => world.hf.heightAt(x, z));
  fly.attach(canvas);

  const input = new Input(canvas);
  const audio = new GameAudio();
  const hud = new Hud();
  const game = new Game(scene, camera, world, input, audio, hud);
  let photo = false;

  loading.setProgress(0.75, 'Calling the mist');
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
    world.applyQuality(quality.scatterDensity, renderer.getPixelRatio());
    game.fx.setPixelRatio(renderer.getPixelRatio());
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
    setView: (i) => {
      photo = true;
      hud.show(false);
      fly.setView(i % VIEWPOINTS.length, false);
    },
    play: game.debug,
    photo: (on) => {
      photo = on;
      hud.show(!on && game.active);
    },
    setRain: (a) => {
      world.weather.rainTarget = a;
      world.weather.rain = a;
    },
    stats: () => ({
      trees: world.forest.treeCount,
      ferns: world.forest.fernCount,
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
    }),
    setCycle: (on) => {
      cycle = on;
    },
  };

  const focus = new THREE.Vector3();
  const swampFog = new THREE.Color(0.2, 0.3, 0.17);
  let worldTime = 0;
  const update = (rawDt: number, elapsed: number): void => {
    input.poll();
    let scale = 1;
    if (game.active && !photo) scale = game.update(rawDt, elapsed);
    else fly.update(rawDt, elapsed);
    const dt = rawDt * scale;
    worldTime += dt;
    const dark = game.darkness;
    if (cycle) hour = (hour + dt * ATMOSPHERE.cycleSpeed) % 24;
    sky.setHour(hour);
    const s = sky.state;
    const rain = world.weather.rain;
    sky.material.uniforms.uCloudCover!.value = 0.5 + rain * 0.3;
    sky.material.uniforms.uDark!.value = dark;

    // The shadow map follows the camera, snapped to whole texels to avoid shimmer.
    if (game.active && !photo)
      focus
        .copy(game.player.pos)
        .addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 30);
    else
      focus
        .copy(camera.position)
        .addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 45);
    const texel = 190 / quality.shadowMapSize;
    focus.set(
      Math.round(focus.x / texel) * texel,
      world.hf.heightAt(focus.x, focus.z),
      Math.round(focus.z / texel) * texel,
    );
    sun.color.copy(s.lightColor);
    sun.intensity = s.lightIntensity * (1 - rain * 0.45) * (1 - dark * 0.92);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(s.lightDir, 200);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.95, 0.5, s.night) * (1 - dark * 0.9);

    const swamp = world.swampNearness(camera.position);
    fog.color
      .copy(s.fogColor)
      .lerp(swampFog.clone().multiplyScalar(0.25 + 0.75 * (1 - s.night)), swamp * 0.7);
    fog.color.multiplyScalar(1 - dark * 0.93);
    fog.density = s.fogDensity * (1 + rain * 0.9 + swamp * 1.3 + dark * 3.5);

    const sunUp = THREE.MathUtils.smoothstep(s.sunDir.y, -0.06, 0.08);
    sunDisc.position.copy(camera.position).addScaledVector(s.sunDir, 2600);
    (sunDisc.material as THREE.MeshBasicMaterial).color
      .copy(s.lightColor)
      .multiplyScalar(sunUp * (1 - s.night) * 2.4 * (1 - rain * 0.5));

    sky.update(worldTime, camera);
    env.update(quality.envRefreshHours);
    world.update(dt, worldTime, camera.position, sky);

    renderer.info.reset();
    post!.render(rawDt);
    input.endFrame();

    window.__game.fps = loop.fps;
    window.__game.hour = hour;
    meter.update(rawDt, {
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
  audio.start();
  world.weather.rainTarget = 0.35;
  game.getQuality = () => qualityName;
  game.onQuality = (q) => {
    applyQuality(q);
    saveSettings({ ...loadSettings(), quality: q });
  };
  game.start();
  input.requestLock();
  window.__game.started = true;
  hint.textContent = 'Click to take control   ·   Esc: pause and controls';
  setTimeout(() => (hint.style.transition = 'opacity 2s'), 0);
  setTimeout(() => (hint.style.opacity = '0'), 8000);

  canvas.addEventListener('click', () => {
    if (game.active && !game.paused && !input.locked && !photo) input.requestLock();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && game.active && !photo) game.pause();
  });
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f') meter.visible = !meter.visible;
    else if (k === 'p' && !game.paused) {
      // Photo mode: free camera, no HUD.
      photo = !photo;
      hud.show(!photo);
      if (photo) {
        document.exitPointerLock?.();
        fly.position.copy(camera.position);
        fly.yaw = game.camYaw;
        fly.pitch = game.camPitch;
        hint.textContent =
          'Photo mode   ·   Drag: look   WASD QE: move   Shift: fast   V: viewpoints   T [ ]: time   R: rain   P: back';
        hint.style.opacity = '1';
      } else hint.style.opacity = '0';
    } else if (photo) {
      if (k === 't') cycle = !cycle;
      else if (k === '[') hour = (hour + 23.5) % 24;
      else if (k === ']') hour = (hour + 0.5) % 24;
      else if (k === 'r') world.weather.rainTarget = world.weather.rainTarget > 0.05 ? 0 : 0.7;
    }
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  const label = document.getElementById('loading-label');
  if (label) label.textContent = 'Something went wrong while loading. Please reload.';
});
