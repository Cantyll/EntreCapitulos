import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { LegalLinks } from '@/components/legal/LegalLinks';
import { legalConfig } from '@/content/legal-config';
import { buildPrivacy } from '@/content/legal/privacy';

vi.mock('server-only', () => ({}));

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('links das páginas legais', () => {
  it('o rodapé leva a /privacidade e /termos', () => {
    const footer = read('src/components/site/SiteFooter.tsx');
    expect(footer).toMatch(/href="\/privacidade"/);
    expect(footer).toMatch(/href="\/termos"/);
  });

  it('/entrar e /boas-vindas mostram os links (LegalLinks)', () => {
    for (const page of [
      'src/app/(public)/entrar/page.tsx',
      'src/app/(public)/boas-vindas/page.tsx',
    ]) {
      expect(read(page)).toMatch(/<LegalLinks verb=/);
    }
  });

  it('a frase de /entrar é a pedida', () => {
    const html = renderToStaticMarkup(createElement(LegalLinks, { verb: 'entrar' }));
    expect(html.replace(/<[^>]+>/g, '')).toBe(
      'Ao entrar, você concorda com os Termos e a Política de Privacidade.',
    );
    expect(html).toContain('href="/termos"');
    expect(html).toContain('href="/privacidade"');
  });
});

describe('rascunho em revisão e noindex', () => {
  const render = (draft: boolean) =>
    renderToStaticMarkup(
      createElement(LegalDocument, {
        doc: buildPrivacy(legalConfig, { google: false, turnstile: false }),
        draft,
        other: { href: '/termos', label: 'Ler os Termos de Uso' },
      }),
    );

  it('mostra o aviso quando é rascunho e não mostra quando não é', () => {
    expect(render(true)).toContain('Rascunho em revisão');
    expect(render(false)).not.toContain('Rascunho em revisão');
  });

  it('cada "A DEFINIR" do texto aparece destacado', () => {
    const html = render(false);
    expect(html).toMatch(/<mark[^>]*>A DEFINIR<\/mark>/);
    expect(html.match(/A DEFINIR/g)!.length).toBe(
      html.match(/<mark[^>]*>A DEFINIR<\/mark>/g)!.length,
    );
  });

  it('as duas páginas só ficam indexáveis quando NÃO são rascunho', () => {
    for (const page of ['privacidade', 'termos']) {
      const source = read(`src/app/(public)/${page}/page.tsx`);
      expect(source).toMatch(/isLegalDraft\(\)\s*\?\s*\{\s*robots:\s*\{\s*index:\s*false/);
    }
  });

  it('com o padrão entregue, os metadados dizem noindex', async () => {
    const [privacy, terms] = await Promise.all([
      import('@/app/(public)/privacidade/page'),
      import('@/app/(public)/termos/page'),
    ]);
    for (const mod of [privacy, terms]) {
      expect(mod.metadata.robots).toEqual({ index: false, follow: false });
    }
  });
});

describe('noindex nas áreas privadas', () => {
  it.each([
    'src/app/(public)/conta/page.tsx',
    'src/app/(public)/conta/excluida/page.tsx',
    'src/app/(public)/entrar/page.tsx',
    'src/app/(public)/boas-vindas/page.tsx',
    'src/app/painel/layout.tsx',
  ])('%s tem robots index:false', (file) => {
    expect(read(file)).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});

describe('robots.txt', () => {
  it('permite o site e bloqueia painel, conta, auth e entrar', async () => {
    const robots = (await import('@/app/robots')).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ userAgent: '*', allow: '/' });
    expect(rules[0]!.disallow).toEqual(['/painel', '/conta', '/auth', '/entrar']);
    expect(robots.sitemap).toBeUndefined();
  });

  it('as rotas bloqueadas existem e nenhuma rota pública foi bloqueada', async () => {
    const { PRIVATE_PATHS } = await import('@/lib/robots-paths');
    for (const path of ['/sessoes', '/estante', '/sobre', '/privacidade', '/termos', '/livros']) {
      expect(PRIVATE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))).toBe(false);
    }
  });
});
