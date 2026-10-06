# Revisão jurídica: Entre Capítulos

> **Documento TEMPORÁRIO**, para entregar ao advogado. Pode ser apagado depois da revisão (ver o README). É **gerado** a partir de `src/content/` (`legal-config.ts`, `legal/privacy.ts`, `legal/terms.ts`, `legal/providers.ts` e `legal/cookies.ts`) por `UPDATE_LEGAL_REVIEW=1 npx vitest run src/content/legal/review.test.ts`; um teste falha se ele ficar diferente das fontes. Não edite à mão.

Última atualização dos textos: 5 de outubro de 2026. Os textos são **RASCUNHO** (`legalReviewed` = `false`).

Cada fato abaixo vem marcado com a origem: **do código**, **informado pelo dono do site**, **não verificado**.

## (a) O serviço e o controlador

1. O Entre Capítulos é um blog e clube de leitura de Agatha Montinelli: ela publica "sessões de leitura" (relatos por grupo de capítulos) do livro atual (do código).
2. Quem entra no clube comenta cada sessão, com controle de spoiler por capítulo; os comentários são moderados (do código).
3. É um site web (sem aplicativo nativo), hospedado na Vercel, com banco de dados e login no Supabase e e-mail de código enviado pelo Resend (do código e informado pelo dono do site).
4. Para entrar há login por código de 6 dígitos enviado por e-mail e, se ativado, login com o Google; sem ferramentas de análise ou de publicidade (do código).
5. **Controlador:** Felipe Almeida e Agatha Montinelli (informado pelo dono do site). Contato para pedidos de privacidade: Felipe.golinus@gmail.com (informado pelo dono do site). Idade mínima proposta: 18 anos, **sem** verificação de idade no cadastro (do código).

## (b) Mapa de dados

A base legal e a retenção de cada linha apontam para os itens de `legalBases` e `retention` de `legal-config.ts` (propostas a validar).

