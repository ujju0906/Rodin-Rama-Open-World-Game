import { expect, test, type Page } from '@playwright/test';

type Hooks = {
  blocked: (x: number, z: number, ignoreMaya?: boolean) => boolean;
  calm: () => void;
  temple: () => { x: number; z: number; maya: { off: boolean }[] };
  teleport: (x: number, z: number) => void;
  look: (yaw: number, pitch: number) => void;
  simulate: (s: number) => void;
  step: (id: string) => void;
  state: () => { step: string; pos: number[] };
};

/** Shortest walkable route on a 1 m grid between two points, treating maya walls as open. */
async function route(page: Page, from: [number, number], to: [number, number]) {
  return page.evaluate(
    ([from, to]) => {
      const g = window.__game.play as unknown as Hooks;
      const ox = 175 - 40;
      const oz = 240 - 40;
      const n = 81;
      const key = (i: number, j: number): number => j * n + i;
      const free = new Uint8Array(n * n);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) free[key(i, j)] = g.blocked(ox + i, oz + j, true) ? 0 : 1;
      const s = key(Math.round(from[0] - ox), Math.round(from[1] - oz));
      const t = key(Math.round(to[0] - ox), Math.round(to[1] - oz));
      const prev = new Int32Array(n * n).fill(-1);
      prev[s] = s;
      const q = [s];
      while (q.length) {
        const c = q.shift()!;
        if (c === t) break;
        const i = c % n;
        const j = Math.floor(c / n);
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const a = i + di;
          const b = j + dj;
          if (a < 0 || b < 0 || a >= n || b >= n) continue;
          const k = key(a, b);
          if (free[k] && prev[k]! < 0) {
            prev[k] = c;
            q.push(k);
          }
        }
      }
      if (prev[t]! < 0) return null;
      const path: [number, number][] = [];
      for (let c = t; c !== s; c = prev[c]!) path.push([ox + (c % n), oz + Math.floor(c / n)]);
      return path.reverse().filter((_, i, a) => i % 3 === 2 || i === a.length - 1);
    },
    [from, to] as const,
  );
}

/** Walks Rama along a route with the real movement code (W held, camera turned towards each point). */
async function walk(page: Page, path: [number, number][]): Promise<void> {
  await page.keyboard.down('w');
  for (const [x, z] of path) {
    const ok = await page.evaluate(
      ([x, z]) => {
        const g = window.__game.play as unknown as Hooks;
        for (let i = 0; i < 200; i++) {
          const [px, , pz] = g.state().pos as [number, number, number];
          if (Math.hypot(x - px, z - pz) < 0.8) return true;
          g.look(Math.atan2(-(x - px), -(z - pz)), -0.1);
          g.calm();
          g.simulate(0.1);
        }
        return false;
      },
      [x, z] as const,
    );
    if (!ok) {
      await page.keyboard.up('w');
      throw new Error(
        `stuck on the way to ${x}, ${z}: ${JSON.stringify(await page.evaluate(() => window.__game.play.state()))}`,
      );
    }
  }
  await page.keyboard.up('w');
}

/** Walks into the temple maze, takes the heart and walks back out, without Divya Drishti or arrows. */
test('the temple maze can be walked in and out', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/?quality=low');
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 120_000 });
  await page.click('#loading-begin');
  await page.waitForFunction(() => window.__game.started === true);
  const outside: [number, number] = [159, 204];
  const heart: [number, number] = [175, 240];
  await page.evaluate(([x, z]) => {
    const g = window.__game.play as unknown as Hooks;
    g.step('maze');
    g.calm();
    g.teleport(x, z);
    g.simulate(0.2);
  }, outside);

  // Without the maya walls the heart must be connected to the gate.
  const inPath = await route(page, outside, heart);
  expect(inPath, 'no route from the gate to the heart').not.toBeNull();
  await walk(page, inPath!);
  await page.evaluate(() => (window.__game.play as unknown as Hooks).simulate(0.5));
  expect((await page.evaluate(() => window.__game.play.state() as { step: string })).step).toBe(
    'deer',
  );

  const here = (await page.evaluate(() => window.__game.play.state() as { pos: number[] })).pos;
  const outPath = await route(page, [here[0]!, here[2]!], outside);
  expect(outPath, 'no route from the heart back out').not.toBeNull();
  await walk(page, outPath!);
  const pos = (await page.evaluate(() => window.__game.play.state() as { pos: number[] })).pos;
  expect(pos[2]!).toBeLessThan(240 - 29); // north of the outer wall
});
