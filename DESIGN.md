# Ramayana: Path of the Bow — Design Document

Living document. Numbers here are starting values; all of them live in `src/data/*.ts` so they can be tuned without touching systems.

## 1. Pitch

A third-person action-adventure in the browser. You are Rama in exile. You fight with the bow Kodanda and chanted astras, fly a vimana above the monsoon clouds, and use Divya Drishti to see through the maya that Ravana's side casts over the world. Theme: **dharma under illusion** — the right path is always there, but it is rarely the one that glitters.

First release: one polished region, the **Dandaka Forest** (about 25 to 35 minutes of play).

## 2. Pillars

1. **The bow feels divine.** Draw, hold, release. Every shot has weight, a trail and a consequence.
2. **Nothing is quite what it seems.** Maya is a mechanic, not decoration. Seeing truly is a skill the player practises.
3. **A film still at every moment.** Golden-hour light, fog, embers, rain. The first 10 seconds must impress.
4. **Dignity.** Sacred figures are portrayed with reverence. No comedy, no sexualisation.
5. **Built to grow.** Regions, astras, enemies and quests are data. A new region plugs in without new systems.

## 3. The five regions

| # | Region | Mood and palette | Signature mechanic | Boss | Release |
|---|--------|------------------|--------------------|------|---------|
| 1 | Ayodhya | Golden city, saffron and temple gold, dawn | Tutorial, archery contest, the exile | none (story) | later |
| 2 | **Dandaka Forest** | Monsoon jungle, teal and wet green, fog and fireflies | Golden deer chase, maya maze, first vimana flight | **Tataka** | **first release** |
| 3 | Kishkindha | Red rock, waterfalls, vanara city in cliffs | Climbing, Hanuman as ally, duel of Vali and Sugriva | Vali (moral choice framing) | later |
| 4 | Rama Setu | Indigo ocean, storm, floating stones | Bridge building under attack, Varunastra | Sea serpents / Simhika | later |
| 5 | Lanka | Gold and obsidian, vermilion fire, night | The shifting Maya Labyrinth, Brahmastra | Indrajit, Kumbhakarna, Ravana | later |

A region is a folder of data: heightmap, splat map, scatter rules, points of interest, quest list, enemy spawn tables, lighting preset.

## 4. Characters

- **Rama** (player): calm, dusky blue-tinged skin, bark-cloth exile garments, hair in a topknot, the bow Kodanda.
- **Lakshmana**: voice and presence at the hermitage; guards it, gives guidance. Not a combat companion in release 1.
- **Sita**: at the hermitage; her wish for the golden deer starts the chase. Shown with grace and agency.
- **Vishwamitra** (memory / voice): teaches the astra chants at shrines.
- **Maricha**: the rakshasa hidden inside the golden deer.
- **Tataka**: the yakshini turned rakshasi who poisons the swamp. Boss.
- **Later:** Hanuman (mace and crown), Sugriva, Jatayu, Vibhishana, Indrajit, Kumbhakarna, Ravana.

## 5. Story beats — Dandaka Forest

1. **Title.** Slow camera drift over the misted canopy at dawn.
2. **The hermitage.** Wake at Panchavati. Lakshmana points to the practice targets. Learn to draw and shoot.
3. **First shrine.** Vishwamitra's teaching returns as a chant: unlock **Agneyastra**. Rakshasa scouts attack the path.
4. **The river shrine.** Unlock **Divya Drishti**. A fake bridge teaches the pulse.
5. **The golden deer.** Sita sees it. The chase leads off the path; correct pulses reveal the true route. At the end the deer dissolves and **Maricha** stands revealed. Short fight.
6. **The ruined temple (maya maze).** The way back is closed by illusion. Corridors rearrange when unseen. Unlock **Vayavyastra** at the heart.
7. **The vimana.** A shrine on the temple roof summons it. Fly above the canopy, through the storm, fighting airborne rakshasas.
8. **Tataka.** Land in the swamp. Three-phase fight.
9. **Closing panel.** The forest breathes again. A crow's-eye shot south, towards Kishkindha: "The path of the bow continues."

Story is told with short text panels (2 to 3 lines) and in-engine camera shots. No long dialogue.

## 6. Core systems and numbers

### Player