| Dado | Onde é guardado | Finalidade | Base legal proposta | Retenção proposta | Quem vê | Existe | Origem do fato |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-mail | Supabase Auth (tabela `auth.users`) | Entrar na conta, enviar o código de acesso e responder pedidos | item 1 da lista de bases: (art. 7º, V, da LGPD) | Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito. | A própria pessoa, quem administra o Supabase e, sob demanda e com registro, a administração do clube (ver a linha da consulta de e-mail, abaixo). Não é público. | sempre | do código |
| Nome de exibição | Supabase (tabela `profiles`) | Mostrar quem comentou | item 2 da lista de bases: (art. 7º, V) | Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito. | Qualquer visitante (público). | sempre | do código |
| Nome, e-mail e foto vindos do Google | Supabase (nome inicial e endereço da foto em `profiles`; e-mail em `auth.users`) | Criar a conta de quem escolhe entrar com o Google | item 1 da lista de bases: (art. 7º, V, da LGPD) | Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito. | O nome é público. O endereço da foto é legível publicamente pela API (a interface mostra só as iniciais). O e-mail não é público. | só com o login do Google ativo | do código |
| Papel (membro, moderação ou administração) | Supabase (`profiles.role`) | Distinguir a equipe e liberar a moderação | item 3 da lista de bases: (art. 7º, IX) | Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito. | Qualquer visitante (aparece como selo "Administração" ou "Moderação"). | sempre | do código |
| Comentários e respostas (texto, data, estado de moderação) | Supabase (tabela `comments`) | Exibir e moderar a conversa | item 2 da lista de bases: (art. 7º, V) | Comentários: enquanto a conta existir ou até você excluir o comentário. Ao excluir, o texto é substituído por um aviso e o original deixa de ser guardado. Comentários removidos pela moderação ficam guardados, sem exibição pública, até a exclusão da conta de quem os escreveu ou até você pedir, pelo e-mail de contato, que o texto seja apagado antes. | Aprovados: qualquer visitante (ou só membros, em sessão "só para membros"). Em análise: o autor e a equipe. Removidos: o autor e a equipe. | sempre | do código |
| Capítulo lido (no momento do comentário) e aviso de spoiler | Supabase (`comments.read_up_to` e `comments.spoiler_up_to`) | Mostrar até onde a pessoa tinha lido e cobrir spoiler | item 2 da lista de bases: (art. 7º, V) | Comentários: enquanto a conta existir ou até você excluir o comentário. Ao excluir, o texto é substituído por um aviso e o original deixa de ser guardado. Comentários removidos pela moderação ficam guardados, sem exibição pública, até a exclusão da conta de quem os escreveu ou até você pedir, pelo e-mail de contato, que o texto seja apagado antes. | Qualquer visitante, junto do comentário. | sempre | do código |
| Alerta interno "Contém link" | Supabase (tabela `comment_flags`) | Ajudar a moderação a analisar comentários com link | item 3 da lista de bases: (art. 7º, IX) | Comentários: enquanto a conta existir ou até você excluir o comentário. Ao excluir, o texto é substituído por um aviso e o original deixa de ser guardado. Comentários removidos pela moderação ficam guardados, sem exibição pública, até a exclusão da conta de quem os escreveu ou até você pedir, pelo e-mail de contato, que o texto seja apagado antes. | Só a equipe. | sempre | do código |
| Progresso de leitura (com conta) | Supabase (tabela `reading_progress`) | Guardar até que capítulo a pessoa leu e esconder spoilers | item 2 da lista de bases: (art. 7º, V) | Progresso de leitura: enquanto a conta existir. Para quem não tem conta, por até 1 ano no próprio navegador (cookie). | Só a própria pessoa. | sempre | do código |
| Progresso de leitura (sem conta) | Cookie `ec_progress` no navegador | O mesmo, para quem não tem conta | item 2 da lista de bases: (art. 7º, V) | Progresso de leitura: enquanto a conta existir. Para quem não tem conta, por até 1 ano no próprio navegador (cookie). | Só o navegador da pessoa (o servidor lê o cookie para esconder os spoilers). | sempre | do código |
| Sessão de login | Cookies `sb-…-auth-token` e as tabelas de sessão do Supabase Auth | Manter a pessoa conectada | item 1 da lista de bases: (art. 7º, V, da LGPD) | Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito. | A própria pessoa e quem administra o Supabase. | sempre | do código |
| Consulta de e-mail, último acesso e provedor de login pela administração | Supabase Auth (`auth.users`), lido por funções do banco que só a administração chama | Dar suporte e atender pedidos sobre os dados (LGPD) | item 3 da lista de bases: (art. 7º, IX) | Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito. | Só a administração. O e-mail completo, o último acesso e o provedor só aparecem depois de um clique no perfil, e cada vez que aparecem fica na auditoria. A lista de membros mostra só o e-mail mascarado (primeira letra e domínio) e a busca por e-mail exato confirma se existe uma conta com ele: esses dois usos NÃO ficam na auditoria. | sempre | do código |
| Suspensão de comentários (quem está impedido de comentar) | Supabase (tabela `member_suspensions`, separada de `profiles`, que é pública) | Impedir que uma conta publique comentários (abuso) | item 3 da lista de bases: (art. 7º, IX) | Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito. | A própria pessoa e a administração. | sempre | do código |
| Auditoria das ações da administração sobre pessoas | Supabase (tabela `member_audit`; só funções do banco gravam) | Registrar quem mudou um cargo, suspendeu ou reativou comentários, consultou o e-mail, baixou os dados ou excluiu uma conta | item 3 da lista de bases: (art. 7º, IX) | sem item específico (a definir pelo advogado) | Só a administração. Guarda só identificadores internos (uuid) de quem agiu e de quem sofreu a ação, o tipo da ação, a data e, na mudança de cargo, o cargo de antes e o de depois. Nunca nome, e-mail nem texto. Continua depois da exclusão da conta (ver `audit.retention`). | sempre | do código |
| Registros técnicos de acesso (IP, data e hora, navegador, páginas) | Registros dos provedores (Vercel, Supabase e outros) | Operar e proteger o serviço | item 3 da lista de bases: (art. 7º, IX) | Registros técnicos e de segurança: mantidos pelos provedores por períodos definidos por eles, em regra curtos, e pelo prazo que a lei exigir. | Os provedores e quem administra as contas deles. | sempre | não verificado |
| Verificação anti-robô (dados do navegador enviados à Cloudflare) | Cloudflare Turnstile (o site não guarda estes dados) | Confirmar que o pedido de código vem de uma pessoa | item 3 da lista de bases: (art. 7º, IX) | sem item específico (a definir pelo advogado) | A Cloudflare. | só com o Turnstile ativo | não verificado |
| Pedidos de privacidade enviados por e-mail | Caixa de e-mail dos controladores | Atender os pedidos e comprovar o atendimento | item 4 da lista de bases: (art. 7º, II) e (art. 7º, VI) | Pedidos de privacidade enviados por e-mail: pelo tempo necessário para atender e comprovar o atendimento. | Os controladores. | sempre | informado pelo dono do site |
| Cópias de segurança do banco de dados | Provedor do banco de dados (Supabase) | Continuidade do serviço | a definir pelo advogado | Cópias de segurança: as mantidas pelo provedor do banco de dados e as cópias criptografadas que guardamos no Cloudflare R2 podem conter os dados por um período limitado depois da exclusão, até a cópia expirar. | O provedor. | sempre | não verificado |
| Cópias de segurança criptografadas do banco (incluem dados pessoais) | Cloudflare R2 (bucket privado, fora do Brasil) | Recuperar o site depois de uma perda de dados | a definir pelo advogado | Cópias de segurança: as mantidas pelo provedor do banco de dados e as cópias criptografadas que guardamos no Cloudflare R2 podem conter os dados por um período limitado depois da exclusão, até a cópia expirar. | Quem tiver o acesso ao bucket e a frase-senha da criptografia (os controladores). | sempre | informado pelo dono do site |
| Cópia local do rascunho (editor de sessões) | IndexedDB do navegador da equipe | Não perder o texto se o aplicativo for fechado | a definir pelo advogado | sem item específico (a definir pelo advogado) | Só quem usa o editor (a equipe). | sempre | do código |
| Preferência do cartão de instalação (neste aparelho) | localStorage do navegador (`ec:install:v1`), só em iPhone e iPad (Safari ou navegador embutido de outro aplicativo); nunca é enviada ao servidor | Decidir quando mostrar o cartão que ensina a colocar o site na Tela de Início: dias distintos de visita, último dia, "Agora não" (e quando) e "Já instalei" | a definir pelo advogado | sem item específico (a definir pelo advogado) | Só a própria pessoa (fica no aparelho). | sempre | do código |

