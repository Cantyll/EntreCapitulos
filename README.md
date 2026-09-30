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

Os nomes dos menus dos painéis mudam de vez em quando; se algo não estiver exatamente onde está escrito, procure pelo nome em destaque.

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

1. Abra **Actions → Database deploy → Run workflow**, escolha a branch `main` e deixe **dry run** marcado. Esse modo só mostra o que seria aplicado, sem alterar o banco. Confira no log quais migrations aparecem (por exemplo, `…_display_name_confirmation.sql` depois da etapa 2). As que já foram aplicadas não aparecem de novo.
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

## Login e e-mails (configuração manual no Supabase)

Esta parte **já foi configurada** no painel do Supabase; o texto abaixo registra como ficou, para conferir ou refazer um dia. Os caminhos de menu seguem a documentação do Supabase e **não foram conferidos na tela do projeto**: se algo não estiver exatamente onde está escrito, procure pelo nome em destaque.

O site tem duas formas de entrar: **código de 6 dígitos por e-mail**, digitado na própria tela de login, e **Google**. Não há link mágico: no app instalado na Tela de Início do iPhone, um link do e-mail abriria no Safari, que guarda outros cookies, e o app continuaria deslogado.

### URLs (Authentication → URL Configuration)

| Campo         | Valor                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Site URL      | `https://entrecapitulos.blog.br`                                                           |
| Redirect URLs | `https://entrecapitulos.blog.br/**` e `https://*-felipe-almeida-s-projects.vercel.app/**` |

A segunda URL cobre as pré-visualizações da Vercel. Depois do Google, o Supabase devolve a pessoa para `/auth/callback` no mesmo endereço em que ela começou o login.

### E-mail de envio (Authentication → Emails → SMTP Settings)

| Campo          | Valor                                                  |
| -------------- | ------------------------------------------------------ |
| Host           | `smtp.resend.com`                                      |
| Porta          | `465`                                                  |
| Usuário        | `resend`                                               |
| Senha          | A chave de API do Resend (nunca entra no repositório) |
| Remetente      | `codigo@mail.entrecapitulos.blog.br`                   |
| Nome           | `Entre Capítulos`                                      |

No Resend, o domínio de envio é `mail.entrecapitulos.blog.br`, com os registros de DNS gerenciados na Vercel (o domínio `entrecapitulos.blog.br` está lá).

### Modelos de e-mail (Authentication → Emails)

Os modelos **Magic Link** e **Confirm signup** mandam só o código, com a variável `{{ .Token }}`, sem link. O primeiro é usado quando o e-mail já tem conta; o segundo, no primeiro acesso de um endereço novo. Há uma cópia de referência do texto em pt-BR em `supabase/templates/` (`magic_link.html` e `confirmation.html`); ela não é enviada para a nuvem, e o texto no painel pode ter pequenas diferenças.

**O código precisa ter 6 dígitos.** O tamanho do código é uma opção separada dos modelos, nas configurações do provedor de e-mail (pela documentação, em **Authentication → Sign In / Providers → Email**, campo do tamanho do código OTP). A tela de login aceita exatamente 6 dígitos (`OTP_LENGTH` em `src/lib/auth/constants.ts`); se o painel estiver com outro tamanho, nenhum código vai validar.

### Provedores (Authentication → Sign In / Providers)

- **Email**: ligado, com cadastro permitido (o primeiro código cria a conta).
- **Anonymous sign-ins**: desligado. Mesmo que um dia seja ligado, o site e o banco tratam o usuário anônimo como não logado.
- **Google**: ligado, com o Client ID e o Client Secret do passo a passo abaixo.

### Limites (Authentication → Rate Limits)

O Supabase limita quantos e-mails saem por hora e quantas tentativas de login cada endereço de IP faz. Se muita gente entrar ao mesmo tempo (por exemplo, logo depois de divulgar o clube) e aparecer "Muitas tentativas seguidas" na tela de login, é aqui que o limite de e-mails sobe.

### Google (só pelo navegador)

Os nomes de menu do Google Cloud mudam com frequência; se não achar algo, procure pelo nome em destaque.

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto (por exemplo, `entre-capitulos`).
2. Abra **Google Auth Platform** (em alguns painéis ainda aparece como **APIs e serviços → Tela de permissão OAuth**) e preencha o nome do app (`Entre Capítulos`), o e-mail de suporte e o domínio `entrecapitulos.blog.br`. O público é **Externo**. Os escopos padrão (`email`, `profile`, `openid`) bastam.
3. Em **Clientes** (ou **Credenciais → Criar credenciais → ID do cliente OAuth**), crie um cliente do tipo **Aplicativo da Web**:
   - **Origens JavaScript autorizadas**: `https://entrecapitulos.blog.br`.
   - **URIs de redirecionamento autorizados**: a **Callback URL** que o Supabase mostra na tela do provedor Google (algo como `https://<reference-id>.supabase.co/auth/v1/callback`). É o Supabase, e não o site, que recebe a volta do Google.
4. Copie o **Client ID** e o **Client Secret** para **Authentication → Sign In / Providers → Google** no Supabase e salve. O Client Secret é um segredo: não cole no repositório nem em conversas.
5. Enquanto o app estiver em modo de teste no Google, só os e-mails cadastrados como testadores conseguem entrar. Para abrir a todos, publique o app na mesma tela do passo 2.

Do lado do site não há nada a configurar: o botão "Continuar com Google" usa as mesmas variáveis do passo 4 da seção anterior.

### Depois de mesclar a etapa 2

Aplique a migration nova logo depois do merge (seção 5 acima, dry run primeiro). Até lá, o banco da nuvem não tem a coluna que registra se a pessoa já escolheu o nome público. O login continua funcionando nesse intervalo, só que a tela de boas-vindas não aparece: o site trata todo mundo como se já tivesse escolhido o nome.

## Decisões conhecidas

- **Excluir uma conta apaga os comentários da pessoa e, por consequência, as respostas de outras pessoas a eles.** É uma cascata no banco (`profiles → comments → respostas`), escolhida para que a exclusão da conta realmente remova o que a pessoa escreveu. Nenhuma tela exclui contas por enquanto; isso só acontece pelo painel do Supabase.
- **Os perfis são legíveis publicamente.** Qualquer visitante, sem login, consegue ler o nome de exibição e o avatar de todos os membros (e quem é administradora ou moderadora). O e-mail nunca está no perfil, e quem se cadastra sem informar nome aparece como "Leitor". Isso precisa constar da política de privacidade (etapa 7).
- **Comentários nunca são apagados pelo site.** A moderação marca como `removed` (exclusão lógica). Uma sessão que já recebeu comentários não pode ser excluída.
- **Livros são públicos.** Sessões publicadas como públicas aparecem para todo mundo; as marcadas como "só membros" exigem login. Rascunhos só a administradora vê.
- **O total de capítulos de cada livro é uma estimativa.** O banco não trava uma sessão por passar do total.
- **Quem não escolheu o nome público não comenta.** No primeiro acesso, a tela de boas-vindas pergunta como a pessoa quer aparecer (e avisa que o nome é público). Dá para pular e só ler; o banco recusa o comentário até o nome ser escolhido.
- **Sair desconecta só o aparelho atual.** Sair no computador não desloga o app instalado no celular.
