import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Regras do cartão de instalação (etapa 8e) que se garantem lendo o código:
 *  - onde o cartão é montado (site público, Visão geral e Comentários da moderadora) e onde ele nunca aparece;
 *  - o servidor nunca decide pelo aparelho (nada de user-agent fora do cliente);
 *  - erro e 404 se marcam com <NoInstallCard />;
 *  - o registro de falhas leva só o nome do erro, uma vez por carga de página;
 *  - sem imagem, sem HTML montado por string, fonte de pelo menos 16px, hover só com ponteiro de mouse;
 *  - o localStorage e a chave versionada ficam em poucos arquivos, e o estado nunca sai do aparelho.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Tira os comentários (a menção de uma palavra num comentário não é uso). Mantém `https://` dentro de textos. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}
const code = (path: string) => stripComments(read(path));

const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const rel = (file: string) => relative(ROOT, file).split('\\').join('/');

const srcFiles = walk(join(ROOT, 'src'))
  .filter((file) => /\.(tsx?|css)$/.test(file) && !isTest(file))
  .map((file) => ({ path: rel(file), text: readFileSync(file, 'utf8') }));
const srcCode = srcFiles.filter(({ path }) => /\.tsx?$/.test(path));

const INSTALL_DIR = 'src/components/install';
const installFiles = srcFiles.filter(({ path }) => path.startsWith(`${INSTALL_DIR}/`));

/** O código do cartão: os componentes, o núcleo em src/lib/pwa e os textos e regras. */
const cardScope = [
  ...installFiles.filter(({ path }) => /\.tsx?$/.test(path)),
  ...srcCode.filter(({ path }) =>
    [
      'src/lib/pwa/platform.ts',
      'src/lib/pwa/install-state.ts',
      'src/lib/pwa/install-client.ts',
      'src/content/install.ts',
    ].includes(path),
  ),
];

const startsClient = (text: string) => /^\s*'use client';/.test(text);

describe('cartão de instalação: há código para auditar', () => {
  it('os arquivos do cartão existem', () => {
    expect(installFiles.map(({ path }) => path.slice(INSTALL_DIR.length + 1)).sort()).toEqual(
      expect.arrayContaining([
        'InstallAccountSection.tsx',
        'InstallCard.tsx',
        'InstallGate.tsx',
        'InstallGuide.tsx',
        'InstallSteps.tsx',
        'NoInstallCard.tsx',
        'install.module.css',
      ]),
    );
    expect(cardScope.length).toBeGreaterThanOrEqual(11);
  });
});

