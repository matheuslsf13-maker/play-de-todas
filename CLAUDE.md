# Play de Todas — guia rápido do projeto

App do campeonato de **beach tennis** feminino da **V3 Arena**, jogado toda
**segunda às 20h**. Monta duplas equilibradas, lança placares, fecha o dia e o
mês, e mostra rankings e estatísticas. Tudo é operado principalmente **pelo
celular**.

**Antes de mudar regra do campeonato, algoritmo de duplas ou o "quem está em
quadra", leia [`DECISOES.md`](DECISOES.md)** — ele guarda o que já foi medido e
descartado, para não refazer discussão encerrada.

## Stack

React 18 + TypeScript + Vite 5. Sem router (o estado das abas fica no `App.tsx`).
PWA (manifest + service worker). Português do Brasil em toda a interface.

## Comandos

```bash
npm run dev      # servidor local em http://localhost:5173
npm run build    # tsc -b + vite build (use antes de commitar)
npx tsc --noEmit # só a checagem de tipos
```

## Mapa do código

```
src/pages/       telas: Play.tsx (a maior), Ranking.tsx, Stats.tsx, Players.tsx,
                 Checkins.tsx (contas, dias, arenas, caixa)
src/lib/         regras: pairing (fila de partidas e grupos), scoring,
                 streaks (status 🔥), stats, poster (imagens de fechamento),
                 roster (importar lista), emQuadra (horários locais), store,
                 checkins (cota, saldo, relatórios), xlsx (escritor de .xlsx)
src/data/        armazenamento: localRepo (navegador) e supabaseRepo, com fila
                 de escrita otimista que sobrevive a refresh (queue.ts)
src/config.ts    URL e chave pública do Supabase (NUNCA a secret/service_role)
supabase/*.sql   migrações, rodadas na ordem numérica no SQL Editor
```

⚠️ Duas colunas do banco têm nome enganoso, mantido para não migrar dados:
`matches.round` é a **posição na fila** (não existe mais rodada) e
`sessions.rounds` é o **total de partidas do dia**.

`hasSupabase` decide qual driver é usado. Escrita exige login; leitura é pública.

## Regras do campeonato (não invente, elas são específicas)

- Partida até 4 pontos, sem empate. Pontos = games do vencedor − do perdedor
  (mínimo 1). Quem perde não pontua.
- **Não há rodadas.** O play é uma **fila de partidas**; cada quadra que vaga
  puxa da fila a partida cujas quatro meninas estão livres, dando preferência a
  quem está fora há mais tempo (`proximasDasQuadras`).
- Rodízio completo: cada uma faz dupla com cada uma das outras exatamente uma
  vez. **Todas jogam o mesmo número de partidas.** Quando a conta não fecha
  (grupos de 6, 7, 10, 11), algumas duplas repetem — escolhidas para que cada
  jogadora repita a mesma quantidade (`repeticoesPorJogadora`). **Quem enfrenta quem também é escolhido**, sempre pela dupla que menos
  se enfrentou até ali — o alvo é espalhar, não zerar (é impossível zerar).
- **Dois formatos**, escolhidos ao criar o play: `todas` (rodízio único) e
  `grupos` (o mesmo rodízio dentro de grupos formados por nível, grupo 1 com as
  mais bem pontuadas). Nos grupos os pontos continuam **individuais** e o
  ranking do dia é **um só** — mas o **pódio é um por grupo**. No fim do play a
  organizadora escolhe se gera o texto e a arte de **todos os grupos ou de um
  só** (chips "Tudo / Grupo 1 / Grupo 2…" no modal do ranking do dia), e os dois
  saem carimbados com o grupo. O status de **cada** medalhista aparece no texto
  e na imagem.
- **Status 🔥**: mantido terminando o play no **pódio do dia** (top 3; nos
  grupos, o top 3 **de cada grupo**, nunca mais que metade do grupo —
  `vagasDoPodio`). Faltar zera o status, mesmo com vida. Escada em
  `src/lib/streaks.ts`, de
  🔥 *Em chamas* (2) até 👑💎🌟 **Duquesa da V3** (8+). No fim do mês a jogadora
  escolhe **usar** (vira pontos, zera) ou **preservar** (segue e ganha 1 vida).
