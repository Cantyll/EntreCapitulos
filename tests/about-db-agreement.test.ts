import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { defaultAbout, parseAbout } from '@/lib/about';

/*
 * O esquema do app (zod) e a função do banco `site_page_content_problem` guardam os MESMOS limites do conteúdo da
 * página Sobre. Este teste manda os mesmos casos aos dois e exige a mesma resposta (aceita ou recusa). Só roda com o
 * banco local de pé (como o inventário de segurança): `SECURITY_DOC_DB_CONTAINER=supabase_db_entre-capitulos`; sem a
 * variável, é pulado. A lista de nós permitidos do texto rico NÃO entra aqui: só o app a confere.
 */
const CONTAINER = process.env.SECURITY_DOC_DB_CONTAINER ?? '';

const UUID = '0b9f5f00-1111-4222-8333-444455556666';
const base = (): Record<string, unknown> => ({ ...defaultAbout() });
const withKey = (key: string, value: unknown) => ({ ...base(), [key]: value });
const at = (n: number) => 'a'.repeat(n);
const link = (url: string, label = 'L') => ({ label, url });
const section = (title: string) => ({ title, body: { type: 'doc', content: [] } });
const step = (title: string, text: string) => ({ title, text });
const how = (steps: unknown[]) => ({ visible: true, steps });
const photo = (path: string, alt = 'Retrato') => ({ path, alt });

const CASES: [string, unknown][] = [
  ['padrão', base()],
  ['título 120', withKey('title', at(120))],
  ['título 121', withKey('title', at(121))],
  ['título 120 emojis', withKey('title', '😀'.repeat(120))],
  ['título 121 emojis', withKey('title', '😀'.repeat(121))],
  ['bio 300', withKey('bio', at(300))],
  ['bio 301', withKey('bio', at(301))],
  ['bio vazia', withKey('bio', '')],
  ['3 seções', withKey('sections', [section('a'), section('b'), section('c')])],
  ['4 seções', withKey('sections', [section('a'), section('b'), section('c'), section('d')])],
  ['seção título 80', withKey('sections', [section(at(80))])],
  ['seção título 81', withKey('sections', [section(at(81))])],
  [
    '5 links',
    withKey(
      'links',
      [1, 2, 3, 4, 5].map((n) => link(`https://e.com/${n}`)),
    ),
  ],
  [
    '6 links',
    withKey(
      'links',
      [1, 2, 3, 4, 5, 6].map((n) => link(`https://e.com/${n}`)),
    ),
  ],
  ['rótulo 40', withKey('links', [link('https://e.com', at(40))])],
  ['rótulo 41', withKey('links', [link('https://e.com', at(41))])],
  ['https simples', withKey('links', [link('https://exemplo.com')])],
  ['https com caminho', withKey('links', [link('https://sub.exemplo.com.br/a/b?x=1&y=2#t')])],
  ['https com porta', withKey('links', [link('https://exemplo.com:8443/x')])],
  ['http', withKey('links', [link('http://exemplo.com')])],
  ['javascript:', withKey('links', [link('javascript:alert(1)')])],
  ['data:', withKey('links', [link('data:text/html,x')])],
  ['mailto:', withKey('links', [link('mailto:a@b.com')])],
  ['usuário e senha', withKey('links', [link('https://u:p@exemplo.com')])],
  ['só usuário', withKey('links', [link('https://u@exemplo.com')])],
  ['espaço', withKey('links', [link('https://exemplo.com/a b')])],
  ['barra invertida', withKey('links', [link('https://exemplo.com\\@x.com')])],
  ['HTTPS maiúsculo', withKey('links', [link('HTTPS://exemplo.com')])],
  ['sem host', withKey('links', [link('https://')])],
  ['relativo', withKey('links', [link('/x')])],
  ['url 2048', withKey('links', [link(`https://e.com/${at(2048 - 14)}`)])],
  ['url 2049', withKey('links', [link(`https://e.com/${at(2049 - 14)}`)])],
  ['foto ok', withKey('photo', photo(`site/sobre/${UUID}.webp`))],
  ['foto png', withKey('photo', photo(`site/sobre/${UUID}.png`))],
  ['foto de livro', withKey('photo', photo(`books/${UUID}/${UUID}.webp`))],
  ['foto com ..', withKey('photo', photo('site/sobre/../x.webp'))],
  ['foto sem alt', withKey('photo', photo(`site/sobre/${UUID}.webp`, ''))],
  ['foto alt 120', withKey('photo', photo(`site/sobre/${UUID}.webp`, at(120)))],
  ['foto alt 121', withKey('photo', photo(`site/sobre/${UUID}.webp`, at(121)))],
  ['stats não booleano', withKey('stats', { visible: 'sim' })],
  ['stats oculto', withKey('stats', { visible: false })],
  ['0 passos', withKey('howItWorks', how([]))],
  ['6 passos', withKey('howItWorks', how([1, 2, 3, 4, 5, 6].map((n) => step(`P${n}`, 'x'))))],
  ['7 passos', withKey('howItWorks', how([1, 2, 3, 4, 5, 6, 7].map((n) => step(`P${n}`, 'x'))))],
  ['passo título 60', withKey('howItWorks', how([step(at(60), 'x')]))],
  ['passo título 61', withKey('howItWorks', how([step(at(61), 'x')]))],
  ['passo texto 400', withKey('howItWorks', how([step('t', at(400))]))],
  ['passo texto 401', withKey('howItWorks', how([step('t', at(401))]))],
  ['cta 200', withKey('cta', { visible: true, text: at(200) })],
  ['cta 201', withKey('cta', { visible: true, text: at(201) })],
  ['cta vazia', withKey('cta', { visible: true, text: '' })],
  ['versão 2', withKey('v', 2)],
  ['chave a mais', { ...base(), extra: 1 }],
  [
    'sem título',
    (() => {
      const c = base();
      delete c.title;
      return c;
    })(),
  ],
];

function dbProblems(cases: unknown[]): (string | null)[] {
  const values = cases
    .map((content, index) => `(${index}, $ec$${JSON.stringify(content)}$ec$::jsonb)`)
    .join(', ');
  const out = execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|'],
    {
      input: `select i, coalesce(public.site_page_content_problem('sobre', c), '') from (values ${values}) v(i, c) order by i;`,
      encoding: 'utf8',
    },
  ).trim();
  return out.split('\n').map((line) => line.split('|')[1] || null);
}

describe.skipIf(!CONTAINER)('esquema do app × função do banco (página Sobre)', () => {
  it('aceitam e recusam exatamente os mesmos casos', () => {
    const problems = dbProblems(CASES.map(([, content]) => content));
    expect(problems).toHaveLength(CASES.length);
    const disagreements = CASES.flatMap(([label, content], index) => {
      const app = parseAbout(content).ok;
      const db = problems[index] === null;
      return app === db
        ? []
        : [
            `${label}: app=${app ? 'aceita' : 'recusa'}, banco=${db ? 'aceita' : `recusa (${problems[index]})`}`,
          ];
    });
    expect(disagreements).toEqual([]);
  });

  it('o conteúdo padrão passa nos dois', () => {
    expect(dbProblems([defaultAbout()])).toEqual([null]);
  });
});
