import { test } from '@playwright/test';

/** Not a pass/fail test: captures review screenshots at several hours and angles. */
const SHOTS: { name: string; hour: number; orbit: number }[] = [
  { name: 'dawn', hour: 6.5, orbit: 3.35 },
  { name: 'morning', hour: 8.2, orbit: 2.2 },
  { name: 'noon', hour: 12.5, orbit: 4.0 },
  { name: 'sunset', hour: 17.6, orbit: 0.3 },
  { name: 'night', hour: 23, orbit: 1.2 },
];

test('review screenshots', async ({ page }) => {
  test.skip(!process.env.SHOTS, 'run with SHOTS=1');
  test.setTimeout(300_000);
  await page.goto(`/?quality=${process.env.SHOTS_QUALITY ?? 'ultra'}`);
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 120_000 });
  await page.click('#loading-begin');
  await page.evaluate(() => window.__game.setCycle(false));
  await page.addStyleTag({ content: '#hint{display:none}' });
  await page.waitForTimeout(2500);
  for (const s of SHOTS) {
    await page.evaluate(({ hour, orbit }) => {
      window.__game.setHour(hour);
      window.__game.setOrbit(orbit);
    }, s);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `screenshots/${s.name}.png` });
  }
});
