import sharp from 'sharp';

import { expect, test } from '../support/fixtures';

type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };

/** Manifest, ícones e metadados da Apple não dependem do navegador: um projeto basta. */
test.describe('PWA (instalação na Tela de Início)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'independe do navegador');
  });

  test('manifest válido, com o nome, o escopo e as cores certas', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/manifest\+json|application\/json/);
    const manifest = (await response.json()) as Record<string, unknown> & { icons: ManifestIcon[] };
    expect(manifest).toMatchObject({
      name: 'Entre Capítulos',
      short_name: 'Entre Capítulos',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      lang: 'pt-BR',
      background_color: '#FFF8F9',
      theme_color: '#FFF8F9',
    });
    const purposes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose ?? 'any'}`);
    expect(purposes).toEqual(
      expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']),
    );
  });

  test('os ícones do manifest e o apple-icon respondem 200, em PNG, no tamanho declarado', async ({
    request,
  }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
      icons: ManifestIcon[];
    };
    for (const icon of manifest.icons) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()['content-type'], icon.src).toMatch(/image\/png/);
      const [width, height] = icon.sizes.split('x').map(Number);
      const meta = await sharp(await response.body()).metadata();
      expect([meta.width, meta.height], icon.src).toEqual([width, height]);
    }

    const html = await (await request.get('/')).text();
    const href = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html)?.[1];
    expect(href).toBeTruthy();
    const apple = await request.get(href!);
    expect(apple.status()).toBe(200);
    const meta = await sharp(await apple.body()).metadata();
    expect([meta.width, meta.height]).toEqual([180, 180]);
    // O iOS aplica a própria máscara: o ícone vai sem transparência.
    expect(meta.hasAlpha === false || (await sharp(await apple.body()).stats()).isOpaque).toBe(
      true,
    );
  });

  test('metadados da Apple, viewport com safe area e zoom liberado', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="Entre Capítulos"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-status-bar-style" content="default"/);
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9A-Fa-f]{6}"/);
    const viewport = /<meta name="viewport" content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('viewport-fit=cover');
    // Acessibilidade: nada de bloquear o zoom por pinça.
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/);
  });
});
