# Revisão jurídica: Entre Capítulos

> **Documento TEMPORÁRIO**, para entregar ao advogado. Pode ser apagado depois da revisão (ver o README). É **gerado** a partir de `src/content/` (`legal-config.ts`, `legal/privacy.ts`, `legal/terms.ts`, `legal/providers.ts` e `legal/cookies.ts`) por `UPDATE_LEGAL_REVIEW=1 npx vitest run src/content/legal/review.test.ts`; um teste falha se ele ficar diferente das fontes. Não edite à mão.

Última atualização dos textos: 6 de outubro de 2026. Os textos são **RASCUNHO** (`legalReviewed` = `false`).

Cada fato abaixo vem marcado com a origem: **do código**, **informado pelo dono do site**, **não verificado**.

## (a) O serviço e o controlador

1. O Entre Capítulos é um blog e clube de leitura de Agatha Montinelli: ela publica "sessões de leitura" (relatos por grupo de capítulos) do livro atual (do código).
2. Quem entra no clube comenta cada sessão, com controle de spoiler por capítulo; os comentários são moderados (do código).
3. É um site web (sem aplicativo nativo), hospedado na Vercel, com banco de dados e login no Supabase e e-mail de código enviado pelo Resend (do código e informado pelo dono do site).
4. Para entrar há login por código de 6 dígitos enviado por e-mail e, se ativado, login com o Google; sem ferramentas de análise ou de publicidade (do código).
5. **Controlador:** Felipe Almeida e Agatha Montinelli (informado pelo dono do site). Contato para pedidos de privacidade: Felipe.golinus@gmail.com (informado pelo dono do site). Idade mínima: 18 anos, declarada pela pessoa no aceite dos Termos, **sem** verificação de idade (do código); é decisão do dono do site (o advogado validou 16) e fica como proposta até a posição sobre a ECA Digital.

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
| Aceite dos Termos e declaração de ter 18 anos ou mais (versão, data do primeiro aceite e do último) | Supabase (tabela `terms_acceptances`; só a função `accept_terms` grava) | Registrar o aceite dos Termos e da Política e a declaração de idade (a idade é declarada, nunca verificada) | item 4 da lista de bases: (art. 7º, II) e (art. 7º, VI) | Aceite dos Termos (a versão aceita, a data do primeiro aceite e a do último, que valem também como a declaração de ter 18 anos ou mais): enquanto a conta existir. Ao excluir a conta, o aceite é apagado. | A própria pessoa (em "Baixar meus dados") e a administração (no arquivo de dados da pessoa, ao atender um pedido, com registro na auditoria). Guarda só o último aceite e a data do primeiro, sem histórico. | sempre | do código |
| Registro mínimo de exclusões (identificador técnico da conta excluída e data) | Supabase (tabela `account_deletions`; só funções do banco gravam e leem; nenhum acesso pela API, nem da administração) | Evitar que contas e dados já excluídos sejam recriados por engano ao restaurar uma cópia de segurança | item 4 da lista de bases: (art. 7º, II) e (art. 7º, VI) | Registro mínimo de exclusões (identificador técnico da conta e data da exclusão): 56 dias, o mesmo prazo das cópias de segurança semanais, e depois é apagado. | Ninguém pelo site nem pela API: só quem administra o Supabase, no banco. Entra nas cópias de segurança como as outras tabelas. Sem nome, e-mail nem texto. | sempre | do código |
| Texto e foto da autora na página Sobre (publicados pela própria titular) | Supabase (tabelas `site_pages`, `site_page_drafts` e `site_page_revisions`) e, para a foto, o bucket público `covers` do Supabase Storage (prefixo `site/sobre/`) | Apresentar a autora e o clube na página Sobre, que a administração edita e publica no painel | a definir pelo advogado | sem item específico (a definir pelo advogado) | O texto e a foto publicados: qualquer visitante (público). Rascunhos e as 20 últimas versões publicadas: só a administração. A foto é recortada em 512x512 e reencodada em WebP sem metadados (EXIF, localização) e o arquivo original enviado é apagado em seguida. A foto de um RASCUNHO fica no bucket público: quem souber o endereço (um UUID aleatório, que não aparece em nenhuma listagem) consegue abri-la antes de ela ser publicada. Os arquivos do Storage NÃO entram nas cópias de segurança (a foto se reenvia pelo painel); o texto entra, como as demais tabelas. | sempre | do código |
| Autoria das publicações do Sobre (identificador interno da conta de quem salvou ou publicou cada versão) | Supabase (colunas `updated_by` e `published_by` das tabelas da página Sobre; só funções do banco gravam) | Saber quem salvou e publicou cada versão (histórico das 20 últimas) | item 3 da lista de bases: (art. 7º, IX) | sem item específico (a definir pelo advogado) | Só a administração, no histórico. Só o identificador interno (uuid), sem nome, e-mail nem texto: o `updated_by` da página publicada é legível pela API como o resto de `profiles` (id, nome e papel já são públicos). Se a conta for excluída o campo fica vazio e a página não é apagada. | sempre | do código |
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

