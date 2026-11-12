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

## Next
- **Phase 2: The forest.** 1 x 1 km heightmap terrain with splat-blended materials, river with water shader, instanced monsoon forest with proper foliage (alpha-card leaves, LODs), rain, hermitage, ruined temple, swamp. Cascaded shadows for the sun.

## Known issues
- Frame rate has only been measured in headless Chrome with software rendering (about 1 fps there, which is expected without a GPU). 60 fps on a real laptop is not verified yet; check the meter with `?fps`.
- This cloud workspace cannot download files from Higgsfield's image host, so the concept images are not in `/ArtRef` as files and are not used in the game yet (loading screen background is CSS). Drop the image files into `/ArtRef` to change that.
- Trees and rocks in the test scene are simple placeholders; Phase 2 replaces them.
- Shadows use one shadow map that follows the scene focus; cascades come in Phase 2.
- Depth of field (cutscenes only) is planned for Phase 6.
- No HDRI file is used: lighting comes from the procedural sky. A Poly Haven HDRI can be added later if wanted.
- Higgsfield credit balance is 0.5: enough for nothing in 3D. Image allowance ends 2026-11-15.

## Controls (test scene)
Drag: look around. T: pause/resume time. [ and ]: change hour. 1 2 3: Low / Medium / Ultra. F: stats.