## (c) Provedores e o papel de cada um

A região é a informada pelos donos do site e **não foi verificada no código** (não há `vercel.json`; a região das funções é uma configuração do painel da Vercel). Fora a região, o que cada serviço faz vem do código.

| Serviço | Papel (LGPD) | Para quê | Região (legal-config) | Existe | Origem |
| --- | --- | --- | --- | --- | --- |
| Supabase | Operador (trata os dados em nome dos controladores). | Banco de dados, autenticação (login) e armazenamento das capas dos livros. | São Paulo (Brasil) | sempre | uso: do código; região: informado pelo dono do site |
| Vercel | Operador (trata os dados em nome dos controladores). | Hospedagem do site e das funções que o executam. | São Paulo (gru1, Brasil) | sempre | uso: do código; região: informado pelo dono do site |
| Resend | Operador contratado pelos controladores e acionado pelo Supabase (SMTP). | Envio do e-mail com o código de entrada, como operador contratado por nós e acionado pelo Supabase (o envio de e-mails do Supabase está configurado para usá-lo). | São Paulo (sa-east-1) | sempre | uso: informado pelo dono do site; região: informado pelo dono do site |
| Google | A confirmar pelo advogado (o Google trata os dados da conta Google por conta própria; o site só recebe o que ele informa). | Login com a conta Google, quando você escolhe essa opção. | Infraestrutura global do Google, sem região fixa. O processamento pode ocorrer fora do Brasil. | só com o login do Google ativo | uso: do código; região: informado pelo dono do site |
| Cloudflare Turnstile | A confirmar pelo advogado (operador, na verificação anti-robô). | Verificação anti-robô ao pedir o código por e-mail. | Rede global da Cloudflare, sem região fixa. O processamento pode ocorrer fora do Brasil. | só com o Turnstile ativo | uso: do código; região: informado pelo dono do site |
| Cloudflare R2 | Operador (guarda arquivos criptografados em nome dos controladores). A confirmar pelo advogado. | Guarda das cópias de segurança criptografadas do banco de dados. A criptografia é feita antes do envio e a Cloudflare não tem a chave. | Região escolhida na criação do bucket, fora do Brasil (a Cloudflare não oferece região no Brasil para o R2, a confirmar). O armazenamento e o processamento ocorrem fora do Brasil. | sempre | uso: informado pelo dono do site; região: informado pelo dono do site |

## (d) Cookies e armazenamento local

| Nome | Finalidade | Duração | Existe | Origem |
| --- | --- | --- | --- | --- |
| ec_progress | Guarda até que capítulo você leu (por livro), para esconder os trechos com spoiler. Só é usado por quem não entrou na conta. | 1 ano | sempre | do código |
| ec_next | Lembra para onde voltar depois de entrar com o Google. | 10 minutos | só com o login do Google ativo | do código |
| sb-…-auth-token | Sessão do Supabase Auth: mantém você conectado depois de entrar. Pode vir em mais de um pedaço (.0, .1…). | a duração da sessão, definida pelo Supabase | sempre | do código |
| IndexedDB do editor de sessões (`session:<id>` e `new:<bookId>`) | Cópia local do rascunho, para não perder o texto se o aplicativo for fechado. (só a equipe (quem usa o editor)) | até o rascunho ser enviado ao servidor ou o navegador limpar os dados do site | sempre | do código |
| `ec:install:v1` (armazenamento local do site) | Preferência do cartão "Instale o Entre Capítulos": guarda em quantos dias diferentes você abriu o site neste aparelho, o último desses dias, se você tocou em "Agora não" (e quando; o cartão pode voltar depois de 60 dias) e se você tocou em "Já instalei". Não guarda nome, e-mail nem identificador de conta, e nunca é enviada ao servidor. (só iPhone e iPad (Safari ou navegador embutido de outro aplicativo); nos demais aparelhos e no aplicativo instalado, nada é gravado) | até o navegador limpar os dados do site ("Já instalei" vale por todo esse tempo) | sempre | do código |
| `cf.turnstile.u` (armazenamento local do iframe da Cloudflare) | Item criado pelo widget de verificação anti-robô, no domínio da Cloudflare. (quem pede o código quando a verificação está ativa) | definida pela Cloudflare | só com o Turnstile ativo | não verificado (medido só com a chave de testes da Cloudflare) |