### Transferência internacional: mecanismo a confirmar para cada provedor

A referência adotada pelo dono do site é a **Resolução CD/ANPD nº 19/2024** (cláusulas-padrão contratuais). Para **cada** provedor da tabela acima (Supabase, Vercel, Resend, Cloudflare, tanto o Turnstile quanto o R2, e Google), o advogado confirma se esse é o mecanismo adequado e se o contrato do provedor o cumpre (não verificado). Os textos públicos dizem apenas que buscamos as garantias previstas na LGPD pelos contratos e pelos termos de tratamento de dados dos provedores, e **não citam resolução**. Essa frase só é verdadeira depois que o dono do site aceitar o termo de tratamento de dados (DPA) de cada provedor (`docs/lancamento.md`).

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

O clube é destinado a pessoas com 18 anos ou mais. Ao aceitar os Termos de Uso e a Política de Privacidade, você declara ter essa idade. O site não verifica a idade de quem cria a conta. Se soubermos que alguém abaixo dessa idade criou uma conta, podemos excluí-la.

Este ponto ainda precisa ser validado por um advogado.

O Entre Capítulos é tratado como agente de tratamento de pequeno porte e, na forma da regulamentação da ANPD para esses agentes, fica dispensado de indicar um encarregado pelo tratamento de dados pessoais. O canal para os titulares falarem com a gente é o e-mail de contato: Felipe.golinus@gmail.com.

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
- Aceite dos Termos: a versão dos Termos de Uso e da Política de Privacidade que você aceitou, a data do primeiro aceite e a do último. O aceite vale também como a sua declaração de ter 18 anos ou mais: o site não verifica a idade. Só você e, ao atender um pedido sobre os seus dados, a administração o veem.
- Registro mínimo de exclusões: quando uma conta é excluída, guardamos por 56 dias apenas um identificador técnico e a data da exclusão, sem nome, e-mail nem texto. Ninguém o vê pelo site.
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
- Registrar o aceite dos Termos de Uso e da Política de Privacidade e a declaração de ter 18 anos ou mais.
- Evitar que contas e dados já excluídos sejam recriados por engano ao restaurar uma cópia de segurança (registro mínimo de exclusões).
- Cumprir obrigações legais e exercer direitos em eventual disputa.

#### 5. Bases legais

As bases legais da LGPD (art. 7º) que justificam cada finalidade:

- Criar e manter sua conta, enviar o código de acesso por e-mail e, se você escolher entrar com o Google, receber seu nome, e-mail e foto de perfil: execução de contrato (art. 7º, V, da LGPD), porque são necessários para oferecer o serviço que você pediu.
- Exibir seu nome e seus comentários e guardar seu progresso de leitura: execução de contrato (art. 7º, V).
- Moderar comentários e proteger a comunidade e o serviço contra abuso, incluindo limites de uso e verificação anti-robô: legítimo interesse (art. 7º, IX), respeitando seus direitos e suas expectativas.
- Cumprir obrigações legais e exercer direitos em eventual disputa: cumprimento de obrigação legal ou regulatória (art. 7º, II) e exercício regular de direitos (art. 7º, VI).

Base legal do registro mínimo de exclusões:

Cumprimento de obrigação legal ou regulatória (art. 7º, II, da LGPD): manter um registro mínimo (só um identificador técnico e a data) para que contas e dados já excluídos por você não sejam recriados ao restaurar uma cópia de segurança.

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

