# Propostas da etapa 8: monitoramento e backup

> **Este documento é SÓ proposta.** Nada aqui foi implementado, contratado ou ligado. Cada item depende da sua decisão (e, quando mexe em dados pessoais, de revisão jurídica). Preços, limites e nomes de menus vêm da memória ou da documentação dos provedores e **não foram conferidos**: confirme na página do provedor antes de decidir.
>
> Contexto confirmado: o Supabase está no **plano gratuito**: **sem backup automático** e **pausa do projeto após 1 semana de inatividade**. O repositório é **público** e não há computador local para guardar arquivos.

## A. Monitoramento de erros e de disponibilidade

Hoje existem: o **Smoke test da produção** (GitHub Actions, diário, avisa por e-mail se falhar) e os **logs de runtime da Vercel** (só aparecem quando alguém abre). Os logs do site foram desenhados para **nunca** conter e-mail, código, token ou texto de comentário.

| Opção | O que cobre | Custo (**não verificado**) | Impacto na política de privacidade e na CSP |
| --- | --- | --- | --- |
| **1. Só o que já existe** (Smoke diário + logs da Vercel) | Site fora do ar ou quebrado, uma vez por dia. Erros só se alguém olhar os logs | Grátis | **Nenhum.** Nada novo trata dados de visitantes |
| **2. Monitor de disponibilidade externo** (serviço que abre a home a cada poucos minutos e avisa por e-mail, como UptimeRobot, Better Stack ou Healthchecks.io) | Site fora do ar em minutos, não em um dia. Também mantém o banco "acordado" se a página lida acessar o Supabase (ajuda, sem garantia, contra a pausa) | Plano gratuito costuma existir, com intervalos de 5 minutos ou mais e poucos monitores | **Quase nenhum:** o serviço só acessa uma URL pública; não vê dados de leitoras. O seu e-mail fica na conta do serviço. Mencionar na seção de provedores só se o texto legal listar todos os fornecedores. Sem mudança de CSP |
| **3. Alerta por e-mail dos logs da Vercel / drain para um serviço de logs** | Erros 5xx e exceções do servidor, sem abrir o painel | **Não verificado** quais recursos de alerta e de _log drain_ existem no plano gratuito | Os logs não têm dado pessoal por desenho, mas um serviço de logs é um **novo operador**: listar na política e conferir região |
| **4. Monitoramento de erros no navegador e no servidor** (como o Sentry, com plano gratuito) | Exceções reais das leitoras, com pilha e contexto | Plano gratuito com cota pequena (**não verificado**) | **Alto.** Captura IP, navegador e URL; pode capturar texto digitado se mal configurado. Exige: novo operador na política (possível **transferência internacional**), ajustar a CSP (`connect-src`/`script-src` para o domínio do serviço), ajustar o teste de CSP e o E2E, configurar para **não** enviar corpo de comentário, e-mail nem cookies. Só com aval jurídico |
| **5. Estatísticas de acesso** (como o Vercel Web Analytics) | Visitas, páginas mais lidas; **não** é monitoramento de erro | **Não verificado** | **Médio.** Muda a política (finalidade nova) e talvez os cookies/armazenamento. Hoje o site não tem analytics nem banner de consentimento, e a política afirma isso (há teste): ligar exige reescrever |

**Recomendação:** começar pela **opção 2** (um monitor externo gratuito apontando para a home e para `/livro`, com alerta por e-mail), mantendo o Smoke diário. É o melhor custo-benefício e **não muda a política de privacidade**. Deixar as opções 4 e 5 para depois da revisão jurídica e de haver leitoras suficientes para justificar.

**Se escolher a opção 2:** crie a conta com um e-mail seu, cadastre só URLs públicas, e **não** cadastre nenhuma URL do painel nem com token. Anote o serviço em `docs/operacao.md`.

## B. Backup do banco

O que vale proteger, por ordem de dor se for perdido: **(1)** sessões, notas e perguntas da Agatha (o conteúdo do blog); **(2)** livros e capas; **(3)** comentários e perfis das leitoras (dados pessoais); **(4)** progresso de leitura (fácil de refazer). As **capas** ficam no Storage do Supabase (arquivos), que **não** entram em backup de banco: guarde as imagens originais à parte.

### Comparação

