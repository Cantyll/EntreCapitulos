# Entre Capítulos

Blog e clube de leitura em sessões, com discussão por capítulo e controle de spoiler.

- Protótipo navegável: `docs/prototype/entre-capitulos.html`
- Briefing técnico e de design: `CLAUDE.md`
- Referência do tema automático pela capa: `docs/theme-engine.reference.js`

## Stack

Next.js + TypeScript, Supabase (Postgres, Auth, Storage) e Vercel.

## Como o projeto é desenvolvido

Tudo acontece pelo navegador: o código é escrito em sessões na nuvem, o GitHub roda a verificação automática (lint, tipos, build e testes do banco) em cada pull request, e a Vercel publica uma pré-visualização. Não é preciso instalar nem rodar nada no seu computador.

## Configurar o Supabase (só pelo navegador)

Os nomes dos menus dos painéis mudam de vez em quando; se algo não estiver exatamente onde está escrito, procure pelo nome em destaque. Os caminhos de menu do Supabase e do Google citados aqui seguem a documentação e **não foram conferidos na tela do projeto**; o de Actions do GitHub confere com o workflow `db-deploy.yml`.

### 1. Criar o projeto

1. Em [supabase.com/dashboard](https://supabase.com/dashboard), clique em **New project**.
2. Escolha um nome (por exemplo, `entre-capitulos`), uma região próxima (por exemplo, São Paulo) e uma **senha do banco**. Guarde a senha no seu gerenciador de senhas: ela será o secret `SUPABASE_DB_PASSWORD` (se perder, dá para redefinir em **Project Settings → Database**).
3. Espere o projeto terminar de criar.

### 2. Achar a URL e a chave pública

No painel do projeto, abra **Project Settings**:

- A **URL do projeto** (algo como `https://abcdefghijklmnopqrst.supabase.co`) aparece em **API** / **Data API**.
- A **chave pública** começa com `sb_publishable_` e fica em **API Keys**. Ela é pública por desenho: quem protege os dados é o RLS do banco.
- O **Reference ID** do projeto (20 letras) está em **General**. É o mesmo trecho que aparece na URL do painel e no início da URL do projeto.

Nunca copie para o GitHub, para a Vercel ou para uma conversa a chave **secret** (`sb_secret_…`) nem a `service_role`: este app não usa nenhuma das duas.

### 3. Criar os três secrets no GitHub

No repositório, vá em **Settings → Secrets and variables → Actions → New repository secret** e crie:

| Nome                    | Valor                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Token pessoal: em [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens), **Generate new token** |
| `SUPABASE_DB_PASSWORD`  | A senha do banco definida no passo 1                                                                                       |
| `SUPABASE_PROJECT_REF`  | O Reference ID do projeto                                                                                                  |

Os valores não aparecem nos logs do GitHub. A verificação automática das pull requests (CI) não usa nenhum secret.

### 4. Variáveis na Vercel

No projeto da Vercel, abra **Settings → Environment Variables** e crie as duas variáveis abaixo, marcando Production, Preview e Development:

| Nome                                   | Valor                                 |
| -------------------------------------- | ------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | A URL do projeto (passo 2)            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | A chave `sb_publishable_…` (passo 2)  |

Depois de salvar, faça um novo deploy (**Deployments →** os três pontinhos do último deploy **→ Redeploy**) para as variáveis valerem. O arquivo `.env.example` do repositório só lista os nomes.

### 5. Aplicar as migrations

As migrations ficam em `supabase/migrations/` e só são aplicadas depois que a pull request estiver mesclada na `main`. No GitHub:

1. Abra **Actions → Database deploy → Run workflow**, escolha a branch `main` e deixe **dry run** marcado. Esse modo só mostra o que seria aplicado, sem alterar o banco. Confira no log que aparece a migration `…_initial_schema.sql`.
2. Se o log pedir algum secret, o erro diz qual está faltando (passo 3).
3. Rode de novo com **dry run desmarcado** para aplicar de verdade.

O workflow roda uma execução por vez e nunca envia dados de exemplo (`seed.sql`): eles existem só para o banco de desenvolvimento.

### 6. Promover a primeira administradora

Ninguém vira administradora ao se cadastrar: nenhum fluxo do site concede esse papel, e o banco recusa qualquer tentativa de mudar o próprio papel. A promoção é feita uma vez, à mão, **depois do primeiro login** da pessoa (assim o perfil dela já existe).

No painel do Supabase, abra **SQL Editor**, cole o comando abaixo trocando o e-mail pelo que a administradora usou para entrar, e clique em **Run**:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'email-da-administradora@exemplo.com');
```

Para conferir, rode:

```sql
select p.display_name, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.role <> 'member';
```

Deve aparecer uma linha com `admin`. Para criar uma moderadora, use o mesmo comando com `'moderator'` no lugar de `'admin'`.

## Configurar o login (Supabase Auth)

O site entra por **código de 6 dígitos enviado por e-mail** (digitado na própria página, sem link) e por **Google**. O código existe porque o app instalado no iPhone tem cookies separados do Safari: um link abriria a sessão no lugar errado. Tudo abaixo é configuração manual no painel do Supabase (não há migration nem arquivo que a aplique). Os caminhos de menu seguem a documentação e não foram conferidos na tela do projeto.

### 1. URLs (Authentication → URL Configuration)

| Campo             | Valor                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **Site URL**      | `https://entrecapitulos.blog.br`                                                                              |
| **Redirect URLs** | `https://entrecapitulos.blog.br/**` e `https://*-felipe-almeida-s-projects.vercel.app/**` (pré-visualizações) |

O retorno do Google é sempre `/auth/callback`; o destino depois do login vai num cookie do site, não na URL.