- **O mês fecha na mão**, no botão "🏁 Finalizar o mês" do Ranking (dá para
  reabrir). A premiação acontece no último play do mês, antes de o calendário
  virar.
- **A força é visível** (`src/lib/forca.ts`, aba “💪 Força” em Stats, na ficha da
  jogadora e na linha dela em Meninas). É o mesmo Elo que sempre montou os
  grupos e as duplas — só que agora com um número e um nível na tela. A escala
  mostrada é a clássica, **1500 no meio**, e isso importa: o Elo é **soma zero**,
  então a média do grupo não se move e as faixas continuam querendo dizer a mesma
  coisa no ano que vem. As faixas (±25 / ±75) saem de uma temporada simulada de
  12 sextas com 16 jogadoras, que espalhou o grupo de −107 a +91. Abaixo de
  `JOGOS_PARA_FIRMAR` a nota sai marcada como **provisória**, e quem nunca jogou
  fica fora da lista.
- **A dupla tem força própria** (`forcaDeDuplas`, aba “🤝 Dupla”). Não é a média
  das duas — essa é só o **ponto de partida**. A partir dela, cada partida
  **daquela dupla** move a nota pela fórmula do Elo, então `nota − base` é o
  **entrosamento**: duas medianas que se acham em quadra rendem mais do que a
  soma das notas diz, e isso não aparece na nota individual de ninguém.
- **O entrosamento entra no balanceamento** (`ajusteDeEntrosamento` →
  `ScheduleOptions.entrosamento` → `forcaDuo`). Escolher quem enfrenta quem
  usando só a média individual ignorava que certas duplas rendem acima disso. Só
  entram duplas com `JOGOS_PARA_ENTROSAMENTO`+ jogos juntas: com duas ou três
  partidas o número é ruído, e ruído no confronto piora o equilíbrio.
- **O ranking zera todo mês, o histórico não.** A força que equilibra as duplas e
  divide os grupos sai de `ratings()`, que é um **Elo**: cada partida move a nota
  conforme quem estava do outro lado, então **vencer quem está melhor rende muito
  mais** do que vencer quem está pior. Não é o ranking do mês (senão o primeiro
  play do mês sairia desequilibrado) e não é média de pontos, que não sabe de quem
  você ganhou — e por isso quebrava no modo em grupos.
- **No `grupos-duplas` quem decide o dia é a DUPLA.** A fase de grupos só forma as
  duplas e **não pontua** — nem no dia, nem no mês (`pontuaveis`); o Elo continua
  contando essas partidas, que aconteceram e só não dão ponto. O pódio é 🥇 campeã,
  🥈 vice e 🥉 a melhor semifinalista, e o 🔥 segue esse mesmo pódio.
  ⚠️ **O ouro e a prata saem da FINAL, nunca da conta de vitórias**
  (`DuplaDoDia.medalha`): com bye a vice chega à final com as mesmas vitórias da
  campeã e **mais pontos**, porque jogou uma partida a mais — o desempate por pontos
  invertia o pódio, em 6% dos plays.
- **O bye paga pontos** (`pontosDeBye`). Quem foi bem nos grupos passa direto de uma
  rodada e jogava **uma partida a menos**, terminando o mês atrás de quem precisou
  jogar para chegar no mesmo lugar da chave. O bye paga o que uma vitória daquela
  rodada pagou **na média**: nem menos, que puniria quem foi bem, nem mais, que faria
  valer a pena não jogar. Não vira partida — bye não tem adversária, então não mexe
  no Elo, no retrospecto nem na força da dupla.
- **Grupo é por força; empate é sorteio; e a organizadora tem a última palavra.**
  `formarGrupos`/`gruposEquilibrados` ordenam pela força, e quem está **empatada**
  (toda estreante entra com a mesma nota) é **embaralhada antes** (`filaPorForca`) —
  sem isso o desempate era a ordem da lista de presença, e refazer o play dava
  sempre os mesmos grupos, com estreantes no grupo forte por ordem alfabética.
  No cartão dos grupos dá para **tocar numa menina e movê-la** (`movidas`, por cima
  do sorteio; um grupo nunca fica com menos de 4) e **sortear de novo**. Cada
  chip mostra a nota e o cabeçalho a média do grupo.