| | **1. Plano Pro do Supabase** | **2. Exportação manual em CSV** | **3. Dump criptografado diário no Cloudflare R2 (etapa 8d)** |
| --- | --- | --- | --- |
| Custo (**não verificado**) | **A partir de US$ 25 por mês** | Grátis | R2 tem plano gratuito com cota (**não verificado**); o GitHub Actions é gratuito para este uso |
| Backup | **Diário automático, guardado por 7 dias**, feito pelo próprio provedor | Só quando você exporta | **Diário**, retenção que você define (proposta: diários por 14 dias, semanais por 8 semanas) |
| Pausa por inatividade | **Não pausa** | Continua pausando | Continua pausando (o dump em si não "acorda" o projeto de forma garantida) |
| Cobre | Banco inteiro (inclui contas e comentários) | Só as 4 tabelas de conteúdo (`reading_sessions`, `books`, `session_notes`, `session_questions`) | Banco inteiro, criptografado |
| Esforço seu | Nenhum depois de contratar | **Constante:** lembrar toda semana e antes de qualquer SQL que apague dados | Médio uma vez (conta Cloudflare, segredos, teste de restauração); depois nenhum |
| Principal risco | Custo mensal em dólar; 7 dias de histórico | **Esquecer.** Pouca cobertura (sem comentários nem contas) | Mais peças que podem quebrar (segredos, rede, limites); risco de vazamento se o dump ou a chave forem mal guardados |
| Dados pessoais fora do Supabase | Não (fica no provedor atual) | Não (as 4 tabelas não têm dado pessoal) | **Sim:** o dump contém e-mails e comentários e vai para a Cloudflare |
| Impacto nos textos legais | Atualizar `retention`: o provedor guarda backups por 7 dias | Nenhum | **Grande:** novo operador (Cloudflare R2), **transferência internacional (A DEFINIR com advogado)**, e backups que podem conter dados já excluídos até expirarem |

### Recomendação

1. **Se houver orçamento: opção 1** antes de convidar leitoras. Resolve os **dois** riscos (backup e pausa) sem peças novas, e é a única em que o provedor mantém o backup. A decisão está no checklist de lançamento.
2. **Se não houver orçamento agora: opção 2 como paliativo** (já documentada em `docs/operacao.md`, seção 10), sabendo que **comentários e contas não ficam protegidos**, e **reavaliar quando houver leitoras ativas**.
3. **Opção 3 (8d)** só se a opção 1 estiver fora de questão e houver interesse real em proteger comentários e contas. Não implementar sem aval e sem a revisão jurídica da transferência internacional.

### Detalhes da opção 3 (para a decisão, não para implementar)

**Como funcionaria:** um workflow agendado (só na `main`, **sem** gatilho de `pull_request`, e só no repositório oficial) gera o dump dentro do runner do GitHub Actions, **criptografa ali mesmo**, envia ao bucket R2 **privado** e apaga o arquivo local. O dump **nunca** é commitado, nunca vira artefato do GitHub e nunca aparece em log. O bucket aplica a retenção por regra de ciclo de vida.

**Segredos necessários (todos como secrets do GitHub, nunca no código):** a conexão com o banco (preferir um papel só de leitura; **não verificado:** formato de conexão e IPv6 no plano gratuito), o ID da conta da Cloudflare, a chave de acesso e o segredo do R2 (com permissão **só** neste bucket), o nome do bucket e a **frase-senha** (ou chave pública) da criptografia.

**Onde fica a chave de descriptografia sem computador local.** Esta é a parte difícil: um backup que ninguém consegue abrir é inútil.

- **Frase-senha (criptografia simétrica):** gerada e guardada num **gerenciador de senhas** (que roda no navegador), copiada para o secret do GitHub. Quem tem o secret (o runner) também consegue decifrar: simples, mas um workflow comprometido abriria os backups.
- **Chave pública/privada:** o runner só tem a chave **pública** (ela só cifra); a privada fica **só** no gerenciador de senhas e, de preferência, numa cópia impressa em local seguro. Mais seguro, mas gerar o par sem computador local exige uma ferramenta confiável no navegador, e é fácil errar.
- Em ambos: **sem a chave, os backups são lixo.** Guardar em **dois** lugares independentes e **testar a restauração** logo no começo.

**Restauração:** só por `workflow_dispatch`, em um projeto Supabase **novo e vazio**, com confirmação digitada; nunca por cima do banco de produção. Há uma prova de restauração automática em Supabase local para garantir que o dump abre.

**Impacto na LGPD:** o dump tem dados pessoais (e-mails, comentários). Consequências: (a) a Cloudflare vira operador (listar em `src/content/legal/providers.ts` e na política); (b) **transferência internacional: A DEFINIR com advogado** (nunca escrever "não saem do Brasil"); (c) **um dado excluído continua nos backups até a retenção vencer**; a política precisa dizer isso e o fluxo de exclusão de conta não pode prometer apagamento imediato dos backups; (d) **proposta, sem implementar sem aval:** um **registro mínimo de exclusões** (só o ID da conta e a data, sem dado pessoal) para reaplicar as exclusões depois de restaurar um backup antigo.