describe('onde o cartão é montado', () => {
  it('o layout público põe o InstallGate no fim do <main>, antes do rodapé', () => {
    const layout = read('src/app/(public)/layout.tsx');
    expect(layout).toMatch(/from '@\/components\/install\/InstallGate'/);
    expect(layout).toContain('<InstallGate surface="public" />');
    const main = layout.indexOf('<main id="conteudo"');
    const children = layout.indexOf('{children}');
    const gate = layout.indexOf('<InstallGate');
    const mainEnd = layout.indexOf('</main>');
    const footer = layout.indexOf('<SiteFooter');
    expect(main).toBeGreaterThan(-1);
    // Depois do conteúdo da página (nunca acima da dobra) e antes do rodapé.
    expect(children).toBeGreaterThan(main);
    expect(gate).toBeGreaterThan(children);
    expect(mainEnd).toBeGreaterThan(gate);
    expect(footer).toBeGreaterThan(mainEnd);
  });

  it('o layout público continua sendo um Server Component', () => {
    expect(startsClient(read('src/app/(public)/layout.tsx'))).toBe(false);
  });

  it('o GettingStartedSlot (Visão geral da administradora) usa o InstallGate do painel', () => {
    const slot = read('src/components/admin/overview/GettingStartedSlot.tsx');
    expect(slot).toMatch(/from '@\/components\/install\/InstallGate'/);
    expect(slot).toContain('<InstallGate surface="panel" />');
  });

  it('a Visão geral renderiza o slot', () => {
    expect(read('src/app/painel/page.tsx')).toContain('<GettingStartedSlot />');
  });

  it('Comentários mostra o cartão do painel só para a moderadora', () => {
    const page = read('src/app/painel/comentarios/page.tsx');
    expect(page).toMatch(/from '@\/components\/install\/InstallGate'/);
    expect(page).toMatch(
      /user\.role\s*===\s*'moderator'\s*&&\s*<InstallGate surface="panel"\s*\/>/,
    );
  });

  it('o InstallGate só é montado nesses três lugares (nem no layout raiz, nem no do painel, nem em erro ou 404)', () => {
    const importers = srcCode
      .filter(({ path }) => path !== `${INSTALL_DIR}/InstallGate.tsx`)
      .filter(({ text }) => /from '[^']*InstallGate'/.test(text))
      .map(({ path }) => path)
      .sort();
    expect(importers).toEqual(
      [
        'src/app/(public)/layout.tsx',
        'src/app/painel/comentarios/page.tsx',
        'src/components/admin/overview/GettingStartedSlot.tsx',
      ].sort(),
    );
  });

  it('as seções de /sobre e de /conta usam os componentes certos', () => {
    const about = read('src/app/(public)/sobre/page.tsx');
    expect(about).toMatch(/id="app"/);
    expect(about).toContain('<InstallGuide variant="about" />');
    const account = read('src/app/(public)/conta/page.tsx');
    expect(account).toContain('<InstallAccountSection />');
    // Só a seção de /conta usa a variante "account" (no cliente, só no Safari do iOS fora do app).
    const accountGuide = srcCode
      .filter(({ text }) => /<InstallGuide\s+variant="account"/.test(text))
      .map(({ path }) => path);
    expect(accountGuide).toEqual([`${INSTALL_DIR}/InstallAccountSection.tsx`]);
  });
});

