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

**Na Vercel (ligar o botão):**

O botão "Continuar com Google" **fica escondido por padrão**: o site só o mostra quando a variável `NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED` vale exatamente `true`. Deixe desligado até o provedor estar configurado e testado.

1. Em **Settings → Environment Variables**, crie `NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED` com o valor `true` (nos ambientes em que quiser o botão).
2. Faça um novo deploy (**Deployments →** os três pontinhos do último deploy **→ Redeploy**). Esta é uma variável `NEXT_PUBLIC_`, **lida só no build**: o Next a embute no código na hora de construir o site, então salvar o valor na Vercel não muda nada num deploy que já existe. Para desligar de novo, apague a variável (ou use qualquer valor diferente de `true`) e faça outro deploy.

O Google informa o nome e a foto; o site usa o nome como sugestão na tela de boas-vindas.

### 7. Primeiro acesso

Quem entra pela primeira vez passa por **/boas-vindas** ("Como devemos chamar você nos comentários?"). Esse nome é público e só depois dele a pessoa consegue comentar: o banco recusa comentários de perfis sem `display_name_confirmed_at`. A migration `profile_name_confirmation` só chega à nuvem quando você a aplica (Actions → Database deploy, depois do merge). Até lá, o site trata a coluna ausente como "nome confirmado" para o login funcionar (na pré-visualização, por exemplo). Aplique a migration logo após o merge.

## Livros e capas

Tudo fica em **Painel → Livros** (só a administradora). A moderadora não vê esta página.

### Cadastrar o primeiro livro

1. Abra **Painel → Livros** e clique em **Adicionar livro**.
2. Preencha título, autor, sinopse (opcional), gêneros (digite e aperte Enter ou vírgula) e o **total de capítulos** (uma estimativa: dá para mudar depois).
3. Escolha o **estado inicial**: **Lendo agora** (o livro que o clube está lendo; só um por vez), **Na fila** ou **Já terminado** (pede nota e data).
4. Escolha a **capa** (PNG, JPG ou WEBP, até 5 MB; entre 200 e 6000 px de largura e de altura) e clique em **Criar livro**.

O link do livro (`/livros/<título-em-minúsculas-com-hífens>`) é gerado do título e **não muda** se você editar o título depois. Se já existir um livro com o mesmo título, o link ganha `-2`, `-3`…

### Livro atual, fila e terminados

- **Leitura atual:** mostra o progresso e deixa ajustar o **capítulo atual** e o **total de capítulos** (o total não pode ficar abaixo do capítulo atual). **Marcar livro como terminado** pede a nota (0 a 5, de meio em meio ponto) e leva o livro para a estante.
- **Na fila:** **Começar a ler** só aparece enquanto nenhum livro está em leitura. Com um livro em leitura, o painel explica e leva até o cartão da leitura atual: termine o atual primeiro.
- **Excluir livro** só funciona para livro **sem sessões** e apaga também a capa. Livro com sessões não pode ser excluído.

### Capa e tema do site

Ao enviar a capa do livro **em leitura**, o site inteiro (páginas públicas e painel) passa a usar as cores dela. O servidor confere o arquivo (o formato real, não só a extensão), reduz para no máximo 1000×1500 px, converte para WebP e tira os metadados. Depois extrai as cores e escolhe o tom de destaque, **escurecendo-o até o texto ficar legível** (o selo "Contraste AA verificado" é calculado de verdade nas cores guardadas). O fundo branco da foto é ignorado, e o site continua claro.

- **Tema automático pela capa** (interruptor): desligado, o site usa o tema rosa padrão. Cores escolhidas à mão ficam para a página Configurações, em uma fase futura.
- **Capa em tons de cinza, preto e branco ou sem cor suficiente:** o painel mostra o aviso "Sem cores suficientes" e o site **mantém o tema rosa padrão**. A capa em si é salva normalmente. Capas muito claras ou pastel funcionam (há uma segunda tentativa, mais tolerante).
- **Sem livro em leitura**, ou se algo falhar ao ler o tema, vale sempre o tema padrão: o tema nunca derruba o site.
- Livro sem capa usa uma capa gerada (gradiente a partir do título).
- A cor da barra do navegador (`theme-color`) acompanha o tom profundo do tema; o ícone do app instalado continua o mesmo.

### Aplicar a atualização do banco