Todos os cookies são essenciais; não há banner de consentimento (do código).

## (e) Texto integral

Os dois textos abaixo são os de `/privacidade` e `/termos`, com o login do Google e o Turnstile **ativos** (com eles desligados, a tabela de serviços, os cookies e alguns itens da lista de dados somem).

### Política de Privacidade

*Como o Entre Capítulos trata os seus dados pessoais, em linguagem simples.*

#### 1. Quem controla os dados

O Entre Capítulos é mantido por Felipe Almeida e Agatha Montinelli, que decidem como os dados descritos aqui são tratados (o "controlador", na LGPD).

Para qualquer pedido ou dúvida sobre privacidade, escreva para Felipe.golinus@gmail.com.

O clube é destinado a pessoas com 18 anos ou mais. O site não verifica a idade de quem cria a conta. Se soubermos que alguém abaixo dessa idade criou uma conta, podemos excluí-la.

#### 2. Quais dados tratamos

- E-mail: o endereço que você informa para entrar (ou que o Google informa, se você entrar com ele). Usamos para enviar o código de acesso por e-mail e responder aos pedidos que você nos fizer. Ele não é público: só você e, para dar suporte e atender pedidos sobre os seus dados, a administração do clube o veem (veja "Consulta de contato pela administração", mais abaixo).
- Nome de exibição: o nome que você escolhe no primeiro acesso e pode trocar em Minha conta. É público.
- Se você escolher entrar com o Google, ele nos informa seu nome, e-mail e foto de perfil. O nome inicial do perfil vem daí.
- Comentários e respostas: o texto, a data, o estado de moderação (em análise, publicado ou removido), o aviso de spoiler, se houver, e até que capítulo você tinha lido quando comentou. Nome, texto e esse capítulo são públicos.
- Alertas de moderação: quando um comentário tem um link, a equipe vê um alerta interno ("Contém link"). Só a equipe vê.
- Progresso de leitura: até que capítulo você leu em cada livro. Com conta, fica guardado no banco de dados; sem conta, fica num cookie do seu navegador.
- Consulta de contato pela administração: a administração do clube pode ver o seu e-mail, a data do seu último acesso e como você entra (código por e-mail ou Google), só para dar suporte e atender pedidos sobre os seus dados. Cada vez que o e-mail completo, o último acesso e o provedor são mostrados, a consulta fica registrada. A lista de membros mostra só um e-mail parcial (a primeira letra e o domínio) e a busca por um e-mail exato diz se existe uma conta com ele; esses dois usos não ficam registrados.
- Situação dos comentários: a administração pode suspender a publicação de comentários de uma conta. Essa informação só a própria pessoa e a administração veem.
- Registro das ações da administração (auditoria): quando a administração muda um cargo, suspende ou reativa comentários, consulta o e-mail, baixa os dados ou exclui uma conta, fica registrado quem fez, em qual conta, o quê e quando. O registro não guarda nome, e-mail nem texto: só os identificadores internos das contas e, na mudança de cargo, o cargo de antes e o de depois. Só a administração o vê.
- Registros técnicos: os provedores de hospedagem e de banco de dados podem registrar dados técnicos de acesso, como endereço IP, data e hora, tipo de navegador e páginas acessadas, para operar e proteger o serviço. O site não usa ferramentas de análise de audiência nem de publicidade.
- Quando a verificação anti-robô (Cloudflare Turnstile) estiver ativa, ela é usada na tela de entrada para confirmar que o envio vem de uma pessoa. Ela recebe dados do seu navegador; os dados exatos são definidos pela Cloudflare.

#### 3. O que é público

> Seu nome de exibição e seus comentários são públicos: qualquer visitante, mesmo sem entrar, consegue ler o seu nome, o texto, a data e até que capítulo você tinha lido. Também é público se a conta é da administração ou da moderação (um selo aparece ao lado do nome). Não escreva no comentário nada que você não queira que apareça para todo mundo. Seu e-mail não é público.

#### 4. Para que usamos os dados

- Deixar você entrar na sua conta e manter a sessão, enviar o código de acesso por e-mail e responder aos pedidos que você nos fizer.
- Mostrar as sessões de leitura e esconder o que fala de capítulos que você ainda não leu.
- Publicar, moderar e exibir comentários e respostas.
- Guardar até onde você leu, para a próxima visita.
- Proteger o site contra abuso e spam (limite de comentários por minuto e por hora, análise de comentários com link e, quando ativa, a verificação anti-robô no envio do código).
- Dar suporte, atender os pedidos sobre os dados e proteger a comunidade: a administração pode ver o e-mail de uma conta, suspender os comentários dela ou excluí-la, e registra essas ações.
- Cumprir obrigações legais e exercer direitos em eventual disputa.

#### 5. Bases legais

As bases legais da LGPD (art. 7º) que justificam cada finalidade:

