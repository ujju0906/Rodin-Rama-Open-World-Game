# DEVLOG

## Done
- **Phase 0 (2026-11-12):** Toolchain checked (Node v22.23.4, npm 10.9.9, git 2.43.0). `DESIGN.md` written. Git repository started.
- **Phase 1 (2026-11-12): Foundation.**
  - Vite 8 + TypeScript 6 (strict), Three.js 0.187, postprocessing 6.39.6, Rapier 0.21 installed (not used yet). All versions pinned. ESLint + Prettier clean.
  - Renderer with HDR pipeline; post stack: god rays, bloom, ACES tone mapping, code-generated saffron/teal LUT grade, vignette, SMAA.
  - Procedural sky with day/night cycle (sun, moon, stars, clouds); image-based lighting baked from the sky itself and re-baked as the hour changes.
  - Height fog through replaced Three.js fog shader chunks (works on every standard material, including instanced).
  - Low / Medium / Ultra presets in `src/data/quality.ts`, auto-picked by a short benchmark, switchable with keys 1 2 3, saved to localStorage. `?quality=low|medium|ultra` forces one.
  - Loading screen with progress and a Begin button; FPS meter (dev mode or `?fps`).
  - Test scene: terrain, lamp shrine, instanced wind-blown grass, trees, rocks, embers by day and fireflies by night.
  - Playwright smoke test (`npm test`) and review screenshots (`SHOTS=1 npx playwright test shots`).
- **Concept art:** generated in Higgsfield (GPT Image 2.6, unlimited allowance). Prompts and links in `ArtRef/concept-art.md`.

- **Phase 2 (2026-11-12): The forest.** 1 x 1 km baked heightfield with river channel, swamp basin, clearings and footpaths; four-layer splat ground (mud, moss, rock, sand) with rain wetness; river and swamp water shader (sky reflection, sun glitter, depth colour, foam, rain chop); about 7,000 instanced trees of three kinds with leaf cards, hanging banyan roots, two LODs and chunk culling; about 16,000 ferns; camera-following grass and swamp reeds; rain and fireflies; hermitage, two lamp shrines, wooden bridge, ruined temple with a real generated maze, swamp idols and standing stones. All textures are generated in code.
- **Playable game (Phases 3, 4 and parts of 5 and 6, 2026-11-12).**
  - Rama (procedural placeholder figure): run, sprint, jump, dodge roll, swim, third-person camera with wall avoidance.
  - Kodanda: hold-to-draw, gravity, glowing trail, arrows stick, headshots, focus slow-motion (draw in the air or right after a dodge).
  - Astras as data: Agneyastra (fire cone, burn) and Vayavyastra (cyclone that lifts enemies and clears poison); chant rings; a hit breaks the chant.
  - Divya Drishti pulse: destroys clones, dissolves maya walls, unmasks the golden deer, reveals Tataka in the dark.
  - Enemies: rakshasa grunt, archer, maya clone, Maricha. State-machine AI with flanking and range keeping.
  - Story: practice targets, forest shrine and ambush, river shrine, temple maya maze, golden deer chase, Maricha, Tataka (fury, brood, darkness), victory.
  - HUD (health, focus, astra cooldowns, compass, boss bar, story text), pause menu with controls, quality, volume and sensitivity, save and resume (localStorage), respawn at shrines, photo mode (P).
  - All sound is synthesised with Web Audio: rain, drone, combat pulse, bow, astras, hits.
  - Tests: `npm test` runs the smoke test and an end-to-end story test (`tests/play.spec.ts`) that drives every beat through to victory.

- **Art and vimana pass (2026-11-12).**
  - The ten Higgsfield concept images (attached by Ujwal) are in `/ArtRef` and `public/art` as web-sized JPEGs.
  - Title screen uses the key art. Illustrated full-screen story cards at the hermitage, the shrines, the temple, the golden deer, the vimana, Tataka and the ending.
  - Vimana flight (Phase 5): procedural craft with lotus-petal wings and teal crystals, arcade flight with boost and dives, speed-based field of view, eight gates of light over the whole map, a storm with rain, darkness and lightning, three waves of sky rakshasas, arrows from the deck. The flight lands at the swamp.
  - Higgsfield 3D cost checked: a textured, rigged Rama (Meshy 7 image-to-3D) is 44 credits; an unrigged single-object mesh (SAM 3) is 1 credit. Balance is 0.5, so no 3D model was generated.

- **Character pass (2026-11-12).**
  - Rama, the rakshasas, Maricha and Tataka are now skinned, animated 3D figures: one rigged humanoid (`src/assets/figure.glb`, the three.js example model "Xbot", Mixamo skeleton) with idle, walk and run clips blended by speed. Each character re-colours it and attaches its own hair, garments, armour and weapons to the bones.
  - Aiming, drawing and striking are posed in code on top of the clips (arm bones are pointed along the aim), and the bow follows the left hand.
  - If the model fails to load, the old jointed figures are used.
  - Tree trunks now block Rama and enemies.
  - `viewer.html` is a developer page that shows the characters side by side (`VIEWER=1 npx playwright test viewer`). It is not published.

## Next
- Real character models: Higgsfield image-to-3D with rigging needs credits (balance is 0.5).
- Astra wheel (radial menu), ledge climbing, skill trees, cutscene cameras, depth of field.
- Cascaded shadows; Rapier physics (installed but not used: movement is a simple kinematic controller on the heightfield).
- Phase 7 hosting on a public host (Netlify, Cloudflare Pages or GitHub Pages).

## Known issues
- Frame rate is unverified on real hardware: headless Chrome here uses software rendering (about 0.3 fps on Low). Press F in the game to see the meter; change quality in the pause menu.
- Characters share one mannequin-style body with a smooth, featureless face. They are animated and dressed, but not the painterly look in the concept art; that still needs bespoke models.
- The golden deer and the flying rakshasas in the vimana section are still simple shapes.
- Enemies walk in straight lines and can get stuck on temple walls or trees.
- The golden deer chase needs only one Divya Drishti pulse at the end of its route; earlier pulses just make it flicker.
- Tataka has 720 health, not the 1200 in the design draft (tuned in `src/data/gameplay.ts`).
- Trees are not cleared around the swamp arena's far edge, so arrows there can be blocked visually but not physically.
- This workspace cannot download from Higgsfield's host, so any generated GLB has to be downloaded by Ujwal and attached before it can go into the game.
- The vimana cannot be failed: if the hull reaches zero the craft finishes the route on its own.

## Controls
W A S D move, mouse look, Shift sprint, Ctrl dodge, Space jump. Hold and release left mouse to shoot (right mouse aims). Hold Q to chant an astra (1 / 2 or Tab to choose). E for Divya Drishti. Esc pauses. P photo mode. F stats. Gamepad is supported.