describe('o servidor nunca decide pelo aparelho', () => {
  it.each(['InstallGate.tsx', 'InstallAccountSection.tsx', 'InstallCard.tsx'])(
    '%s começa com "use client"',
    (name) => {
      expect(startsClient(read(`${INSTALL_DIR}/${name}`))).toBe(true);
    },
  );

  it('nenhum arquivo de servidor em src/app lê o user-agent', () => {
    const offenders = srcCode
      .filter(({ path, text }) => path.startsWith('src/app/') && !startsClient(text))
      .filter(({ text }) => {
        const body = stripComments(text)
          // A regra `userAgent: '*'` do robots.txt não lê o agente de ninguém.
          .replace(/\buserAgent:\s*'\*'/g, '');
        return /user-agent|sec-ch-ua|\buserAgent\b|\bnavigator\b/i.test(body);
      })
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('o cartão nunca usa headers() nem cookies() do servidor', () => {
    const mounts = [
      'src/app/(public)/layout.tsx',
      'src/components/admin/overview/GettingStartedSlot.tsx',
    ];
    const files = [...cardScope.map(({ path }) => path), ...mounts];
    const offenders = files.filter((path) =>
      /next\/headers|\bheaders\(\)|\bcookies\(\)/.test(code(path)),
    );
    expect(offenders).toEqual([]);
  });

  it('nenhum Server Component importa platform.ts nem install-client.ts', () => {
    const targets = new Set(['src/lib/pwa/platform.ts', 'src/lib/pwa/install-client.ts']);
    const offenders: string[] = [];
    let found = 0;
    for (const { path, text } of srcCode) {
      for (const match of text.matchAll(/\bfrom\s+'([^']+)'/g)) {
        const spec = match[1]!;
        const base = spec.startsWith('@/')
          ? join(ROOT, 'src', spec.slice(2))
          : spec.startsWith('.')
            ? resolve(dirname(join(ROOT, path)), spec)
            : null;
        if (!base || !targets.has(`${rel(base)}.ts`)) continue;
        found += 1;
        const insideLib = path.startsWith('src/lib/pwa/');
        if (!insideLib && !startsClient(text)) offenders.push(`${path} importa ${spec}`);
      }
    }
    // O Gate importa o install-client e a seção de /conta importa o platform.
    expect(found).toBeGreaterThanOrEqual(2);
    expect(offenders).toEqual([]);
  });

  it('o núcleo (platform, install-state, install-client) não toca em window, navigator nem armazenamento global', () => {
    const globals =
      /(?<![\w.$])(window|document|navigator|localStorage|sessionStorage|globalThis)\s*[.[]/;
    for (const file of [
      'src/lib/pwa/platform.ts',
      'src/lib/pwa/install-state.ts',
      'src/lib/pwa/install-client.ts',
    ]) {
      expect(code(file), file).not.toMatch(globals);
    }
  });

  it('o InstallGate decide só depois da hidratação (useSyncExternalStore com instantâneo de servidor falso)', () => {
    const gate = code(`${INSTALL_DIR}/InstallGate.tsx`);
    expect(gate).toContain('useSyncExternalStore');
    expect(gate).toMatch(/const getServer = \(\) => false/);
  });
});

describe('erro e 404 marcam a página para o cartão sumir', () => {
  const pages = srcCode
    .filter(({ path }) => path.startsWith('src/app/(public)/'))
    .filter(({ path }) => /\/(error|not-found)\.tsx$/.test(path));

  it('há páginas de erro e 404 no site público', () => {
    const names = pages.map(({ path }) => path).sort();
    expect(names).toEqual(
      expect.arrayContaining(['src/app/(public)/error.tsx', 'src/app/(public)/not-found.tsx']),
    );
  });

  it('toda página de erro ou 404 dentro do layout público tem <NoInstallCard />', () => {
    for (const { path, text } of pages) {
      expect(text, path).toContain('<NoInstallCard />');
      expect(text, path).toMatch(/from '@\/components\/install\/NoInstallCard'/);
    }
  });

  it('o 404 dentro do layout público (ex.: /livros/nao-existe) e o erro específicos estão cobertos', () => {
    expect(read('src/app/(public)/error.tsx')).toContain('<NoInstallCard />');
    expect(read('src/app/(public)/not-found.tsx')).toContain('<NoInstallCard />');
  });

  it('o InstallGate esconde o cartão também se o marcador surgir depois da montagem', () => {
    const gate = code(`${INSTALL_DIR}/InstallGate.tsx`);
    expect(gate).toContain('new MutationObserver');
    expect(gate).toMatch(/subtree:\s*true/);
    expect(gate).toMatch(/childList:\s*true/);
    expect(gate).toContain("getElementById('conteudo')");
    expect(gate).toContain('observer.disconnect()');
    // A decisão de esconder usa o marcador.
    expect(gate).toMatch(/\|\|\s*suppressed\b|suppressed\s*\|\|/);
  });

  it('as páginas de erro e 404 de fora do layout público não montam o cartão (não têm o que esconder)', () => {
    for (const file of [
      'src/app/global-error.tsx',
      'src/app/not-found.tsx',
      'src/app/forbidden.tsx',
      'src/app/painel/error.tsx',
    ]) {
      expect(read(file), file).not.toMatch(/InstallGate|InstallCard/);
    }
  });
});

/** Cada chamada de `logFailure(...)` do código do cartão, com a operação e o segundo argumento. */
function logFailureCalls() {
  const calls: { path: string; operation: string; arg: string; index: number; text: string }[] = [];
  for (const { path, text } of cardScope) {
    const body = stripComments(text);
    for (const match of body.matchAll(/\blogFailure\(\s*'([^']*)'\s*,\s*([^)]*)\)/g)) {
      calls.push({
        path,
        operation: match[1]!,
        arg: match[2]!.trim(),
        index: match.index ?? 0,
        text: body,
      });
    }
  }
  return calls;
}

describe('o cartão não derruba a página', () => {
  const gate = code(`${INSTALL_DIR}/InstallGate.tsx`);

  it('o cartão carregado sob demanda sempre fica dentro do isolador de erro', () => {
    expect(gate).toMatch(/import \{ InstallCardBoundary \} from '\.\/InstallCardBoundary'/);
    // Toda renderização do <InstallCard abre dentro de um <InstallCardBoundary (e nenhuma fora).
    const opens = [...gate.matchAll(/<InstallCard\b(?!Boundary)/g)].length;
    const inside = [...gate.matchAll(/<InstallCardBoundary[^>]*>\s*<InstallCard\b(?!Boundary)/g)]
      .length;
    expect(opens).toBeGreaterThan(0);
    expect(inside).toBe(opens);
  });

  it('o isolador é um Client Component que não mostra nada ao falhar e entrega o erro a quem registra', () => {
    const boundary = code(`${INSTALL_DIR}/InstallCardBoundary.tsx`);
    expect(boundary).toMatch(/^'use client';/);
    expect(boundary).toMatch(/getDerivedStateFromError/);
    expect(boundary).toMatch(
      /componentDidCatch\(error: unknown\)\s*\{\s*this\.props\.onError\(error\);/,
    );
    expect(boundary).toMatch(
      /render\(\)\s*\{\s*return this\.state\.failed \? null : this\.props\.children;/,
    );
    // Nunca imprime nada por conta própria (o registro é do helper de log, no InstallGate).
    expect(boundary).not.toMatch(/\bconsole\s*\./);
    expect(boundary).not.toMatch(/\blogFailure\b/);
  });

  it('a busca da decisão vem do roteador (useSearchParams), nunca de window.location na renderização', () => {
    expect(gate).toMatch(/useSearchParams\(\)\.toString\(\)/);
    expect(gate).not.toMatch(/window\.location/);
    expect(gate).toMatch(/\[isClient, surface, pathname, search\]/);
  });
});

describe('registro de falhas do armazenamento', () => {
  const calls = logFailureCalls();

  it('são exatamente três chamadas, com os textos combinados', () => {
    expect(calls.map(({ operation }) => operation).sort()).toEqual([
      'cartão de instalação: carregamento',
      'cartão de instalação: gravação',
      'cartão de instalação: leitura',
    ]);
    // Nenhuma chamada escapa do padrão (por exemplo, com texto concatenado no primeiro argumento).
    const raw = cardScope
      .map(({ text }) => stripComments(text).replace(/^import .*$/gm, ''))
      .join('\n')
      .match(/\blogFailure\(/g);
    expect(raw).toHaveLength(3);
  });

  it('o segundo argumento é só a variável do erro (nunca a mensagem, a chave, o valor ou o estado)', () => {
    for (const { arg, operation } of calls) {
      // Uma variável simples (como exige a auditoria de logs de tests/privacy-static.test.ts), sem `.message` e afins.
      expect(arg, operation).toMatch(/^[A-Za-z_$][\w$]*$/);
      expect(arg, operation).toMatch(/error$/i);
      expect(arg, operation).not.toMatch(
        /message|stack|cause|key|value|state|raw|storage|item|visits|json/i,
      );
    }
  });

  it('cada uma registra uma vez por carga de página (guarda no módulo, ligada antes da chamada)', () => {
    const gate = code(`${INSTALL_DIR}/InstallGate.tsx`);
    expect(
      gate.indexOf('const reported = { read: false, write: false, load: false }'),
    ).toBeGreaterThan(-1);
    // A guarda vive fora do componente, para durar a página inteira.
    expect(gate.indexOf('const reported')).toBeLessThan(
      gate.indexOf('export function InstallGate'),
    );
    for (const { operation, index, text } of calls) {
      const kind = operation.endsWith('leitura')
        ? 'read'
        : operation.endsWith('carregamento')
          ? 'load'
          : 'write';
      const before = text.slice(Math.max(0, index - 300), index);
      expect(before, operation).toContain(`!reported.${kind}`);
      expect(before, operation).toContain(`reported.${kind} = true`);
    }
  });

  it('o código do cartão não usa console.* (só o helper de log imprime)', () => {
    for (const { path, text } of cardScope) {
      expect(stripComments(text), path).not.toMatch(/\bconsole\s*\./);
    }
  });

  it('o código do cartão registra com o helper de log, nunca com um próprio', () => {
    const gate = code(`${INSTALL_DIR}/InstallGate.tsx`);
    expect(gate).toMatch(/import \{ logFailure \} from '@\/lib\/auth\/log'/);
  });
});

describe('sem imagens, sem HTML por string', () => {
  it('nenhum arquivo de imagem em src/components/install (as ilustrações são SVG inline)', () => {
    const images = walk(join(ROOT, INSTALL_DIR)).filter((file) =>
      /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|svg)$/i.test(file),
    );
    expect(images.map(rel)).toEqual([]);
  });

  it('só há .tsx e .css na pasta', () => {
    for (const { path } of installFiles) expect(path, path).toMatch(/\.(tsx|css)$/);
  });

  it('nenhum dangerouslySetInnerHTML, <img, <Image nem next/image', () => {
    for (const { path, text } of installFiles.filter(({ path }) => /\.tsx$/.test(path))) {
      const body = stripComments(text);
      expect(body, path).not.toContain('dangerouslySetInnerHTML');
      expect(body, path).not.toMatch(/<img[\s>/]/i);
      expect(body, path).not.toMatch(/<Image[\s>/]/);
      expect(body, path).not.toMatch(/from 'next\/image'/);
      expect(body, path).not.toMatch(/data:image/);
    }
  });

  it('o CSS não carrega imagem (url(), image-set)', () => {
    const css = stripComments(read(`${INSTALL_DIR}/install.module.css`));
    expect(css).not.toMatch(/url\(/i);
    expect(css).not.toMatch(/image-set\(/i);
    expect(css).not.toMatch(/background-image/i);
  });

  it('os ícones são <svg> inline decorativos (aria-hidden)', () => {
    const icons = read(`${INSTALL_DIR}/InstallIcons.tsx`);
    const svgs = icons.match(/<svg[\s>]/g) ?? [];
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    expect(icons.match(/aria-hidden="true"/g) ?? []).toHaveLength(svgs.length);
  });
});

/** Escolhe o valor de cada `font-size` do CSS (sem comentários). */
function fontSizes(css: string): string[] {
  return [...stripComments(css).matchAll(/(?<![\w-])font-size\s*:\s*([^;}]+)/g)].map((m) =>
    m[1]!.trim(),
  );
}

/** Converte um tamanho em px (16px por rem/em, como o navegador); outra unidade é recusada (null). */
function toPixels(value: string): number | null {
  const match = /^(\d*\.?\d+)(px|rem|em)$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2] === 'px' ? amount : amount * 16;
}

/** Seletores com `:hover` fora de `@media (hover: hover)`, lendo o CSS por blocos. */
function hoverOutsideMedia(css: string): string[] {
  const text = stripComments(css);
  const stack: string[] = [];
  const offenders: string[] = [];
  let prelude = '';
  for (const char of text) {
    if (char === '{') {
      const rule = prelude.trim();
      // Só seletores de verdade: o `(hover: hover)` do próprio `@media` não é um `:hover`.
      if (
        !rule.startsWith('@') &&
        /:hover\b/.test(rule) &&
        !stack.some((open) => /@media[^{]*\(\s*hover\s*:\s*hover\s*\)/.test(open))
      ) {
        offenders.push(rule);
      }
      stack.push(rule);
      prelude = '';
    } else if (char === '}') {
      stack.pop();
      prelude = '';
    } else if (char === ';') {
      prelude = '';
    } else {
      prelude += char;
    }
  }
  return offenders;
}

describe('CSS do cartão', () => {
  const css = read(`${INSTALL_DIR}/install.module.css`);

  it('toda declaração font-size é de pelo menos 16px (o iOS não dá zoom e o texto é legível)', () => {
    const sizes = fontSizes(css);
    expect(sizes.length).toBeGreaterThanOrEqual(3);
    for (const size of sizes) {
      const pixels = toPixels(size);
      // Uma unidade que não dá para conferir (var, calc, clamp, %) também reprova: confira à mão e ajuste o teste.
      expect(pixels, `font-size: ${size}`).not.toBeNull();
      expect(pixels!, `font-size: ${size}`).toBeGreaterThanOrEqual(16);
    }
  });

  it('não usa o atalho `font:` (ele poderia esconder um tamanho menor que 16px)', () => {
    expect(stripComments(css)).not.toMatch(/(?<![\w-])font\s*:/);
  });

  it('o leitor de font-size entende o que deve (teste do próprio teste)', () => {
    expect(fontSizes('a{font-size:15px} /* font-size: 99px */ b{ font-size : 1rem; }')).toEqual([
      '15px',
      '1rem',
    ]);
    expect(toPixels('16px')).toBe(16);
    expect(toPixels('1rem')).toBe(16);
    expect(toPixels('0.9rem')).toBeCloseTo(14.4);
    expect(toPixels('1.25em')).toBe(20);
    expect(toPixels('calc(1rem + 2px)')).toBeNull();
    expect(toPixels('var(--x)')).toBeNull();
    expect(toPixels('smaller')).toBeNull();
  });

  it('qualquer :hover fica dentro de @media (hover: hover)', () => {
    expect(hoverOutsideMedia(css)).toEqual([]);
  });

  it('o leitor de :hover entende o que deve (teste do próprio teste)', () => {
    expect(hoverOutsideMedia('.a:hover{color:red}')).toEqual(['.a:hover']);
    expect(hoverOutsideMedia('@media (hover: hover){.a:hover{color:red}}')).toEqual([]);
    expect(
      hoverOutsideMedia('@media (hover:hover) and (pointer: fine){.a:hover{color:red}}'),
    ).toEqual([]);
    expect(hoverOutsideMedia('@media (min-width: 600px){.a:hover{color:red}}')).toEqual([
      '.a:hover',
    ]);
    expect(hoverOutsideMedia('@media (hover: hover){.a{color:red}} .b:hover{color:blue}')).toEqual([
      '.b:hover',
    ]);
    expect(hoverOutsideMedia('.a:hover:not(:disabled){x:y}')).toEqual(['.a:hover:not(:disabled)']);
  });

  it('só tokens do tema (sem cor literal), sem 100vh e sem tirar o contorno de foco', () => {
    const body = stripComments(css);
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(body).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|lab)\(/);
    expect(body).not.toMatch(/\b100vh\b/);
    expect(body).not.toMatch(/outline\s*:\s*(none|0)\b/);
  });
});

describe('armazenamento local e a chave versionada', () => {
  const ALLOWED = [`${INSTALL_DIR}/InstallGate.tsx`];
  const isAllowed = (path: string) =>
    ALLOWED.includes(path) || /^src\/lib\/pwa\/install-[\w-]+\.ts$/.test(path);

  it('"localStorage" só aparece no InstallGate e em src/lib/pwa/install-*.ts (fora dos textos legais)', () => {
    const offenders = srcCode
      // Os textos legais só DESCREVEM o que o site guarda (palavras dentro de texto), não acessam nada.
      .filter(({ path }) => !path.startsWith('src/content/legal/'))
      .filter(({ path, text }) => /\blocalStorage\b/.test(stripComments(text)) && !isAllowed(path))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('os textos legais não acessam o armazenamento (só falam dele)', () => {
    for (const { path, text } of srcCode.filter(({ path }) =>
      path.startsWith('src/content/legal/'),
    )) {
      expect(stripComments(text), path).not.toMatch(
        /\b(window|globalThis|self)\.localStorage|\blocalStorage\s*(\.|\[)\s*(get|set|remove|clear|\w*Item)/,
      );
    }
  });

  it('o acesso ao localStorage existe só onde se espera (o Gate entrega o objeto, o núcleo lê e grava)', () => {
    expect(code(`${INSTALL_DIR}/InstallGate.tsx`)).toMatch(/window\.localStorage/);
    expect(code('src/lib/pwa/install-client.ts')).toMatch(/win\.localStorage/);
  });

  it('a chave "ec:install:v1" só aparece em src/content/install.ts (no resto de src/, sempre pela regra)', () => {
    const files = srcFiles.filter(({ text }) => /ec:install/.test(text)).map(({ path }) => path);
    expect(files).toEqual(['src/content/install.ts']);
    expect(read('src/content/install.ts')).toContain("storageKey: 'ec:install:v1'");
  });

  it('o estado nunca sai do aparelho: nada de rede, cookie, Server Action nem outro armazenamento', () => {
    const forbidden =
      /\bfetch\s*\(|sendBeacon|XMLHttpRequest|WebSocket|EventSource|'use server'|\bsessionStorage\b|\bindexedDB\b|document\.cookie|\bcookies\s*\(|from '@\/lib\/supabase|from '@\/app\//;
    for (const { path, text } of cardScope) {
      expect(stripComments(text), path).not.toMatch(forbidden);
    }
  });

  it('o estado guardado não tem e-mail, nome nem identificador (só os quatro campos)', () => {
    const state = code('src/lib/pwa/install-state.ts');
    const type = /export type InstallState = \{([\s\S]*?)\n\};/.exec(state)?.[1] ?? '';
    const fields = [...type.matchAll(/^\s*(\w+)\s*:/gm)].map((match) => match[1]);
    expect(fields).toEqual(['visits', 'lastDay', 'dismissedAt', 'never']);
  });
});

/** O corpo de cada `catch`, lido com chaves balanceadas (o que está entre `{` e `}` do catch). */
function catchBlocks(text: string): { binding: string | null; body: string }[] {
  const blocks: { binding: string | null; body: string }[] = [];
  for (const match of text.matchAll(/\bcatch\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\))?\s*\{/g)) {
    let depth = 1;
    let end = (match.index ?? 0) + match[0].length;
    while (end < text.length && depth > 0) {
      if (text[end] === '{') depth += 1;
      else if (text[end] === '}') depth -= 1;
      end += 1;
    }
    blocks.push({
      binding: match[1] ?? null,
      body: text.slice((match.index ?? 0) + match[0].length, end - 1),
    });
  }
  return blocks;
}

/** O catch usa o erro para mais do que devolvê-lo (mensagem, pilha, texto)? */
function misusesError(binding: string | null, body: string): boolean {
  if (/\.(message|stack)\b/.test(body)) return true;
  if (!binding) return false;
  const name = binding.replace(/\$/g, '\\$');
  return (
    new RegExp(`String\\(\\s*${name}\\s*\\)`).test(body) ||
    new RegExp(`\\$\\{\\s*${name}\\b`).test(body) ||
    new RegExp(`JSON\\.stringify\\(\\s*${name}\\b`).test(body) ||
    new RegExp(`\\b${name}\\.toString\\(`).test(body) ||
    new RegExp(`['"\`]\\s*\\+\\s*${name}\\b|\\b${name}\\s*\\+\\s*['"\`]`).test(body)
  );
}

describe('catch do cartão', () => {
  it('nenhum catch usa .message, .stack nem transforma o erro em texto', () => {
    let total = 0;
    for (const { path, text } of cardScope) {
      for (const { binding, body } of catchBlocks(stripComments(text))) {
        total += 1;
        expect(misusesError(binding, body), `${path}: catch (${binding}) { ${body.trim()} }`).toBe(
          false,
        );
      }
    }
    // O núcleo tem três catch (JSON.parse, leitura e gravação): se sumirem todos, o teste não prova nada.
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it('o código do cartão não lê .message nem .stack em nenhum lugar', () => {
    for (const { path, text } of cardScope) {
      expect(stripComments(text), path).not.toMatch(/\.(message|stack)\b/);
    }
  });

  it('os catch do núcleo devolvem o erro a quem chamou (não o engolem)', () => {
    for (const file of ['src/lib/pwa/install-state.ts', 'src/lib/pwa/install-client.ts']) {
      for (const { binding, body } of catchBlocks(code(file))) {
        expect(binding, `${file}: catch sem nome`).not.toBeNull();
        expect(body, `${file}: catch (${binding})`).toMatch(new RegExp(`\\b${binding}\\b`));
      }
    }
  });

  it('o leitor de catch entende o que deve (teste do próprio teste)', () => {
    const sample = `
      try { a(); } catch (error) { return { error, failed: true }; }
      try { b(); } catch (e) { if (x) { log(e.message); } }
      try { c(); } catch { d(); }
      try { f(); } catch (err) { return String(err); }
      try { g(); } catch (err) { return \`\${err}\`; }
    `;
    const blocks = catchBlocks(sample);
    expect(blocks).toHaveLength(5);
    expect(blocks.map(({ binding, body }) => misusesError(binding, body))).toEqual([
      false,
      true,
      false,
      true,
      true,
    ]);
    expect(blocks[1]!.body).toContain('e.message');
  });
});