Transferência internacional das cópias de segurança:

Ficam no Cloudflare R2, fora do Brasil. A criptografia é feita antes do envio e a Cloudflare não tem a chave. Buscamos as garantias da LGPD pelos termos de tratamento de dados da Cloudflare.

Este ponto ainda precisa ser validado por um advogado.

#### 7. Por quanto tempo guardamos

Por quanto tempo guardamos cada tipo de dado:

- Conta e perfil (e-mail e nome de exibição): enquanto a conta existir. Ao excluir a conta em "Minha conta", esses dados são apagados; a administração também pode excluir uma conta (por abuso ou a pedido da pessoa), com o mesmo efeito.
- Comentários: enquanto a conta existir ou até você excluir o comentário. Ao excluir, o texto é substituído por um aviso e o original deixa de ser guardado. Comentários removidos pela moderação ficam guardados, sem exibição pública, até a exclusão da conta de quem os escreveu ou até você pedir, pelo e-mail de contato, que o texto seja apagado antes.
- Progresso de leitura: enquanto a conta existir. Para quem não tem conta, por até 1 ano no próprio navegador (cookie).
- Registros técnicos e de segurança: mantidos pelos provedores por períodos definidos por eles, em regra curtos, e pelo prazo que a lei exigir.
- Pedidos de privacidade enviados por e-mail: pelo tempo necessário para atender e comprovar o atendimento.
- Cópias de segurança: as mantidas pelo provedor do banco de dados e as cópias criptografadas que guardamos no Cloudflare R2 podem conter os dados por um período limitado depois da exclusão, até a cópia expirar.
- Aceite dos Termos (a versão aceita, a data do primeiro aceite e a do último, que valem também como a declaração de ter 18 anos ou mais): enquanto a conta existir. Ao excluir a conta, o aceite é apagado.
- Registro mínimo de exclusões (identificador técnico da conta e data da exclusão): 56 dias, o mesmo prazo das cópias de segurança semanais, e depois é apagado.

Este ponto ainda precisa ser validado por um advogado.

Guardamos cópias de segurança criptografadas do banco de dados, para recuperar o site se houver uma perda de dados. Elas podem conter dados que você já excluiu, como comentários e contas apagados, até que cada cópia expire e seja descartada. Por isso, excluir um comentário ou a conta apaga o dado do banco de dados do site, mas não das cópias de segurança já feitas.

Por quanto tempo guardamos as cópias de segurança:

As cópias criptografadas no Cloudflare R2 são mantidas por 14 dias (as diárias) e 56 dias (as semanais) e depois descartadas. Até lá podem conter dados que você já excluiu. Se o provedor do banco de dados mantiver cópias próprias, elas seguem o prazo dele.

Você pode excluir seus comentários que estejam visíveis ou em análise, quando quiser, no próprio comentário ("Excluir meu comentário", embaixo dele, na página da sessão). Comentários removidos pela moderação não aparecem mais no site, e o texto deles só deixa de existir quando a conta é excluída; se quiser que um deles seja apagado antes, peça pelo e-mail de contato. As respostas de outras pessoas a um comentário excluído deixam de aparecer no site, mas continuam guardadas até a exclusão da conta de quem as escreveu.

"Excluir minha conta", em Minha conta, apaga o seu perfil, o seu e-mail, os seus comentários (e as respostas que outras pessoas escreveram a eles), o aceite dos Termos e o seu progresso de leitura. A exclusão da conta não tem volta.

Caso haja a restauração de um backup, mantemos um registro mínimo, seguro e inacessível ao público (apenas um identificador técnico e a data) com o único objetivo de garantir que contas e dados já excluídos por você não sejam recriados acidentalmente. Esse registro é mantido por 56 dias, o mesmo prazo das cópias de segurança semanais, e depois é apagado.

Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.

O registro das ações da administração guarda só os identificadores internos das contas. Quando uma conta é excluída, as linhas sobre ela (e as em que ela foi quem fez a ação) continuam, ligadas só a esse identificador, que já não corresponde a nenhum perfil, sem nome, e-mail nem texto.

Por quanto tempo guardamos o registro das ações da administração: A DEFINIR. Este ponto depende de análise jurídica.