- Criar e manter sua conta, enviar o código de acesso por e-mail e, se você escolher entrar com o Google, receber seu nome, e-mail e foto de perfil: execução de contrato (art. 7º, V, da LGPD), porque são necessários para oferecer o serviço que você pediu.
- Exibir seu nome e seus comentários e guardar seu progresso de leitura: execução de contrato (art. 7º, V).
- Moderar comentários e proteger a comunidade e o serviço contra abuso, incluindo limites de uso e verificação anti-robô: legítimo interesse (art. 7º, IX), respeitando seus direitos e suas expectativas.
- Cumprir obrigações legais e exercer direitos em eventual disputa: cumprimento de obrigação legal ou regulatória (art. 7º, II) e exercício regular de direitos (art. 7º, VI).

Este ponto ainda precisa ser validado por um advogado.

#### 6. Com quem compartilhamos

Usamos os serviços abaixo para o site funcionar. Eles tratam dados em nosso nome ou, no caso do login, a seu pedido. Não há outros destinatários no código do site.

*Serviços usados pelo site*

| Serviço | Para quê | Região |
| --- | --- | --- |
| Supabase | Banco de dados, autenticação (login) e armazenamento das capas dos livros. | São Paulo (Brasil) |
| Vercel | Hospedagem do site e das funções que o executam. | São Paulo (gru1, Brasil) |
| Resend | Envio do e-mail com o código de entrada, como operador contratado por nós e acionado pelo Supabase (o envio de e-mails do Supabase está configurado para usá-lo). | São Paulo (sa-east-1) |
| Google | Login com a conta Google, quando você escolhe essa opção. | Infraestrutura global do Google, sem região fixa. O processamento pode ocorrer fora do Brasil. |
| Cloudflare Turnstile | Verificação anti-robô ao pedir o código por e-mail. | Rede global da Cloudflare, sem região fixa. O processamento pode ocorrer fora do Brasil. |
| Cloudflare R2 | Guarda das cópias de segurança criptografadas do banco de dados. A criptografia é feita antes do envio e a Cloudflare não tem a chave. | Região escolhida na criação do bucket, fora do Brasil (a Cloudflare não oferece região no Brasil para o R2, a confirmar). O armazenamento e o processamento ocorrem fora do Brasil. |

O banco de dados e a autenticação (Supabase) ficam na região de São Paulo (Brasil). As funções do site (Vercel) rodam na região de São Paulo (gru1, Brasil), conforme a configuração do projeto no provedor.

Transferência internacional de dados:

O banco de dados e as funções do site rodam em servidores em São Paulo (Brasil). Mesmo assim, os provedores que usamos (Supabase, Vercel e Resend) e, quando ativos, o Cloudflare Turnstile e o login do Google são empresas com operações em outros países, e partes do tratamento, como a entrega de e-mails, a proteção contra robôs, a rede de distribuição de conteúdo, os registros técnicos e o suporte, podem ocorrer fora do Brasil. Nesses casos, buscamos as garantias previstas na LGPD por meio dos contratos de tratamento de dados e dos termos desses provedores. Você pode pedir informações sobre isso pelo e-mail de contato.

Este ponto ainda precisa ser validado por um advogado.

As cópias de segurança criptografadas do banco de dados ficam num serviço de armazenamento da Cloudflare (R2). Região: Região escolhida na criação do bucket, fora do Brasil (a Cloudflare não oferece região no Brasil para o R2, a confirmar). O armazenamento e o processamento ocorrem fora do Brasil.

Transferência internacional das cópias de segurança: A DEFINIR. Este ponto depende de análise jurídica.

#### 7. Por quanto tempo guardamos

Por quanto tempo guardamos cada tipo de dado:

- Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito.
- Comentários: enquanto a conta existir ou até você excluir o comentário. Ao excluir, o texto é substituído por um aviso e o original deixa de ser guardado. Comentários removidos pela moderação ficam guardados, sem exibição pública, até a exclusão da conta de quem os escreveu ou até você pedir, pelo e-mail de contato, que o texto seja apagado antes.
- Progresso de leitura: enquanto a conta existir. Para quem não tem conta, por até 1 ano no próprio navegador (cookie).
- Registros técnicos e de segurança: mantidos pelos provedores por períodos definidos por eles, em regra curtos, e pelo prazo que a lei exigir.
- Pedidos de privacidade enviados por e-mail: pelo tempo necessário para atender e comprovar o atendimento.
- Cópias de segurança: as mantidas pelo provedor do banco de dados e as cópias criptografadas que guardamos no Cloudflare R2 podem conter os dados por um período limitado depois da exclusão, até a cópia expirar.

Este ponto ainda precisa ser validado por um advogado.

Guardamos cópias de segurança criptografadas do banco de dados, para recuperar o site se houver uma perda de dados. Elas podem conter dados que você já excluiu, como comentários e contas apagados, até que cada cópia expire e seja descartada. Por isso, excluir um comentário ou a conta apaga o dado do banco de dados do site, mas não das cópias de segurança já feitas.

Por quanto tempo guardamos as cópias de segurança: A DEFINIR. Este ponto depende de análise jurídica.

