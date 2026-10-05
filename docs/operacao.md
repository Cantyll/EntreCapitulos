# Operação do Entre Capítulos

Guia prático para quem cuida do site. **Tudo é feito pelo navegador** (GitHub, Vercel, Supabase); nada precisa ser rodado no seu computador.

> **Como ler os avisos.** "Não verificado" quer dizer que o caminho do menu ou o limite vem da documentação do provedor ou da memória, e **não foi conferido na tela do projeto**. Os painéis mudam de nome com frequência: se algo não estiver onde está escrito, procure pelo nome em destaque.
>
> **Este repositório é público.** Nunca cole aqui (nem em PR, issue ou log) e-mails de pessoas, chaves, senhas, IDs de projeto ou dados de leitoras.

## 1. Deploy normal

1. Um pull request só é mesclado na `main` com o **CI** verde (o **E2E** é um bom sinal, mas não é obrigatório).
2. Ao mesclar, a Vercel publica a `main` em produção sozinha. Acompanhe em **Vercel → projeto → Deployments** (o novo deploy deve terminar em "Ready").
3. Se o PR trouxe uma **migration** (pasta `supabase/migrations/`), aplique-a depois do deploy (seção 2).
4. Confira o site: abra a home, o livro atual e `/entrar`. O workflow **Smoke test da produção** faz essa conferência (Actions → Smoke test da produção → Run workflow).

Variáveis `NEXT_PUBLIC_*` são embutidas **no build**: mudar o valor na Vercel só vale depois de um novo deploy (**Deployments → ⋯ do último deploy → Redeploy**).

## 2. Database deploy (aplicar migrations)

