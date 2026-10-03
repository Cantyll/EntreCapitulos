# Checklist de lançamento

Antes de convidar as primeiras leitoras. Cada item é:

- **[automático]**: coberto por teste que roda no CI ou no workflow indicado. Se o item falhar, o GitHub avisa; você não precisa conferir à mão.
- **[manual]**: só você (ou a Agatha) consegue fazer ou decidir. Marque quando estiver feito.

> O repositório é público: nunca escreva aqui e-mails, chaves, IDs de projeto ou dados de pessoas. Caminhos de menu dos painéis **não foram conferidos na tela** e mudam com o tempo; procure pelo nome em destaque. Passo a passo de operação: [`operacao.md`](operacao.md).

## 1. Já garantido por teste

- [x] **[automático]** Nenhuma chave secreta, chave privada ou JWT no repositório (`tests/secrets-static.test.ts`, no CI).
- [x] **[automático]** Toda tabela tem RLS; permissões de escrita e funções executáveis pela API só mudam de propósito (`supabase/tests/database/`, no CI).
- [x] **[automático]** `docs/seguranca.md` bate com o banco (job do banco do CI).
- [x] **[automático]** Toda página e ação do painel confere o papel no servidor; a moderadora só abre Comentários (`tests/painel-guards.test.ts`, e2e de moderação).
- [x] **[automático]** Nenhuma tela do painel mostra dado de exemplo do protótipo; Membros, Votações e Configurações aparecem como "Em breve" e fora do menu (`tests/prototype-data-static.test.ts`, e2e de navegação do painel).
- [x] **[automático]** Cabeçalhos de segurança, CSP com nonce, `robots.txt`, manifest e ícones, nas versões local (E2E) e de produção (Smoke test).
- [x] **[automático]** Fluxos principais: visitante, login por código, comentários e moderação, painel (livros, capa, tema, editor, publicar), autosave e conflito, conta (nome, baixar dados, excluir), acessibilidade (axe) e alvos de toque de 44 px no iPhone (workflow **E2E**).
- [x] **[automático]** O site de produção responde, lê o banco e mantém os cabeçalhos (workflow **Smoke test da produção**, diário).
- [x] **[automático]** Ações dos workflows fixadas por SHA e atualizadas pelo Dependabot.

## 2. Conteúdo

- [ ] **[manual]** **Conteúdo de teste removido** da nuvem: livros, sessões, comentários e contas que você criou para testar (SQL Editor ou painel). **Exporte as tabelas antes de apagar** (regra de ouro em `operacao.md`, seção 10).
- [ ] **[manual]** **Primeira sessão real publicada** pela Agatha, com o livro atual cadastrado, a capa enviada e o tema conferido.
- [ ] **[manual]** **Texto de `/sobre` aprovado pela Agatha.** O texto atual (`src/content/sobre.ts`) é **provisório** e foi escrito sem ela; a página não foi alterada na etapa 8b.
- [ ] **[manual]** Total de capítulos do livro atual confirmado (52 é estimativa).

## 3. Jurídico e privacidade

- [ ] **[manual]** **`legalReviewed` mudado para `true`** em `src/content/legal-config.ts`, **só depois** de um advogado validar os textos (`docs/revisao-juridica.md` é o documento para ele). Enquanto for `false`, as páginas legais aparecem como "Rascunho em revisão" e ficam `noindex`.
- [ ] **[manual]** Campos de proposta de `legal-config.ts` (bases legais, transferência internacional, retenção, prazo de resposta) validados com o advogado. Nunca escrever que os dados "não saem do Brasil".
- [ ] **[manual]** **E-mail de contato recebendo**: mande um e-mail de teste para o endereço de `privacyContactEmail` e confirme que chega e que alguém responde dentro do prazo prometido.
- [ ] **[manual]** Depois da revisão jurídica, decidir o que sai do repositório público (ver o PR da etapa 8b: dados pessoais em `legal-config.ts` e `revisao-juridica.md`).
- [ ] **[manual]** **Decisão sobre a licença** do repositório (hoje: "Todos os direitos reservados"; veja o PR da etapa 8b).

## 4. Login e e-mail

