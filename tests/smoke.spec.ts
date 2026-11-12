import { expect, test } from '@playwright/test';

/**
 * Smoke test: the game loads, starts, renders frames and logs no errors.
 * Headless Chrome has no real GPU (software rendering), so the fps floor here is low;
 * real-device fps is checked by the in-game meter.
 */
test('loads, starts and renders without errors', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/?quality=low&fps');
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 90_000 });
  await expect(page.locator('#loading-begin')).toBeVisible();
  await page.screenshot({ path: 'screenshots/00-loading.png' });

  await page.click('#loading-begin');
  await page.waitForFunction(() => window.__game.started === true);
  await page.waitForTimeout(4000);

  const fps = await page.evaluate(() => window.__game.fps);
  console.log(`fps (software rendering, Low): ${fps.toFixed(1)}`);
  expect(fps).toBeGreaterThan(0.1); // software rendering: only proves frames are being produced

  // The canvas must contain a real picture, not a blank frame.
  const shot = await page.screenshot({ path: 'screenshots/01-started.png' });
  expect(shot.byteLength).toBeGreaterThan(60_000);

  // The game itself: an arrow can be fired and a fight can be started without errors.
  await page.evaluate(() => {
    window.__game.play.shoot();
    window.__game.play.step('ambush');
    window.__game.play.cast('agneya');
    window.__game.play.cast('drishti');
  });
  await page.waitForTimeout(3000);
  const state = (await page.evaluate(() => window.__game.play.state())) as { step: string };
  console.log(JSON.stringify(state));
  expect(state.step).toBe('ambush');

  // Switching quality at runtime must not break anything.
  await page.evaluate(() => window.__game.setQuality('medium'));
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__game.quality)).toBe('medium');

  expect(errors, errors.join('\n')).toEqual([]);
});