#### 8. Seus direitos (LGPD, art. 18)

A LGPD garante que você peça, a qualquer momento: confirmação de que tratamos seus dados; acesso aos dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados fora da lei; portabilidade; eliminação dos dados tratados com o seu consentimento; informação sobre com quem compartilhamos os dados; informação sobre a possibilidade de não dar consentimento e suas consequências; e a revogação do consentimento.

Como exercer, na prática:

- Editar o seu nome: em Minha conta (menu da conta, no topo do site).
- Baixar uma cópia dos seus dados: em Minha conta, "Baixar meus dados" (um arquivo com o seu perfil, e-mail, todos os seus comentários, o seu progresso e o seu aceite dos Termos).
- Excluir um comentário que esteja visível ou em análise: "Excluir meu comentário", embaixo dele. Para um comentário removido pela moderação, peça pelo e-mail de contato.
- Excluir a sua conta: em Minha conta, "Excluir minha conta". Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.
- Pedir uma cópia dos seus dados ou a exclusão da conta pelo e-mail de contato: a administração confirma que o pedido vem do e-mail cadastrado na conta e atende pelo painel, com a mesma cópia e a mesma exclusão de "Minha conta". Cada uma dessas ações fica registrada.
- Qualquer outro pedido (por exemplo, confirmar o tratamento, corrigir algo que você não consegue editar ou pedir informações): escreva para Felipe.golinus@gmail.com, a partir do e-mail cadastrado na conta.

Prazo para responder aos pedidos:

Respondemos aos pedidos em até 15 dias, contados do recebimento. Acessar seus dados, corrigir seu nome e excluir sua conta você faz na hora, em "Minha conta"; as contas da equipe do clube têm uma etapa a mais para a exclusão (veja "Seus direitos").

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

Podemos atualizar esta política. A data da última atualização é 6 de outubro de 2026.

### Termos de Uso

*As regras de convivência e de uso do Entre Capítulos.*

#### 1. O que é o Entre Capítulos

O Entre Capítulos é um blog e clube de leitura de Agatha Montinelli. Ela lê um livro por vez e publica sessões de leitura, que são relatos curtos sobre grupos de capítulos. Quem entra no clube pode conversar sobre cada sessão nos comentários, com controle de spoiler por capítulo.

#### 2. Sua conta

Você pode ler as sessões públicas sem conta. Para comentar, é preciso entrar com um código enviado por e-mail ou, quando disponível, com a conta Google.

O clube é destinado a pessoas com 18 anos ou mais. Ao aceitar os Termos de Uso e a Política de Privacidade, você declara ter essa idade. O site não verifica a idade de quem cria a conta. Se soubermos que alguém abaixo dessa idade criou uma conta, podemos excluí-la.

O aceite (a versão destes Termos e a data) fica registrado enquanto a sua conta existir. Sem o aceite você pode ler as sessões, mas não pode comentar. Se estes Termos mudarem, pedimos um novo aceite.

Você escolhe o nome que aparece nos seus comentários, que é público. Cuide do acesso ao seu e-mail: quem o controla consegue entrar na sua conta. Você pode trocar o nome, baixar os seus dados e excluir a conta em Minha conta.

Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.

Ao excluir a sua conta ou um comentário, o dado é apagado do banco de dados do site, mas pode continuar por algum tempo em cópias de segurança criptografadas, até elas expirarem. Os detalhes estão na Política de Privacidade.

#### 3. Combinados da comunidade

- Marque os spoilers: Se o seu comentário fala de capítulos à frente, marque até qual.
- Discordar é bem-vindo: Com carinho. Critique ideias, nunca pessoas.
- Sem autopromoção: Links de venda e divulgação são removidos pela moderação.
- Todo ritmo vale: Quem está atrasado é tão parte do clube quanto quem adiantou.
- Conteúdo adequado: Sem conteúdo sexual explícito nem palavrões pesados; a moderação pode remover comentários que descumpram os combinados.

Os primeiros comentários de cada pessoa, e os que têm link, passam por uma análise da moderação antes de aparecer. A moderação pode remover comentários que não respeitem estes combinados.

#### 4. O que você escreve