Você pode excluir seus comentários que estejam visíveis ou em análise, quando quiser, no próprio comentário ("Excluir meu comentário", embaixo dele, na página da sessão). Comentários removidos pela moderação não aparecem mais no site, e o texto deles só deixa de existir quando a conta é excluída; se quiser que um deles seja apagado antes, peça pelo e-mail de contato. As respostas de outras pessoas a um comentário excluído deixam de aparecer no site, mas continuam guardadas até a exclusão da conta de quem as escreveu.

"Excluir minha conta", em Minha conta, apaga o seu perfil, o seu e-mail, os seus comentários (e as respostas que outras pessoas escreveram a eles) e o seu progresso de leitura. A exclusão da conta não tem volta.

Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.

O registro das ações da administração guarda só os identificadores internos das contas. Quando uma conta é excluída, as linhas sobre ela (e as em que ela foi quem fez a ação) continuam, ligadas só a esse identificador, que já não corresponde a nenhum perfil, sem nome, e-mail nem texto.

Por quanto tempo guardamos o registro das ações da administração: A DEFINIR. Este ponto depende de análise jurídica.

#### 8. Seus direitos (LGPD, art. 18)

A LGPD garante que você peça, a qualquer momento: confirmação de que tratamos seus dados; acesso aos dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados fora da lei; portabilidade; eliminação dos dados tratados com o seu consentimento; informação sobre com quem compartilhamos os dados; informação sobre a possibilidade de não dar consentimento e suas consequências; e a revogação do consentimento.

Como exercer, na prática:

- Editar o seu nome: em Minha conta (menu da conta, no topo do site).
- Baixar uma cópia dos seus dados: em Minha conta, "Baixar meus dados" (um arquivo com o seu perfil, e-mail, todos os seus comentários e o seu progresso).
- Excluir um comentário que esteja visível ou em análise: "Excluir meu comentário", embaixo dele. Para um comentário removido pela moderação, peça pelo e-mail de contato.
- Excluir a sua conta: em Minha conta, "Excluir minha conta". Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.
- Pedir uma cópia dos seus dados ou a exclusão da conta pelo e-mail de contato: a administração confirma que o pedido vem do e-mail cadastrado na conta e atende pelo painel, com a mesma cópia e a mesma exclusão de "Minha conta". Cada uma dessas ações fica registrada.
- Qualquer outro pedido (por exemplo, confirmar o tratamento, corrigir algo que você não consegue editar ou pedir informações): escreva para Felipe.golinus@gmail.com, a partir do e-mail cadastrado na conta.

Prazo para responder aos pedidos:

Respondemos aos pedidos em até 15 dias, contados do recebimento. Acessar seus dados, corrigir seu nome e excluir sua conta você faz na hora, em "Minha conta"; as contas da equipe do clube têm uma etapa a mais para a exclusão (veja "Seus direitos").

Este ponto ainda precisa ser validado por um advogado.

#### 9. Cookies e armazenamento no navegador

O site usa apenas cookies essenciais, necessários para o que você pediu (entrar na conta e lembrar até onde leu). Por isso não há aviso de consentimento de cookies.

*Cookies do site*

| Cookie | Para quê | Duração |
| --- | --- | --- |
| ec_progress | Guarda até que capítulo você leu (por livro), para esconder os trechos com spoiler. Só é usado por quem não entrou na conta. | 1 ano |
| ec_next | Lembra para onde voltar depois de entrar com o Google. | 10 minutos |
| sb-…-auth-token | Sessão do Supabase Auth: mantém você conectado depois de entrar. Pode vir em mais de um pedaço (.0, .1…). | a duração da sessão, definida pelo Supabase |

O editor de sessões, usado só pela equipe, guarda uma cópia do rascunho no armazenamento local do navegador (IndexedDB) para não perder o texto se o aplicativo for fechado.

Em iPhones e iPads (no Safari ou no navegador embutido de outro aplicativo), o site guarda uma preferência no armazenamento local do navegador (ec:install:v1) para decidir quando mostrar o cartão que ensina a colocar o Entre Capítulos na Tela de Início. Ela guarda em quantos dias diferentes você abriu o site neste aparelho, o último desses dias, se você tocou em "Agora não" (e quando; o cartão pode voltar depois de 60 dias) e se você tocou em "Já instalei". Não guarda nome, e-mail nem identificador de conta, nunca é enviada ao servidor e fica neste aparelho até o navegador limpar os dados do site. Nos outros aparelhos e no aplicativo instalado, o site não grava essa preferência.

Quando a verificação de segurança está ativa, o site carrega scripts da Cloudflare. Num teste com a chave de testes da Cloudflare, o widget não criou cookies no site e guardou um item no armazenamento local do próprio domínio da Cloudflare; o que o serviço usa de verdade com a chave real é definido pela Cloudflare: A DEFINIR (conferir antes de ativar).

#### 10. Mudanças nesta política

Podemos atualizar esta política. A data da última atualização é 5 de outubro de 2026.

### Termos de Uso