- **A força inicial é escolhida no cadastro** (`players.forca_inicial`, script 13).
  O padrão é **1500, o meio da escala — não a média das cadastradas**: o Elo é
  soma zero, então a média fica em 1500 sozinha enquanto todas partirem dali. Dar
  outro ponto de partida é contar ao app o que ele ainda não sabe; depois disso as
  partidas mandam do mesmo jeito, e o histórico é **recalculado a partir do novo
  ponto** (`ratings()`), por isso o campo continua editável no perfil.
- **O ranking do DIA é por vitórias; o do MÊS, por pontos** (`sessions.criterio_dia`,
  script 14). Ganhar 5 de 6 apertado vale mais no dia do que ganhar 3 atropelando;
  os pontos só desempatam. O critério fica **gravado no play**: os antigos (sem
  valor) seguem por pontos, para um pódio já anunciado nunca mudar, e todo play
  novo nasce `vitorias`. O 🔥 e o "dia vencido" seguem o critério do play.
- **Ninguém emenda três, e repetida vai para o fim** (`EstadoDaFila`,
  `custoNaFila`, `ordemExata`). A próxima partida é escolhida olhando o que sobra:
  primeiro a pergunta "existe ordem em que ninguém emende 3?" (busca podada, até 16
  pendentes), depois a melhor ordem geral; com duas quadras livres, a simulação do
  resto é exata **por grupo** — as seguidas contam por grupo, e cada quadra roda uma
  partida por vez, então um grupo não mexe na sequência do outro. Uma dupla que já
  jogou hoje só entra de novo quando não há outra. **Grupo de 6 é montado em três
  quartetos** (`rodizioDeSeis`): o rodízio geral de 6 *nunca* admite ordem sem 3
  (medido: 0 de 40); os quartetos, que são o grupo menos um dos 3 pares que repetem,
  admitem sempre. Medido em 30 noites sem intervenção: 6, 7, 8, 9 numa quadra e
  6+7 em duas → **máximo 2 em todas**; 7+7 em duas → 3 em 6 de 30. Antes, 6+7 tinha
  alguém emendando 3 em 29 de 30 noites (e 4 em uma).
- **Refazer a fila nunca some com uma dupla e completa até o plano, nunca além**:
  a dupla que sobra sem adversária joga contra qualquer dupla livre do grupo
  (marcada 🔁); depois, enquanto houver **quatro abaixo de `jogosDoRodizio`**, entra
  uma partida com as quatro que menos jogaram — o teto é o do plano, então a noite
  **nunca fica maior** do que nasceu. Medido: 7 com troca na 6ª → 14 partidas, 8 cada
  (era 11, de 6 a 7). Em 14/09 o refazer tinha deixado Izabelle + Karla sem jogar e o
  grupo de 6 a 8. Troca **entre grupos** ainda desequilibra (quem entra fica com uma a
  mais no grupo dela): o Trocar mostra o mesmo grupo primeiro e avisa nas outras.
- **O empate no fim é configurável** (`sessions.desempate`, `src/lib/desempate.ts`).
  São **três modos**, e o que muda é o que acontece no `alvo-1`x`alvo-1` (o 3x3):
  `alvo` (quem chegar primeiro leva), `vantagem` (“só vai a 2”, sem teto) e
  `vantagem-tie7`/`vantagem-tie10` (vai a 2 até o `alvo`x`alvo`, e dali um tie
  decide — o **único modo com teto**). **O tie sempre vai a 2** (7x5 vale, 7x6
  não): é regra, não pergunta. **Só a vantagem muda o que dá para lançar**, porque
  é a única em que a vencedora passa do alvo; com tie o placar em games não muda.
- **Colar a lista do grupo** (`ImportarLista`) serve **duas** telas, pelo `modo`:
  em `play` marca presença; em `cadastro` (aba Meninas) só cria quem falta. E os
  **ícones da lista do WhatsApp são descartados** (`ICONES`, em `roster.ts`) — saem
  **antes** da numeração, senão um “✅ 3 - Bia” esconde o “3 -”.
