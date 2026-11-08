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
npx tsc --noEmit # só a checagem de tipos (= npm run typecheck)
VITE_SUPABASE_URL=local VITE_SUPABASE_ANON_KEY=local npm run dev  # modo local: sem
                 # essas variáveis o app usa o Supabase REAL de src/config.ts
npm test         # testes das regras puras (tests/*.test.ts, node:test via esbuild)
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
liga.config.ts   as três ligas: Play de Todas (feminino, schema public, raiz do
                 site) e Play de Terça (masculino, schema masculino, /masculino/).
                 Mesmo código; escolhida no build por VITE_LIGA. Migração nova
                 que cria/altera tabela: rodar 27-liga-masculina.sql de novo
                 (ou repetir o ALTER em masculino.*), senão o masculino quebra.
liga/            textos do masculino: o código fica no feminino e o build
                 masculino troca as strings EXATAS de liga/masculino.json
                 (liga/traduzir.ts). Texto novo de tela com "jogadora/menina/
                 ela" → incluir no JSON (scripts/liga/extrair.mjs lista).
                 Logo e ícones do masculino: public-masculino/ (gerados de
                 liga/masculino/logo.svg por scripts/liga/gerar-logo.mjs).
                 Cores: bloco [data-liga="masculino"] no fim do styles.css.
