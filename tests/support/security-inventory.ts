import { execFileSync } from 'node:child_process';

/*
 * Inventário de segurança do banco LOCAL (o que as migrations criam), em Markdown. Alimenta
 * docs/seguranca.md e o teste que confere que o documento não divergiu do banco.
 * Só lê o catálogo do Postgres; nunca a nuvem e nunca dados de usuários.
 */

export const DB_CONTAINER = process.env.SECURITY_DOC_DB_CONTAINER ?? '';

function query<T>(sql: string): T[] {
  const out = execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
    { input: `select coalesce(json_agg(t), '[]'::json) from (${sql}) t;`, encoding: 'utf8' },
  ).trim();
  return JSON.parse(out) as T[];
}

const cell = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();

const code = (value: unknown) => (value === null || value === '' ? '' : `\`${cell(value)}\``);

function table(headers: string[], rows: unknown[][]) {
  if (rows.length === 0) return '_Nenhum._\n';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(
      (row) =>
        `| ${row.map((v) => (typeof v === 'string' && v.startsWith('`') ? v : cell(v))).join(' | ')} |`,
    ),
    '',
  ].join('\n');
}

export function buildSecurityInventory(): string {
  const tables = query<{ name: string; rls: boolean; forced: boolean }>(`
    select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);

  const policies = query<{
    schema: string;
    table: string;
    name: string;
    cmd: string;
    roles: string;
    using: string | null;
    check: string | null;
  }>(`
    select schemaname as schema, tablename as "table", policyname as name, cmd,
           array_to_string(roles, ', ') as roles, qual as "using", with_check as "check"
      from pg_policies
     where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
     order by schemaname, tablename, policyname`);

  const grants = query<{ table: string; role: string; privileges: string }>(`
    select c.relname as "table", r.rolname as role,
           string_agg(a.privilege_type, ', ' order by a.privilege_type) as privileges
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      join pg_roles r on r.oid = a.grantee
     where n.nspname = 'public' and c.relkind in ('r', 'p') and r.rolname in ('anon', 'authenticated')
     group by 1, 2 order by 1, 2`);

  const columnGrants = query<{ table: string; role: string; privilege: string; columns: string }>(`
    select c.relname as "table", r.rolname as role, a.privilege_type as privilege,
           string_agg(att.attname, ', ' order by att.attnum) as columns
      from pg_attribute att
      join pg_class c on c.oid = att.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(att.attacl) a
      join pg_roles r on r.oid = a.grantee
     where n.nspname = 'public' and att.attacl is not null and not att.attisdropped
       and r.rolname in ('anon', 'authenticated')
     group by 1, 2, 3 order by 1, 2, 3`);

  const functions = query<{
    signature: string;
    definer: boolean;
    search_path: string | null;
    anon: boolean;
    authenticated: boolean;
    public: boolean;
    trigger: boolean;
  }>(`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
           p.prosecdef as definer,
           (select split_part(cfg, '=', 2) from unnest(p.proconfig) cfg where cfg like 'search_path=%') as search_path,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
           exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public,
           (p.prorettype = 'trigger'::regtype) as trigger
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by 1`);

  const yesNo = (value: boolean) => (value ? 'sim' : 'não');
  const lines: string[] = [];

  lines.push(
    '# Inventário de segurança do banco',
    '',
    '> **Arquivo GERADO** do banco local (o que as migrations criam). Não edite à mão.',
    '> Para regenerar, numa sessão de nuvem com o Supabase local de pé:',
    '> `SECURITY_DOC_DB_CONTAINER=supabase_db_entre-capitulos UPDATE_SECURITY_DOC=1 npx vitest run tests/security-doc.test.ts`.',
    '> O teste `tests/security-doc.test.ts` roda no CI (job do banco) e falha se este arquivo divergir do banco.',
    '',
    'Mostra o desenho das permissões: quem lê e escreve o quê. **Não** mostra a configuração do painel do',
    'Supabase na nuvem (Auth, Storage, e-mail), que se confere à mão (ver `docs/lancamento.md`). O contrato',
    'que impede alargar permissões sem querer está em `supabase/tests/database/12_security_contract.test.sql`.',
    '',
    '## Tabelas e row level security (RLS)',
    '',
    table(
      ['Tabela', 'RLS ligado', 'RLS forçado ao dono'],
      tables.map((t) => [code(t.name), yesNo(t.rls), yesNo(t.forced)]),
    ),
    '## Políticas de RLS',
    '',
    'Inclui as políticas de `storage.objects` (bucket das capas). `USING` filtra o que se enxerga ou altera;',
    '`WITH CHECK` valida o que se grava.',
    '',
    table(
      ['Esquema.tabela', 'Política', 'Comando', 'Papéis', 'USING', 'WITH CHECK'],
      policies.map((p) => [
        code(`${p.schema}.${p.table}`),
        code(p.name),
        p.cmd,
        p.roles,
        code(p.using),
        code(p.check),
      ]),
    ),
    '## Permissões nas tabelas (anon e authenticated)',
    '',
    'Permissão na tabela inteira. O RLS ainda se aplica a cada uma delas.',
    '',
    table(
      ['Tabela', 'Papel', 'Permissões'],
      grants.map((g) => [code(g.table), g.role, g.privileges]),
    ),
    '## Permissões por coluna (anon e authenticated)',
    '',
    'Onde a escrita é limitada a certas colunas.',
    '',
    table(
      ['Tabela', 'Papel', 'Permissão', 'Colunas'],
      columnGrants.map((g) => [code(g.table), g.role, g.privilege, code(g.columns)]),
    ),
    '## Funções do esquema `public`',
    '',
    '`security definer` roda com os direitos do dono da função, por isso precisa de `search_path` vazio. As',
    'colunas "anon", "authenticated" e "PUBLIC" dizem quem pode executar pela API.',
    '',
    table(
      ['Função', 'Trigger', 'security definer', 'search_path', 'anon', 'authenticated', 'PUBLIC'],
      functions.map((f) => [
        code(f.signature),
        yesNo(f.trigger),
        yesNo(f.definer),
        f.search_path === null ? '' : code(f.search_path === '""' ? '"" (vazio)' : f.search_path),
        yesNo(f.anon),
        yesNo(f.authenticated),
        yesNo(f.public),
      ]),
    ),
  );

  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}