### 2. E-mail: SMTP do Resend (Authentication → Emails → SMTP Settings)

| Campo              | Valor                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| Enable custom SMTP | ligado                                                                      |
| **Sender email**   | `codigo@mail.entrecapitulos.blog.br`                                        |
| **Sender name**    | `Entre Capítulos`                                                           |
| **Host**           | `smtp.resend.com`                                                           |
| **Port number**    | `465`                                                                       |
| **Username**       | `resend`                                                                    |
| **Password**       | a chave de API do Resend (nunca no repositório, na Vercel ou numa conversa) |

No Resend, o domínio de envio é `mail.entrecapitulos.blog.br`, com os registros de DNS gerenciados na Vercel. Sem SMTP próprio o Supabase só envia uns poucos e-mails por hora.

### 3. E-mail: modelos (Authentication → Emails → templates)

Cole o conteúdo de [`supabase/templates/magic_link.html`](supabase/templates/magic_link.html) em **Magic Link** (quem já tem conta) e de [`supabase/templates/confirmation.html`](supabase/templates/confirmation.html) em **Confirm signup** (primeiro acesso). Os dois usam `{{ .Token }}`, o código, e não têm link. O assunto sugerido está no topo de cada arquivo. Esses arquivos são só cópia de referência: o painel é a fonte de verdade.

### 4. Tamanho do código

O app espera **6 dígitos** (constante `OTP_LENGTH` em `src/lib/auth/constants.ts`). O tamanho do código é uma opção do painel do Supabase, separada dos modelos (em Authentication → Sign In / Providers → Email, conforme a documentação), e **precisa estar em 6**. Com outro tamanho, o campo nunca valida.

### 5. Login anônimo e limites

- Em **Authentication → Sign In / Providers**, deixe **Allow anonymous sign-ins** desligado. O RLS já trata anônimos como não-membros, mas não há motivo para ligar.
- Em **Authentication → Rate Limits** ficam os limites de envio de e-mail e de verificação de código. A tela de login espera 60 segundos antes de reenviar, o mesmo intervalo mínimo do Supabase.

### 6. Google (Authentication → Sign In / Providers → Google)

Tudo pelo navegador, em duas partes. Os nomes dos menus do Google mudam com frequência (por exemplo, "OAuth consent screen" virou "Google Auth Platform"); se algo não estiver onde está escrito, procure pelo nome em destaque.

**No Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Crie um projeto (ou escolha um) no seletor de projetos, no topo.
2. Abra **APIs & Services → OAuth consent screen** (ou **Google Auth Platform**). Tipo de usuário **External**. Preencha nome do app (`Entre Capítulos`), e-mail de suporte e e-mail do desenvolvedor.
3. Em domínios autorizados, adicione `entrecapitulos.blog.br` e o domínio do seu projeto Supabase (`<reference id>.supabase.co`).
4. Em escopos, deixe só os básicos: `openid`, `email` e `profile` (não precisam de verificação do Google).
5. Publique o app (**Publish app** / status **In production**). Em modo de teste só as contas de teste entram e a sessão expira em poucos dias.
6. Abra **APIs & Services → Credentials → Create credentials → OAuth client ID**, tipo **Web application**.
7. Em **Authorized JavaScript origins**, coloque `https://entrecapitulos.blog.br`.
8. Em **Authorized redirect URIs**, coloque a **Callback URL** que o Supabase mostra na página do provedor Google (no formato `https://<reference id>.supabase.co/auth/v1/callback`).
9. Crie e copie o **Client ID** e o **Client secret**.

**No Supabase:**

1. Abra **Authentication → Sign In / Providers → Google**, ligue o provedor, cole o Client ID e o Client secret e salve. O secret fica só no Supabase, nunca no repositório.

O Google informa o nome e a foto; o site usa o nome como sugestão na tela de boas-vindas.

### 7. Primeiro acesso

Quem entra pela primeira vez passa por **/boas-vindas** ("Como devemos chamar você nos comentários?"). Esse nome é público e só depois dele a pessoa consegue comentar: o banco recusa comentários de perfis sem `display_name_confirmed_at`. A migration `profile_name_confirmation` só chega à nuvem quando você a aplica (Actions → Database deploy, depois do merge). Até lá, o site trata a coluna ausente como "nome confirmado" para o login funcionar (na pré-visualização, por exemplo). Aplique a migration logo após o merge.

## Decisões conhecidas

- **Excluir uma conta apaga os comentários da pessoa e, por consequência, as respostas de outras pessoas a eles.** É uma cascata no banco (`profiles → comments → respostas`), escolhida para que a exclusão da conta realmente remova o que a pessoa escreveu. Nenhuma tela exclui contas por enquanto; isso só acontece pelo painel do Supabase.
- **Os perfis são legíveis publicamente.** Qualquer visitante, sem login, consegue ler o nome de exibição e o avatar de todos os membros (e quem é administradora ou moderadora). O e-mail nunca está no perfil, e quem se cadastra sem informar nome aparece como "Leitor". Isso precisa constar da política de privacidade (etapa 7).
- **Comentários nunca são apagados pelo site.** A moderação marca como `removed` (exclusão lógica). Uma sessão que já recebeu comentários não pode ser excluída.
- **O painel só abre para quem tem papel no banco.** O proxy (`src/proxy.ts`) redireciona quem não está logado, mas a autorização real é `requireRole` (lê `profiles.role`) e o RLS. A moderadora só acessa Comentários; o resto do painel dá 403.
- **Livros são públicos.** Sessões publicadas como públicas aparecem para todo mundo; as marcadas como "só membros" exigem login. Rascunhos só a administradora vê.
- **O total de capítulos de cada livro é uma estimativa.** O banco não trava uma sessão por passar do total.