- **Quem paga define quem entra** (`src/lib/mensalidade.ts`). Quatro categorias:
  - **📅 Mensalista** — liberada enquanto `players.pago_mes` for o mês de hoje.
    A regra é **derivada do calendário**: na virada do mês ela volta a aparecer
    devendo **sozinha**, sem rotina para rodar, esquecer ou rodar duas vezes.
  - **🎟️ Avulsa** — crédito de **uma** participação, gasto ao finalizar o play.
  - **🤝 Convidada** — não paga e nunca é bloqueada; dois plays seguidos acendem
    um **alerta**, porque quem decide se aquilo virou mensalista é a organização.
  - **🎫 Isenta** — não paga e **nunca alerta**. É o padrão aqui: enquanto a
    organização não disser o contrário, ninguém é barrado. **Se o grupo não cobra,
    deixe todo mundo isenta e o portão some.**
  Trocar de categoria **zera o pagamento**. Na hora de escalar, tocar em quem
  está devendo abre o `ResolverCadastro`, que confirma o pagamento ou corrige a
  categoria ali e já escala — quase todo bloqueio é cadastro errado, e mandar a
  pessoa até Meninas perderia a lista montada. O botão “Todas” e a **lista colada**
  também respeitam o portão.
- **Play avulso** (`sessions.ranked = false`): conta no histórico e na força,
  mas **não soma no ranking do mês nem mexe nas sequências**. Serve para o jogo
  fora de calendário que não é o campeonato.
- **✅ Check-ins** (`src/lib/checkins.ts`, scripts 15 a 18): a planilha da
  organizadora. **A cota é por arena e vem do plano** (`checkin_planos`, script 18):
  Wellhub Gold dá 12 na V3 e 12 na GW (não aceita Itaparica); Gold+ e TotalPass dão
  12 em cada uma das três (`cotas` = `{local_id: n}`, ausente = não aceita; os
  planos e as cotas se editam em ⚙️). As **aulas cobram a cota do local onde são
  feitas** — `consumoDasAulas`: 1/semana = 8, 2 = 12, 3 = 16 (`4 × (n + 1)`) — e
  ficam na conta como `aulas [{local_id, por_semana}]`; `disponibilidade` é por
  conta **e por local**, e avisa quando as aulas passam da cota ou o plano não aceita
  a arena. **O que passa da cota tem destino** (`AulaDaConta.excedente`): outra conta
  da menina (o Matheus cobre os 4 das 3 aulas da Beatriz — vira `complemento` na conta
  dele, naquele local), **outra arena da mesma conta** (`'local:<id>'`, só entre arenas
  com a mesma `checkin_locais.afiliacao`, script 19: V3 e Itaparica se cobrem, a GW não
  divide com ninguém — os 4 que não cabem na V3 do Matheus saem da Itaparica dele) ou
  `'dinheiro'` (não consome nada); sem destino, aviso. Em cada arena a ordem é:
  complementos recebidos → plays já lançados → aulas da própria conta (só o que
  sobrou; o resto vai para o destino) — assim um play na V3 empurra mais aula para a
  Itaparica em vez de deixar a V3 negativa; o
  excedente é calculado em **duas rodadas**, porque o que uma conta cobre das outras
  só se sabe depois de olhar todas (`testa_disp.mjs` no scratchpad tem os cenários).
  **E a conta faz um check-in por dia**: somando as arenas, o teto do mês é
  `diasNoMes` (30/31) — três arenas de 12 "dariam" 36, mas o que sobra em cada
  arena é `min(cota − uso ali, dias − uso total da conta)`. Conta **sem plano** vale
  como antes: 12 em qualquer arena. A conta **principal** de cada menina existe na tela sem estar gravada
  (`contaPrincipalVirtual`, id `principal:<player_id>`) e só vai ao banco quando
  editada; `checkins.conta_id` **nulo** quer dizer "a principal dela". A **conta de
  outra pessoa** (o marido) é uma conta secundária: a arena vê o **titular**
  (`nomeDoTitular`), o play continua da menina. Tudo é **derivado**: devido =
  0 se não compareceu, senão o preço combinado ou o do dia pelo modo; saldo = pago −
  devido (positivo é crédito). *Regularizado* só com pagamento **e** check-in
  confirmados, como na planilha. **Dinheiro só logada**: `checkin_pagamentos` e
  `caixa` têm RLS `to authenticated` também no `select`, porque a chave anon é
  pública — e por isso `statusDoCheckin` recebe `logada`. A receita dos plays é a
  soma dos pagamentos; no `caixa` entram só receitas extras e saídas. Nada no banco
  recusa o que a tela aceitou (sem unique dia+atleta, FKs `set null`): uma escrita
  recusada travaria a fila de envio para sempre; a tela abre o lançamento existente
  em vez de duplicar, e só deixa **desativar** conta/arena com histórico.
  **O crédito não é gravado: é o saldo que sobrou** (`extratoDaAtleta`, o saldo
  correndo na ordem do calendário). O play seguinte usa o crédito sozinho — o campo
  "Pagou" já vem com `devido − crédito` — e quem deve vê o aviso com o total para
  quitar; apagar um dia devolve o que ele consumiu, sem nada para desfazer. Mexer
  no saldo fora de um play é um **acerto** (`checkin_acertos`, script 17): `valor`
  é o efeito no saldo e `dinheiro` diz se entrou/saiu dinheiro de verdade — só
  esses contam na receita; perdoar uma dívida não conta.