```

⚠️ Duas colunas do banco têm nome enganoso, mantido para não migrar dados:
`matches.round` é a **posição na fila** (não existe mais rodada) e
`sessions.rounds` é o **total de partidas do dia**.

`hasSupabase` decide qual driver é usado. Escrita exige login; leitura é pública.

## ⛔ Só o Play de Todas está no ar (dono, 08/11/2026)

O deploy (`.github/workflows/deploy.yml`) publica só o feminino. O Play de Terça (`/masculino/`) e o Play Mista
(`/mista/`) saíram do ar: nesses endereços fica `public-fora-do-ar/` (página que leva para a raiz e um `sw.js` de
saída que apaga o app antigo do celular). O código das três ligas e os schemas `masculino`/`misto` no banco
continuam (nada foi apagado); para voltar, recolocar os dois builds no workflow. As seções abaixo sobre o
masculino e o misto descrevem esse código parado.

## 👫 Play Mista (`/mista/`, `VITE_LIGA=misto`, schema `misto`, script 29)

- **Não tem jogadores próprios**: lê os `players` do `public` (♀) e do `masculino` (♂)
  (`jogadoresDosDoisCampeonatos` em `supabaseRepo.ts`) e marca `genero` só em memória.
  Cadastrar no misto pede ♀/♂ (`EscolherGenero`) e grava no campeonato certo; apagar e
  juntar ficam bloqueados. Sem a aba Check-ins. O schema `misto` só tem as tabelas do play.
- **Força própria do misto, puxada UMA vez** (`misto.atletas`, script 30): ao abrir o misto
  logada, quem ainda não tem linha ganha uma com a força do campeonato daquele momento (a
  "foto", em `forca_inicial`; `upsert` com `ignoreDuplicates`, nunca regrava). Dali em diante
  é o **mesmo cálculo** dos outros plays (`calcularElo`: Glicko, queda por falta, pausa,
  2 faltas fora do ranking), só que com os plays do misto. O campeonato não mexe mais no
  misto, e o misto nunca mexe no campeonato. Sem foto ainda (visitante, antes de alguém
  logado abrir), vale a força de casa de agora.
- **Duplas do rodízio escolhidas a cada play** (`sessions.duplas_mistas`): 🔀 mistas
  (padrão) ou 🎲 livres. Mistas = quadrado latino (`rondasMistas`/`rodizioMisto` em
  `pairing.ts`): cada homem joga uma vez com cada mulher, todos com o mesmo número de
  jogos (n de cada: n par → n jogos; n ímpar → cada um repete UM parceiro, n+1). Precisa
  do mesmo número de cada gênero; senão o play sai livre (a tela avisa). Grupos mistos:
  cada gênero dividido por nível, metade de cada (`formarGruposMistos`). Refazer e
  `precisaRefazer` só contam duplas H+M (`genero`). Trocar jogador mostra o mesmo gênero
  primeiro. Duplas fixas no misto: `montarDuplasPorNivel(..., genero)` prioriza H+M.
- **Inatividade do misto é do misto**: inativar, pausar e a força inicial do perfil gravam em
  `misto.atletas` (`savePlayer` no misto manda só o cadastro — nome, apelido, foto, grafias —
  para o campeonato; nunca `forca_inicial`/`active`/`pausas`/`reativada_em`, exceto ao criar
  alguém novo pelo misto). Juntar e apagar continuam só no app do campeonato. Status: 💎 **Craque do Play** (4) e 👑 **MVP da V3** (5).
- **A força do misto aparece antes do 1º play misto**: quem tem jogos no campeonato dela
  (`jogos_de_casa`, só em memória) entra no ranking da força e na média (`mediaDaForca`).
- **`Modal` é desenhado no `<body>`** (`createPortal` em `ui.tsx`): aberto de dentro do
  cabeçalho (sticky, camada própria), ficava atrás da barra de abas.
  **Com janela aberta o fundo não rola** (`useTravarFundo`, classe `janela-aberta` no
  `<html>`, `overscroll-behavior: contain` e `86dvh` no `.modal`): no celular o arraste
  passava da janela para a tela de trás (perfil da dupla, 06/11/2026). Travar só o `html`:
  travar o `body` (altura 100%) jogava a página para o topo; `position: fixed` mexeria no
  scrollY e o topo que encolhe piscaria. Teste fora do repo: `pdt-teste/modal-rolagem.mjs`.
- **A raiz sempre abre o Play de Todas** (dono, 08/11/2026): o "🔁 Trocar de play", a tela "Qual play
  você quer abrir?" e o redirecionamento pela escolha guardada (`play:app`) saíram de `main.tsx` e do
  cabeçalho, junto com o botão Instalar e o "tudo salvo" (`components/TrocarDePlay.tsx` e
  `InstalarApp.tsx` ficaram no repo, sem uso, para voltar se o dono quiser). O masculino e o misto só
  abrem pelo endereço (`/masculino/`, `/mista/`). O **cabeçalho é o antigo cartão do logo** da tela
  inicial (logo 64 px, `hero-nome`, "mais que um play"), nas cores do tema e da liga; o cartão saiu do Ranking.
- Textos: `liga/masculino.json` (plural neutro) + `liga/misto.json` por cima. Logo:
  `node scripts/liga/gerar-logo.mjs misto` (de `liga/misto/logo.svg` para `public-misto/`).

## 📋 Lista de presença por link (só o Play de Todas, script 31)

- **A atleta, sem login, coloca o nome pelo link `?lista=<código>`** e o **banco** dá a posição
  (ordem de chegada no servidor, trava por lista). Confirmada × suplente é **calculado**
  (`dividir` em `src/lib/listaDePresenca.ts`: as `vagas` primeiras ativas), nunca gravado.
- **Tabelas** (`public` só): `listas`, `lista_nomes` (saída suave: `saiu_em`/`saiu_por`, nunca
  delete; `ordem` da organizadora por cima da `chegada`) e `lista_aparelhos` (hash do código do
  celular; **ninguém lê**, só as funções). **Visitante só escreve por `lista_colocar` e
  `lista_tirar`** (`security definer`); a logada escreve direto e troca por `lista_trocar`.
- **Fora do `AppData` e do canal geral**: `useLista` (`src/lib/useLista.ts`) carrega a lista e ouve
  um canal **próprio** filtrado por ela (`repo.ouvirLista`, rajada = 1 leitura em 300 ms). Escritas
  da organizadora **esperam o banco** (sem fila offline): a ordem é do servidor.
- **O link passa por cima da escolha de play** (`main.tsx`: não redireciona; grava "Play de Todas"
  só se o aparelho não tinha escolha) e a página aparece **no lugar da aba** (`App.tsx`); tocar numa
  aba, "Agora não", colocar ou tirar o nome volta à tela inicial e limpa o `?lista=`.
- **Celular**: `CHAVE.aparelho` (UUID), `listaNome` (último nome), `listaMeus` (`{lista: nome}`).
  "Tirar meu nome" só aparece no nome colocado por este celular (WhatsApp/Safari com armazenamento
  separado: pede à organização).
- **A atleta escreve nome e sobrenome** (`validarNomeDaAtleta`: 2+ palavras de 2+ letras; pedido do dono
  em 06/11). A organizadora ainda adiciona um nome só; o banco aceita uma palavra (burlar a tela só
  perde o vínculo automático).
- **Cada nome**: vinculado = foto + 💪 força (em avaliação: `🔍 n/3` para visitante); sem vínculo = só
  o texto. **Vínculo automático** (banco e `vinculoAutomatico`): grafia = nome/apelido/alias de **um**
  cadastro só (as duas "Bruna" não vinculam). Ao vincular, a grafia vai para `players.aliases`.
  Botão de um toque na linha só com `sugestaoSegura` (≥ 0,93, sem empate, nome de 2+ palavras); o
  menu do nome mostra até 4 palpites.
- **Organizadora** (mesma página, `canEdit`): copiar atualização, mensagem do link, adicionar à mão,
  ⭐ garantir vaga (só nome adicionado à mão), ⇅ trocar de lugar, tirar (mensalista: "avisou com
  24h?" → `avisou_24h`), editar, fechar/reabrir (prazo vencido pede prazo novo), **montar play**
  (fecha a lista; confirmadas sem vínculo travam; o Novo Play abre com elas pelo portão da lista
  colada e grava `listas.session_id`). Criar: "📋 Criar lista de presença por link" no Novo Play;
  as **mensalistas em dia** (`mensalistaEmDiaNoPlay`: pagou o mês do play, ou play até o dia 5 com o
  mês anterior pago; ativas, sem pausa) entram garantidas, **por força**.
- **Apagar lista** (D39): só lista sem play (`podeApagar`); a janela mostra os avisos (`avisosAoApagar`)
  e o banco leva nomes e códigos de aparelho pela cascata do 31 (`repo.apagarLista` confere 1 linha e
  `session_id` nulo). `salvarLista` só cria com `nova`; sem ela é update por id (nunca recria apagada).
  Depois: toast "Lista apagada" e a aba Play.
- **Trazer os nomes da apagada** (D41): a cópia fica **só neste celular** por 30 min
  (`CHAVE.listaApagada`, `copiaDaApagada`/`copiaValida`); o criar mostra a opção **desmarcada**;
  marcada, entram um por vez na ordem antiga; as mensalistas que faltam (e não tinham saído) entram
  depois da última garantida (`juntarSemRepetir`).
  Quem veio pelo link perde o "Tirar meu nome" (o código do aparelho ficou na apagada).
- **Rótulos**: "🔒 Fechar a lista agora" / "🔓 Reabrir a lista" (linha inteira); "Fechar" sozinho é
  só o das janelas.
- **Lotada e aberta**: "entre como suplente" no cartão e na página (`soSuplente`). **Datas**: prazo ≤ play
  e play no futuro (`problemaDaLista`), mensagem embaixo das datas e botão travado.
- **Apagar play/lista desfaz o financeiro** (D45, `desfazerDoPlay`/`lancadosPelaLista` em
  `pagamentoNaLista.ts`): dia do play com lançamentos, o 💰 da lista, o "pago" da avulsa e o crédito gasto
  no Finalizar (diário `creditos`). Play montado pela lista: a janela pergunta manter (volta aberta, sem
  vínculo) ou apagar a lista junto. Não há mais "📋 Listas de presença" na aba Play.
- **Na tela inicial** a lista aparece no **cartão do momento** (D42, abaixo).
- **Play de Terça / Play Mista**: `TEM_LISTA = false` — nada aparece e nada é consultado. **Não**
  rodar o 27/29 por causa do 31. Sem o 31 no feminino, a leitura tolerante esconde tudo
  (`avisosDoBanco.tabelas.has('listas')`) e o botão de criar avisa qual script rodar.
- Horas no fuso fixo −03:00 (`quando`, `quandoComData`, `inicioEmSaoPaulo`). Testes:
  `tests/listaDePresenca.test.ts`. Prova do SQL: fora do repo (`pdt-teste/sql-teste/`).

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
- **Status 🔥** (`src/lib/streaks.ts`): sobe a cada play terminado no **pódio** — em
  `todas` o top 3 do play; em `grupos` o pódio **de cada grupo** (nunca mais que metade
  do grupo, `vagasDoPodio`; o ranking do dia é só informativo); em `grupos-duplas` e no
  campeonato as 3 duplas medalhistas do mata-mata (de **cada categoria**). Play com
  **"🧊 sem status"** (`sessions.conta_status = false`, script 26, `contaNoStatus`) não existe
  para o 🔥: o pódio não soma e quem fica fora ou falta não perde. É separado do avulso; sem
  valor gravado segue o `ranked` (avulso antigo = sem status).
  Escada: 🔥 Em chamas (2) → ⚡ Imparável (3) → 💎 Rainha do Play (4) → 👑 **Duquesa da
  V3** (5, `MAX_STREAK`). **Não vale pontos e não tem vida** (desde `STATUS_NOVO_DESDE`
  = 06/10/2026): segue atravessando o mês e zera fora do pódio ou faltando. No 5º pódio
  ela vira Duquesa (`streaks.duquesas`): ganha um **presente misterioso** (não revelar o que é),
  o status zera e o **nome fica dourado com 👑 para sempre** (`useStore().duquesas` →
  `NomeClicavel`, classe `nome-duquesa`). **Não existe Hall das Duquesas** (o card saiu do Ranking em 03/11/2026): o que fica é o nome dourado. O perfil mostra as conquistas (`conquistas`:
  maior nível e quantas vezes chegou em cada um). Antes da data vale a regra antiga
  (usar = pontos no fechamento, preservar = 1 vida): os +3 de setembro ficam.
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
- **🔍 Força em avaliação nos 3 primeiros plays** (`emAvaliacao`/`PLAYS_EM_AVALIACAO` em
  `forca.ts`, desde 03/11/2026): até completar 3 plays jogados (noites, não partidas), a nota
  fica **oculta para quem não é admin** — ranking da força (Stats e o card da tela inicial),
  ficha (sem número, nível nem gráfico), +/− do 🕑 Histórico, cartão dos grupos do play
  ("🔍" no lugar da nota e "o grupo dela é a recomendação do app") e a força da **dupla** com
  ela (a dupla parte da média das duas: mostraria a dela). A admin (logada) vê o número com
  "🔍". O app usa a nota normalmente para grupos e duplas. Motivo: no 1º play a nota da novata
  anda mediana 21 e até 55 (a veterana ~7), e as meninas reclamavam de quem "acabou de chegar
  e já tem força grande". No misto, quem tem jogos no campeonato não entra. O multiplicador do
  passo foi medido (×1,65/×2/×3: precisão 0,864 → 0,850/0,851/0,840) e o dono preferiu não
  mexer. `tests/emAvaliacao.test.ts`.
- **Medir antes de mexer na força** (`RegraDaForca` em `stats.ts`, padrão = a regra de hoje):
  `node scripts/medir-forca.mjs` mede cada variante no histórico real; `--simular` em
  temporadas simuladas; `--par "a" "b"` compara duas com intervalo. Em 12/10 o passo por
  confiança (ganho ≠ perda) foi medido e não ganhou da regra atual (DECISOES.md).
- **Glicko: nota + incerteza** (desde 13/10/2026, `REGRA_DA_FORCA.glicko` em `stats.ts`):
  cada menina tem a nota e o quanto o app ainda não a conhece (60 para quem chega, desce a
  cada partida até 35, e **cresce** 10 por raiz de semana parada). O passo de cada uma sai
  da incerteza dela e dos games da partida — a novata mexe ~3× mais que a veterana no mesmo
  jogo, quem volta de um sumiço mexe mais — e a incerteza das outras três amortece (jogo
  com novata ensina menos). Não é soma zero (a média é calculada). Medido contra o Elo de
  passo 24: novata 5 a 7 pontos mais perto da força real nos 2 primeiros plays, ordem geral
  igual; curva de aprendizado, peso pelos games e histórico inteiro não ganharam (DECISOES.md).
- **Sem o passo que acelera** (desligado em 13/10/2026, `REGRA_DA_FORCA.aceleraDesde = null`;
  as funções `proximaSequencia`/`passoDaSequencia` ficam para medir). Ele dava passo maior a
  quem engatava surpresas boas, e o extra saía de todas do play para a média ficar em 1500 —
  o dono não quis tirar de quem não teve nada a ver; sem ninguém pagar, a força ficou menos
  precisa (quem vem mais vezes acumulava força só por vir). Sem aceleração, cada partida é
  soma zero e a precisão é a de antes. Vale também para os plays desde 07/10.
- **A média é calculada, não suposta** (`mediaDaForca`): a média de hoje de quem já jogou
  (1498 em 13/10 — a queda por falta tira pontos que não vão para ninguém). É o meio dos
  níveis (`nivelDeForca(nota, media)`), da linha "média" dos gráficos, do nível da novata e de
  onde a queda por falta puxa. Novata sem nível escolhido começa na média do dia em que estreia.
- **Quem falta perde força, devagar** (`calcularElo` em `stats.ts`): 1ª falta nada; da
  2ª seguida em diante, por play do ranking e aumentando a cada falta: acima da média de hoje
  −10%, −30%, −50% e daí −70% da distância até ela (mín. 2; era 10/15/20… até 30%, lento
  demais: em 09/10 quem tinha 1 play e 4 faltas ainda caía no grupo forte); abaixo −2, −3, −4, depois
  −5, até −20 na sequência. Voltou, zera. Faltar a um play avulso ou 🧊 sem status não
  conta, mas quem veio nele zera as faltas; quem nunca
  jogou não cai. A ficha e as listas mostram "−N por K faltas seguidas".
- **Pausar uma menina** (`players.pausas`, `reativada_em`, script 24; `pausaNaForca`):
  quem vai ficar um tempo fora é **pausada na aba Meninas** (o Stats só mostra): sai do ranking da força,
  o perfil continua aberto e **as faltas continuam baixando a força**, como as de todo
  mundo (a pausa só tira do ranking). **As duas pausas são a mesma pausa com causas diferentes: jogar
  qualquer play depois do dia da pausa (avulso e sem status inclusive) tira dela** (`pausaAberta`). Tocar nela ao montar um play pergunta "despausar e colocar no play?" (a lista
  colada pergunta uma vez por todas; o "Todas" deixa as pausadas de fora). Além disso,
  com **2 faltas seguidas** ela sai do ranking da força sozinha (a queda gradual continua)
  e volta ao jogar, ou no "▶️ Despausar" da aba Meninas (o mesmo botão para as duas pausas).
  Despausar ao montar o play só vale **quando o play é criado** (`pausas[].play` guarda o
  id dele): desistir de montar ou **apagar o play** devolve a pausa sozinha (`pausaAberta`).
  Não confundir com **inativa** (o "Inativar" da aba Meninas, `players.active`): essa some
  da hora de montar o play. Na aba Meninas, **tocar na linha abre uma folha**
  (08/11/2026) com Editar perfil, foto, ⏸️ Pausar / ▶️ Despausar (quem já está pausada pelas faltas
  não tem Pausar), Inativar, Juntar e, num grupo à parte, Remover; o "confirmar pagamento" também
  fica na folha. A aba tem filtros, numa folha própria aberta pelo "⚙️ Filtros" (08/11/2026) (ativas, inativas, ⏸️ pausadas — na mão ou pelas faltas,
  📉 faltando, 💸 devendo, sem jogos, sem foto, cadastro, nível) e ordena por nome, força
  ou faltas; os filtros ficam guardados no aparelho (`play-de-todas:meninas-filtro`).
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
- **🏆 Campeonato = `grupos-duplas` com categorias** (`src/lib/campeonato.ts`,
  `session.categorias`, script 21). Um play só, dividido **pela força** em categorias
  A, B, C… (quantas quiser) e, dentro de cada uma, em grupos **por nível** (grupo 1 com
  as mais fortes); a organizadora move qualquer menina para qualquer categoria/grupo
  antes de começar. `session.groups` continua uma lista só (A-G1, A-G2, B-G1…) — por
  isso fila, rodízio e “quem está em quadra” não mudaram; sem `categorias` é uma
  categoria só (o grupos + duplas de sempre). Cada categoria tem **quadras fixas**
  (padrão: o que os grupos dela enchem juntos) e anda no seu ritmo; quando uma termina
  **tudo**, as quadras dela vão para a que tem mais jogo (`quadrasEfetivas`, ou a
  escolhida em `quadras_cedidas`). Duplas **1ª com 1ª** (`duplasDaFase2`), chave, pódio,
  🔥 e texto/arte **por categoria**; para o app é **um** play (ninguém “falta” na
  categoria em que não estava — era o defeito de criar 3 plays no mesmo dia).
  **Classificação do grupo** (`classificarGrupo`): vitórias → pontos → saldo de games →
  **confronto direto** (só entre duas: quem venceu mais vezes a outra **neste play**, sem
  olhar as parceiras — o "só quando justo" saiu em 20/10, quase nunca decidia) → **desempate em
  quadra** (simples 1x1 ou par ou ímpar, `desempates_grupo`, vale só para o mesmo
  conjunto de empatadas). **Nunca ordem alfabética.** **Pontos do mês por colocação**
  (`pontuacao`, padrão 16/12/10/8/6/3 = campeã, vice, 3º, semifinal, quartas ou antes,
  fase de grupos; editável): pela diferença de games a vice podia somar mais que a
  campeã. Com `pontuacao` nenhuma partida pontua por games e o bye não paga; sem ela
  (plays antigos) tudo segue como era. Os plays **novos** de grupos + duplas também
  usam a tabela e grupos por nível (antes: grupos equilibrados, que faziam da 1ª de
  cada grupo uma superdupla). O ranking do dia mostra a **fase de grupos** (classificação
  e duplas “se acabasse agora”) — antes ficava vazio até o mata-mata.
- **🔗 Duplas fixas desde o início** (`src/lib/duplasFixas.ts`, `sessions.duplas_definidas`,
  script 28): a dupla joga a noite toda junta. É o campeonato com **uma categoria = um
  grupo**: o app monta as duplas **por nível** (forte com forte; no misto, mulher i com
  homem i e a sobra do mesmo gênero, avisada), divide em categorias pela força da dupla
  (padrão: uma categoria a cada 4 duplas), e a organizadora troca pessoas de dupla e
  duplas de categoria na mão. Fase 1 = **todas contra todas** entre as duplas da
  categoria (não pontua); `classificarDuplas` (vitórias → pontos → saldo → confronto
  direto → desempate em quadra, gravado pela 1ª de cada dupla) monta a chave
  (`gerarChaveDasDuplasFixas`); dali em diante é o mata-mata do campeonato. Trocar
  jogador = substituir **na dupla** (mescla `substituir`, nas partidas pendentes); o
  Entra/sai some nesse modo e o refazer só repõe confronto dupla × dupla que falta.
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
  do sorteio; **livre**, mesmo deixando um grupo com menos de 4 no meio da arrumação: o grupo
  mostra ⚠️ e o "criar o play" recusa dizendo qual grupo) e **sortear de novo**. Cada
  chip mostra a nota e o cabeçalho a média do grupo.
  **Com o play já criado**, enquanto nenhuma partida foi iniciada nem lançada, o cartão
  "👥 Grupos" tem **"✏️ Arrumar grupos"** (`ArrumarGrupos`/`salvarGrupos` em Play.tsx): o
  mesmo toque-e-move, num rascunho; o Salvar recusa grupo com menos de 4, grava os grupos e
  refaz a fila do zero (como o "Refazer tudo") e anota no diário (`tipo: 'grupos'`). A fila
  nova é **conferida antes de gravar** (`src/lib/arrumarGrupos.ts`: cada uma em um grupo só,
  partidas só com gente do grupo, todas com `jogosDoRodizio` jogos, toda dupla do rodízio — H+M
  no misto equilibrado —, total = `partidasDoRodizio`); se não fecha, nada é gravado. Se
  alguém entrou/saiu em outro celular no meio da arrumação, o Salvar recusa.
  `tests/arrumarGrupos.test.ts` simula a noite inteira depois de grupos mexidos. Antes,
  mudar alguém de grupo era apagar e criar o play de novo. Depois do 1º "▶️ Partida
  iniciada" o botão some (o caminho é o Entra / sai); nas duplas fixas não aparece.
- **🕑 Histórico** (`components/HistoricoDePartidas.tsx`): na ficha da jogadora e na da dupla,
  as partidas da mais recente para a mais antiga, agrupadas por play (V/D da noite no
  cabeçalho, "avulso" marcado), 2 plays de cara e mais 4 a cada "ver mais" (08/11/2026; as tabelas "Com quem/Contra quem já
  jogou" mostram 5 linhas e "Ver todas"). Segue o período do Stats.
  Cada partida mostra **quanto mexeu na força** (verde/vermelho; da jogadora, ou da
  **dupla** na ficha da dupla) e o cabeçalho do play o total da noite
  (`forcaNasPartidas` em `stats.ts`, `forcaDasDuplasNasPartidas` em `forca.ts`). O
  arredondamento é na nota acumulada: as partidas somam o total do play, e o total é a
  mesma variação do gráfico (`tests/forcaNoHistorico.test.ts`). O gráfico, ao tocar num
  ponto, também mostra "−15 de força em relação ao play anterior".
- **🆕 Novata** (`novatas(data, sessionId?)` em `stats.ts`): quem não tem partida jogada fora
  do play. Aparece ao montar o play (chips, grupos, divisão do campeonato) e, com o play
  **aberto**, nos cartões de partida (`Duo`, via contexto `NovatasDoPlay`) e no cartão dos
  grupos; play finalizado não marca. Fica fora do texto e da arte. A nota 1500 não dizia
  isso: veterana também pode estar em 1500.
- **A força inicial é escolhida no cadastro** (`players.forca_inicial`, script 13).
  O padrão é **a média de hoje** (`forca_inicial` nulo = entra na média do dia em que
  estrear). Dar
  outro ponto de partida é contar ao app o que ele ainda não sabe; depois disso as
  partidas mandam do mesmo jeito, e o histórico é **recalculado a partir do novo
  ponto** (`ratings()`), por isso o campo continua editável no perfil.
  O nível vem **em três toques** (`NIVEIS_RAPIDOS` em `components/ForcaInicial.tsx`:
  🌱 iniciante 1440 · ⚖️ intermediária 1500 · 📈 avançada 1560), com o número ajustável
  embaixo — um número era difícil de chutar e quase ninguém usava. Dá para **cadastrar na
  tela de montar o play** ("➕ Nova atleta", `components/NovaAtleta.tsx`): nome, quem paga e
  o nível, e ela já entra no play (com o portão do pagamento, como todas).
  **Ao montar o play, toda atleta nova sem nível é perguntada, uma de cada vez**
  (`components/NivelDaNovata.tsx`, `semNivel` em Play.tsx): quem está no play, nunca jogou
  e tem `forca_inicial` nula — venha da lista colada, do toque no nome ou do "Todas" — abre
  "🆕 Atleta nova (1 de N)" com o mesmo nível em três toques; "Salvar e ir para a próxima",
  "Pular (fica na média)" ou "Pular todas". Espera as outras janelas fecharem (a lista
  colada termina antes), não pergunta de novo nesta tela quem já respondeu (`nivelVisto`) nem
  quem foi cadastrada pelo "➕ Nova atleta", e o "Criar" espera as respostas: a força da
  novata decide grupo e duplas. No misto, quem tem jogos no campeonato não é perguntado.
- **Empate no pódio se decide na quadra em TODOS os formatos** (`src/lib/desempateDoDia.ts`,
  `empatesNoPodio`/`podiosDoDia` em `streaks.ts`). Empate exato (vitórias, pontos e saldo)
  divide a posição — **nunca ordem alfabética**. Ordem igual à do campeonato: vitórias →
  pontos → saldo → **confronto direto** (só entre duas: quem venceu mais vezes a outra neste
  play, `confrontoDireto`; nos plays desde `CONFRONTO_NO_DIA_DESDE` = 19/10) → quadra. Isso
  vale só para o pódio porque no todas/grupos a colocação não forma dupla; no grupos + duplas,
  campeonato e duplas fixas **todo** empate da classificação vai para a quadra e trava o
  "Montar a chave" até ser decidido. No todas e no grupos, quando o
  empate ainda aberto mexe no pódio (1º–3º, ou as vagas do grupo) e o grupo já não tem partida por jogar, o play mostra o
  card "⚖️ Empate no pódio" (`DesempateEmQuadra`: simples 1x1 ou par ou ímpar), também em play
  já finalizado. Grava em `sessions.desempates_grupo` (grupo = índice em `groups`, 0 no todas),
  vale só para o mesmo conjunto de empatadas e decide ordem, pódio, 🔥 e "dia vencido"; na
  última vaga só a vencedora sobe. Sem desempate, as empatadas sobem juntas (como sempre foi:
  play antigo não muda). O Finalizar avisa, mas não trava.
- **📷 Arte do pódio com a foto da noite** (`buildPosterComFoto` em `poster.ts`, desde
  03/11/2026): no modal do ranking do dia, com **um** grupo escolhido (ou o play todo no
  `todas`), "📷 Tirar foto do pódio" (`capture="environment"`: abre a câmera) ou "🖼️ Foto da
  galeria". A foto vira o fundo (em cima, escurecendo para baixo) e o resultado entra num
  painel de vidro: medalhistas com medalha nas cores das fitas (ouro, prata, laranja), da
  4ª à 6ª em pílulas, título em **Anton** e o rodapé em **Caveat Brush** (`public/fontes`,
  OFL, carregadas só nessa arte). **Desde 06/11/2026** também no grupos + duplas, campeonato
  e duplas fixas (opção `duplas` do `buildPosterComFoto`: cada medalha com os dois nomes e
  "Campeãs do dia"/"Vice-campeãs"/"3º lugar"; no campeonato só com **uma** categoria nos chips)
  e no **fechamento do mês** (Ranking, "📷 Tirar foto"/"🖼️ Foto da galeria" abaixo do 👑;
  "Pódio do mês", top 3 + 4ª–6ª). Os botões são `components/BotoesDeFoto.tsx`. Toda arte com
  foto leva o endereço do site pequeno embaixo da frase (`enderecoDoSite` em `liga.config.ts`:
  domínio + `pasta`, ex. `playdetodas.com.br/masculino`). A arte de sempre (sem foto) continua; nela o nome longo quebra em duas linhas, a inicial ignora
  caractere invisível ("\u2060" colado do WhatsApp) e "1 pt" no singular.
- **"✅ Já jogadas" filtra** (`ListaDePartidas` com `filtravel`): chips por grupo/categoria e
  "🔎 procurar pelo nome" (apelido ou cadastro, sem acento), com o V-D de quem foi procurada.
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
- **Refazer a fila respeita o teto do plano em tudo**: uma dupla que falta só entra
  se as **duas ainda têm vaga** (`resta > 0`); quem passou do plano por uma troca na
  mão não entra em partida nova. A dupla que sobra sem adversária joga contra uma
  rival do grupo com vaga (marcada 🔁; sem ninguém com vaga, uma rival no teto entra
  de novo — a dupla que falta vale mais que a partida a mais); depois, enquanto
  houver **quatro abaixo de `jogosDoRodizio`**, entra uma partida com as quatro que
  menos jogaram. A noite **nunca fica maior** do que nasceu. Medido: 7 com troca na
  6ª → 14 partidas, 8 cada; 21/09 (Beatriz no lugar da Vanessa na 12ª) → 14, 7 cada,
  Vanessa + Maria Paula formada — o refazer antigo dava 15, com Maria Paula em 9. Em
  14/09 o refazer tinha deixado Izabelle + Karla sem jogar. Troca **entre grupos**
  ainda desequilibra: o Trocar mostra o mesmo grupo primeiro e avisa nas outras.
  **A fila se arruma sozinha depois de uma troca** (o banner "a fila desandou" saiu):
  o Trocar jogadora refaz na hora o que falta daquele grupo, mantendo a partida
  trocada. E o refazer (automático ou no botão) **só mexe nos grupos em que a conta
  não fecha** (`precisaRefazer`: alguém fora de `jogosDoRodizio` ou dupla que nunca
  se forma) — grupo certinho fica como está; em 05/10 o Refazer apertado 9 vezes num
  play sem problema desmontou o rodízio de 6 e 14 de 18 meninas emendaram 3.
- **O play tem diário** (`sessions.eventos`, script 20): cada intervenção na mão —
  trocar jogadora, entra/sai, refazer a fila, refazer tudo, abrir/tirar quadra — fica
  anotada com hora, texto pronto e quantas partidas já tinham sido jogadas
  (`comEvento`/`anotar` em Play.tsx), e sai no card "🛠️ Intervenções nesta noite".
  Em 21/09 ninguém sabia dizer quando a troca tinha sido feita; agora o banco sabe.
  E o texto do 🔁 distingue a repetição **do plano** (grupo de 6/7/10/11: "é o que
  deixa todas com o mesmo número") da que **veio de uma troca na mão** ("não estava no
  plano… Refazer a fila compensa"): com diário, é da troca quando a dupla tem quem
  **entrou** numa troca (`EventoDoPlay.entra`) numa das duas partidas; sem diário (play
  antigo), vale o tamanho do grupo. O 🔁 só olha a fase 1 — no mata-mata a dupla é fixa.
  A troca anota no diário por `anotarNoPlay`, que grava **só** `eventos`: regravar a
  sessão inteira a partir da cópia do aparelho desfaria o que outro aparelho mudou.
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
  - **📅 Mensalista** — até novembro/2026, liberada enquanto `players.pago_mes` for o mês de hoje;
    **desde a de dezembro/2026, pela ficha** (seção "📅 Mensalidade" abaixo).
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
  fora de calendário que não é o campeonato. As duas opções (mês e 🔥) aparecem na criação e, com o play
  aberto, no "⚙️ Vale para o mês e para o 🔥?" (`OpcoesDoPlay`, grava só a coluna).
- **💪 Força do play e selos na lista de plays** (`src/lib/selos.ts`, `tests/selos.test.ts`):
  cada play finalizado mostra a média da força **do dia** (antes do play) de quem jogou —
  o número nunca muda depois — e no máximo **um** selo, o mais raro que ele detém agora
  (ordem em `SELOS`: recordes de força e de público, 👑 coroação, zebra, mais forte,
  disputado, ties, casa cheia, estreias, maratona do mês). Empate: fica o mais antigo. O
  líder que já mostra selo mais raro não passa o menor para o 2º. Avulso mostra a força,
  mas não concorre (como no ranking do mês). Uma passada de `calcularElo` (`aoMudar`), por `data`.
  O 💪 e o total do cartão de grupos aparecem para todos, mesmo com alguém 🔍 em avaliação: dá para
  deduzir a nota dela fazendo contas, e o dono decidiu (06/11/2026) que isso não importa.
- **✅ Check-ins** (`src/lib/checkins.ts`, scripts 15 a 19): a planilha da
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
  pública — e por isso `statusDoCheckin` recebe `logada`. Desde o script 23 **todas**
  as tabelas dos check-ins (arenas, contas, dias, check-ins, planos) só se leem
  logada, e as abas **Meninas** e **Check-ins** só aparecem para quem está logada
  (`soAdmin` em `App.tsx`; a aba guardada cai no Ranking para visitante). A receita dos plays é a
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
  **Check-in de crédito** (script 25, `creditosDeCheckin`, `gastaCheckin`): não veio mas
  **fez o check-in no app** (`credito_checkin`) → a arena recebeu, a cota do mês é gasta e
  ela fica com 1 check-in de crédito **naquela arena**; no lançamento seguinte "Usar o de
  DD/MM" (`credito_de`) leva conta e arena do crédito e **não gasta cota**. O relatório da
  arena lista os dois dias ("não veio (vira crédito)" e "crédito do check-in de DD/MM").
  O relatório e a planilha usam o **nome do cadastro**, não o apelido: é o nome que a arena tem.
- **"⏳ Quem não chegou"** (no card das quadras): quem está na lista mas ainda não
  apareceu é marcada e o app **pula as partidas dela** ao sugerir a próxima — para a
  escolha ela conta como se estivesse em quadra (`indisponiveis`), e a fila deixa as
  partidas dela **para o fim**. Desmarcou, ela entra na frente: é quem está há mais
  tempo sem jogar. **Fica no play** (`sessions.ausentes`, script 22), igual em todos
  os celulares — em 05/10 era só do aparelho e o outro celular mostrava outra fila.
  Se ela **não vem**, o caminho é o Entra / sai, não este.
  **Marcada antes de o grupo dela começar, o rodízio do grupo é remontado**
  (`replanejarPelaAtrasada` em Play.tsx, `ScheduleOptions.ausentes` → `custoDaEspera` em
  `pairing.ts`): as partidas sem ela giram entre **todas** as presentes. Em 02/11 a Ana
  Pretti atrasou num grupo de 6; nos quartetos (`rodizioDeSeis`) a única partida sem ela
  tirava também a parceira de par dela — a Wanessa esperou 1 hora (3,3,**0**,3,3 → agora
  2,2,2,3,3). Com atrasada, o grupo de 6 usa o rodízio geral. Desmarcar antes de começar
  volta ao plano normal. Anota no diário e a fila é conferida (`problemasDaFila`).
  **Marcada com o grupo já começado** (D46, `pendentesPelaAtrasada` em `pairing.ts`,
  `replanejarComecado` em Play.tsx): só as **pendentes** mudam (jogadas e em quadra ficam),
  trocando jogadoras entre elas — cada uma fica com o mesmo total, toda dupla que falta ainda se
  forma (as dela, quando chegar), a noite não cresce. Só grava se alguém presente passa a esperar
  menos e o grupo inteiro passa no `problemasDaFila`; senão só empurra as dela para o fim, como
  antes. Desmarcar depois de começar não mexe. Medido: grupo de 6, maior espera de uma presente
  3 → 1 partida; 8, 5 → 3. `tests/atrasada.test.ts`.
- **A fila mostrada é a que acontece** (`src/lib/fila.ts`): `filaPorGrupo` ordena as
  pendentes de cada grupo e a quadra que vaga pega **a primeira da fila do grupo dela
  com as quatro livres** (`proximasPelaFila`). Antes a lista era uma previsão feita de
  um jeito e a quadra escolhia de outro. Medido em `tests/fila.test.ts` (noites
  simuladas): fila furada 0x, e ninguém emenda 3 nos formatos em grupos (igual a
  antes); só "todas com todas" com +16 pendentes perde um pouco (11 em 2 quadras: 6/20
  noites contra 4/20) — a troca aceita por a lista ser a verdade. A escolha na mão
  ("🔀 Trocar por outra partida") fica no play (`sessions.escolhas`, script 22). O
  início guardado no aparelho só vale 3 minutos; depois manda o banco.
- **"⚠️ jogaria a 3ª seguida" conta o relógio** (`seguidasAgora` em Play.tsx, no "🔀 Trocar
  por outra partida"): a sequência é dentro do grupo, mas quebra se entre uma partida dela e a
  seguinte (ou agora) passou mais de ~60% de uma partida (`minutosDaPartida`). Em 02/11, com
  uma quadra a menos e os grupos revezando, o aviso aparecia para quem estava parada havia
  meia hora esperando quadra.
- **Menos quadras que grupos: os grupos revezam sozinhos** (`proximasPelaFila` em `fila.ts`).
  Com mais grupos com partida pela frente do que quadras, a quadra que vaga vai para o grupo
  **sem partida em quadra parado há mais tempo** (fim da última partida dele; quem nunca
  jogou primeiro) — sem "quadra da casa". Em 02/11 (5 grupos de 6, uma quadra
  indisponível) o grupo sem quadra só entrava quando outro não tinha partida e a organizadora
  trocava na mão; medido em `tests/revezar.test.ts`: a maior espera de um grupo caiu de 137
  para 15 min. O campeonato (quadras fixas por categoria) não muda.
- **➕/➖ quadra no meio do play** (D44, `src/lib/quadras.ts`, script 33): o ➕ mostra um selo
  com quantos jogos completos podem entrar agora (some no zero; tocar sem jogo pronto avisa) e
  abre o menor número fechado. O ➖ tira uma quadra **sem jogo em andamento** (a livre de maior
  número, fixa de categoria inclusive); todas em jogo ou só 1 quadra: tremidinha e aviso.
  Mínimo 1. Números físicos em `sessions.quadras_abertas` (`[1, 3, 4]` não renumera); a fila
  manda "abrir/tirar uma", nunca o total. Sem o 33 só tira a última, livre e não fixa.
- **Partida iniciada**: quem está em quadra agora é definido pelo botão
  "▶️ Partida iniciada"; lançar o placar encerra. Isso alimenta o aviso de
  quadra parada e a troca de jogadoras. **O placar guarda o `started_at`** (D43; antes
  gravava null): "em quadra" é **começou E ainda não tem placar** (`!isPlayed(m) &&
  started_at`) — nunca testar só o `started_at`. Voltar para a fila limpa o início;
  partidas antigas têm início nulo.
- A lista "Próximas na fila" é a fila de cada grupo (`filaPorGrupo`), intercalada
  pela posição — não a ordem gravada, que colocava na frente quem tinha acabado de sair.
- **"Como terminou?"** (`ComoTerminou` em Play.tsx): depois de tocar em quem venceu, os
  botões trazem o **placar inteiro, do lado de quem venceu** (`6x0 … 6x4 7x5 6x6 → tie`);
  o do tie mostra o **empate** que levou a ele (com "7x6" parecia que o 7 vinha antes) e
  abre logo abaixo a linha do tie (`7x0 … 7x5 8x6 9x7…`). O ✏️ digita qualquer placar,
  nos games e no tie. Antes eram duas perguntas pelo lado da perdedora. Serve também o
  ✏️ de corrigir. A tela do play mostra quanto falta e a hora prevista do fim, contando o
  mata-mata ainda não montado (`estimativaDaNoite`, `minutosRestantesDaChave`), e um
  "📋 Como vai a noite" recolhido.
- **O placar só é lançável depois de "▶️ Partida iniciada"** (botões de "venceu"
  desabilitados). Corrigir placar é o ✏️ da lista "Já jogadas", que abre um modal
  e **preserva o `ended_at`** — não devolve a partida para a fila.
- **🔓 Reabrir o play para corrigir placar** (play finalizado, logada; `reabrir` em
  Play.tsx): volta o `status` para `open` e anota no diário (`tipo: 'reabrir'`); o ✏️ das
  "Já jogadas" corrige e o Finalizar fecha de novo. Ranking, pódio e força saem do placar,
  então se recalculam sozinhos; o 🔥 só conta play finalizado, por isso enquanto está
  reaberto ele não entra. Se o mês já foi fechado, o confirmar avisa que o ranking final
  muda. O 2º Finalizar **não gasta de novo o crédito da avulsa** (já gasto na 1ª vez;
  gastar comeria o que ela pagou para o próximo play).

## 📅 Mensalidade (desde dezembro/2026, script 34, D47)

- **R$ 180 no Pix, ou R$ 80 + 4 check-ins de R$ 25** direcionados à mensalidade (80 + 4×25 = 180; check-in que
  falta pode virar R$ 25). Valores congelados no cabeçalho `mensalidades` (`MENSALIDADE_PADRAO` sem cabeçalho);
  cada Pix, check-in ou abatimento é uma linha de `mensalidade_itens` com a **data dele** (não a do registro).
  Só logada, só o Play de Todas (a store recusa no masculino e sem o 34).
- **Renovar = pagar os 80 (ou 180) até o dia 5 de M** (`vencimento`, `renovada`): renovada, está em dia o mês
  todo. **Os check-ins de M vão até o dia 5 de M+1** (`prazoDosCheckins`), junto com a renovação seguinte.
  Tudo derivado, sem rotina (`src/lib/fichaDaMensalidade.ts`, `tests/mensalidade.test.ts`): `emDiaNaData` (até o
  dia 5 vale a renovação do mês anterior), `dividaDaMensalidade` (o que falta das fichas iniciadas cujo prazo dos
  check-ins passou). **Dia 6 sem renovar**: joga como avulsa, **sem dívida**, e **cede a vaga** (`perdeuAVaga` em
  `vagasDeMensalista.ts`; o cartão de Meninas lista "não renovaram" com "Passar para avulsa (fim da espera)").
  **Para renovar tem de quitar o que deve da anterior e pagar os 80** (dono, 07/11): devendo check-ins no dia 6,
  não renovou — joga como avulsa e cede a vaga, como quem não pagou. **O Pix de quem deve quita a dívida primeiro**
  (`dividirPix`, a tela mostra a divisão) e o resto vai para a mensalidade escolhida. **Dinheiro pago sem renovar
  vira crédito, não dívida** (`creditoDaMensalidade`; dívida só de ficha renovada): a Ingryd devolve (apaga o Pix) ou
  ele entra no **saldo dos plays** no dia 6 (`acertosDaMensalidade` em `checkins.ts`, calculado, `dinheiro: false`) e
  os avulsos descontam dele. Na rematrícula a ficha mostra a conta antes (`contaDaRenovacao`: quanto do crédito +
  quanto cobrar, com a dívida) e só grava em "Recebi os R$ X — renovar" (acerto −usado + abatimento na ficha + o Pix
  dividido); o "Topou e pagou" faz o mesmo. A receita fica no mês do Pix original. **Passou do dia 5 sem renovar,
  não renova mais pela ficha** (`perdeuEsteMes`: some o ➕ Pix do mês e o aviso manda para a fila), mesmo com
  crédito ou vaga livre: volta só pela fila, e aí o crédito completa o valor.
- **No dia 6 o crédito cobre a dívida sozinho** (`usosDoCreditoNaDivida`): quem renovou e não fechou os check-ins e
  tem crédito (saldo positivo dos plays antes do dia 6, `saldoDosPlaysAntesDe`) tem a dívida coberta — inteira se
  der, senão em parte — e o crédito cai do mesmo tanto. Calculado: na ficha é um abatimento "crédito usado na dívida
  (automático)" (`fichaDe` = `fichaBruta` + esse item) e no saldo um acerto negativo; o Excel segue o mesmo.
- **Falta avisada também na troca de lugar** (script 36, `TrocarDeLugar` em `GestaoDaLista.tsx`): a mensalista que o
  "⇅ Trocar de lugar" tira das confirmadas recebe a mesma pergunta das 24h e a compensação (`useCompensarFalta`,
  `EscolherCompensacao`); voltando às confirmadas, o aviso, a compensação e a substituta são desfeitos. A suplente que
  entra (pela troca ou pelo tirar com aviso) fica com `lista_nomes.substitui` = a mensalista, e o 💰 da lista já lança
  o play dela como substituta. **Sem suplente na hora** (dono, 08/11): o 💰 de quem está nas confirmadas pergunta
  "🔁 Entrou no lugar de X?" para a mensalista que saiu com aviso e ficou sem ninguém (`semSubstituta` em
  `listaDePresenca.ts`); marcado, grava o `substitui` no lançamento e na lista.
- **No play, o 🔁 Entra / sai também** (`FaltaDaMensalistaNoPlay` em Play.tsx): quem sai é mensalista em dia → avisou
  com 24h? → compensação → "a substituta vai pagar? quanto?" (com "Vai fazer check-in": modo check-in sem confirmar,
  a Ingryd confirma e acerta a conta em Check-ins). Grava o lançamento da substituta (`diaDoPlay`, `substitui`).
  **Caixa de eventos da substituta = metade do que ela pagou**, contando o check-in como pago (integral − com
  check-in do dia): R$ 25 no Pix + check-in = R$ 25 para os eventos.
- **📜 Histórico financeiro** (`components/HistoricoFinanceiro.tsx`, só leitura): na ficha ("📜 Histórico") e no
  perfil em Meninas. Mensalidades mês a mês (renovada/quitada/deve/não renovou, Pix, check-ins, crédito) e todas as
  movimentações (Pix e para qual mês, check-in com arena e conta, plays com crédito usado, acertos, crédito que
  cobriu a dívida — uma linha só, pelo saldo), com o crédito depois de cada uma.
  **Nova mensalista da espera** começa a mensalidade do mês ao pagar ("✅ Topou e pagou": 80 ou 180, grava o Pix e
  vira mensalista) ou "Recusou" (sai da fila). **Novembro/2026 é transição** (`MES_INICIAL` = 2026-12; antes vale o
  `pago_mes`; check-in de novembro conta para dezembro).
- **Para qual mês vai o check-in** (`mesSugeridoDoCheckin`): a mais antiga já paga que ainda falta check-in (dívida
  primeiro), senão a do mês da data (quitada ou cheia, a seguinte). A Ingryd registra na **ficha** (`components/FichaDaMensalidade.tsx`, aberta pela linha "📅
  Mensalidade de …" de cada mensalista em Check-ins → Atletas): ➕ Check-in (dia, conta, arena; aviso se a conta já
  tem check-in no dia) e ➕ Pix (vem com o que falta).
- **Quem lê**: lista (pré-incluídas, `ehMensalista`), 💰 (`tipoNaLista`), Novo Play e `situacaoDoAtleta`.
  A mensalista que não está em dia **paga o play como avulsa** (`pago_avulso`: `confirmarPagamento`,
  `pagoAvulsoDaLista`, `consumirAvulsos`), sem gravar `pago_mes`. **Pagou só a mensalidade seguinte** (virou mensalista
  depois do dia 5, quando a ficha já não aceita o Pix do mês): segura a vaga e joga o mês como avulsa, e a tela diz
  "Mensalista a partir de janeiro" em vez de "atrasada" (`comecaNoMesSeguinte`; dono, 08/11).
- **As contagens batem** (08/11): os chips de categoria de Financeiro › Atletas contam e filtram só as ativas (inativas
  ficam em "Todas"); a aba Mensalistas explica embaixo do "N de L" quem mais aparece na lista (não renovaram, ex com
  saldo) e quantas inativas ficam de fora.
- **Check-in da ficha gasta a cota do mês da DATA** e entra no relatório da arena ("mensalidade de …")
  (`disponibilidade`, `relatorioDasArenas` em `checkins.ts`). No dia do play, as mensalistas em dia aparecem
  "📅 … sem cobrança" (derivado) e o Lançar avisa para não cobrar (dívida falsa).
- **Excel**: aba Mensalidades e o Pix no Resumo pelo mês do Pix (`exportarCheckins.ts`). **Aluguel da V3**
  (`src/lib/aluguel.ts`, só cálculo, sem tela): 5% do plano mensal → caixa de eventos; R$ 25 por check-in na V3
  no mês anterior (`checkinsNaArena`: o **uso** de um check-in de crédito não conta de novo).
- Juntar cadastros leva fichas e itens (`juntar_mensalidades` no 34, atômico).
- **Script 35**: aluguel no Caixa (`caixa.plano_mensal/valor_cobrado/checkins_abatidos`; o lançamento é o Pix; a
  economia de 5% vai para o 🎉 caixa de eventos, reserva dentro do saldo, `economiaDoAluguel`/`eventosAcumulado`),
  **substituta** (`checkins.substitui`: metade do valor cheio do dia para o caixa de eventos), **falta avisada** (a
  lista pergunta: R$ 25 de crédito na mensalidade do mês seguinte ou um check-in a menos na que ela está fechando —
  abatimento na ficha, `mesDaCompensacao`), **limite de mensalistas** (`ajustes.limite_mensalistas`, padrão 12) e
  **lista de espera** (`players.espera_mensalista`, ordem do pedido; `vagasDeMensalista.ts`).

## 🗓️ Cartão do momento na tela inicial (D42)

- **Um cartão só acima do ranking** (`components/CartaoDoMomento.tsx`); qual momento vale é
  `momentoDaInicio` (`src/lib/momentoDaInicio.ts`, puro, `tests/momentoDaInicio.test.ts`):
  **ao vivo** (play aberto com partida iniciada/lançada, de hoje −03:00 ou com atividade < 3 h) →
  **lista aberta** → **lista fechada** com o play por vir (até 6 h depois, sem `session_id` e sem play
  na data dela: montado o play, o cartão já é do play — D45) → **play aberto** sem estar ao vivo ("Próximo play", ou "Play em
  andamento" parado de dias atrás) → **pódio da noite** (último play finalizado, até o meio-dia
  seguinte; até 5 grupos e "+N") → nada. Terça e Mista: só ao vivo, play e pódio. **Lista aberta de
  outro play prevalece** até sobre o ao vivo: o play de hoje (ao vivo ou por começar) vira uma faixa
  pequena embaixo dela, que abre o play.
- **Caractere invisível do WhatsApp** (`\p{Cf}`) sai ao salvar (`validarNome`, `limparCadastro` no
  `savePlayer` do store) e na comparação (`normalizar`).
- A lista vem de `repo.listaDoMomento` (aberta, senão a fechada de play nas últimas 6 h) e o canal
  dela move a barra das vagas. Recado só com o nome deste celular (`listaMeus`) ainda ativo.
- **A previsão do ao vivo é a da tela do play**: `src/lib/previsaoDaNoite.ts` serve os dois
  (`tests/previsaoDaNoite.test.ts` prova que a tela do play dá os mesmos números de antes).
  **Divide pelas quadras em uso de verdade** (D43, `quadrasEmUso`): o **pico** da noite, o máximo
  de quadras diferentes com partida numa mesma janela de `max(30, 2 partidas)` min (pelo
  `started_at`/`ended_at`), limitado pelo configurado (e por `quadrasSimultaneas` fora do
  grupos+duplas). Pico, não a janela de agora: pausa e volta escalonada não fazem a previsão
  disparar. Sem dados (sem `agora`, ou as jogadas com início ainda não cobrem uma janela: começo da
  noite, partidas antigas) a conta é a de antes. Não depende da hora de quem olha (Play e cartão
  dão os mesmos minutos). ➕ quadra conta quando a 1ª partida começa nela; tirar quadra vale na
  hora. Em 02/11 (5 no app, 4 de verdade): 75 → 90 min (real 103).
- **Ritmo medido da noite** (`ritmoDaNoite` em `previsaoDaNoite.ts`, 08/11/2026): cada partida jogada com início e
  placar (4 a 60 min) diz quanto levou; a previsão multiplica pela razão medido/calibrado com peso `n/(n+4)` (trava
  0,6–1,8). `restanteDaNoite(..., fator)` com fator 1 = a conta de antes (os testes de equivalência continuam valendo);
  Play e cartão da tela inicial usam o mesmo fator. `tests/ritmoDaNoite.test.ts`.
- **Painel da noite no play rodando** (`components/PainelDaNoite.tsx`): número grande, barra (jogadas, em quadra
  listrada, tracinho do mata-mata), "termina ~HHhMM", "▶️ Rolando há 1h12 · 1ª partida às 20h10" (desde o 1º início; anda sozinho a cada 20 s) e o ritmo; o cartão da quadra mostra "Jogando há 6 min · desde 21h04" (`TempoEmQuadra`); a regra e o ritmo detalhado ficam no "📋 Como vai a
  noite"; Entra/sai e Refazer num grupo "Arrumar a noite". **Numeração da noite** (`ListaDePartidas`, props `antes` e
  `porGrupo`): jogadas pela ordem em que terminaram (não o `round`), a fila continua depois das jogadas, das em quadra e
  das já separadas para as quadras; com chip de grupo, a sequência é a do grupo; no campeonato as jogadas contam por
  categoria. A fila também tem busca pelo nome ("N partidas na fila, a próxima é a Xª").
- A cor do momento só pinta borda, selo, barra e fotos; texto em `--text`/`--muted` (≥ 4,5:1).
  Prints e roteiros fora do repo: `pdt-teste/momento-prints.mjs`, `pdt-teste/momento-toque.mjs`,
  `pdt-teste/momento-ajustes.mjs` e `momento-ajustes-toque.mjs` (prints em `prints/inicio/ajustes/`).

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

- **Financeiro e Meninas carregam à parte** (`lazy` em `App.tsx`, 08/11/2026): só a organizadora usa. Logada,
  os dois são baixados em segundo plano ao abrir o app (o service worker guarda, para abrir sem sinal);
  se faltarem, aparece um aviso no lugar da aba. O **status** da tela inicial é um cartão só: quem está
  em sequência e, recolhido, "Como funciona o status" (`details.status-como`).

- **O voltar do celular fica dentro do app** (`src/lib/voltar.ts`, 08/11/2026): cada troca de aba (e a lista aberta)
  é um passo no histórico e o voltar devolve a aba anterior; janelas (`Modal`) e o play aberto ficam numa pilha
  com um passo só, e o voltar fecha a de cima (`useVoltar`). Só sai do app na primeira tela.
- **Stats › Dupla não leva à ficha individual**: na lista e no stats da dupla (também aberto pela tela inicial) os
  nomes são texto (`ProvedorDePerfil value={null}`); tocar na dupla abre só o stats dela.

## Convenções

- Comentários e nomes em português, sem acento em identificadores.
- Código sem dependências novas sempre que der; o bundle é servido para
  celulares em quadra.
- Rodar `npm run build` antes de commitar; o push na `main` publica o site.