- [ ] **[manual]** **Resend com domínio verificado e DMARC**: domínio de envio como "Verified" no Resend e registro DMARC publicado no DNS (Vercel). Um e-mail de teste não pode cair no spam.
- [ ] **[manual]** **SMTP do Resend ligado no Supabase** (Authentication → Emails → SMTP Settings) e modelos de e-mail com o código (README, "Configurar o login").
- [ ] **[manual]** **Tamanho do código em 6** no Supabase.
- [ ] **[manual]** **Turnstile ligado**, na ordem segura do README ("Proteção contra abuso"): Site Key na Vercel (Production), teste, e só então CAPTCHA no Supabase. Antes de ativar com a chave real, conferir no navegador (DevTools → Application) quais cookies e armazenamento o widget cria e atualizar a política de privacidade se mudar.
- [ ] **[manual]** **Anonymous sign-ins desligado** no Supabase (Authentication → Sign In / Providers).
- [ ] **[manual]** **Limites de envio do Supabase** (Authentication → Rate Limits) conferidos para o tamanho esperado de leitoras.
- [ ] **[manual]** **Decisão sobre o login do Google**: ligar (README, passo 6 de "Configurar o login") ou manter desligado. Se ligar, atualizar os textos legais (o código já inclui o Google só quando ligado).
- [ ] **[manual]** URLs do Supabase (Site URL e Redirect URLs) apontando para o domínio de produção.

## 5. Banco e Supabase

- [ ] **[manual]** **Migrations aplicadas na nuvem** até a mais recente (Actions → Database deploy: dry run primeiro, depois de verdade). Conferir que o último deploy da Vercel é posterior.
- [ ] **[manual]** **Advisors sem alertas** (Supabase → Advisors, segurança e desempenho): leia cada alerta; os que forem falso positivo, anote o motivo.
- [ ] **[manual]** **Conta da Agatha como administradora** e **moderadora promovida** pelo SQL Editor (`operacao.md`, seção 7). Confirmar que a moderadora só vê Comentários.
- [ ] **[manual]** **Decidir sobre backup (plano Pro ou paliativos) antes de convidar leitoras.** O plano gratuito **não tem backup automático** e **pausa o projeto após 1 semana sem atividade** (riscos confirmados). Opções comparadas em [`propostas-etapa8.md`](propostas-etapa8.md); se ficar nos paliativos, siga a rotina de exportação de `operacao.md` (seção 10) e a etapa 8d fica como proposta.
- [ ] **[manual]** **Monitoramento**: decidir se haverá (e qual) além do Smoke test diário (`propostas-etapa8.md`). Confirmar que as notificações de Actions chegam a você (Settings → Notifications → Actions).
- [ ] **[manual]** **Região do Supabase e da Vercel confirmadas** e iguais às que `legal-config.ts` informa (a região da Vercel é configuração do painel, não do código).

## 6. Vercel e GitHub

- [ ] **[manual]** Variáveis de produção da Vercel conferidas (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, e as opcionais: `NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). `CSP_REPORT_ONLY` **não** deve estar ligada em produção, a não ser que você a tenha ligado de propósito.
- [ ] **[manual]** **GitHub: Secret scanning e Push protection ligados** (Settings → Code security; **não verificado:** o nome exato do menu).
- [ ] **[manual]** **GitHub: aprovação de workflows de colaboradores externos** exigida (Settings → Actions → General → "Approval for running fork pull request workflows"; **não verificado:** o texto exato). Os workflows não usam secrets em pull request, mas a aprovação evita gastar minutos com PR de desconhecidos.
- [ ] **[manual]** Dependabot ativo e os PRs semanais sendo lidos (Insights → Dependency graph → Dependabot, ou a aba Pull requests).
- [ ] **[manual]** Smoke test da produção rodado uma vez à mão e verde (Actions → Smoke test da produção → Run workflow).

## 7. iPhone e PWA

- [ ] **[manual]** **Teste de instalação no iPhone** (Safari → Compartilhar → Adicionar à Tela de Início): ícone e nome certos, abre sem barra do navegador, nada sob o notch nem sob a barra inferior, nenhum campo dá zoom ao focar, **login por código funciona dentro do app instalado**, o rascunho sobrevive a fechar e reabrir o app (checklist completo no PR da etapa 8a). O WebKit dos testes **não** substitui isso.
- [ ] **[manual]** **Decisão:** o service worker com a página `/offline` e o cartão de convite para instalar (itens 5 e 6 do bloco PWA do `CLAUDE.md`) **não foram implementados**; decidir se entram antes ou depois do lançamento.

## 8. No dia

- [ ] **[manual]** Rodar o Smoke test, abrir o site no celular e no computador, entrar com sua conta, criar um comentário de teste (e apagá-lo) e conferir a moderação.
- [ ] **[manual]** Convidar poucas pessoas primeiro e acompanhar os logs da Vercel (nível Error) nos primeiros dias.
