import { expect, test } from '@playwright/test';

type Vim = { parked: boolean; active: boolean; free: boolean; pos: number[] };

/** The vimana can be found (compass, minimap, beacon), boarded, and called again for free flight. */
test('vimana tracker and free flight', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?quality=low');
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 120_000 });
  await page.click('#loading-begin');
  await page.waitForFunction(() => window.__game.started === true);
  await page.evaluate(() => window.__game.setCycle(false));
  const vim = (): Promise<Vim> =>
    page.evaluate(() => (window.__game.play as unknown as { vimana: () => Vim }).vimana());
  const shot = async (name: string): Promise<void> => {
    if (!process.env.SHOTS) return;
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/vimana-${name}.png` });
  };

  // Before the story reaches it, G only explains where the vimana comes from.
  await page.evaluate(() => {
    (window.__game.play as unknown as { callVimana: () => void }).callVimana();
    window.__game.play.simulate(0.1);
  });
  expect((await vim()).active).toBe(false);

  // The vimana step: the craft is parked, and the compass and minimap point at it from far away.
  await page.evaluate(() => {
    const g = window.__game.play;
    g.step('vimana');
    g.teleport(-150, 40);
    g.simulate(0.3);
  });
  const parked = await vim();
  expect(parked.parked).toBe(true);
  await expect(page.locator('#hud .compass em')).toContainText('m');
  await expect(page.locator('#hud .minimap canvas')).toBeVisible();
  const dist = Number(
    (await page.locator('#hud .compass em').textContent())!.replace(/[^0-9]/g, ''),
  );
  expect(dist).toBeGreaterThan(300);
  await page.evaluate(([x, z]) => {
    const g = window.__game.play;
    g.teleport(x! - 60, z! + 40);
    g.look(Math.atan2(-60, 40), 0.2);
    g.simulate(0.2);
  }, [parked.pos[0], parked.pos[2]]);
  await shot('beacon');

  // Walking up to it boards it.
  await page.evaluate(([x, z]) => {
    const g = window.__game.play;
    g.teleport(x! + 3, z! + 3);
    g.simulate(0.3);
  }, [parked.pos[0], parked.pos[2]]);
  expect((await page.evaluate(() => window.__game.play.state() as { step: string })).step).toBe(
    'flight',
  );
  await expect(page.locator('#hud .compass em')).toBeVisible(); // next gate of light

  // After the story, G calls the vimana for a free flight and G again lands.
  await page.evaluate(() => {
    const g = window.__game.play;
    g.step('done');
    g.teleport(-150, 40);
    g.simulate(0.3);
    (g as unknown as { callVimana: () => void }).callVimana();
    g.simulate(4);
  });
  const flying = await vim();
  expect(flying.free).toBe(true);
  expect(flying.pos[1]).toBeGreaterThan(20);
  await shot('free-flight');
  await page.keyboard.press('g');
  await page.evaluate(() => window.__game.play.simulate(0.2));
  expect((await vim()).free).toBe(false);
  expect(errors).toEqual([]);
});