O que você escreve nos comentários continua sendo seu. Ao publicar, você autoriza o site a exibir o seu comentário (com o seu nome de exibição) na página da sessão, para qualquer visitante.

Você é responsável pelo que escreve. A moderação pode remover um comentário a qualquer momento.

O Entre Capítulos não se responsabiliza pelo conteúdo gerado pelos usuários (comentários), sendo a responsabilidade civil e penal exclusiva de seus autores.

O site cumpre ordem judicial específica de remoção de conteúdo.

Você pode excluir seus comentários que estejam visíveis ou em análise, quando quiser, no próprio comentário ("Excluir meu comentário", embaixo dele, na página da sessão). Comentários removidos pela moderação não aparecem mais no site, e o texto deles só deixa de existir quando a conta é excluída; se quiser que um deles seja apagado antes, peça pelo e-mail de contato.

#### 5. Filtro de spoiler

O filtro de spoiler é uma cortesia de leitura: ele cobre os trechos e comentários que falam de capítulos à frente do que você marcou como lido, mas não é uma garantia. O texto coberto continua na página e pode aparecer por falha, por engano de quem comentou ou quando você escolhe mostrá-lo.

#### 6. Disponibilidade

O site é oferecido como está, sem garantia de que estará sempre disponível ou livre de erros. Podemos mudar, suspender ou encerrar partes do site.

#### 7. Seus dados

O tratamento dos seus dados pessoais está descrito na Política de Privacidade.

#### 8. Mudanças nestes termos

Podemos atualizar estes termos. A data da última atualização é 6 de outubro de 2026.

#### 9. Contato

Dúvidas sobre estes termos: Felipe.golinus@gmail.com.

#### 10. Foro

Fica eleito o foro da Comarca de Sinop/MT para dirimir quaisquer dúvidas ou litígios decorrentes destes Termos, renunciando as partes a qualquer outro, por mais privilegiado que seja.

## (f) Campos validados, campos de proposta e campos pendentes

Cada campo preenchido de `src/content/legal-config.ts` tem um destes comentários: `// VALIDADO pelo advogado` (informado pelo dono do site) ou `// PROPOSTA: validar com advogado`. A política só mostra o aviso "ainda precisa ser validado" nos pontos de proposta.

**Validados pelo advogado (4):**

- `legalBases`: as bases legais de cada finalidade.
- `requestDeadline`: prazo de 15 dias para responder aos pedidos dos titulares.
- `dataProtectionOfficer`: a dispensa do encarregado como agente de tratamento de pequeno porte, com o e-mail de contato como canal (referências: Resolução CD/ANPD nº 2/2022, sobre os agentes de pequeno porte, e Resolução CD/ANPD nº 18/2024, sobre o encarregado).
- `backups.retention`: retenção das cópias de segurança, 14 dias (diárias) e 56 dias (semanais).

**Preenchidos como proposta (8):**

- `minimumAge`
- `regions.cloudflareTurnstile`
- `regions.google`
- `regions.cloudflareR2`
- `internationalTransfer`
- `retention`
- `backups.internationalTransfer`
- `deletionRegistry`

**Ainda "A DEFINIR":** `audit.retention`

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
- Motor de censura de palavras (etapa 8h, NÃO implementada, prevista para depois do lançamento): ocultaria palavras inadequadas a menores de 18 anos em todo o conteúdo dinâmico para quem não tem a idade verificada, inclusive visitantes.
- Verificação de idade opcional (etapa 8i, NÃO implementada, prevista para depois do lançamento): CPF e data de nascimento, conferidos à mão só pela administração, criptografados, apagados na decisão e fora das cópias de segurança.

## (h) Perguntas para o advogado

