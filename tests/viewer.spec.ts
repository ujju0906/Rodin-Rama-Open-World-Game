import { test } from '@playwright/test';

/** Captures the character line-up from the developer viewer page. Run with VIEWER=1. */
test('character viewer screenshot', async ({ page }) => {
  test.skip(!process.env.VIEWER, 'run with VIEWER=1');
  for (const shot of ['1', '2']) {
    await page.goto(`/viewer.html?shot=${shot}`);
    await page.waitForFunction(
      () => (window as unknown as { __frames?: number }).__frames! > 0.6,
      undefined,
      { timeout: 60_000 },
    );
    await page.screenshot({ path: `screenshots/viewer-${shot}.png` });
  }
});