*As regras de convivência e de uso do Entre Capítulos.*

#### 1. O que é o Entre Capítulos

O Entre Capítulos é um blog e clube de leitura de Agatha Montinelli. Ela lê um livro por vez e publica sessões de leitura, que são relatos curtos sobre grupos de capítulos. Quem entra no clube pode conversar sobre cada sessão nos comentários, com controle de spoiler por capítulo.

#### 2. Sua conta

Você pode ler as sessões públicas sem conta. Para comentar, é preciso entrar com um código enviado por e-mail ou, quando disponível, com a conta Google.

O clube é destinado a pessoas com 18 anos ou mais. O site não verifica a idade de quem cria a conta. Se soubermos que alguém abaixo dessa idade criou uma conta, podemos excluí-la.

Você escolhe o nome que aparece nos seus comentários, que é público. Cuide do acesso ao seu e-mail: quem o controla consegue entrar na sua conta. Você pode trocar o nome, baixar os seus dados e excluir a conta em Minha conta.

Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.

Ao excluir a sua conta ou um comentário, o dado é apagado do banco de dados do site, mas pode continuar por algum tempo em cópias de segurança criptografadas, até elas expirarem. Os detalhes estão na Política de Privacidade.

#### 3. Combinados da comunidade

- Marque os spoilers: Se o seu comentário fala de capítulos à frente, marque até qual.
- Discordar é bem-vindo: Com carinho. Critique ideias, nunca pessoas.
- Sem autopromoção: Links de venda e divulgação são removidos pela moderação.
- Todo ritmo vale: Quem está atrasado é tão parte do clube quanto quem adiantou.

Os primeiros comentários de cada pessoa, e os que têm link, passam por uma análise da moderação antes de aparecer. A moderação pode remover comentários que não respeitem estes combinados.

#### 4. O que você escreve

O que você escreve nos comentários continua sendo seu. Ao publicar, você autoriza o site a exibir o seu comentário (com o seu nome de exibição) na página da sessão, para qualquer visitante.

Você é responsável pelo que escreve. A moderação pode remover um comentário a qualquer momento.

Você pode excluir seus comentários que estejam visíveis ou em análise, quando quiser, no próprio comentário ("Excluir meu comentário", embaixo dele, na página da sessão). Comentários removidos pela moderação não aparecem mais no site, e o texto deles só deixa de existir quando a conta é excluída; se quiser que um deles seja apagado antes, peça pelo e-mail de contato.

#### 5. Filtro de spoiler

O filtro de spoiler é uma cortesia de leitura: ele cobre os trechos e comentários que falam de capítulos à frente do que você marcou como lido, mas não é uma garantia. O texto coberto continua na página e pode aparecer por falha, por engano de quem comentou ou quando você escolhe mostrá-lo.

#### 6. Disponibilidade

O site é oferecido como está, sem garantia de que estará sempre disponível ou livre de erros. Podemos mudar, suspender ou encerrar partes do site.

#### 7. Seus dados

O tratamento dos seus dados pessoais está descrito na Política de Privacidade.

#### 8. Mudanças nestes termos

Podemos atualizar estes termos. A data da última atualização é 5 de outubro de 2026.

#### 9. Contato

Dúvidas sobre estes termos: Felipe.golinus@gmail.com.

## (f) Campos preenchidos como proposta e campos pendentes

Cada campo preenchido tem o comentário `// PROPOSTA: validar com advogado` em `src/content/legal-config.ts`.

**Preenchidos como proposta (7):**

- `regions.cloudflareTurnstile`
- `regions.google`
- `regions.cloudflareR2`
- `legalBases`
- `internationalTransfer`
- `retention`
- `requestDeadline`

**Ainda "A DEFINIR":** `backups.internationalTransfer`, `backups.retention`, `audit.retention`

**Revisão profissional (`legalReviewed`):** `false`. Enquanto for `false`, as páginas mostram "Rascunho em revisão" e ficam com `noindex`.

## (g) Funcionalidades futuras que mudam a política

Nenhuma destas existe hoje (do código).

- Envio por e-mail de cada nova sessão aos inscritos (Resend; tabela de inscritos): novo dado (e-mail para newsletter), nova finalidade e base legal, descadastro.
- Reações, curtidas e votação do próximo livro: novos dados de comportamento ligados à conta.
- Ferramenta de análise de audiência (analytics) ou estatísticas do painel: hoje o site não usa nenhuma.
- Notificações push (Web Push): permissão do navegador e identificadores do aparelho.
- Service worker e leitura offline: cópias do conteúdo guardadas no aparelho.
- Denúncias de comentários e de membros: novos dados.
- Convites por e-mail, mensagens aos membros, ações em lote, banimento com prazo, anotações da administração sobre pessoas e cargos personalizados (a gestão de membros de hoje não faz nada disso): cada um mudaria o que a política diz.
- Edição de comentário pelo autor: hoje o banco não deixa mudar o texto.
- Busca no site.

## (h) Perguntas para o advogado

