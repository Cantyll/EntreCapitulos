import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Acha, em "Para aprovar", o item do comentário com este texto. A fila é global (os outros testes
 * deixam itens pendentes) e tem páginas de 20, então segue "Próxima página" até achar.
 */
export async function findPending(page: Page, text: string): Promise<Locator> {
  await page.goto('/painel/comentarios?aba=pendentes');
  for (let guard = 0; guard < 30; guard += 1) {
    const item = page.getByRole('listitem').filter({ hasText: text });
    if ((await item.count()) > 0) return item.first();
    const next = page.getByRole('link', { name: 'Próxima página' });
    if ((await next.count()) === 0) break;
    await next.click();
    await expect(page.getByRole('navigation').or(page.locator('main')).first()).toBeVisible();
  }
  throw new Error('comentário pendente não encontrado na fila de moderação');
}