1. Bases legais: as quatro propostas (execução de contrato, legítimo interesse, obrigação legal e exercício regular de direitos) servem para cada finalidade? O legítimo interesse (moderação, limites de uso e verificação anti-robô) exige registro da avaliação?
2. Retenção e guarda de registros de acesso: quais prazos e quais registros precisamos guardar ou podemos descartar, inclusive os que os provedores mantêm, e o que dizer sobre as cópias de segurança?
3. Quem é o controlador: os dois donos do site em conjunto, uma pessoa, ou uma empresa? Isso muda o texto e a responsabilidade?
4. Regime de agentes de tratamento de pequeno porte: o site se enquadra, e isso dispensa ou simplifica alguma obrigação?
5. Termos de Uso: responsabilidade pelo conteúdo dos comentários, limitação de responsabilidade e foro.
6. Retenção de comentários removidos pela moderação: guardar o texto original até a exclusão da conta é adequado, e qual a melhor forma de atender o pedido de apagar antes?
7. Cópias de segurança (Cloudflare R2): qual a base legal e o mecanismo de transferência internacional para guardar um dump criptografado fora do Brasil, e como conciliar o direito de exclusão com dados que continuam nas cópias até expirarem? (A retenção de 14 dias para as diárias e 56 dias para as semanais já foi validada.)
8. Contas da equipe: a exclusão só depois de retirar o papel de equipe, a pedido por e-mail, está de acordo com os direitos do titular?

## (i) Perguntas da segunda rodada

Sobre a gestão de membros pela administração (etapa 8f): o que a administração passou a poder ver, fazer e registrar sobre as pessoas. O texto de `/privacidade` já descreve esses pontos; o prazo de retenção da auditoria (`audit.retention`) está "A DEFINIR".

1. Retenção da auditoria: por quanto tempo guardar as linhas de auditoria das ações da administração sobre pessoas (`audit.retention`, hoje "A DEFINIR")? O que justifica o prazo e como ele se concilia com a eliminação de dados quando a conta é excluída?
2. Identificadores de quem agiu e de quem sofreu a ação depois da exclusão: as linhas de auditoria sobre uma conta excluída (e as em que ela foi quem fez a ação) continuam ligadas só ao identificador interno (uuid), sem nome, e-mail nem texto. Esse identificador ainda é dado pessoal? Ele também aparece nas cópias de segurança, nos registros da Vercel (`/painel/membros/<uuid>`) e nos 8 primeiros caracteres do nome do arquivo de dados. Precisa ser tratado na política e nos prazos?
3. A administração vendo e-mail e último acesso: a administração vê o e-mail completo, o último acesso e o provedor de login de qualquer pessoa, para suporte e pedidos da LGPD, depois de um clique e com registro de cada vez que são mostrados. Já a lista de membros mostra o e-mail mascarado (primeira letra e domínio) e a busca por e-mail exato confirma se existe uma conta com ele, e esses dois usos NÃO são registrados. Qual a base legal adequada, o texto da política basta, esses dois usos sem registro são aceitáveis ou devem ser auditados, e é preciso limitar quem tem o cargo de administração ou registrar a finalidade de cada consulta?
4. Suspensão de comentários: a administração pode suspender os comentários de uma conta, sem motivo, prazo nem aviso além da mensagem no campo de comentário. Isso é uma sanção que exige aviso prévio, motivo, prazo ou canal de contestação? Precisa constar nos Termos de Uso?
5. Leitura de e-mail por função do projeto gerenciado: o e-mail é lido da tabela de contas do Supabase (provedor gerenciado) por funções do banco, executadas com o papel dono das funções, e o uso é registrado só pelo nosso próprio registro. Isso muda o papel do Supabase como operador, ou exige alguma cláusula ou aviso? E como descrever o caso em que o projeto gerenciado não permite essa leitura?
6. As linhas de auditoria sobre a pessoa (mudança de cargo, suspensão, consulta ao e-mail pela administração) fazem parte do direito de acesso? Devem constar na exportação dela, com ou sem o nome de quem agiu?

## (j) Perguntas da terceira rodada

Sobre as adequações legais (etapa 8g): a idade mínima de 18 anos (decisão do dono do site; o advogado validou 16), o aceite dos Termos com a declaração de idade, o registro mínimo de exclusões, o foro e as duas funcionalidades planejadas e **não implementadas** (a censura de palavras e a verificação de idade). Reúne também as perguntas abertas da primeira rodada que mudaram de forma.

