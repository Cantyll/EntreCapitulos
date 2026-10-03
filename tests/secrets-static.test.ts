import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * O repositório é PÚBLICO. Este teste procura, em todo arquivo versionado (`git ls-files`, mais os novos ainda não commitados), o que
 * nunca pode ir para o git: a chave secreta/service_role do Supabase, chaves privadas e JWTs.
 *
 * Os padrões são amplos de propósito: a menção ao NOME de uma chave (numa regra de lint, numa
 * documentação) também aparece. Por isso existe a lista de exceções abaixo. Cada entrada diz o
 * arquivo, quais padrões ele pode conter e POR QUÊ. Um arquivo novo que cite essas palavras tem
 * de entrar na lista de propósito, com justificativa, numa revisão.
 */
const PATTERNS = {
  sbSecret: /sb_secret_/,
  serviceRole: /service_role/i,
  privateKey: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  jwt: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
} as const;

type PatternName = keyof typeof PATTERNS;

const ALLOWLIST: Record<string, { allowed: PatternName[]; why: string }> = {
  'src/lib/supabase/env.ts': {
    allowed: ['sbSecret', 'serviceRole'],
    why: 'precisa nomear a chave secreta para RECUSÁ-LA (SupabaseEnvError); não contém valor',
  },
  'src/lib/supabase/env.test.ts': {
    allowed: ['sbSecret', 'serviceRole'],
    why: 'testa a recusa da chave secreta com valores FALSOS construídos no teste',
  },
  'eslint.config.mjs': {
    allowed: ['serviceRole'],
    why: 'regra de lint que proíbe a chave no app (só o nome)',
  },
  '.env.example': {
    allowed: ['serviceRole'],
    why: 'aviso "nunca coloque a chave service_role" (só o nome, sem valor)',
  },
  'supabase/config.toml': {
    allowed: ['serviceRole'],
    why: 'comentário do Supabase CLI sobre os papéis da Data API (não é chave)',
  },
  'tests/privacy-static.test.ts': {
    allowed: ['serviceRole'],
    why: 'garante que a action de excluir conta não usa service_role (só o nome)',
  },
  'CLAUDE.md': {
    allowed: ['sbSecret', 'serviceRole'],
    why: 'documentação das regras de segurança (só o nome)',
  },
  'docs/operacao.md': {
    allowed: ['serviceRole'],
    why: 'guia de rotação de chaves: cita o NOME da chave que o app não usa (sem valor)',
  },
  'README.md': {
    allowed: ['sbSecret', 'serviceRole'],
    why: 'documentação para a dona do projeto (só o nome)',
  },
  'tests/secrets-static.test.ts': {
    allowed: ['sbSecret', 'serviceRole'],
    why: 'este teste: contém os padrões de busca e os exemplos falsos',
  },
};

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  },
)
  .split('\0')
  .filter(Boolean);

function read(file: string): string | null {
  try {
    const text = readFileSync(file, 'utf8');
    return text.includes('\0') ? null : text; // binário (imagens, fontes): fora
  } catch {
    return null; // listado pelo git, mas ausente do disco
  }
}

function found(text: string): PatternName[] {
  return (Object.keys(PATTERNS) as PatternName[]).filter((name) => PATTERNS[name].test(text));
}

describe('segredos no repositório', () => {
  it('nenhum arquivo versionado tem chave secreta, chave privada ou JWT fora da lista de exceções', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = read(file);
      if (text === null) continue;
      const allowed = ALLOWLIST[file]?.allowed ?? [];
      for (const name of found(text)) {
        if (!allowed.includes(name)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a lista de exceções não tem entrada velha: o arquivo existe, está versionado e usa o que declara', () => {
    const stale: string[] = [];
    for (const [file, { allowed }] of Object.entries(ALLOWLIST)) {
      const text = files.includes(file) ? read(file) : null;
      if (text === null) {
        stale.push(`${file}: não está versionado`);
        continue;
      }
      const present = found(text);
      for (const name of allowed) {
        if (!present.includes(name)) stale.push(`${file}: ${name} não aparece mais`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('os padrões pegam o que deveriam (o teste não passa por estar cego)', () => {
    const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
    const payload = Buffer.from('{"role":"anon","iss":"exemplo"}').toString('base64url');
    expect(PATTERNS.jwt.test(`${header}.${payload}.assinatura-de-exemplo-1234`)).toBe(true);
    expect(PATTERNS.sbSecret.test('sb_secret_exemplo')).toBe(true);
    expect(PATTERNS.privateKey.test(`-----BEGIN ${'RSA'} PRIVATE KEY-----`)).toBe(true);
    expect(PATTERNS.serviceRole.test('SERVICE_ROLE')).toBe(true);
  });
});
