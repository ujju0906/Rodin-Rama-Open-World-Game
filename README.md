# Ramayana: Path of the Bow

A third-person action-adventure in the browser (Three.js + TypeScript). You play Rama through the Dandaka Forest: archery, astras, Divya Drishti, the golden deer, a vimana flight and the fight with Tataka.

## Run it on your computer

1. Install Node.js 20 or newer (nodejs.org).
2. In this folder: `npm install`
3. `npm run dev`, then open http://localhost:5173

## Build the website

`npm run build` writes the finished site to the `dist` folder. It is plain static files: any web host works. (`viewer.html` and `assets/viewer-*.js` in `dist` are a developer page; you can delete them before uploading.)

## Put it online (pick one)

- **Netlify Drop (fastest):** go to app.netlify.com/drop and drag the `dist` folder onto the page.
- **Cloudflare Pages:** create a Pages project, choose "Direct upload" and upload `dist`. Or connect this repository with build command `npm run build` and output folder `dist`.
- **Vercel:** import the repository; the build command and `dist` output are detected.
- **GitHub Pages:** push this repository to GitHub, then Settings > Pages > Source: "GitHub Actions". The included workflow (`.github/workflows/pages.yml`) builds and publishes on every push to `main`.

The site uses relative paths, so it also works from a sub-folder (for example `username.github.io/repository/`).

## Controls

W A S D move, mouse look, Shift sprint, Ctrl dodge, Space jump. Hold and release the left mouse button to shoot (right button aims). Hold Q to chant an astra; hold Tab for the astra wheel (or press 1 / 2). E is Divya Drishti. Esc pauses. P is photo mode. F shows the frame rate. Gamepads work too.

## Where things are

- `src/data` — all gameplay numbers, the world layout and quality presets. Change values here without touching code.
- `src/game` — player, bow, astras, enemies, boss, vimana, story.
- `src/render` — sky, fog, terrain, water, forest, weather, post-processing.
- `src/assets/audio` — optional music and narration files (see the README there).
- `DESIGN.md` (design), `DEVLOG.md` (what is done, what is next, known issues), `CREDITS.md` (asset sources and licenses).

## Tests

`npm test` runs a start-up test and a full story run in headless Chrome. Set `CHROME_PATH` if Playwright's own browser is not installed.
