import { expect, test, type Page } from '@playwright/test';

const diagram = (page: Page) => page.getByTestId('diagram');
const svg = (page: Page) => diagram(page).locator('svg').first();
const notice = (page: Page) => diagram(page).getByRole('status');

async function openDemo(page: Page) {
  await page.goto('/');
  await expect(svg(page)).toBeVisible({ timeout: 30_000 });
  // Focus the canvas without landing on an arrow
  await diagram(page).focus();
}

test.describe('viewer', () => {
  test('renders the demo flow with its participants and numbered arrows', async ({ page }) => {
    await openDemo(page);
    await expect(svg(page).locator('[data-step]').first()).toBeAttached();
    const steps = await svg(page)
      .locator('.messageLine0[data-step], .messageLine1[data-step]')
      .count();
    expect(steps).toBeGreaterThan(40);
    await expect(svg(page).locator('.swv-actor[data-alias="SVC"]').first()).toBeAttached();
  });

  test('arrow keys move the current step and highlight it in the diagram', async ({ page }) => {
    await openDemo(page);
    await page.keyboard.press('ArrowRight');
    await expect(svg(page).locator('.swv-cur').first()).toBeAttached();
    await expect(svg(page).locator('.swv-ring')).toHaveCount(1);
    await expect(svg(page).locator('[data-step="0"].swv-cur').first()).toBeAttached();
    await page.keyboard.press('ArrowRight');
    await expect(svg(page).locator('[data-step="1"].swv-cur').first()).toBeAttached();
    await page.keyboard.press('ArrowLeft');
    await expect(svg(page).locator('[data-step="0"].swv-cur').first()).toBeAttached();
  });

  test('clicking an arrow selects its step and hovering shows the summary', async ({ page }) => {
    await openDemo(page);
    const hit = svg(page).locator('.swv-hit[data-step="3"]').first();
    await hit.hover({ force: true });
    await expect(page.getByTestId('arrow-tooltip')).toContainText('Step 4');
    await hit.click({ force: true });
    await expect(svg(page).locator('[data-step="3"].swv-cur').first()).toBeAttached();
  });

  test('clicking a participant shows only its arrows until Show all', async ({ page }) => {
    await openDemo(page);
    await svg(page).locator('.swv-actor[data-alias="RD"]').first().click({ force: true });
    await expect(notice(page)).toContainText('Showing only the');
    await expect(svg(page).locator('[data-step].swv-out').first()).toBeAttached();
    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(svg(page).locator('[data-step].swv-out')).toHaveCount(0);
  });

  test('zoom controls and fit change the zoom level', async ({ page }) => {
    await openDemo(page);
    const pct = page.getByTitle('Set zoom to 100%');
    const before = await pct.textContent();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(pct).not.toHaveText(before ?? '');
    await pct.click();
    await expect(pct).toHaveText('100%');
    await page.getByTitle('Fit width (0). Fit all (F)').click();
    await expect(pct).not.toHaveText('100%');
  });

  test('the participant header stays pinned while the diagram scrolls', async ({ page }) => {
    await openDemo(page);
    await page.getByTitle('Set zoom to 100%').click();
    await page.keyboard.press('End');
    await expect(diagram(page).locator('svg[id$="-hdr"]')).toBeVisible();
  });

  test('the theme choice re-renders the diagram', async ({ page }) => {
    await openDemo(page);
    await page.locator('#themeSel').selectOption('dark');
    await expect(page.locator('#themeSel')).toHaveValue('dark');
    await expect(svg(page)).toBeVisible();
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('swv:settings') ?? '{}') as { theme?: string },
    );
    expect(stored.theme).toBe('dark');
  });

  test('a non-sequence diagram still draws, with the walkthrough off', async ({ page }) => {
    await page.goto('/');
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      localStorage.setItem('swv:code', JSON.stringify('flowchart TD\n  A --> B'));
    });
    await page.reload();
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    await expect(notice(page)).toContainText('flowchart');
  });

  test('a link with code and a step opens that flow on that step', async ({ page }) => {
    await page.goto('/');
    await expect(svg(page)).toBeVisible({ timeout: 30_000 });
    const fragment = await page.evaluate(async () => {
      const code =
        'sequenceDiagram\n  %% @title From a link\n  A->>B: one\n  B-->>A: two\n  A->>B: three';
      const bytes = new TextEncoder().encode(code);
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
      const out = new Uint8Array(await new Response(stream).arrayBuffer());
      let bin = '';
      for (const b of out) bin += String.fromCharCode(b);
      return `#z.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}&step=2`;
    });
    await page.goto('about:blank');
    await page.goto(`/${fragment}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('From a link');
    await expect(svg(page).locator('[data-step="1"].swv-cur').first()).toBeAttached({
      timeout: 30_000,
    });
  });
});