- **"⏳ Quem não chegou"** (no card das quadras): quem está na lista mas ainda não
  apareceu é marcada e o app **pula as partidas dela** ao sugerir a próxima — para a
  escolha ela conta como se estivesse em quadra (`indisponiveis`), e a previsão da
  fila deixa as partidas dela **para o fim**. Desmarcou, ela entra na frente: é quem
  está há mais tempo sem jogar. Fica só no aparelho (`CHAVE.ausentes`), como a hora
  de início. Se ela **não vem**, o caminho é o Entra / sai, não este.
- **Quadra a mais no meio do play** ("➕ quadra" no card das quadras): só muda
  `sessions.courts`; a quadra nova aparece livre e já puxa a próxima da fila. Tirar
  só a última, e só vazia — reduzir com jogo em andamento sumiria com ele da tela.
- **Partida iniciada**: quem está em quadra agora é definido pelo botão
  "▶️ Partida iniciada"; lançar o placar encerra. Isso alimenta o aviso de
  quadra parada e a troca de jogadoras.
- A lista "Próximas na fila" usa `ordemPrevista()`, não a ordem gravada: mostrar
  a ordem de geração colocava na frente quem tinha acabado de sair da quadra.
- **O placar só é lançável depois de "▶️ Partida iniciada"** (botões de "venceu"
  desabilitados). Corrigir placar é o ✏️ da lista "Já jogadas", que abre um modal
  e **preserva o `ended_at`** — não devolve a partida para a fila.

## A tela é um celular na beira da quadra

- **A ordem de criar o play** é quem joga → **formato** → detalhes. O formato é a
  escolha que muda tudo o que vem depois, então tem cartão próprio logo abaixo das
  participantes, como **lista vertical** (nomes longos num `segmented` quebram no
  meio das palavras a 375px).
- `.field > span` vale para `label` **e** `div`. Enquanto só `label.field > span`
  tinha estilo, metade do formulário saia com rótulo pequeno em caixa alta e a
  outra metade com texto corrido do corpo.
- **Nome de pessoa não quebra no meio**: o `span` de cada jogadora é `nowrap` e
  carrega o `+` da frente, então a linha só parte entre os dois nomes da dupla.
- **Separador entre links é desenhado (`::before`), não digitado**: como texto, o
  `·` conta como palavra e vai parar sozinho no fim da linha.
- **Nada de `(s)`**: use `plural()` de `src/lib/types.ts`.
- **A aba aberta fica guardada** (`play-de-todas:aba`, e a seção dos Check-ins em
  `play-de-todas:checkins-secao`): o app recarrega ao voltar para a tela, e cair
  sempre no Ranking obrigava a navegar de novo.

## Convenções

- Comentários e nomes em português, sem acento em identificadores.
- Código sem dependências novas sempre que der; o bundle é servido para
  celulares em quadra.
- Rodar `npm run build` antes de commitar; o push na `main` publica o site.
