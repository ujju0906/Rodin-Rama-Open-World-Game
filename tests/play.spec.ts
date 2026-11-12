import { expect, test } from '@playwright/test';

type State = {
  step: string;
  health: number;
  enemies: number;
  boss: { hp: number; phase: number } | null;
  pos: number[];
  mayaOpen: number;
};

/**
 * Plays through the key beats of the story using the game's test hooks.
 * Logic is advanced with `simulate` so it does not depend on the (slow) headless frame rate.
 */
test('story beats work end to end', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?quality=${process.env.SHOTS_QUALITY ?? 'low'}`);
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 120_000 });
  await page.click('#loading-begin');
  await page.waitForFunction(() => window.__game.started === true);
  const run = <T>(fn: () => T): Promise<T> => page.evaluate(fn);
  const state = (): Promise<State> => run(() => window.__game.play.state() as State);
  const shot = async (name: string): Promise<void> => {
    if (!process.env.SHOTS) return;
    await page.waitForTimeout(Number(process.env.SHOTS_WAIT ?? 2500));
    await page.screenshot({ path: `screenshots/play-${name}.png` });
  };
  await page.evaluate(() => window.__game.setCycle(false));

  // 1. Start: at the hermitage, practice step.
  expect((await state()).step).toBe('practice');
  await run(() => window.__game.play.simulate(1));
  await shot('start');

  // 2. Ambush: the Agneyastra kills or burns the scouts in front of the player.
  await run(() => {
    const g = window.__game.play;
    g.step('ambush');
    g.teleport(-40 - 13 * Math.cos(0.6) - 9, 150 + 13 * Math.sin(0.6));
    g.look(-Math.PI / 2, -0.05);
    g.simulate(0.2);
    g.cast('agneya');
  });
  await shot('agneya');
  await run(() => window.__game.play.simulate(8));
  const afterFire = await state();
  expect(afterFire.enemies).toBeLessThan(3);

  // 3. Divya Drishti destroys clones.
  await run(() => {
    const g = window.__game.play;
    g.step('riverFight');
    g.teleport(60, 100);
    g.simulate(0.2);
    g.cast('drishti');
    g.simulate(2);
  });
  expect((await state()).enemies).toBeLessThanOrEqual(2);

  // 4. Maze: a pulse at the temple dissolves maya walls.
  await run(() => {
    const g = window.__game.play;
    g.step('maze');
    g.teleport(175 - 16, 240 - 24);
    g.look(Math.PI, -0.05);
    g.simulate(0.3);
    g.cast('drishti');
    g.simulate(0.5);
  });
  await shot('maze');
  await run(() => window.__game.play.simulate(2.5));
  expect((await state()).mayaOpen).toBeGreaterThan(0);

  // 5. Reaching the heart teaches the Vayavyastra and starts the deer chase.
  await run(() => {
    const g = window.__game.play;
    g.teleport(175, 240);
    g.simulate(0.5);
  });
  expect((await state()).step).toBe('deer');
  await run(() => {
    const g = window.__game.play;
    g.teleport(60, 90);
    g.look(0, -0.05);
    g.simulate(0.3);
  });
  await shot('deer');

  // 6. Vimana: board it, fly the whole route on autopilot, land at the swamp.
  await run(() => {
    const g = window.__game.play;
    g.step('vimana');
    g.simulate(0.2);
    g.teleport(165 + 12, -165 + 8);
    g.simulate(0.5);
  });
  expect((await state()).step).toBe('flight');
  await run(() => {
    const g = window.__game.play;
    g.autopilot();
    g.simulate(6);
  });
  await shot('vimana');
  await run(() => window.__game.play.simulate(150));
  expect((await state()).step).toBe('toSwamp');

  // 7. Boss: three phases, then victory.
  await run(() => {
    const g = window.__game.play;
    g.step('toSwamp');
    g.teleport(290 - 20, -270 + 20);
    g.look(-2.2, 0.1);
    g.simulate(1.5);
  });
  let s = await state();
  expect(s.step).toBe('boss');
  await shot('boss');
  await run(() => {
    const g = window.__game.play;
    g.hurtBoss(260);
    g.simulate(1);
    g.cast('vayavya');
    g.simulate(2);
  });
  s = await state();
  expect(s.boss?.phase).toBe(2);
  await shot('cyclone');
  await run(() => {
    const g = window.__game.play;
    g.hurtBoss(240);
    g.simulate(3);
  });
  expect((await state()).boss?.phase).toBe(3);
  await shot('darkness');
  await run(() => {
    const g = window.__game.play;
    g.hurtBoss(1000);
    g.simulate(1);
  });
  expect((await state()).step).toBe('done');
  expect(errors, errors.join('\n')).toEqual([]);
});