1. ECA Digital (Lei 15.211/2025): a lei se aplica ao clube, que é um blog e clube de leitura com comentários, sem fins econômicos e sem CNPJ? O que ela exige de nós e o que muda se se aplica? A decisão atual do dono do site é exigir 18 anos ou mais.
2. Verificação de idade planejada (opcional, NÃO implementada): a pessoa informaria o CPF e a data de nascimento; só a administração (nunca a moderação, e ninguém valida o próprio pedido) os conferiria à mão; os dados seriam criptografados na aplicação, apagados na decisão (aprovar ou recusar), expirariam em 30 dias se pendentes e ficariam fora das cópias de segurança, restando só o resultado da decisão, a data e quem decidiu. Isso atende como mecanismo confiável de verificação? Qual a base legal e a retenção adequadas para o CPF? (Limite conhecido: a conferência manual mostra que o CPF e a data existem e coincidem, não que quem enviou é o titular.)
3. Censura de palavras para quem não verificou a idade (NÃO implementada): ocultar palavras inadequadas a menores de 18 anos em todo o conteúdo dinâmico, para qualquer pessoa sem a idade verificada, inclusive visitantes, é uma medida de mitigação aceitável?
4. Foro e relação de consumo: a cláusula que elege o foro da Comarca de Sinop/MT vale diante de uma relação de consumo, em que o consumidor pode propor a ação no próprio domicílio? Precisa de ressalva ou de outra redação?
5. Art. 15 do Marco Civil da Internet (guarda de registros de acesso por 6 meses): confirmar que, sem CNPJ e sem fins econômicos, o art. 15 não se aplica. Hoje o site não guarda IP por conta própria (só os provedores guardam registros técnicos, no prazo deles). Quando houver CNPJ ou fins econômicos, o ponto será reavaliado com o advogado.
6. Base legal do registro mínimo de exclusões e do aceite dos Termos: o registro mínimo (identificador técnico e data, por 56 dias) está descrito como "cumprimento de obrigação legal" (art. 7º, II); essa é a base adequada, ou seria o legítimo interesse (art. 7º, IX)? E o aceite dos Termos, que guarda só a última versão aceita, a data do último aceite e a do primeiro (sem histórico), basta como prova do aceite e da declaração de idade?
7. Idade mínima de 18 anos: o advogado validou 16, e a mudança para 18 é decisão do dono do site por causa da ECA Digital. O texto atual basta? O que muda se uma conta de menor for identificada (art. 14 da LGPD)?
8. Declaração de idade: a caixa obrigatória no primeiro acesso (e ao aceitar uma nova versão), sem verificação, basta como declaração? Ela precisa de algum registro além da versão e das datas do aceite?
9. Transferência internacional: confirmar, para cada provedor (Supabase, Vercel, Resend, Cloudflare, tanto o Turnstile quanto o R2, e Google), se o mecanismo é a Resolução CD/ANPD nº 19/2024 (cláusulas-padrão contratuais) e se o texto "buscamos as garantias previstas na LGPD por meio dos contratos e dos termos de tratamento de dados dos provedores" é verdadeiro e suficiente depois que o dono do site aceitar o termo de tratamento de dados (DPA) de cada um.

## (k) Mudanças dos Termos

Versão atual dos Termos: `2026-10-06.2` (`TERMS_VERSION`, em `src/content/legal/version.ts`; a data é a de "última atualização" do texto e o sufixo ".2" distingue duas versões do mesmo dia). Quem aceitou uma versão anterior vê o aviso "Atualizamos os Termos de Uso e a Política de Privacidade" e pode continuar lendo e comentando; o aviso só pede um novo aceite, sem bloquear (do código). Uma verificação automática garante que o texto dos Termos e dos combinados nunca muda sem a versão subir.

- **2026-10-06**
  - Etapa 8g: idade mínima de 18 anos, com a declaração no aceite (o site não verifica a idade); aceite registrado enquanto a conta existir.
  - Responsabilidade do usuário pelo que escreve, cumprimento de ordem judicial específica de remoção e foro da Comarca de Sinop/MT.
- **2026-10-06.2** (atual)
  - Nova regra nos combinados da comunidade, "Conteúdo adequado": "Sem conteúdo sexual explícito nem palavrões pesados; a moderação pode remover comentários que descumpram os combinados." (texto ditado pelo dono do site; validar com o advogado).
  - Os combinados deixaram de ser editados na página Sobre: vivem em código (`src/content/legal/community-rules.ts`), versionados junto com os Termos. A seção "Combinados da comunidade" de `/termos` lista as cinco regras.
