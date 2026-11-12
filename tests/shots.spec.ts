import { test } from '@playwright/test';

/** Not a pass/fail test: captures review screenshots at several hours and angles. */
const VIEWS = ['hermitage', 'forest-path', 'river', 'temple', 'swamp'];
const TIMES: { name: string; hour: number; rain: number }[] = [
  { name: 'dawn', hour: 6.7, rain: 0.15 },
  { name: 'night', hour: 22.5, rain: 0.5 },
];

test('review screenshots', async ({ page }) => {
  test.skip(!process.env.SHOTS, 'run with SHOTS=1');
  test.setTimeout(900_000);
  await page.goto(`/?quality=${process.env.SHOTS_QUALITY ?? 'ultra'}`);
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 120_000 });
  await page.click('#loading-begin');
  await page.evaluate(() => window.__game.setCycle(false));
  await page.addStyleTag({ content: '#hint{display:none}' });
  await page.waitForTimeout(2500);
  const only = process.env.SHOTS_VIEWS?.split(',').map(Number);
  for (const t of TIMES) {
    if (process.env.SHOTS_TIME && process.env.SHOTS_TIME !== t.name) continue;
    for (let i = 0; i < VIEWS.length; i++) {
      if (only && !only.includes(i)) continue;
      await page.evaluate(
        ({ hour, rain, i }) => {
          window.__game.setHour(hour);
          window.__game.setRain(rain);
          window.__game.setView(i);
        },
        { hour: t.hour, rain: t.rain, i },
      );
      await page.waitForTimeout(Number(process.env.SHOTS_WAIT ?? 6000));
      await page.screenshot({ path: `screenshots/${VIEWS[i]}-${t.name}.png` });
    }
  }
  console.log(JSON.stringify(await page.evaluate(() => window.__game.stats())));
});