| Stat | Value |
|------|-------|
| Health | 100 |
| Walk / run / sprint | 2.0 / 5.5 / 8.5 m/s |
| Jump height | 1.4 m |
| Dodge roll | 5 m in 0.45 s, 0.3 s invulnerable, 0.8 s cooldown |
| Swim speed | 3.0 m/s |
| Focus meter | 100; drains 50/s in focus mode (2 s max); regains 12/s, +15 per headshot |

### Bow — Kodanda

| Stat | Value |
|------|-------|
| Draw time | 0 to 1.2 s |
| Arrow speed | 35 m/s (tap) to 90 m/s (full draw) |
| Damage | 12 (tap) to 40 (full draw); headshot x2 |
| Gravity on arrow | 9.8 m/s² x 0.6 |
| Crosshair spread | 4° (tap) to 0.3° (full draw) |
| Focus mode | time scale 0.3 for up to 2 s, when drawing in the air or within 0.5 s of a dodge |
| Hit reactions | flinch under 20 dmg, stagger 20 to 39, knockback 40+ |

### Astras

Chanting: hold the astra key. Glyph rings spin up around the arrow. Taking a hit breaks the chant and costs half the cooldown.

| Astra | Deity | Chant | Cooldown | Effect | Status |
|-------|-------|-------|----------|--------|--------|
| Agneyastra | Agni | 1.5 s | 25 s | Fire cone 18 m, 50°. 60 dmg + burn 8/s for 5 s. Ignites foliage for 6 s | Release 1 |
| Vayavyastra | Vayu | 2.0 s | 30 s | Cyclone, 7 m radius, 4 s. Lifts enemies, 30 dmg + 25 on fall. Douses fire, clears fog | Release 1 |
| Varunastra | Varuna | 2.0 s | 35 s | Tidal wave 25 m line. 45 dmg, pushes back, soaks (fire immune, lightning weak) | Data only |
| Nagastra | Nagas | 2.5 s | 40 s | Serpent bind: up to 5 enemies rooted 6 s, 5 dmg/s | Data only |
| Brahmastra | Brahma | 3.0 s | 180 s | Ultimate. 30 m blast, 400 dmg. Needs full Dharma meter | Data only |

Astra wheel: hold the wheel key, time scale 0.15 while open, release to select.

Each astra is one data entry: `{ id, chantTime, cooldown, shape, damage, statusEffect, vfx, sfx }`.

### Divya Drishti

Pulse: 40 m radius, 8 s cooldown, expands in 1.2 s as a screen-space ripple. Real things glow gold for 5 s. Illusions flicker violet and dissolve (walls and bridges for 10 s; clones die). Arrows pass through fake walls and stop on real ones — a no-cooldown way to test a wall.

### Vimana

| Stat | Value |
|------|-------|
| Cruise / boost / dive max | 30 / 55 / 75 m/s |
| Boost | 3 s, 6 s recharge |
| Pitch / yaw / roll rate | 60 / 45 / 120 °/s |
| FOV | 60° at cruise to 85° at max speed |
| Hull | 150 |

Procedural model: stepped golden shikhara hull, lotus-petal wings that open with speed, teal crystals that pulse with boost.

### Enemies

| Enemy | HP | Damage | Speed | Behaviour |
|-------|----|--------|-------|-----------|
| Rakshasa grunt | 60 | 15 melee | 4.5 m/s | Patrol, alert, chase, flank in pairs |
| Rakshasa archer | 40 | 12 per arrow, every 2.5 s | 3.5 m/s | Keeps 15 to 25 m, retreats if closer than 8 m |
| Maya clone | 1 | 10 | 5 m/s | Looks like a grunt, bursts into violet smoke. Dies to a Drishti pulse |
| Sky rakshasa (flight) | 30 | 10 | 35 m/s | Swoops at the vimana in groups of 3 |
| Maricha (mini-boss) | 350 | 20 | 6 m/s | Blinks, spawns 3 deer illusions; only the real one casts a shadow |

AI is a small state machine: `patrol → alert → chase → attack`, plus `flank` (grunts) and `keepRange` (archers). Sight 25 m in a 110° cone, hearing 12 m.

### Boss — Tataka (swamp arena, 60 m across)