1. Bases legais: as quatro propostas (execução de contrato, legítimo interesse, obrigação legal e exercício regular de direitos) servem para cada finalidade? O legítimo interesse (moderação, limites de uso e verificação anti-robô) exige registro da avaliação?
2. Transferência internacional: qual o mecanismo adequado para cada provedor (Supabase, Vercel, Resend, Cloudflare e Google), e o texto de "buscamos as garantias previstas na LGPD por meio dos contratos desses provedores" é verdadeiro e suficiente?
3. Retenção e guarda de registros de acesso: quais prazos e quais registros precisamos guardar ou podemos descartar, inclusive os que os provedores mantêm, e o que dizer sobre as cópias de segurança?
4. Prazo de resposta: o prazo proposto de 15 dias para os pedidos dos titulares está adequado?
5. Encarregado (art. 41): somos obrigados a indicar um encarregado e a publicar a identidade e o contato?
6. Idade mínima e crianças e adolescentes (art. 14): a idade proposta e o texto atual bastam? O que muda se uma conta de menor for identificada?
7. Quem é o controlador: os dois donos do site em conjunto, uma pessoa, ou uma empresa? Isso muda o texto e a responsabilidade?
8. Regime de agentes de tratamento de pequeno porte: o site se enquadra, e isso dispensa ou simplifica alguma obrigação?
9. Termos de Uso: responsabilidade pelo conteúdo dos comentários, limitação de responsabilidade e foro.
10. Retenção de comentários removidos pela moderação: guardar o texto original até a exclusão da conta é adequado, e qual a melhor forma de atender o pedido de apagar antes?
11. Declaração de idade no cadastro: é preciso pedir uma declaração (por exemplo, uma caixa de confirmação) ao criar a conta?
12. Cópias de segurança (Cloudflare R2): qual a base legal e o mecanismo de transferência internacional para guardar um dump criptografado fora do Brasil, qual prazo de retenção das cópias é adequado (a proposta técnica é 14 dias para as diárias e 56 dias para as semanais) e como conciliar o direito de exclusão com dados que continuam nas cópias até expirarem?
13. Registro mínimo de exclusões (proposta adiada, não implementada): guardar só o identificador da conta excluída e a data, pelo mesmo prazo das cópias, para reaplicar as exclusões depois de restaurar um backup, é aceitável e como deve constar na política?
14. Contas da equipe: a exclusão só depois de retirar o papel de equipe, a pedido por e-mail, está de acordo com os direitos do titular?

## (i) Perguntas da segunda rodada

Sobre a gestão de membros pela administração (etapa 8f): o que a administração passou a poder ver, fazer e registrar sobre as pessoas. O texto de `/privacidade` já descreve esses pontos; o prazo de retenção da auditoria (`audit.retention`) está "A DEFINIR".

1. Retenção da auditoria: por quanto tempo guardar as linhas de auditoria das ações da administração sobre pessoas (`audit.retention`, hoje "A DEFINIR")? O que justifica o prazo e como ele se concilia com a eliminação de dados quando a conta é excluída?
2. Identificadores de quem agiu e de quem sofreu a ação depois da exclusão: as linhas de auditoria sobre uma conta excluída (e as em que ela foi quem fez a ação) continuam ligadas só ao identificador interno (uuid), sem nome, e-mail nem texto. Esse identificador ainda é dado pessoal? Ele também aparece nas cópias de segurança, nos registros da Vercel (`/painel/membros/<uuid>`) e nos 8 primeiros caracteres do nome do arquivo de dados. Precisa ser tratado na política e nos prazos?
3. A administração vendo e-mail e último acesso: a administração vê o e-mail completo, o último acesso e o provedor de login de qualquer pessoa, para suporte e pedidos da LGPD, depois de um clique e com registro de cada vez que são mostrados. Já a lista de membros mostra o e-mail mascarado (primeira letra e domínio) e a busca por e-mail exato confirma se existe uma conta com ele, e esses dois usos NÃO são registrados. Qual a base legal adequada, o texto da política basta, esses dois usos sem registro são aceitáveis ou devem ser auditados, e é preciso limitar quem tem o cargo de administração ou registrar a finalidade de cada consulta?
4. Suspensão de comentários: a administração pode suspender os comentários de uma conta, sem motivo, prazo nem aviso além da mensagem no campo de comentário. Isso é uma sanção que exige aviso prévio, motivo, prazo ou canal de contestação? Precisa constar nos Termos de Uso?
5. Leitura de e-mail por função do projeto gerenciado: o e-mail é lido da tabela de contas do Supabase (provedor gerenciado) por funções do banco, executadas com o papel dono das funções, e o uso é registrado só pelo nosso próprio registro. Isso muda o papel do Supabase como operador, ou exige alguma cláusula ou aviso? E como descrever o caso em que o projeto gerenciado não permite essa leitura?
6. As linhas de auditoria sobre a pessoa (mudança de cargo, suspensão, consulta ao e-mail pela administração) fazem parte do direito de acesso? Devem constar na exportação dela, com ou sem o nome de quem agiu?