1. No GitHub: **Actions → Database deploy → Run workflow**.
2. Escolha a branch **`main`** (o workflow recusa qualquer outra) e **deixe "dry run" marcado**. Esse modo só mostra o que seria aplicado.
3. Abra o log e confira que a lista de migrations é a esperada (só as novas).
4. Rode de novo com o dry run **desmarcado** para aplicar de verdade.
5. Se o log disser que falta um secret, confira em **Settings → Secrets and variables → Actions** (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`).

O workflow nunca envia o `seed.sql` (dados de exemplo) para a nuvem.

## 3. Reverter um deploy (rollback da Vercel)

Use quando um deploy novo quebrou o site e o conserto vai demorar.

1. **Vercel → projeto → Deployments**, ache o último deploy que funcionava (o anterior ao problema).
2. Abra o menu **⋯** dele e escolha **Promote to Production** (ou **Instant Rollback**). **Não verificado:** o nome exato do botão.
3. Segundo a documentação da Vercel consultada, escolher **qualquer** deploy antigo exige plano Pro; no plano gratuito (Hobby) o rollback instantâneo só volta ao deploy imediatamente anterior. **Não verificado** para este projeto.
4. O rollback **não desfaz migrations**. Se o deploy ruim veio com uma migration, não reverta o banco por conta própria: o site antigo costuma continuar funcionando com colunas e funções a mais, e a correção do banco é sempre uma **migration nova** (seção 4).
5. Depois do rollback, o conserto entra por um PR normal. A Vercel não publica a `main` por cima enquanto o rollback estiver ativo (**não verificado**): ao terminar, faça um novo deploy da `main`.

## 4. Corrigir uma migration

- **Nunca edite uma migration já aplicada.** O histórico do banco da nuvem não saberia que ela mudou.
- A correção é sempre uma **migration nova**, com timestamp posterior ao da última (`supabase/migrations/`), num PR comum. Depois do merge, rode o Database deploy (seção 2).
- Se uma migration falhou no meio: o log do workflow mostra o erro. Não rode SQL à mão para "terminar" o serviço sem entender o estado; abra uma sessão de desenvolvimento e descreva o erro.
- O arquivo `docs/seguranca.md` é gerado do banco: depois de mudar políticas, permissões ou funções, ele precisa ser regenerado (o CI avisa se esquecer).

## 5. `CSP_REPORT_ONLY` (válvula de escape da CSP)

Se depois de um deploy algo parar de funcionar por causa da política de segurança de conteúdo (um botão que não responde, imagem que não aparece, login que não avança):

1. **Vercel → Settings → Environment Variables:** crie `CSP_REPORT_ONLY` com o valor `true` (marque **Production**).
2. Faça **Redeploy**.
3. O site passa a só **relatar** violações (no console do navegador), sem bloquear. Corrija a causa por PR e **apague a variável** (com novo Redeploy) para voltar a bloquear.

Mais detalhes: README, seção "Cabeçalhos de segurança e CSP".

## 6. Rotação de chaves e o que reiniciar

Troque uma chave sempre que ela vazar, aparecer em algum lugar público ou quando alguém que a conhecia sair do projeto. **Nunca** cole uma chave num PR, issue ou conversa.

| O que | Onde se cria a nova | Onde se troca | Depois |
| --- | --- | --- | --- |
| Chave pública do Supabase (`sb_publishable_…`) | Supabase → Project Settings → API Keys (**não verificado**) | Vercel → Environment Variables → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Redeploy** (é lida no build) |
| Chave **secret** / `service_role` do Supabase | Este app **não usa** nenhuma das duas. Se uma apareceu em algum lugar, gere outra no Supabase e apague a antiga | — | — |
| Senha do banco | Supabase → Project Settings → Database → redefinir senha (**não verificado**) | GitHub → Settings → Secrets → `SUPABASE_DB_PASSWORD` | Nada a reiniciar; o próximo Database deploy já usa a nova |
| Token de acesso do Supabase | supabase.com/dashboard/account/tokens: gere um novo e **apague o antigo** | GitHub → Secrets → `SUPABASE_ACCESS_TOKEN` | Nada a reiniciar |
| Chave de API do Resend | Resend → API Keys: crie uma nova | Supabase → Authentication → Emails → SMTP Settings → campo **Password** (**não verificado**) | Teste: peça um código em `/entrar`. Depois apague a chave antiga no Resend |
| Turnstile (Site Key e Secret Key) | Cloudflare → Turnstile (rotacionar o widget) | **Secret Key:** Supabase → Authentication (Bot and Abuse Protection). **Site Key:** Vercel → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **Redeploy** da Vercel. Troque as duas na mesma janela de tempo; se o login quebrar, desligar o CAPTCHA no Supabase restaura tudo |
| Client secret do Google | Google Cloud Console → Credentials | Supabase → Authentication → Sign In / Providers → Google | Nada a reiniciar |

Chaves públicas (`NEXT_PUBLIC_*`) aparecem no código que vai para o navegador: trocá-las não é urgência de vazamento, só higiene.

## 7. Promover e rebaixar administração e moderação

Ninguém vira administração ao se cadastrar. O papel muda **só** pelo **SQL Editor** do Supabase (a pessoa precisa já ter entrado no site uma vez, para o perfil existir).

Promover (troque o papel por `'admin'` ou `'moderator'` e o e-mail pelo da pessoa):

```sql
update public.profiles
set role = 'moderator'
where id = (select id from auth.users where email = 'email-da-pessoa@exemplo.com');
```

Rebaixar a membro comum:

```sql
update public.profiles
set role = 'member'
where id = (select id from auth.users where email = 'email-da-pessoa@exemplo.com');
```

Conferir quem tem papel (deve mostrar as linhas esperadas):

```sql
select p.display_name, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.role <> 'member';
```

A moderação só abre **Comentários**. O papel vem do banco a cada requisição; a pessoa não precisa sair e entrar de novo.

## 8. Pedidos da LGPD (cópia e exclusão dos dados)

O e-mail de contato é o de `src/content/legal-config.ts` (`privacyContactEmail`). O prazo de resposta (`requestDeadline`) é uma **proposta a validar com advogado**: confirme antes de prometer.

1. **Confirme quem pede.** Responda **para o e-mail cadastrado na conta** e peça que a pessoa confirme o pedido a partir dele. Nunca envie dados para outro endereço.
2. **Ache a conta** (troque o e-mail; deve voltar **uma** linha) no **SQL Editor**:

   ```sql
   select u.id, u.email, u.created_at, p.display_name, p.role
   from auth.users u join public.profiles p on p.id = u.id
   where u.email = 'email-da-pessoa@exemplo.com';
   ```

3. **Cópia dos dados.** Troque `ID` pelo `id` do passo 2 e exporte o resultado de cada consulta (botão de exportar CSV ou JSON; **não verificado**: o nome do botão). Junte num arquivo enviado só ao e-mail confirmado. Não inclua comentários de outras pessoas nem as sinalizações da equipe.

   ```sql
   select * from public.profiles where id = 'ID';
   select c.id, c.status, c.body, c.parent_id, c.session_id, c.read_up_to, c.spoiler_up_to, c.created_at
   from public.comments c where c.author_id = 'ID' order by c.created_at;
   select rp.chapter, rp.updated_at, b.title from public.reading_progress rp
   join public.books b on b.id = rp.book_id where rp.user_id = 'ID';
   ```

4. **Exclusão da conta.** Se o papel (passo 2) for `admin` ou `moderator`, só siga se a pessoa realmente deixará a equipe, e retire o papel antes:

   ```sql
   update public.profiles set role = 'member' where id = 'ID';
   ```

5. **Exporte antes de apagar** (regra da seção 10): faça o passo 3 e guarde o arquivo num lugar **privado** (nunca no repositório).
6. **Confira o que será apagado** (um só usuário e quantos comentários vão junto):

   ```sql
   select (select count(*) from auth.users where id = 'ID') as usuarios,
          (select count(*) from public.comments where author_id = 'ID') as comentarios;
   ```

7. **Exclua** (definitivo; apaga em cascata o perfil, os comentários da pessoa, as respostas de outras pessoas a eles, as sinalizações e o progresso):

   ```sql
   delete from auth.users where id = 'ID';
   ```

   Repita a consulta do passo 6: `usuarios` deve voltar `0`. Nas páginas, os comentários apagados podem aparecer por **até 5 minutos** (cache público); para sumir na hora, faça **Redeploy** na Vercel.
8. **Comentário removido pela moderação** (o autor não tem botão para ele): confirme o autor, e troque o texto:

   ```sql
   update public.comments
   set body = '[comentário removido pelo autor]'
   where id = 'ID-DO-COMENTARIO' and author_id = 'ID' and status = 'removed';
   ```

9. **Responda por e-mail** dizendo o que foi feito. As cópias de segurança do provedor podem reter os dados por um tempo: **o que dizer sobre isso depende do plano e de análise jurídica (A DEFINIR)**.

## 9. O código de login parou de chegar

O login é por **código de 6 dígitos por e-mail**. Se ninguém recebe, siga a ordem:

1. **Peça a uma pessoa de confiança que teste** em `/entrar` e confira a caixa de spam.
2. **Logs da Vercel** (Vercel → projeto → Logs, nível Error, ambiente Production): procure `auth.signInWithOtp falhou`. O campo `code` diz a causa:
   - `over_email_send_rate_limit` (status 429): limite de e-mails do Supabase estourado. Espere e veja o passo 4.
   - `captcha_failed`: o Turnstile não validou. Veja se a Site Key e a Secret Key são do mesmo widget (seção 6) e, se preciso, desligue o CAPTCHA no Supabase.
   - Sem `code` e com `causeCode` (`ENOTFOUND`, `ECONNREFUSED`): problema de rede ou URL do Supabase errada.
3. **Resend** (painel do Resend): o domínio de envio precisa estar **Verified**; veja os registros de envio e se há rejeição ou bloqueio (**não verificado:** nomes de abas). Chave de API revogada ou expirada também derruba o envio: troque conforme a seção 6.
4. **Limites do Supabase** (Authentication → Rate Limits; **não verificado**): com SMTP próprio os limites são ajustáveis; sem ele o Supabase manda pouquíssimos e-mails por hora. Confira se o **SMTP próprio** (Authentication → Emails → SMTP Settings: host `smtp.resend.com`, porta `465`, usuário `resend`) continua ligado.
5. **O modelo de e-mail** (Authentication → Emails) precisa mostrar o código (`{{ .Token }}`): se alguém o trocou por um modelo com link, o app não funciona.
6. **O tamanho do código** no Supabase precisa ser **6**.
7. Se nada resolver, desligue temporariamente o CAPTCHA (se ligado) e teste de novo para isolar a causa.

## 10. Plano gratuito do Supabase: riscos confirmados

**Confirmado na página de preços do Supabase (plano gratuito):**

1. **Não há backup automático.** Se o banco for apagado ou corrompido, não existe cópia do provedor para restaurar.
2. **O projeto é pausado depois de 1 semana sem atividade.** Site e painel param de funcionar até alguém restaurá-lo.

**Desde a etapa 8d existe um backup diário criptografado no Cloudflare R2** (seção 15). Ele cobre o primeiro risco, mas **não** a pausa, e só protege se a seção 15 estiver configurada e o **Backup do banco** estiver rodando. Os dois riscos estão listados em `docs/lancamento.md` (decisão sobre backup antes de convidar leitoras) e comparados em `docs/propostas-etapa8.md`. O **Smoke test da produção** abre o livro atual todo dia (faz o site ler o banco); isso **pode ajudar, sem garantia**, a evitar a pausa. Não confie nele sozinho.

### Restaurar um projeto pausado

1. Entre em **supabase.com/dashboard** e abra o projeto: ele aparece como pausado (**não verificado:** o texto exato).
2. Clique em **Restore project** (ou o botão equivalente) e espere voltar ao estado ativo (alguns minutos).
3. Confira o site e rode o **Smoke test da produção**.
4. **Não verificado:** existe um prazo máximo para restaurar um projeto gratuito pausado; depois dele só dá para baixar os dados. Confirme o prazo atual na documentação do Supabase **antes** de precisar, e não deixe o projeto pausado por muito tempo.

### Exportar tabelas em CSV (pelo painel)

1. No Supabase: **Table Editor**, escolha a tabela, e use o menu de exportação (algo como **Export → Export table as CSV**; **não verificado:** o nome exato do botão).
2. Exporte estas quatro tabelas, que são o **conteúdo** do blog (não têm dado pessoal das leitoras): `reading_sessions`, `books`, `session_notes` e `session_questions`.
3. Guarde os arquivos num lugar **privado** (por exemplo, uma pasta em um drive só seu), com a data no nome. **Nunca no repositório** (ele é público).
4. **Frequência sugerida:** uma vez por semana enquanto a Agatha estiver publicando; e **sempre** antes de uma migration e antes de qualquer SQL que apague dados.
5. As tabelas `comments`, `comment_flags`, `reading_progress` e `profiles` têm dados pessoais e **não fazem parte** desta rotina; se forem exportadas, trate o arquivo como dado pessoal (LGPD). Sem elas, restaurar do CSV perde os comentários e o progresso de leitura. Isso é uma das razões para decidir sobre backup (`docs/propostas-etapa8.md`).

### Regra de ouro

> **Exporte a tabela antes de rodar qualquer SQL que apague dados** (`delete`, `truncate`, `drop`, e `update` em massa também).

## 11. Workflow com `startup_failure`

`startup_failure` quer dizer que o GitHub **nem começou** a rodar o workflow (não é falha de teste nem de código).

1. **Leia a mensagem na página da execução** (Actions → clique na execução): o GitHub costuma dizer o motivo no topo, em "Annotations" ou no resumo.
2. **Settings → Actions → General** do repositório: confira se as ações estão permitidas (e se há uma lista de ações permitidas) e se há a exigência de **fixar por SHA**. Os workflows deste projeto já usam SHA completo; uma ação nova precisa de SHA também.
3. **Billing** da conta ou organização (Settings → Billing): minutos esgotados ou cobrança com problema impedem a execução. **Não verificado** para o plano atual.
4. Uma execução em `startup_failure` **não pode ser reexecutada** ("Re-run" dá erro 403). Em workflow manual, use **Run workflow** de novo; em PR, basta um novo commit legítimo.
5. Se persistir, abra o status do GitHub (githubstatus.com): pode ser incidente deles.

## 12. Workflows do repositório

| Workflow | Quando roda | Permissões | Secrets |
| --- | --- | --- | --- |
| `ci.yml` | pull request | `contents: read` | nenhum |
| `e2e.yml` | pull request para `main` e manual | `contents: read` | nenhum |
| `smoke-prod.yml` | manual e todo dia às 09:17 UTC | `contents: read` | nenhum |
| `db-deploy.yml` | só manual, só na `main` | `contents: read` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` (hoje no repositório; ver "Recomendado" abaixo) |
| `backup.yml` | todo dia às 06:23 UTC e manual, só na `main` | `contents: read` | Environment `backup`: `R2_*`, `BACKUP_PASSPHRASE` e os do Supabase |
| `backup-drill.yml` | domingo às 07:41 UTC e manual, só na `main` | `contents: read` | Environment `backup` |
| `db-restore.yml` | só manual, só na `main`, com aprovação | `contents: read` | Environment `restore` |
| `credentials-check.yml` | só manual, só na `main` | `contents: read` | Environment `backup` ou `restore` (você escolhe; o `restore` pede a sua aprovação) |

Nenhum usa `pull_request_target`. Ações de terceiros ficam fixadas por SHA de commit completo, com a versão no comentário; o **Dependabot** (`.github/dependabot.yml`) abre PRs semanais (no máximo 5) para atualizá-las.

**Recomendado ([manual], ainda não feito): mover os segredos de produção do Supabase para um Environment `production`** restrito à `main`, como os de backup, para que só a `main` os leia. Sem quebrar o Database deploy: (1) crie o Environment `production` (Settings → Environments), restrinja a branch a `main` e crie nele `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `SUPABASE_PROJECT_REF`; (2) peça, numa sessão de desenvolvimento, para acrescentar `environment: production` ao job do `db-deploy.yml` e mescle; (3) rode **Database deploy** com `dry_run` ligado e confirme que funciona; (4) **só depois** apague os três segredos do nível do repositório. Nunca apague antes do passo 3.

O **Smoke test da produção** avisa por e-mail e pelas notificações quando falha (para quem editou o agendamento por último): confira em **Settings → Notifications → Actions**. O GitHub desliga workflows agendados depois de 60 dias sem atividade no repositório; se acontecer, ligue-o de novo em **Actions**.

## 13. Avisos de build conhecidos

- **Node:** `engines.node` é `22.x` (igual ao `.nvmrc`), para a Vercel usar sempre a mesma versão.
- **Scripts de instalação:** só `esbuild` e `unrs-resolver` têm permissão (`allowScripts` no `package.json`). `fsevents` também tem script, mas é opcional e só instala em macOS. Não aprove outro pacote sem entender o que o script faz.
- **ESLint 9:** o ESLint 10 já existe, mas os plugins que o `eslint-config-next` traz (`eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`) só declaram suporte até o ESLint 9. Subir à força quebraria o lint. Reavalie quando esses plugins publicarem suporte (o Dependabot mostra as novas versões).

## 14. PRs do Dependabot

O Dependabot abre PRs semanais, agrupados (no máximo 5 abertos por ecossistema). Três dependências têm regras de ignore em `.github/dependabot.yml`, cada uma com o motivo comentado no arquivo: ESLint (versão maior), TypeScript (a partir da 6.1.0) e `@types/node` (versão maior, para ficar alinhado ao Node 22.x).

- **Nunca faça merge com CI vermelho.** Abra o PR e olhe a aba **Checks**: verde em `CI` e em `E2E` significa que lint, tipos, testes e o fluxo no navegador passaram com as versões novas. Se algo falhar, abra o job que ficou vermelho, leia o primeiro erro e, se não for óbvio, deixe o PR parado e peça ajuda numa sessão de desenvolvimento.
- **PRs de `github-actions`** mudam os workflows, que o CI de PR só exercita em parte. Depois do merge, rode **Actions → Database deploy** com `dry_run` ligado (confirma que o workflow ainda funciona sem aplicar nada) e **Actions → Smoke test da produção** (Run workflow), e confira que os dois terminam verdes. Confira também que o SHA novo veio com o comentário de versão exata.
- **Quando reavaliar as regras de ignore:** quando o `eslint-config-next` aceitar o ESLint 10 (seção 13), quando o `typescript-eslint` aceitar o TypeScript 6.1 ou superior, e ao trocar a versão do Node em `engines.node` e `.nvmrc` (aí o `@types/node` acompanha). Ao reavaliar, remova a regra correspondente e atualize este texto.

## 15. Backup diário do banco no Cloudflare R2 (etapa 8d)

> **ATENÇÃO: sem a frase-senha (`BACKUP_PASSPHRASE`) os backups são irrecuperáveis.** Eles são criptografados antes de sair do GitHub e nem a Cloudflare nem o GitHub conseguem abri-los sem ela. Guarde a frase em **dois lugares independentes** (gerenciador de senhas e uma cópia impressa em local seguro) e **nunca** no repositório.

> Os nomes de menu de Cloudflare, GitHub e Supabase abaixo **não foram conferidos na tela** e mudam com o tempo: procure pelo nome em destaque.

### Como funciona

- O workflow **Backup do banco** (`backup.yml`) roda **todo dia às 06:23 UTC** (03:23 em Brasília) e sob demanda. Ele gera o dump com a CLI do Supabase (a mesma conexão do Database deploy), **criptografa dentro do runner do GitHub** (gpg, AES256, com a frase-senha) e envia para um bucket **privado** do Cloudflare R2. O arquivo nunca é commitado, nunca vira artefato nem cache, e nunca aparece em log: o resumo do job mostra só **OK ou falha, o tamanho e a data**.
- O arquivo é `daily/AAAA-MM-DD.tar.gpg`; aos domingos (UTC) a mesma cópia também vai para `weekly/AAAA-MM-DD.tar.gpg`.
- **O que entra:** todas as tabelas de `public` (livros, sessões, notas, perguntas, comentários, sinalizações, perfis, progresso de leitura) e, de `auth`, **só `users` e `identities`** (os perfis e os comentários dependem de `auth.users`). Também vão, só como referência, o schema (`schema.sql`) e os roles (`roles.sql`), mais um `manifest.json` (data, versão da CLI, última migration, contagem de linhas por tabela e SHA-256 dos arquivos), tudo dentro do arquivo criptografado.
- **O que fica de fora de propósito:** sessões, tokens e auditoria do Auth (têm IP e tokens; ao restaurar, todo mundo entra de novo com o código por e-mail) e **os arquivos do Storage** (as capas dos livros: reenvie pelo painel; guarde as imagens originais à parte). As configurações do painel do Supabase (SMTP, Google, Turnstile, URLs) e as variáveis da Vercel também não fazem parte.
- **Retenção:** regras de ciclo de vida **do próprio bucket**, que você configura no painel da Cloudflare: **14 dias** para `daily/` e **56 dias** para `weekly/`. Os valores oficiais ficam em `.github/backup.config.json` (um teste confere que este texto bate com ele). **Por que não mais:** quando uma conta ou um comentário é excluído, ele continua nos backups até expirarem; quanto maior a retenção, mais tempo um dado já "apagado" continua existindo (LGPD; ver `docs/revisao-juridica.md`). Mudou o prazo? Mude a configuração, as regras do bucket e este texto, e fale com o advogado.
- **Pré-verificação das credenciais (primeiro passo do backup e da prova semanal):** antes de gerar qualquer dump, o workflow confere os segredos, o R2, o Supabase e a frase-senha, **todos de uma vez**, e mostra no **resumo do job** (e em anotações no topo da execução) **qual credencial está errada**. Se qualquer item falhar, o backup **não continua** (nenhum dump é gerado nem enviado). Tudo o que aparece é texto fixo: nunca o valor de um segredo, nem parte dele, nem a saída bruta das ferramentas. Veja "Diagnóstico de falhas do backup" abaixo.
- **Verificação a cada backup:** o objeto existe no R2, o tamanho e o SHA-256 batem, e o job **falha** se o backup vier vazio ou com menos da metade do anterior (use a opção `accept_smaller` só depois de uma exclusão legítima).
- **Prova de restauração semanal** (`backup-drill.yml`, domingos às 07:41 UTC): confere que o backup diário mais recente tem **no máximo 36 horas** e que o semanal tem **no máximo 8 dias**; depois baixa o semanal, descriptografa e restaura num **Supabase local descartável dentro do runner**, comparando as contagens com o manifesto. O texto puro nunca sai do runner.
- **Se falhar:** o GitHub avisa por e-mail e nas notificações (quem editou o agendamento por último). Confira em **Settings → Notifications → Actions**.
- **Pausa por inatividade:** o backup diário conecta ao banco todo dia, o que **pode ajudar, sem garantia**, a evitar a pausa do plano gratuito. Não confie só nisso. Se o projeto estiver pausado, o backup falha: restaure o projeto (seção 10) e rode o backup de novo.
- **Limite da criptografia por frase-senha:** quem obtiver **ao mesmo tempo** o acesso ao bucket e a frase-senha abre os backups. Por isso os segredos ficam separados (Cloudflare de um lado, GitHub do outro) e só os workflows da `main` os leem. Uma evolução possível, depois da revisão do advogado, é criptografar com uma **chave pública** (`age`): o GitHub passaria a guardar só a chave pública, que não é segredo. A chave privada teria de ser gerada num terminal na nuvem e a prova de restauração automática deixaria de poder abrir o arquivo. Fica registrada como proposta, não implementada.

### Configuração inicial, só pelo navegador (uma vez)

1. **Conta e R2.** Crie uma conta em **cloudflare.com** (use um e-mail seu) e ative o **R2 Object Storage** (menu **R2**). **O R2 pode pedir cadastro de uma forma de pagamento** mesmo dentro da cota gratuita (**não verificado**): leia o aviso na tela antes de aceitar.
2. **Bucket privado.** **R2 → Create bucket**, com um nome sem dado pessoal. Deixe o acesso **privado**: não ative o endereço público (`r2.dev`) nem domínio personalizado. Em localização, escolha o que a tela oferecer (**o R2 não tem região no Brasil**, a confirmar; por isso o texto legal trata isso como transferência internacional "A DEFINIR").
3. **Token restrito ao bucket.** **R2 → Manage API Tokens** (ou **Manage R2 API Tokens**) → **Create API token**: permissão **Object Read & Write**, aplicada **somente a este bucket**. Anote o **Account ID** (aparece na página do R2), o **Access Key ID** e o **Secret Access Key** (o segredo aparece **uma vez só**; copie direto para o gerenciador de senhas).
4. **Regras de ciclo de vida.** No bucket, **Settings → Object lifecycle rules** (**não verificado:** o nome exato): crie duas regras de **exclusão**: prefixo `daily/` apagando objetos depois de **14 dias**, e prefixo `weekly/` depois de **56 dias**.
5. **Frase-senha.** No seu gerenciador de senhas (que roda no navegador), gere uma senha **aleatória longa (pelo menos 32 caracteres)**, sem quebra de linha. Guarde-a lá **e** numa cópia impressa em local seguro. **Nunca** a escreva no repositório, em chat nem em log.
6. **Environments do GitHub** (os segredos **não** ficam no nível do repositório). Em **Settings → Environments → New environment**:
   - **`backup`** (usado por `backup.yml` e `backup-drill.yml`): em **Deployment branches and tags** escolha **Selected branches and tags** e adicione só `main`. Em **Environment secrets** (**dentro do ambiente**, não em Repository secrets) crie: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `BACKUP_PASSPHRASE`, e os do Supabase necessários ao dump: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `SUPABASE_PROJECT_REF` (os mesmos valores do Database deploy).
   - **`restore`** (usado por `db-restore.yml`): restrinja a branch a `main` e marque **Required reviewers** com a **sua conta**. Os segredos dele você cria **só no dia de restaurar** (veja "Restaurar").
   - **Por que o `if` dentro do YAML não basta:** uma versão alterada do workflow, em outra branch, poderia ser disparada à mão e tentar ler segredos. O **Environment restrito à `main`** é a fronteira real: só a `main` os recebe.
   - Em **Settings → Secrets and variables → Actions → Variables**, crie a **variável de repositório** `PRODUCTION_PROJECT_REF` com o código do projeto Supabase de **produção** (não é segredo). O `db-restore` a usa para **recusar a produção como destino**; sem ela, ele não roda. (Usei esse nome, e não `SUPABASE_PROJECT_REF`, para não ser confundido com o segredo de mesmo nome que o Database deploy usa.)
7. **Verificar as credenciais, antes do primeiro backup.** **Actions → Verificar credenciais do backup → Run workflow**, com **environment = backup**. Ele não gera nem envia backup: só confere os segredos, o R2 (listar e gravar/apagar um objeto minúsculo em `_preflight/`), o Supabase e a frase-senha. Leia o **resumo do job** (tabela **Item, Resultado, Motivo, O que fazer**) e as **anotações vermelhas no topo da página da execução**; corrija cada item **FALHOU** e rode de novo até tudo ficar **OK**. Uma credencial errada aparece com o nome do segredo e o Environment onde editá-lo (veja "Diagnóstico de falhas do backup").
8. **Primeiro backup.** **Actions → Backup do banco → Run workflow.** Espere terminar e leia o **resumo do job**: deve mostrar a tabela da pré-verificação toda **OK** e, no fim, **Resultado: OK**, o tamanho e a data. Se falhar, a mensagem diz o que falta; não existe mais modo "verbose" (ver abaixo).
9. **Conferir no bucket.** No painel da Cloudflare, **R2 → o bucket → Objects**: deve existir `daily/AAAA-MM-DD.tar.gpg` com tamanho maior que zero.
10. **Prova de restauração.** O workflow semanal só acha backup semanal depois de um domingo. Para testar já, rode **Backup do banco** de novo marcando **force_weekly** e depois **Actions → Prova de restauração do backup → Run workflow**. O resumo deve dizer **OK**.
11. **Alertas.** Confirme em **Settings → Notifications → Actions** que as notificações de workflows com falha chegam a você.

### Duplicação de propósito dos segredos, e a rotação

Os segredos de R2 e a frase-senha existem em **dois** Environments (`backup` e `restore`), de propósito: o `restore` só roda com a sua aprovação e é o único a ler os segredos do projeto de destino. **Consequência:** ao trocar um deles, troque **nos dois lugares**. O token do Supabase do `restore` é uma cópia do usado no Database deploy (e no `backup`): ao rotacioná-lo (seção 6), troque em todos os ambientes.

| O quê | Quando | Como |
| --- | --- | --- |
| **Token do R2** | A cada ~6 meses (ou se vazar) | Crie um token novo (mesmas permissões, só o bucket), atualize `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` em `backup` e `restore`, rode **Verificar credenciais do backup** (Environment `backup` e depois `restore`) e **Backup do banco**, confira os resumos, e só então **apague o token antigo** na Cloudflare |
| **Frase-senha, sem vazamento** | Só se quiser | Gere a nova, atualize `BACKUP_PASSPHRASE` em `backup` e `restore` e rode **Backup do banco** com **force_weekly** **e `passphrase_rotated` ligadas** (sem `passphrase_rotated` a pré-verificação falha de propósito, porque a frase nova não abre os backups anteriores); nos dias seguintes deixe `passphrase_rotated` desligada: o backup diário mais recente já abre com a frase nova. Confira o **Prova de restauração**. **Guarde a frase antiga até o último backup criptografado com ela expirar (56 dias)**: para restaurar um backup antigo, ponha a frase antiga **temporariamente** no `restore` |
| **Se algum segredo vazar** | Na hora | **Revogue** (R2: apague o token; frase: considere-a perdida), **gere de novo**, atualize os dois Environments e **rode um backup novo**. Se vazou a **frase-senha**, **apague os backups antigos do R2** (eles abrem com a frase vazada, para quem tiver o arquivo) e rode **Backup do banco** com **force_weekly** logo depois. Se vazou o acesso ao bucket, troque o token e confira nos logs da Cloudflare, se houver, o que foi acessado |

### Rotina: backup manual antes de mexer no banco

**Rode um backup manual (Actions → Backup do banco → Run workflow) antes de cada Database deploy relevante e antes de qualquer SQL que apague dados**, e espere o resumo dizer OK. Isso complementa a "regra de ouro" da seção 10 (exportar a tabela).

### Workflows agendados podem ser desligados

O GitHub **desativa workflows agendados depois de 60 dias sem atividade no repositório**. Isso vale para o **Backup do banco**, a **Prova de restauração** e o **Smoke test da produção**. **Verifique uma vez por mês** (Actions → o workflow → última execução) se eles continuam rodando, e confira no bucket se o objeto `daily/` do dia existe. Se algum estiver desligado, ligue-o de novo em **Actions**.

### Restaurar (só em projeto novo e vazio)

A restauração **nunca** vai por cima da produção. O workflow **Restaurar backup do banco** (`db-restore.yml`, só `workflow_dispatch`) recusa se: a confirmação digitada não for `RESTAURAR`; o projeto de destino for o de produção; o destino já tiver contas; ou for disparado fora da `main` ou fora do repositório oficial.

1. **Crie um projeto Supabase novo** (**supabase.com/dashboard → New project**), com uma senha de banco nova (guarde-a). **Não faça nada nele**: ele precisa estar vazio.
2. **Crie os segredos do destino no Environment `restore`** (e só agora): `RESTORE_TARGET_PROJECT_REF` (o código do projeto novo), `RESTORE_TARGET_DB_PASSWORD` (a senha dele), `SUPABASE_ACCESS_TOKEN` (cópia do token do Supabase, necessária para vincular o projeto), e confira que `R2_*` e `BACKUP_PASSPHRASE` estão lá. Se o backup for antigo e a frase mudou desde então, use a frase antiga.
3. **Simule primeiro:** **Actions → Restaurar backup do banco → Run workflow**, `backup` = `daily/AAAA-MM-DD` (ou `weekly/...`), `confirm` = `RESTAURAR` e **`dry_run` ligado** (padrão). Aprove a execução (você é o aprovador do Environment). A simulação abre o backup, confere o manifesto e o destino vazio e simula as migrations, **sem alterar nada**.
4. **Restaure de verdade:** rode de novo com **`dry_run` desligado**. O workflow **aplica as migrations no projeto novo** (`supabase db push`, só com os segredos do destino) e depois restaura os **dados** numa única transação, conferindo as contagens com o manifesto. O resumo diz OK e quantos livros têm capa para reenviar.
5. **Reenvie as capas** pelo painel (os arquivos do Storage não estão no backup).
6. **Troque as variáveis da Vercel** (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) para as do projeto novo e faça **Redeploy** (são lidas no build).
7. **Reconfigure no Supabase novo** o que não vem do backup: **Site URL e Redirect URLs**, **SMTP do Resend** e modelos de e-mail, **tamanho do código (6)**, **Turnstile** (Secret Key e CAPTCHA), **Google** (se estiver ligado), **anonymous sign-ins desligado** e limites de envio (README, "Configurar o login").
8. **Atualize os segredos do GitHub** (`SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`) e a variável `PRODUCTION_PROJECT_REF` para o projeto novo, nos Environments e onde existirem.
9. **Confira o login** (peça um código em `/entrar`, entre, comente) e rode o **Smoke test da produção**. Todos terão de entrar de novo: as sessões não estão no backup.
10. **Apague os segredos `RESTORE_TARGET_*`** do Environment `restore` quando terminar.

#### Ensaio real (uma vez, antes de precisar)

> **Pendente e obrigatório antes de convidar leitoras** (seção 16 e `lancamento.md`, seção 5). Ainda não foi feito: até lá, o backup nunca foi restaurado na nuvem de verdade.

Para saber se tudo funciona de verdade, ensaie num **segundo projeto gratuito** (o limite de projetos gratuitos por conta é **não verificado**): crie um projeto de ensaio, siga os passos 1 a 4 e confira as contagens e um login por código. **Apague o projeto de ensaio e os segredos `RESTORE_TARGET_*` ao terminar**: ele terá dados reais das leitoras.

**Limites conhecidos (não verificados na nuvem; o ensaio responde):**

- No projeto gerenciado, o schema `auth` pertence a um papel do Supabase: o usuário `postgres` do projeto precisa ter permissão de escrita em `auth.users` e `auth.identities`. Se não tiver, o restauro falha com um código de erro (os detalhes não são impressos, porque podem citar dados).
- Se o projeto novo tiver uma **versão do Auth com colunas diferentes** das do backup, o restauro dessas tabelas pode falhar. A prova semanal usa a versão **local** da CLI, então ela **não** garante a compatibilidade com a versão atual da nuvem: por isso o ensaio real.
- A conexão do `psql` com o projeto novo usa o endereço do pooler que a CLI grava ao vincular o projeto (`supabase/.temp/pooler-url`); o runner do GitHub não tem IPv6 e a conexão direta do plano gratuito é IPv6 (**não verificado**). A simulação (`dry_run`) é o teste dessa conexão.

### Custo e duração (estimativas, não medidas)

- **Backup diário:** cerca de 2 a 4 minutos por dia, algo como 60 a 120 minutos de Actions por mês.
- **Prova semanal:** cerca de 5 a 8 minutos por semana (sobe um Supabase local), algo como 20 a 35 minutos por mês.
- O repositório é público, então os minutos de runners padrão são gratuitos (**não verificado**). O R2 tem uma cota gratuita de armazenamento (**não verificado**): com um banco pequeno e os backups das retenções acima, o volume deve ficar muito abaixo dela. Confira a duração real no primeiro run e o uso no painel da Cloudflare.

### Mensagens de erro comuns

| Mensagem (resumo do job) | O que fazer |
| --- | --- |
| "Falta o segredo ou a variável …" | Crie o segredo **dentro do Environment** certo (`backup` ou `restore`), não no repositório |
| "O dump não trouxe a tabela auth.users" | O schema `auth` não entrou no dump: confira `.github/backup.config.json` (não rode o backup assim) |
| "O dump trouxe tabelas que não estão na lista permitida" | Uma tabela nova apareceu. Se for inofensiva, entra em `allowedTables`; se guardar sessões ou tokens, em `excludeTables` |
| "menos da metade do anterior" | Pode haver dados faltando. Investigue; se foi uma exclusão legítima, rode de novo com `accept_smaller` |
| "O backup diário parou de rodar" / "falta o backup de domingo" | O agendamento foi desligado ou o backup falhou: veja a última execução do **Backup do banco** |
| "Não foi possível descriptografar" | A frase-senha do ambiente não é a que criptografou aquele arquivo (veja a rotação) ou o arquivo está corrompido |
| "Falhou: … Código de saída N. Identificador do erro: X." | Um passo do backup real falhou. O identificador (código do aws, da CLI do Supabase ou status HTTP) diz o que foi; veja "Diagnóstico de falhas do backup". Não existe modo "verbose" |

### Diagnóstico de falhas do backup

**Onde olhar.** Na página da execução do workflow (Actions → o workflow → a execução): (1) **no topo**, as anotações vermelhas (uma por item que falhou; o título é o item, como "R2 listagem do bucket" ou "R2_SECRET_ACCESS_KEY formato"); (2) no **resumo do job**, a tabela **Item, Resultado, Motivo, O que fazer**, com **todos** os problemas de uma vez (as verificações continuam rodando mesmo que uma falhe; só o passo falha no fim); (3) no log do passo "Pré-verificação das credenciais", uma linha por item. Resultados: **OK**, **FALHOU** e **PULADO**. **PULADO nunca esconde um FALHOU**: ele só aparece quando um item anterior falhou (ex.: o token do Supabase falhou, então o projeto e a senha não foram testados), quando você ligou `passphrase_rotated` ou quando os segredos `RESTORE_TARGET_*` ainda não existem. O job **falha se houver qualquer FALHOU**. O GitHub mostra no máximo 10 anotações por passo; a tabela do resumo sempre mostra todas.

**Como rodar a verificação antes do primeiro backup (e depois de criar ou trocar qualquer segredo).** **Actions → Verificar credenciais do backup → Run workflow**:

- **environment = backup:** confere os oito segredos do backup, o R2 (listar e gravar/apagar `_preflight/<número da execução>-<tentativa>.txt`, **nunca** em `daily/` nem `weekly/`), o Supabase (token, código do projeto, senha) e a frase-senha (ciclo do gpg e abertura do backup diário e do semanal mais recentes).
- **environment = restore:** só leitura no R2 (**não grava nada no bucket**), frase-senha e, se os segredos `RESTORE_TARGET_*` já existirem, o projeto de destino. A execução **pede a sua aprovação**, como qualquer uso desse Environment. Sem os segredos de destino, essas linhas ficam **PULADO** ("ainda não existem neste Environment"), o que é normal fora do dia da restauração.
- **passphrase_rotated:** só ligue se trocou a frase-senha **de propósito** (ver a tabela de rotação). A comparação com os backups anteriores fica **PULADO**, o resumo avisa em destaque e lembra de rodar uma vez o **Backup do banco** com **force_weekly**.

**Por que não existe mais "verbose".** Mostrar a saída das ferramentas (mesmo filtrada) num repositório público é arriscado: uma mensagem de erro pode citar um valor. Em vez disso, cada erro conhecido vira um **texto fixo** e, num erro novo, o log mostra o **passo**, o **código de saída** e o **identificador do erro** (o código entre parênteses do aws, o campo `code` da CLI do Supabase ou um status HTTP), e só se ele passar numa lista estrita de caracteres e não se parecer com um segredo. Nunca a mensagem nem o resto da linha.

**Um segredo "ausente" pode estar só no lugar errado.** O GitHub entrega a um passo um segredo que não existe, ou que está em outro Environment ou em Repository secrets, como texto **vazio**, então "ausente" não distingue os dois. Crie o segredo em **Settings → Environments → (backup ou restore) → Environment secrets**.

| Mensagem no resumo (motivo) | Causa provável | Onde corrigir |
| --- | --- | --- |
| `<SEGREDO>` **ausente** | O segredo não existe nesse Environment (ou foi criado em Repository secrets ou noutro Environment) | Environment `backup` (ou `restore`) → Environment secrets |
| `<SEGREDO>` **vazio** | Foi colado só espaço ou quebra de linha | Edite o segredo e cole o valor |
| `<SEGREDO>` **com espaço ou quebra de linha sobrando** | Copiou com um Enter ou espaço no começo ou no fim | Edite o segredo e apague a sobra. Se for `BACKUP_PASSPHRASE`, depois confira o item "abrir o backup anterior" (se os backups foram feitos com o espaço, a frase muda ao corrigir) |
| `<SEGREDO>` **com formato inesperado** | Valor cortado, de outro campo ou com letra maiúscula. Esperado: ID da conta e Access Key ID do R2 com 32 caracteres hexadecimais minúsculos, Secret Access Key com 64, token do Supabase `sbp_` e 40 hexadecimais, código do projeto com 20 letras minúsculas | Cole de novo o valor completo do painel (Cloudflare ou Supabase) |
| **R2_ACCESS_KEY_ID inválida** (a Cloudflare não reconhece a chave) | Token do R2 apagado, revogado ou expirado, ou ID digitado errado (também pode ser a `R2_SECRET_ACCESS_KEY` errada) | `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`, **nos Environments `backup` e `restore`** |
| **Assinatura não confere** | `R2_SECRET_ACCESS_KEY` incorreta, ou `R2_ACCOUNT_ID` de outra conta | `R2_SECRET_ACCESS_KEY` e `R2_ACCOUNT_ID` no Environment |
| **Endpoint do R2 inalcançável** | `R2_ACCOUNT_ID` de uma conta que não existe (o endereço é `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`), ou rede ou Cloudflare fora do ar | `R2_ACCOUNT_ID` (Account ID da página do R2); se estiver certo, tente de novo mais tarde |
| **Bucket inexistente ou de outra conta** | Nome errado em `R2_BUCKET`, bucket de outra conta, ou criado com jurisdição específica (UE ou FedRAMP), que usa outro endereço (`<conta>.eu.r2.cloudflarestorage.com`), **não suportado** por estes workflows | `R2_BUCKET`; para jurisdição, crie o bucket sem jurisdição |
| **O token do R2 não tem acesso a este bucket** | Token restrito a outro bucket, ou sem permissão | Cloudflare → R2 → Manage API Tokens: token com **Object Read & Write** só neste bucket; atualize os segredos |
| **O token do R2 não tem permissão de escrita** | Token **só de leitura** | Crie um token com Object Read & Write (e atualize os dois segredos nos dois Environments) |
| **O token grava, mas não consegue apagar** | Permissão parcial. Um objeto minúsculo pode ter ficado em `_preflight/` | Corrija as permissões do token; apague `_preflight/` pelo painel se quiser |
| **O token do R2 não conseguiu ler os backups** | Token sem leitura de objetos | Token com Object Read & Write |
| **A conta da Cloudflare não tem o R2 ativo** | R2 não ativado (ou pagamento pendente) | Ative o R2 na Cloudflare |
| **O R2 respondeu com erro de serviço** | Problema temporário da Cloudflare ou limite de requisições | Rode de novo em alguns minutos; veja cloudflarestatus.com |
| **SUPABASE_ACCESS_TOKEN inválido, expirado ou revogado** | Token apagado ou expirado | Token novo (painel do Supabase → Account → Access Tokens); atualize em `backup`, `restore` **e no Database deploy** |
| **Código do projeto inexistente, ou o token não tem acesso** | `SUPABASE_PROJECT_REF` errado, ou o token é de uma conta sem acesso ao projeto | `SUPABASE_PROJECT_REF` no Environment `backup`; confira a conta do token |
| **Senha do banco recusada** | `SUPABASE_DB_PASSWORD` incorreta ou trocada no Supabase | Environment `backup` (e o segredo do Database deploy); se não souber, redefina a senha no painel do Supabase |
| **O banco bloqueou novas conexões por excesso de tentativas** | Várias execuções seguidas com senha errada | Espere alguns minutos, corrija a senha e rode de novo |
| **Falha de conexão ou de rede com o Supabase** | Serviço fora do ar, rede do runner ou **projeto pausado** (plano gratuito) | Painel do Supabase: se estiver pausado, restaure (seção 10); depois rode de novo |
| **O gpg não conseguiu criptografar e descriptografar o texto de teste** | `BACKUP_PASSPHRASE` com caractere estranho, ou problema do runner | Edite `BACKUP_PASSPHRASE` (uma linha só); se persistir, rode de novo |
| **A frase-senha atual NÃO abre os backups anteriores** | A frase foi trocada ou digitada diferente (menos provável: arquivo corrompido) | `BACKUP_PASSPHRASE` em `backup` **e** `restore`, com a frase que criptografou os backups. Se trocou de propósito: rode **Backup do banco** com `passphrase_rotated` e `force_weekly` |
| **Verificação pulada de propósito (passphrase_rotated ligada)** | Você ligou a opção | Informativo. Rode uma vez o backup manual com `force_weekly` e depois deixe a opção desligada |
| **Não verificado porque um item anterior falhou** | Dependência de um item FALHOU acima | Corrija o item FALHOU e rode de novo |
| **Os segredos do projeto de destino (RESTORE_TARGET_*) ainda não existem** | Normal fora do dia da restauração (só no `credentials-check` com `restore`) | Nada a fazer agora |
| **Esta verificação não chegou a rodar** | A pré-verificação foi interrompida (erro inesperado ou cancelamento) | Rode de novo; veja o passo no log |
| **Erro não classificado no passo X (código de saída N). Identificador do erro: Y** | Um erro novo, que a tabela ainda não conhece | Anote o passo e o identificador e peça ajuda numa sessão de desenvolvimento (a classificação ganha uma linha nova). Sem identificador, só o passo e o código |
| **A pré-verificação não chegou a terminar** | Job cancelado, tempo esgotado ou falha antes do script | Rode de novo |
| **Falhou: … Código de saída N. Identificador do erro: X.** (passos do backup real) | Falha do dump, da criptografia ou do envio depois da pré-verificação | Procure o identificador acima; se for `DockerRunError`, o Docker do runner falhou (rode de novo) |

## 16. Pendências obrigatórias antes de convidar leitoras

Duas coisas que só você consegue fazer, e que **precisam estar feitas antes de convidar as primeiras leitoras**. Aqui só a lista e onde está o passo a passo; a checklist completa de lançamento é [`lancamento.md`](lancamento.md).

1. **Ensaio de restauração do backup num segundo projeto gratuito do Supabase.** Passo a passo: seção 15, "Restaurar" e "Ensaio real". Simule primeiro (`dry_run` ligado), restaure de verdade, confira as contagens e um login por código, e **apague o projeto de ensaio e os segredos `RESTORE_TARGET_*`** ao terminar.
2. **Teste de instalação no iPhone real**, no Safari e no app instalado: ícone e nome, abre sem barra, login por código dentro do app instalado, o cartão "Instale o Entre Capítulos" (2ª visita, `?instalacao=ver`), as seções de "Sobre o clube" e de "Minha conta", e a conferência dos **rótulos exatos do iOS em português**. Lista do que conferir: `lancamento.md`, seção 7.