Esta etapa traz a migration `…_book_lifecycle.sql` (funções `start_book` e `finish_book`). Depois do merge: faça o deploy da Vercel e rode **Actions → Database deploy** (primeiro com **dry run** ligado, depois desligado). **Antes de aplicar, o site e o painel funcionam** (cadastro, edição, capa, tema, exclusão), e só três ações mostram o aviso "Falta aplicar a atualização do banco": **Começar a ler**, **Marcar livro como terminado** e criar um livro direto como **Lendo agora** (ele fica na fila). Nada quebra por aplicar a migration depois do deploy, nem o contrário.

## Escrever e publicar uma sessão

Tudo isto é feito em **Painel → Sessões**, pelo celular ou pelo computador.

1. **Nova sessão.** O painel já sugere os capítulos (do seguinte à última sessão, até mais dois). Dê um título e comece a escrever. O rascunho só é criado depois que você escreve o título ou o texto.
2. **Divisória de capítulo.** Use o botão da barra para começar cada capítulo. É por elas que o filtro de spoiler esconde o texto de quem ainda não leu. O título de cada capítulo se edita em “Capítulos desta sessão”, ao lado (no celular, abaixo do texto).
3. **Salvamento automático.** O rascunho é salvo sozinho, uns 2 segundos depois de você parar de digitar, e também quando você troca de app. O aviso mostra “Salvando…”, “Rascunho salvo” ou “Sem conexão: salvo só neste aparelho” (volta a enviar sozinho quando a internet voltar). Se o app for fechado antes de enviar, ao abrir de novo ele pergunta “Restaurar?”.
4. **Trechos, anotações e perguntas.** Cada item é salvo na hora, sem esperar. Trechos são citações **curtas e reais** do livro; anotações são suas.
5. **Publicar.** O botão pede confirmação com o resumo da sessão. Depois de publicar, a sessão aparece no site e a fita de capítulos avança.
6. **Depois de publicada.** O texto **não** é salvo sozinho (uma frase pela metade iria ao ar): use “Salvar alterações”, ou “Descartar alterações”. “Voltar para rascunho” tira a sessão do ar, mas só enquanto ela não tem comentários; com comentários, feche a discussão em “Abrir comentários”.
7. **Se aparecer “Esta sessão foi alterada em outro lugar”**, você abriu a mesma sessão em duas abas ou aparelhos. Escolha “Carregar a versão do servidor” ou “Sobrescrever com a minha”.

Se ao publicar aparecer **“Falta aplicar a atualização do banco”**, vá em Actions → Database deploy (primeiro com “dry run” ligado, depois desligado). Escrever, salvar e as notas funcionam sem isso; só publicar e voltar para rascunho dependem dela.

## Solução de problemas

Os nomes dos menus da Vercel mudam de vez em quando e **não foram conferidos na tela do projeto** (a documentação da Vercel consultada só descreve a CLI e a API). Se algo não estiver onde está escrito, procure pelo nome em destaque.

### O site dá erro 500 em todas as páginas, ou o painel mostra "Painel indisponível"

Quase sempre são as variáveis do Supabase que faltam ou estão erradas **no ambiente Production** da Vercel. O site confere as duas ao iniciar e recusa valores inválidos.

1. Na Vercel, abra o projeto e vá em **Settings → Environment Variables**. Confira que existem `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, com os nomes exatos, e que a caixa **Production** está marcada em cada uma. Uma variável marcada só em Preview ou Development não chega ao site publicado.
2. Confira os valores (sem espaços sobrando):
   - `NEXT_PUBLIC_SUPABASE_URL` precisa começar com `https://` (é a URL do projeto, do passo 2 de "Configurar o Supabase").
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` precisa ser a chave `sb_publishable_…`. O site **recusa** uma chave `sb_secret_…` ou `service_role` colada por engano. Se foi isso, troque pela pública e considere a chave secreta exposta: gere outra no Supabase.
3. **Faça um novo deploy** (**Deployments →** os três pontinhos do último deploy **→ Redeploy**). É indispensável: as variáveis `NEXT_PUBLIC_` são **embutidas no código na hora do build**, então salvar a variável não muda nada num deploy que já existe.

Com as variáveis erradas, o site público continua abrindo como visitante (sem o menu da conta), a página de entrar mostra "Não conseguimos enviar o código agora" e `/painel` responde 503 com a página "Painel indisponível": o painel nunca é liberado sem conferir a sessão. Nos logs (próxima seção) aparece uma linha como esta, que diz **qual variável** está errada e o motivo, nunca o valor:

```
proxy falhou { name: 'SupabaseEnvError', issues: [ { variable: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'missing' } ] }
```

`reason` é `missing` (variável ausente ou vazia), `invalid_url` (a URL não é `https://`) ou `secret_key` (parece uma chave secreta).

