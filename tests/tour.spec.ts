import { test } from '@playwright/test';

/**
 * Plays the game through the real keyboard and mouse path and saves screenshots for review.
 * Run with TOUR=1. Game time is advanced with `simulate`, so it does not depend on the headless frame rate.
 */
test('input-driven tour', async ({ page }) => {
  test.skip(!process.env.TOUR, 'run with TOUR=1');
  test.setTimeout(1_500_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?quality=${process.env.SHOTS_QUALITY ?? 'low'}`);
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 200_000 });
  await page.click('#loading-begin');
  await page.waitForFunction(() => window.__game.started === true);
  await page.evaluate(() => window.__game.setCycle(false));
  const sim = (s: number): Promise<void> => page.evaluate((x) => window.__game.play.simulate(x), s);
  const state = (): Promise<Record<string, unknown>> =>
    page.evaluate(() => window.__game.play.state() as Record<string, unknown>);
  let n = 0;
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(Number(process.env.SHOTS_WAIT ?? 1200));
    await page.screenshot({ path: `screenshots/tour-${String(++n).padStart(2, '0')}-${name}.png` });
    console.log(name, JSON.stringify(await state()));
  };
  const key = page.keyboard;

  if (process.env.TOUR_PART !== '2') {
    // 1. Walk and sprint with real keys.
    await sim(0.5);
    await shot('spawn');
    await key.down('w');
    await sim(2);
    await shot('walking');
    await key.down('Shift');
    await sim(1.5);
    await key.up('Shift');
    await key.up('w');
    await shot('after-sprint');

    // 2. Draw and release the bow with the real mouse.
    await page.evaluate(() => {
      window.__game.play.teleport(-150, 14);
      window.__game.play.look(0, -0.02);
    });
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await sim(1.0);
    await shot('bow-drawn');
    await page.mouse.up();
    await sim(0.6);
    await shot('arrow-loosed');

    // 3. Dodge and jump.
    await key.press('c');
    await sim(0.2);
    await shot('dodge');
    await sim(1);
    await key.down(' ');
    await sim(0.25);
    await key.up(' ');
    await shot('jump');
    await sim(1);
  }

  // 4. Agneyastra by holding Q against the ambush.
  await page.evaluate(() => {
    const g = window.__game.play;
    g.step('ambush');
    g.teleport(-40 - 24 * Math.cos(0.6) - 17, 150 + 24 * Math.sin(0.6));
    g.look(-Math.PI / 2, -0.05);
  });
  await sim(1.4);
  await shot('ambush');
  await key.down('q');
  await sim(1.0);
  await shot('chanting');
  await sim(0.6);
  await key.up('q');
  await sim(0.15);
  await shot('agneya-cast');
  await sim(1.5);
  await shot('ground-burning');

  // 5. Vayavyastra: select with 2, chant, release; it should put out fires and thin the mist.
  await key.press('2');
  await sim(0.1);
  await key.down('q');
  await sim(2.1);
  await key.up('q');
  await sim(0.6);
  await shot('cyclone');
  await sim(2.5);
  await shot('mist-cleared');

  // 6. Divya Drishti with E at the river fight.
  await page.evaluate(() => {
    const g = window.__game.play;
    g.step('riverFight');
    g.teleport(60, 96);
    g.look(Math.PI, -0.05);
  });
  await sim(0.4);
  await shot('river-fight');
  await key.press('e');
  await sim(0.5);
  await shot('drishti-pulse');
  await sim(1.5);
  await shot('clones-gone');

  // 7. Golden deer and Tataka.
  await page.evaluate(() => {
    const g = window.__game.play;
    g.step('deer');
    g.teleport(60, 70);
    g.look(Math.PI, -0.05);
  });
  await sim(0.5);
  await shot('deer');
  await page.evaluate(() => {
    const g = window.__game.play;
    g.step('toSwamp');
    g.teleport(290 - 16, -270 + 8);
    g.look(-2.0, 0.12);
  });
  await sim(2.2);
  await shot('tataka');
  console.log('errors:', JSON.stringify(errors));
});
