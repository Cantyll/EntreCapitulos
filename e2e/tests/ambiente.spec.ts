import { expect, test } from '../support/fixtures';

test('o ambiente responde com o build de produção @mobile', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