| Phase | Health | Behaviour |
|-------|--------|-----------|
| 1. Fury | 1200 to 800 | Charges in a line (dodge sideways, she hits a tree and is stunned 3 s), boulder throw |
| 2. Brood | 800 to 400 | Retreats to the centre, summons waves of 4 grunts + 2 clones, poison pools. Vayavyastra clears poison mist |
| 3. Darkness | 400 to 0 | The arena goes black. She is invisible; Divya Drishti reveals her for 5 s. Agneyastra lights the reeds for a window of visibility |

Cinematic intro (she rises from the water, 8 s) and defeat (light breaks through the canopy, 10 s).

## 7. Progression

XP from enemies, shrines and discoveries. One skill point per level, max level 20 across all regions. Release 1 reaches about level 8. Each tree has 6 nodes; a node costs 1 point and needs the one before it.

**Dharma (resolve and survival)**
1. Steadfast: +20 health
2. Calm Breath: focus regains 25% faster
3. Righteous Guard: dodge invulnerability 0.3 s → 0.45 s
4. Vow of Exile: heal 15 health at each shrine visit and on each elite kill
5. Unshaken: chants are not broken by the first hit
6. Dharma's Shield: once per fight, a killing blow leaves you at 1 health

**Shakti (the bow and the astras)**
1. Strong Arm: draw time 1.2 s → 1.0 s
2. Piercing Shaft: full-draw arrows pass through one enemy
3. Twin Arrow: every 5th full-draw shot fires two arrows
4. Swift Chant: chant times −20%
5. Kindled: astra cooldowns −20%
6. Mantra Mastery: a perfectly timed release (last 0.2 s of the chant) gives +50% astra damage

**Drishti (sight and truth)**
1. Wide Eye: pulse radius 40 m → 55 m
2. Quick Sight: pulse cooldown 8 s → 6 s
3. Lingering Truth: reveal lasts 5 s → 8 s
4. Marked Prey: revealed enemies take +20% damage
5. Unmasking: a pulse staggers illusions' casters for 2 s
6. True Arrow: arrows fired at revealed targets curve slightly to find them

## 8. Controls

| Action | Keyboard + mouse | Gamepad |
|--------|------------------|---------|
| Move / look | WASD / mouse | Left stick / right stick |
| Sprint / dodge / jump | Shift / C / Space | L3 / B / A |
| Aim / draw and release | Right mouse / left mouse | LT / RT |
| Chant astra | Hold Q | Hold RB |
| Astra wheel | Hold Tab | Hold LB |
| Divya Drishti | E | Y |
| Interact (shrine, climb) | F | X |
| Pause | Esc | Start |

## 9. Art pipeline (Higgsfield)

- Images (concept art, title and loading backgrounds, tileable textures) are generated in Higgsfield and saved in `/ArtRef` with the prompt beside them.
- Textures become PBR materials (normal and roughness derived when missing).
- 3D models (Rama, Tataka, rakshasas, deer, shrine pieces) come from image-to-3D with rigging, then get optimised (Meshopt, KTX2) and checked for scale and pivot.
- Anything missing is built procedurally so there are never gaps.
- Every asset and its source is logged in `CREDITS.md`.

## 10. Phase plan

| Phase | What you get at the end |
|-------|-------------------------|
| 0. Plan | This document |
| 1. Foundation | Vite + TypeScript project, renderer, post-processing, sky with day/night, fog, quality presets, FPS meter, loading screen, smoke test. A beautiful empty test scene |
| 2. The forest | 1 x 1 km terrain, river, instanced monsoon forest, rain, fireflies, hermitage, ruined temple, swamp. 5 viewpoints at dawn and night |
| 3. Hero and archery | Rama, movement, camera, bow, arrows, focus slow-motion, target practice |
| 4. Astras, enemies, maya | Astra system and wheel, Agneyastra, Vayavyastra, enemy AI, Divya Drishti, golden deer chase, maya maze |
| 5. Vimana and boss | Flight, aerial combat, storm route, Tataka |
| 6. Story, sound, polish | Title screen, story beats, audio, HUD, menus, saving, juice, performance pass |
| 7. Ship it | Production build, compressed assets, share image, public link |

Each phase ends with: the game run in a headless browser, screenshots, console checked for errors, a git commit and a stop for review.