### Como ler os logs de runtime da Vercel

Os logs de runtime mostram o que o site registrou enquanto atendia as visitas (os de build, de quando o site é construído, ficam em **Deployments →** o deploy **→ Build Logs**).

1. No projeto, abra a aba **Logs** (os logs de runtime). Se preferir ver um deploy específico, abra **Deployments**, clique no deploy e procure a aba de logs dele.
2. Filtre pelo ambiente **Production**, pelo nível **Error** (ou pelo status `500` / `503`) e ajuste o período para incluir a hora do problema.
3. Use a busca de texto por uma destas frases, que o site escreve quando algo falha:

| Texto                                    | Onde aconteceu                                     |
| ---------------------------------------- | -------------------------------------------------- |
| `proxy falhou`                           | na verificação de sessão que roda antes de toda página |
| `SiteHeader: getCurrentUser falhou` / `/entrar: getCurrentUser falhou` | ao descobrir quem está logado, no cabeçalho ou na tela de entrar |
| `auth.signInWithOtp falhou`              | ao pedir o código por e-mail                       |
| `auth.verifyOtp falhou`                  | ao digitar o código                                |
| `auth.signInWithOAuth falhou` / `auth.exchangeCodeForSession falhou` | entrar com o Google |
| `auth.signOut falhou`                    | ao sair                                            |
| `profiles.update (boas-vindas) falhou`   | ao salvar o nome na tela de boas-vindas            |

Cada linha traz só estes campos (os que não se aplicam não aparecem):

- `name` e `constructorName`: o tipo do erro (por exemplo `AuthApiError`, `SupabaseEnvError`, `TypeError`).
- `status` e `code`: a resposta do Supabase (`429` com `over_email_send_rate_limit` é limite de envio de e-mails; `403` com `otp_expired` é código errado ou vencido).
- `causeCode`: só em erro de rede. `ENOTFOUND` costuma ser URL do Supabase com erro de digitação; `ECONNREFUSED` e `ETIMEDOUT`, serviço fora do ar ou inalcançável.
- `issues`: só no erro de variáveis de ambiente, como no exemplo acima.

**Por desenho, os logs nunca trazem e-mail, código, token, cabeçalhos nem a mensagem do erro**: não dá para descobrir de quem foi a tentativa, e isso é de propósito.

### O botão "Continuar com Google" não aparece

Ele só aparece com `NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED` igual a `true` (e **fica escondido por padrão**). Como é uma variável `NEXT_PUBLIC_`, lida no build, depois de criar ou mudar a variável é preciso um novo deploy (**Redeploy**). Veja o passo 6 de "Configurar o login".

## Decisões conhecidas

- **Excluir uma conta apaga os comentários da pessoa e, por consequência, as respostas de outras pessoas a eles.** É uma cascata no banco (`profiles → comments → respostas`), escolhida para que a exclusão da conta realmente remova o que a pessoa escreveu. Nenhuma tela exclui contas por enquanto; isso só acontece pelo painel do Supabase.
- **Os perfis são legíveis publicamente.** Qualquer visitante, sem login, consegue ler o nome de exibição e o avatar de todos os membros (e quem é administradora ou moderadora). O e-mail nunca está no perfil, e quem se cadastra sem informar nome aparece como "Leitor". Isso precisa constar da política de privacidade (etapa 7).
- **Comentários nunca são apagados pelo site.** A moderação marca como `removed` (exclusão lógica). Uma sessão que já recebeu comentários não pode ser excluída.
- **O painel só abre para quem tem papel no banco.** O proxy (`src/proxy.ts`) redireciona quem não está logado, mas a autorização real é `requireRole` (lê `profiles.role`) e o RLS. A moderadora só acessa Comentários; o resto do painel dá 403.
- **Livros são públicos.** Sessões publicadas como públicas aparecem para todo mundo; as marcadas como "só membros" exigem login. Rascunhos só a administradora vê.
- **O total de capítulos de cada livro é uma estimativa.** O banco não trava uma sessão por passar do total.
