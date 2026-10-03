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

## 7. Promover e rebaixar administradora e moderadora

Ninguém vira administradora ao se cadastrar. O papel muda **só** pelo **SQL Editor** do Supabase (a pessoa precisa já ter entrado no site uma vez, para o perfil existir).

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

A moderadora só abre **Comentários**. O papel vem do banco a cada requisição; a pessoa não precisa sair e entrar de novo.

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

Os dois riscos estão listados em `docs/lancamento.md` (decisão sobre backup antes de convidar leitoras) e comparados em `docs/propostas-etapa8.md`. O **Smoke test da produção** abre o livro atual todo dia (faz o site ler o banco); isso **pode ajudar, sem garantia**, a evitar a pausa. Não confie nele sozinho.

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
| `db-deploy.yml` | só manual, só na `main` | `contents: read` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` |

Nenhum usa `pull_request_target`. Ações de terceiros ficam fixadas por SHA de commit completo, com a versão no comentário; o **Dependabot** (`.github/dependabot.yml`) abre PRs semanais (no máximo 5) para atualizá-las.

O **Smoke test da produção** avisa por e-mail e pelas notificações quando falha (para quem editou o agendamento por último): confira em **Settings → Notifications → Actions**. O GitHub desliga workflows agendados depois de 60 dias sem atividade no repositório; se acontecer, ligue-o de novo em **Actions**.

## 13. Avisos de build conhecidos

- **Node:** `engines.node` é `22.x` (igual ao `.nvmrc`), para a Vercel usar sempre a mesma versão.
- **Scripts de instalação:** só `esbuild` e `unrs-resolver` têm permissão (`allowScripts` no `package.json`). `fsevents` também tem script, mas é opcional e só instala em macOS. Não aprove outro pacote sem entender o que o script faz.
- **ESLint 9:** o ESLint 10 já existe, mas os plugins que o `eslint-config-next` traz (`eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`) só declaram suporte até o ESLint 9. Subir à força quebraria o lint. Reavalie quando esses plugins publicarem suporte (o Dependabot mostra as novas versões).
