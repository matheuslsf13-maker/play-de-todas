# 📌 Decisões do projeto — por que as coisas são do jeito que são

Este arquivo guarda o **caminho** até o sistema atual: o que foi testado, o que
foi descartado e por quê. O `CLAUDE.md` diz *como o app funciona hoje*; aqui
está *por que ele funciona assim*.

> Serve para não refazer discussão já encerrada nem "melhorar" algo que já foi
> medido e descartado.

---

## O campeonato

**Play de Todas**, beach tennis **feminino** na **V3 Arena**, **toda segunda,
20h**. A lista de confirmação abre na sexta da semana anterior; R$ 45 por
participação, com check-in por Wellhub/Gympass e TotalPass acertado com a
administradora do grupo.

Não confundir com "Play das Meninas" — esse é um campeonato **concorrente**, e
o nome dele **não pode aparecer em lugar nenhum**. Já apareceu em três: no nome
do repositório (e portanto no link que vai para o grupo), no `package.json` e
nas chaves do `localStorage`. Tudo renomeado para `play-da-sexta`.

O nome já mudou três vezes: era "Play de Sexta" no código enquanto o logo dizia
"PLAY da Sexta" (valeu o logo), e depois o campeonato virou **Play de Todas** e
mudou de dia — de sexta para **segunda**. Por isso o vocabulário das sequências
é **neutro de dia** ("semanas seguidas no pódio", não "sextas"): amarrar o
mini-game a um dia da semana já custou uma rodada de retrabalho.

**O logo novo veio de uma foto de tela**, não do arquivo original. Foi extraído
por código (`PIL`): correção de perspectiva pelos quatro cantos do card,
ponto branco medido no próprio fundo, e o reflexo da tela removido pela regra
"claro **e** sem cor vira branco" — o desenho é saturado ou escuro, então
sobrevive. Ficou bom, mas o teto é o teto: **se aparecer o arquivo original,
vale trocar** (é só soltar em `public/logo.png`).

⚠️ **O logo tem fundo branco e o app é escuro.** Colado direto, vira um
quadrado branco na tela. A solução foi recortar só o emblema circular (a faixa
de ícones do rodapé é ilegível no tamanho que o app usa de qualquer forma) e
deixar o fundo transparente. O emblema traz o próprio fundo — o pôr do sol —
então o "Play" azul-marinho continua legível sobre ele. Funciona em qualquer
cor de fundo.

O arquivo tem 216 KB (o anterior tinha 262 KB). Uma versão paletizada de 41 KB
foi testada e descartada: serrilha o degradê do pôr do sol.

Na arte de fechamento o logo é desenhado a **232px** e não mais que isso — acima
disso a faixa do mês desce e a **coroa do 1º lugar bate nela**.

Duas coisas mudam toda semana e por isso são informadas na hora de criar o play:
**quantas jogadoras vieram** (as meninas decidem durante a semana) e **quantas
quadras** temos.

## Pontuação

Regra do cartaz original, mantida: partida até 4 pontos, sem empate.
`4x0 = 4 · 4x1 = 3 · 4x2 = 2 · 4x3 = 1`. Quem perde não pontua.
Generalizada para partidas até N ("vai até"), mas o padrão é 4.

## Sem rodadas: o play é uma fila de partidas

O play era organizado em **rodadas**, e isso foi removido. Na quadra as partidas
nunca terminam juntas: uma acaba enquanto a outra ainda está rolando, e esperar
a rodada inteira fechar deixava quadra parada de graça.

Hoje o app gera uma **fila** de partidas e, a cada quadra que vaga, escolhe da
fila a partida cujas quatro meninas estão livres (`proximasDasQuadras`).
A coluna `matches.round` virou a **posição na fila** e `sessions.rounds` o
**total de partidas** — os nomes ficaram para não migrar dados existentes.

Duas coisas foram medidas e decidem o desenho atual:

- **A escolha é do conjunto, não quadra por quadra.** Pegar a melhor partida
  para a quadra 1 sem olhar as outras fazia a mesma menina ser sugerida em duas
  quadras ao mesmo tempo (visto no teste com 16 jogadoras). Agora uma busca
  preenche o máximo de quadras possível de uma vez.
- **Quando não dá para preencher, o app fala.** Em vez de sugerir alguém que já
  está jogando, a quadra mostra "nenhuma das N partidas que faltam tem quatro
  meninas livres", lista quem está livre e oferece montar uma partida com elas.

## Duplas: parceira, adversária e descanso

As duplas são montadas pela pontuação acumulada, para os jogos ficarem parelhos.

- O rodízio usa o **método do círculo** (1-fatoração): fixa uma jogadora e gira
  as outras, gerando "rondas" de duplas em que ninguém se repete. Toda
  combinação de parceiras aparece **exatamente uma vez**.
- **Quem enfrenta quem também é escolhido** — antes era sobra do sorteio, e duas
  meninas podiam se enfrentar 5 vezes enquanto outras nunca se cruzavam.
  Não dá para "nunca se enfrentar": num grupo de 8 são 28 duplas, 14 partidas e
  **56 confrontos individuais para só 28 pares possíveis** — na média cada par
  se cruza duas vezes. Então o alvo é **espalhar**, e a adversária escolhida é
  sempre a dupla que menos se enfrentou com essa até ali. Medido: os confrontos
  ficam entre **1 e 3, com média exata de 2,00**.
- **Duplas órfãs, corrigido.** Quando a ronda tem um número ímpar de duplas,
  uma sobra. Tirar sempre a mesma posição fazia as sobras caírem todas em cima
  da mesma menina, e aí elas não conseguiam se enfrentar depois: 3 duplas
  repetidas onde a matemática exige 1. Agora sai a dupla cujas jogadoras menos
  aparecem nas outras sobras, e o resultado bate o mínimo teórico: **0 duplas
  repetidas** quando o total de combinações é par, **1** quando é ímpar.
- **A otimização de confrontos só troca duplas DENTRO da mesma ronda.** Trocar
  entre rondas espalha um pouco melhor (confrontos 1–3 em vez de 1–4), mas
  destrói a propriedade de que as partidas de uma ronda cobrem o grupo inteiro
  — e é essa propriedade que permite as quadras rodarem todas ao mesmo tempo.
  Medido em 16 jogadoras e 3 quadras: **quadra ociosa em 11% dos casos com a
  restrição contra 46% sem ela**. A restrição fica.
- **Entra sempre quem está fora há mais tempo.** Sem isso acontecia de a menina
  terminar o jogo e já voltar, cansada, enquanto outra esperava sentada. O app
  guarda a hora em que cada partida terminou (`matches.ended_at` mais uma cópia
  no `localStorage`) e ordena a fila de espera por isso.
- **Empate na espera tem que dar a MESMA posição** (`ordemDeEspera` usa
  ranking denso). A primeira versão dava posições 0,1,2,3… mesmo quando ninguém
  tinha jogado ainda — uma preferência inventada que, com peso 1000 no custo,
  atropelava a ordem da fila e desmontava as rondas logo na primeira troca.
  Medido no app com 20 jogadoras e 3 quadras: **antes a quadra livre chamava
  alguém que tinha acabado de sair, com 8 meninas ainda esperando a primeira
  partida; depois passou a chamar quatro que nunca tinham entrado**.

## A fila mostrada é a que acontece (06/10/2026)

Em 05/10 a organizadora terminava uma partida e entrava outra, não a escrita na fila.
Três causas, todas consertadas:

1. **A lista e a quadra usavam contas diferentes.** A lista (`ordemPrevista`) simulava
   uma quadra só misturando os grupos; a quadra (`proximasDasQuadras`) escolhia o
   melhor conjunto para as quadras livres. Agora a quadra **pega a primeira da fila do
   grupo dela com as quatro livres** (`proximasPelaFila`, `src/lib/fila.ts`) — a lista é
   a regra, não um palpite. Medido com noites simuladas (`tests/fila.test.ts`, 20 por
   cenário, partidas de 8 a 20 min): **0 vezes** a quadra pegou outra que não a
   primeira possível; ninguém emendou 3 em 6, 7, 8, 9, 6+6, 6+6+6 e 8+8 (igual ao
   jeito antigo). Custo aceito: "todas com todas" com mais de 16 pendentes (ordem
   gulosa) — 11 em 2 quadras, 6/20 noites com alguém emendando 3 contra 4/20.
   Tentado e descartado: montar a lista simulando as quadras com o escolhedor antigo
   (lento, e não melhorou).
2. **"Quem não chegou" e a escolha na mão eram só do aparelho.** Agora ficam no play
   (script 22) e chegam aos outros celulares pelo tempo real.
3. **O Refazer foi apertado 9 vezes** num play que não precisava, e cada toque refazia
   tudo. Agora ele só mexe no grupo em que a conta não fecha (`precisaRefazer`), e
   depois de uma troca refaz **sozinho** — o aviso pedindo o Refazer saiu.

## A fila mostrada é previsão, não a ordem de geração

A lista "Próximas na fila" mostrava as partidas na ordem em que foram geradas.
Isso engana: aparecia na frente quem tinha acabado de sair da quadra, enquanto
meninas que nem tinham entrado ficavam lá embaixo — e contradizia o que as
quadras iam fazer de verdade.

Hoje a lista passa por `ordemPrevista()`, que roda o mesmo critério das quadras
(entra quem está fora há mais tempo) e vai empurrando cada partida escolhida
para o fim da espera. **Só muda a ordem de exibição** — as duplas já estão
formadas, então o rodízio continua intacto. Cada linha marca com 🆕 quem ainda
não entrou em quadra nenhuma vez (e quem está jogando agora **não** conta como
"ainda não jogou", que era um erro da primeira versão do aviso).

## Todas jogam o mesmo tanto, mesmo quando a conta não fecha

Um grupo de `n` gera `n(n-1)/2` duplas e cada partida gasta duas. Quando `n` é
**6, 7, 10, 11** (ou seja, `n % 4` é 2 ou 3) essa conta **não fecha** em partidas
inteiras com todo mundo jogando igual.

A saída antiga era: sobrou uma dupla sem adversária, então uma dupla já formada
joga de novo. Medido, isso dava **um jogo a mais para exatamente duas meninas**:

| grupo | antes | depois |
|---|---|---|
| 6 | 8 partidas — 2 fazem 6 jogos, 4 fazem 5 | **9 partidas — todas fazem 6** |
| 7 | 11 — 2 fazem 7, 5 fazem 6 | **14 — todas fazem 8** |
| 10 | 23 — 2 fazem 10, 8 fazem 9 | **25 — todas fazem 10** |
| 11 | 28 — 2 fazem 11, 9 fazem 10 | **33 — todas fazem 12** |

Grupos de 4, 5, 8, 9, 12, 13 sempre fecharam certo e não mudaram.

**A correção**: em vez de remendar no fim, as duplas que repetem entram no
sorteio **escolhidas para cair igualmente sobre todas** — um emparelhamento
perfeito quando cada uma repete 1 (grupo par), um ciclo passando por todas
quando repete 2 (grupo ímpar). Aí `partidas = n(n-1+k)/4` com `k` = 0, 0, 1, 2
conforme `n % 4`, e a divisão é sempre exata.

O gerador ainda escolhe entre 24 tentativas, mas agora **desigualdade de jogos
pesa 1.000.000** — mais que qualquer ajuste de confronto. Conferido em 30
sorteios de cada tamanho de 4 a 13: jogos iguais, repetições iguais, todas as
duplas formadas, contagem exata, e o espalhamento de confrontos continua em 1–4
(o mesmo de antes). Quadra parada: 0% nos formatos usuais.

⚠️ **O custo é tempo de quadra.** Grupos de 7 passam de 11 para 14 partidas, e
de 11 para 33 nos grupos de 11. Quem escolhe o tamanho do grupo vê o total na
tela. **Grupos de 4, 5, 8, 9 e 12 são os tamanhos "redondos"** — não precisam de
repetição nenhuma.

## A folga também é por grupo — e briga com a justiça

A folga de um grupo é `tamanho % 4`: quantas ficam de fora enquanto as outras
jogam. Ela é no máximo **3** — nunca 4, porque com 4 sobrando o grupo já enche
mais uma quadra.

| grupo | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|
| quadras | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 3 | 3 |
| **fora por vez** | **0** | 1 | 2 | 3 | **0** | 1 | 2 | 3 | **0** | 1 |
| duplas repetidas | 0 | 0 | 1 | 2 | 0 | 0 | 1 | 2 | 0 | 0 |

Repare no cruzamento: **4, 8 e 12 são justos (zero repetição) mas não têm
folga** — ninguém descansa. **5, 9 e 13 são justos E têm folga**: são os
tamanhos ideais.

O aviso 🪑 dizia sempre a mesma coisa ("a quadra que acabar primeiro vai esperar
as outras"), e com **grupos de 4 isso é falso**: cada grupo enche exatamente uma
quadra, então a quadra não espera ninguém — a próxima partida é das mesmas
quatro meninas, que jogam as 3 partidas seguidas sem parar. O problema existe,
mas é outro: falta descanso, não sobra espera. O texto agora escolhe entre três
explicações (grupo de 4 · uma quadra só · várias quadras disputando o mesmo
grupo) e a recomendação em grupos aponta para 5/9/13, não para "+4 jogadoras",
que dentro de um grupo é impossível.

### O botão "montar partida com quem está livre" foi removido

Ele existia para não deixar quadra parada: trocava quem estava ocupada por quem
estava livre. Só que isso **desfaz uma dupla do rodízio** e dá um jogo a mais
para uma menina e a menos para outra — exatamente o que a regra de todas
jogarem o mesmo tanto proíbe.

Medido antes de tirar (100 noites por cenário, partidas de 8 a 20 minutos, com
as quadras terminando em horas diferentes):

| formato | quadra parada | maior espera |
|---|---|---|
| grupos de 4, 3 quadras | 0,1% | 5 min |
| grupos de 7 (14), 2 quadras | 0,2% | 12 min |
| grupos de 6 (12), 2 quadras | 0,5% | 17 min |
| grupos de 8 (24), 4 quadras | 0,8% | 18 min |
| grupos de 8 (16), 4 quadras | 10,2% | 19 min |
| grupos de 9 (18), 4 quadras | 11,1% | 17 min |
| **sem grupos, 16 em 4 quadras** | **19,6%** | **173 min** |

Em grupos a espera máxima é de uns 17 minutos — **uma partida**. Esperar sai
mais barato que quebrar o rodízio. O caso feio (173 min) é o do `courts × 4 =
jogadoras` sem grupos, que já tem aviso próprio na criação, e cuja solução é
usar uma quadra a menos, não mexer nas duplas.

A troca continua existindo para o que ela realmente serve: **alguém foi embora**.
Aí a organizadora troca a jogadora na mão, no card da partida, escolhendo quem
entra — decisão explícita, não remendo automático.

A quadra parada agora só explica a situação: quais estão livres (separadas por
grupo) e por que não dá para juntá-las.

## Em grupos, quem limita as quadras é o GRUPO, não o total

Cada partida precisa de **quatro meninas do mesmo grupo**. Então um grupo de 6
só enche **uma** quadra por vez, por mais gente que tenha no play: 12 jogadoras
em 2 grupos de 6 dão **2 quadras**, não 3, e ficam 2 de fora **de cada grupo**.

A conta certa é `soma de piso(tamanho do grupo ÷ 4)` (`quadrasSimultaneas`), e
não `total ÷ 4`. Enquanto foi `total ÷ 4`, a tela de criar o play dizia
"12 jogadoras em 3 quadras, ninguém fica de fora" — errado nas duas metades — e
ainda gravava o play com uma quadra a mais do que o rodízio consegue encher.
Conferido contra o motor: em todos os cenários testados, `quadrasSimultaneas`
bate exatamente com quantas quadras o `proximasDasQuadras` consegue preencher.

Pela mesma razão, **a substituição da quadra parada não pode cruzar grupos**.
O botão "montar partida com quem está livre" trocava por qualquer uma que
estivesse de fora — e com 2 grupos de 6 as livres são 2 de cada grupo, então a
partida sairia com duas de um grupo e duas do outro. Isso não pertence a rodízio
nenhum e os pontos entrariam nos **dois** pódios ao mesmo tempo. `liberarPartida`
agora recebe os grupos e só aceita substituta do mesmo grupo da partida; o botão
percorre a fila até achar uma partida que dê para montar, e a tela lista as
livres separadas por grupo (`G1: … · G2: …`) explicando por que não dá para
juntar.

## Precisa sobrar gente para as quadras não pararem

Descoberto na simulação: **quando quadras × 4 = número de meninas, ninguém sobra
e a quadra que terminar primeiro fica parada**, porque as quatro da próxima
partida ainda estão jogando. Com 16 jogadoras e 4 quadras a quadra fica ociosa
em 51% dos casos; com as mesmas 16 em 3 quadras, 11%.

Não é bug do algoritmo, é aritmética — então a correção foi um **aviso na
criação do play** explicando que com pelo menos 4 de folga o rodízio anda
sozinho. A configuração ideal medida foi **24 jogadoras em 3 grupos de 8 com 3
quadras: 0% de quadra ociosa e 11 minutos de descanso médio**.

## Campeonato: um play com categorias (06/10/2026)

Para o campeonato de 12/10 a organização montou **três plays** de grupos + duplas no
mesmo dia, um por categoria. Funcionava na quadra, mas para o app cada menina
**faltou** em dois plays — e faltar zera o 🔥. Por isso o campeonato é **um** play com
categorias por cima dos grupos (`session.categorias`), e não plays ligados.

- **Grupos por nível, não equilibrados.** Com grupos de mesma força média, a 1ª de cada
  grupo era uma das melhores do dia, e “1ª com 1ª” formava uma superdupla. Por nível,
  a dupla das primeiras é favorita sem ser imbatível — e ir bem no grupo continua
  valendo.
- **Confronto direto só quando é justo.** Em dupla, quem vence o confronto depende da
  parceira. Ele só conta quando as duas tiveram as mesmas parceiras nas partidas em que
  se enfrentaram. Detalhe medido nos testes: num grupo de 4, duas empatadas em
  vitórias **sempre** ficam 1x1 no confronto — na prática o empate vai para a quadra.
- **Nunca ordem alfabética.** Empate em tudo é decidido na quadra (simples 1x1 ou par ou
  ímpar), gravado no play e no diário.
- **Pontos por colocação.** Pela diferença de games, a vice que ganhou a semi de 4x0 e
  perdeu a final somava 4; a campeã que ganhou as duas de 4x3 somava 2. A tabela
  (16/12/10/8/6/3) fica gravada no play; os antigos não mudam. 16 para a campeã é um
  pouco mais que o melhor de um play comum (média de 8 por menina, top de 11 a 21 em
  set–out/2026).
- **Categoria de grupo único** (o que fazer depois do rodízio) ficou para depois: por
  ora o mínimo são 2 grupos por categoria.

## Modo em grupos

Com 16 meninas o rodízio completo dá **60 partidas e 15 jogos para cada uma** —
longo demais para uma noite. O modo em grupos resolve: o mesmo rodízio acontece
**dentro de cada grupo**, então grupos de 8 dão 7 jogos por menina.

- Quem escolhe é o **tamanho do grupo**; o app calcula quantos grupos cabem a
  partir de quantas confirmaram, com tamanhos o mais parecidos possível.
- Os grupos são formados **por nível**: o grupo 1 leva quem está jogando melhor,
  para os jogos ficarem parelhos dentro do grupo.
- **Os pontos continuam individuais e o ranking do dia é um só** — o grupo muda
  contra quem você joga, não como você pontua. O **pódio**, esse sim, é um por
  grupo (ver [o porquê](#no-modo-em-grupos-um-pódio-por-grupo)).
- Grupos de 8 fecham perfeitos (28 duplas, 14 partidas, zero repetição).

## Força: um Elo, porque importa **de quem** você ganhou

A força de cada jogadora alimenta duas coisas: o equilíbrio das duplas e a
divisão dos grupos por nível. Ela já passou por três versões.

**1. Ranking do mês** — descartado: o primeiro play do mês sairia com todo mundo
zerado e sem equilíbrio nenhum.

**2. Média de pontos por partida** — melhor, mas com um furo que o dono do
projeto apontou: **ela não sabe de quem você ganhou**. Ganhar de quem está mal
vale o mesmo que ganhar de quem está muito bem.

No modo em grupos isso não é detalhe, é quebra. Cada grupo é um rodízio fechado,
então **dominar o grupo 2 rende a mesma média que dominar o grupo 1** — as notas
dos dois grupos deixam de ser comparáveis, a divisão do próximo play erra, e o
erro se realimenta semana após semana.

**3. Elo (o atual).** Cada partida move a nota das quatro jogadoras conforme a
nota de quem estava do outro lado. Vencer quem está melhor rende muito; vencer
quem está pior rende pouco; perder para quem está pior custa caro. A margem
conta, como na pontuação do campeonato (4x0 vale 1,00 e 4x3 vale 0,57).

Medido em 12 sextas simuladas, 16 jogadoras, 30 temporadas — correlação entre a
nota e a habilidade real (1,00 = perfeita):

| | sexta 2 | sexta 4 | sexta 8 | sexta 12 |
|---|---|---|---|---|
| **todas com todas** — média de pontos | 0,85 | 0,91 | 0,90 | 0,91 |
| **todas com todas** — Elo | 0,88 | 0,93 | 0,95 | **0,96** |
| **em grupos** — média de pontos | 0,56 | 0,77 | 0,73 | **0,70** ⚠️ |
| **em grupos** — Elo | 0,60 | 0,84 | 0,90 | **0,92** |

Repare na linha de baixo da média de pontos: ela **piora com o tempo** no modo
em grupos (0,77 → 0,70), exatamente pelo efeito descrito acima. O Elo melhora.

Parâmetros em `src/lib/stats.ts`: `ELO_K = 24` (quanto uma partida move a nota)
e `ELO_ESCALA = 110` (quantos pontos de Elo valem 1 ponto na escala 0–4 que o
`pairing.ts` usa). **K não é sensível**: entre 12 e 60 a correlação final fica
entre 0,90 e 0,93, então o ganho é do método e não de ajuste fino.

**Passo que acelera (out/2026).** Proposta da organização: aumentar o passo de quem
engata uma sequência. Medido em 30 temporadas (16 jogadoras, 12 plays), com uma menina
que melhora +88 no 4º play (todas com todas / grupos):

| | acerto no play 12 | balanço de quem não mudou | plays até alcançar quem melhorou |
|---|---|---|---|
| fixo 24 | 0,89 / 0,85 | 16,6 / 12,6 | 7,6 / 10,0 |
| acelera nos dois lados | 0,87 / 0,86 | 24,0 / 18,0 | 7,2 / 8,6 |
| **acelera só para cima** (adotado) | 0,90 / 0,85 | 20,3 / 15,6 | 6,3 / 9,0 |

Nos dois lados é só um K maior disfarçado (o fixo 36 dá o mesmo). Só para cima mantém o
acerto, alcança ~1 play antes e não faz ninguém afundar rápido — o custo é a nota de quem
está estável balançar um pouco mais. Conta **surpresas** (games acima do esperado), não
vitórias: vencer quem é mais fraca é o esperado e acelerar ali inflaria as fortes.
Vale do primeiro play depois de 05/10/2026 em diante (`PASSO_ACELERA_DESDE`): a
organização não quis mexer na força que já estava publicada.

O Elo também resolve sozinho o que a janela de "últimos 4 plays" resolvia — quem
foi boa há um ano e anda perdendo devolve nota partida a partida — sem o corte
seco, que jogava fora informação boa.

**Quem falta perde força, devagar (06/10/2026).** Antes a nota de quem faltava ficava
parada — e uma estreante que jogou muito bem um play e sumiu voltava semanas depois
direto para o grupo das melhores, tirando a vaga de quem joga toda semana. Agora a 1ª
falta não muda nada; da 2ª seguida em diante, a cada play do ranking, **aumentando a
cada falta**: **acima de 1500 perde 10% da distância até 1500 na 2ª, 15% na 3ª, 20% na
4ª… até 30%** (no mínimo 2: 1560 → 1554 → 1546 → 1537 → 1527…) e **abaixo de 1500 perde
2, 3, 4 e depois 5 por play, até −20 na sequência** — a organização não quis que a fraca que some
subisse, nem que afundasse. Voltou, a contagem zera. Play avulso não conta. Quem nunca
jogou não cai. A ficha mostra "−9 por 3 faltas seguidas" (`quedaPorFalta`, `textoDaQueda`).
Detalhe: com a queda o Elo deixa de ser estritamente soma zero (a média de quem falta
desce um pouco); o efeito é pequeno e é o que foi pedido.

> **Estreante.** Começa na média do grupo (nota 2,00), não no fim da fila. Com
> grupos por nível isso a coloca no meio da tabela, não no grupo dos iniciantes.
> Se ela for muito melhor que isso, o Elo a puxa para cima já no primeiro play.
> Se preferirem que estreante comece por baixo e suba, é mudar `ELO_INICIAL`
> para ela — mas aí uma jogadora forte passa algumas sextas em jogos fáceis.

## Play avulso

Nem todo jogo é campeonato — as meninas marcam um play numa segunda qualquer.
Na criação dá para desmarcar **"vale para o campeonato"** (`sessions.ranked`).

O play avulso **conta** no histórico de cada jogadora, nas estatísticas e na
força que equilibra as duplas dos próximos plays. Ele **não** soma pontos no
ranking do mês e **não** mexe nas sequências 🔥 — o status é sobre as sextas.

No Stats, o filtro por mês acompanha o ranking (só os plays que valem) e o
"Histórico completo" traz tudo; senão os dois números se contradiriam.

## Status 🔥 (o atrativo do campeonato)

A pergunta difícil foi: **o que mantém o status?** Ganhar a sexta seguidas vezes
não serve — emendar duas vitórias é raro demais, e os degraus acima de 3 nunca
seriam alcançados.

> ⚠️ **Correção de uma explicação errada que circulou aqui.** A versão anterior
> deste arquivo dizia que vencer o dia era "quase sorteio, porque as duplas são
> equilibradas de propósito". **Isso está errado**, e o dono do projeto foi quem
> apontou: se todas jogam com todas, as melhores sobem ao pódio mesmo.
>
> O raciocínio falho era supor que o app equilibra as **duplas**. Ele não pode:
> no rodízio completo a parceira de cada partida já está determinada, e ao fim
> do dia **todo mundo joga com todo mundo uma vez** — a soma da força das
> parceiras é idêntica para todas. O que o app escolhe é só a **adversária**.
>
> Medido com o algoritmo atual (600 sextas simuladas, 16 jogadoras, forças
> espalhadas de 0,8 a 3,2 pontos por partida):
>
> | | a melhor jogadora | acaso puro |
> |---|---|---|
> | termina no pódio | **61%** | 18% |
> | vence o dia | **31%** | 6% |
> | posição média | **3,5º de 16** | 8,5º |
>
> Ou seja: habilidade aparece, e muito — de 3 a 5 vezes mais que o acaso.
> O número exato depende de quão diferentes os níveis realmente são; num cenário
> de níveis mais distantes a melhor sobe a 72% de pódio.

O que sustenta o status, então, não é o dia ser aleatório — é que **nem a melhor
da quadra fica no pódio toda semana** (fica fora em 3 a 5 de cada 10 sextas) e
**o pódio inteiro quase nunca é o top 3 real** (8% das vezes). Emendar várias
sextas seguidas continua sendo difícil: a campeã de um dia repete no dia
seguinte em **16% a 27%** das vezes.

### No modo em grupos: um pódio por grupo

Como cada grupo é um rodízio fechado, quem domina o grupo 2 pontua tanto quanto
quem domina o grupo 1. O **ranking do dia continua um só** (os pontos são
individuais), mas o **pódio é um por grupo**: 1º, 2º e 3º do grupo 1, 1º, 2º e
3º do grupo 2, e assim por diante — e todos geram status normalmente.

**Antes era um pódio único.** Mudou por dois motivos. Um pódio só obriga grupos
que nunca se enfrentam a competirem na mesma conta; e, pior, fazia a chance de
status depender de **quantas apareceram**: 19% numa noite de 16, 13% com 24,
10% com 32 — quem veio numa segunda cheia era punida por isso.

Que os grupos são justos entre si já estava medido (800 plays, 16 jogadoras):

| | grupo 1 (mais fortes) | grupo 2 |
|---|---|---|
| vagas no pódio | 48% | 52% |
| campeã do dia | 47% | 53% |
| pontos por jogadora | 7,7 | 7,8 |

**É justo.** Os dois grupos são igualmente equilibrados por dentro, então
produzem a mesma distribuição de pontos — ninguém leva vantagem por estar no
grupo forte ou no fraco.

⚠️ **Cuidado com o argumento "grupo equilibrado = mais mérito".** É intuitivo,
mas o efeito medido é o inverso: quanto mais parelho o grupo, **menos** a melhor
dele lidera.

| grupo de 8 | a melhor termina em 1º |
|---|---|
| níveis misturados (0,8 a 3,2) | 34% |
| equilibrado (2,4 a 3,2) | 19% |
| muito equilibrado (2,8 a 3,2) | 15% |
| puro acaso | 12% |

Faz sentido: entre iguais, cada partida se aproxima de um cara ou coroa. Então
o pódio de um grupo equilibrado **não** premia "quem é a melhor" — premia
**quem jogou melhor naquela noite**.

#### E dobrar as vagas não estraga o status?

Era a dúvida óbvia: com 2 grupos passam a subir 6 de 16 em vez de 3. Medido
antes de soltar (16 semanas seguidas, 40 temporadas simuladas):

| | todas com todas (16) | 2 grupos de 8, pódio por grupo |
|---|---|---|
| vagas de pódio por play | 3 de 16 (19%) | 6 de 16 (38%) |
| chegam a 🔥 *Em chamas* (2) | 5,3 de 16 | **12,9 de 16** |
| chegam a 🔥🔥🔥 *Imparável* (4) | 1,9 | 3,5 |
| chegam a 👑💎🌟 *Duquesa* (8) | 0,6 | **0,3** |
| maior sequência da temporada | 7,8 | 7,3 |

**O topo da escada não inflacionou — encolheu um pouco.** Parece contraintuitivo
com o dobro de vagas, mas é o mesmo efeito da tabela acima: dentro de um grupo
equilibrado o pódio é mais imprevisível, então **emendar 8 semanas fica mais
difícil, não menos**. No pódio único as melhores dominavam semana após semana, e
era isso que permitia sequências longas.

Quem inflaciona é a **base** da escada: o 🔥 *Em chamas* deixa de ser raro —
81% das meninas encostam nele em 16 semanas, contra 33%. É o degrau mais barato
(3 pontos), então foi aceito de propósito: em modo grupos o 🔥 vira convite, e
os títulos de verdade continuam onde estavam.

Em pontos o efeito é pequeno: no fechamento do mês há **2,4** jogadoras com
status em vez de 1,5, e cada status vale **8,9** pontos em média em vez de 12,2
(as sequências são mais curtas).

#### A alavanca é o tamanho do grupo, não o número de grupos

A chance de pódio é `vagas ÷ tamanho do grupo` — e, diferente do pódio único,
**não depende mais de quantas apareceram**:

| tamanho do grupo | 6 | 8 | 10 | 12 |
|---|---|---|---|---|
| chance de pódio | 50% | 38% | 30% | 25% |

A tela de criar o play mostra essa porcentagem (`descreverPodios`), para a
organizadora escolher sabendo o que está fazendo.

**Teto:** o pódio nunca leva mais da **metade** do grupo (`vagasDoPodio`, em
`streaks.ts`). Sem isso, um grupo de 4 — que o app aceita montar — daria status
a 3 das 4 meninas.

> Quando isso entrou não existia nenhum play em grupos gravado, então a mudança
> não reescreveu histórico nenhum. Se um dia existir, lembre que `computeStreaks`
> **recalcula tudo do zero** a cada carregamento: mexer na regra do pódio muda
> sequências antigas retroativamente.

Quatro regras candidatas foram medidas. A escolhida foi **pódio do dia (top 3)
+ 1 vida**:

- termina a sexta no top 3 → mantém e sobe o status;
- **faltar na sexta zera o status, mesmo tendo vida** (regra explícita do dono);
- a vida absorve **uma** sexta fora do pódio, e é ganha ao preservar no fim do mês.

Escada (`src/lib/streaks.ts`), calibrada para 2/3/4 serem possíveis dentro de um
mês e 5/6/7 no segundo: 🔥 Em chamas (2) · 🔥🔥 Pegando fogo (3) ·
🔥🔥🔥 Imparável (4) · 👑🔥 Lenda do Play (5) · 👑💎 Rainha do Play (6) ·
👑🌟 Imperatriz do Play (7) · 👑💎🌟 **Duquesa da V3** (8+, o teto).

**Por que alguém usaria o status em vez de acumular?** Porque a diferença entre
1º e 2º no mês é de apenas **3,6 pontos** em média — então sacar o bônus decide
o mês. No fechamento a jogadora escolhe **usar** (vira pontos e zera, é
irreversível e pede confirmação) ou **preservar** (padrão: não pontua, o status
segue e ela ganha 1 vida).

> No banco os valores gravados continuam `'sacar'` / `'continuar'`, traduzidos
> por `acaoDe()`. Foi de propósito, para não precisar migrar dados existentes.

## Campeã do dia

**Empate exato** (mesmos pontos, saldo e vitórias) gera **co-campeãs**. Uma
simulação mostrou o problema antigo: a Duda venceu 3 dias e ficou com 0 de bônus
enquanto a Ana levou +10, só porque "Ana" vem antes no alfabeto. Desempate por
ordem alfabética nunca mais.

## Quem está em quadra agora

Duas tentativas foram feitas antes da atual — as duas falharam e não devem
voltar:

1. **Por rodada** — errado: a quadra travada estava na rodada 2 enquanto as
   presas ainda jogavam a rodada 1, então detectava zero conflito. (Hoje nem
   existem mais rodadas.)
2. **Primeira partida sem placar de cada quadra** — melhor, mas ainda adivinhação:
   errava sempre que o play saía do roteiro.

A solução é **declarativa**: o botão **"▶️ Partida iniciada"** marca, e o placar
encerra. Quem organiza é quem sabe. O início fica gravado no banco
(`matches.started_at`, script `04`) **e também no `localStorage`**
(`src/lib/emQuadra.ts`) — sem a cópia local o tempo real devolvia a partida sem
o início e o botão "voltava" sozinho.

Em cima disso funcionam o aviso **"⏳ fulana ainda está jogando em outra quadra"**
com o botão **"🔄 Chamar quem está livre"** (`liberarPartida`, mesmos critérios
do sorteio) e o "livre / em quadra" na troca de jogadoras.

## O placar só depois de "partida iniciada"

Dava para lançar o placar de uma partida que nunca tinha entrado em quadra.
A partida ficava gravada **sem quadra e sem hora de início** — e são justamente
esses dois dados que dizem quem está em quadra agora e quem está fora há mais
tempo. Além disso, era fácil lançar por engano o placar do cartão da quadra
errada.

Agora os botões de "venceu" ficam **bloqueados até marcar a partida como
iniciada**, com o botão verde logo acima e uma linha explicando. Custa um toque
a mais quando o play é lançado depois, no papel — vale a pena pelo dado certo.

Isso obrigou a mudar a **correção de placar**: antes o ✏️ apagava o placar e
devolvia a partida para a fila, o que com o bloqueio a deixaria presa lá,
parecendo que sumiu. Hoje o ✏️ abre um modal que troca o placar direto,
**preservando a hora em que a partida terminou** — senão aquelas quatro
voltariam para o fim da fila de espera por causa de uma correção.

## Quadras "com bug" que não eram bug

Reclamação: "selecionei 3 quadras e o play gerou com 2". A matemática estava
certa — 3 quadras exigem 12 jogadoras **ao mesmo tempo**. O problema era de
comunicação, então a correção foi um **aviso bem visível** explicando a conta e
quantas jogadoras faltam. Não mexer na lógica achando que é bug.

## "Não consegue abrir o app"

Investigado: site respondendo 200, deploys verdes, todos os arquivos no ar. Era
**cache velho no navegador das meninas**. Correções: tela de resgate no
`index.html` (fora do JS do app, com "Limpar e recarregar" que remove o service
worker e os caches), cache do SW versionado por build, rodapé com a versão e
"forçar atualização", e o logo reduzido de 848 KB para 260 KB.

## Ações que mexem em pontuação pedem confirmação forte

- **Apagar um play** tira os pontos das meninas do ranking do mês e pode
  derrubar sequências. Um "ok" não basta: a tela mostra quantas partidas serão
  perdidas, **quantos pontos cada uma perde**, avisa se o play já foi finalizado
  (o que refaz as sequências) e **exige escrever APAGAR**.
- **Fechar o mês** agora é um botão, não só a virada do calendário: a premiação
  acontece na última sexta. A confirmação lista quem fecha com status e quanto
  vale. Dá para **reabrir** — serve para teste e para desfazer engano.
  Gravado em `month_closures`; a virada do calendário continua como rede de
  segurança.

## Dois temas, e a lição que se repetiu

O app tem **modo diurno e noturno**, no botão ☀️/🌙 do cabeçalho. A escolha fica
guardada no celular e é aplicada **antes de o React montar** (`aplicarTemaSalvo`
no `main.tsx`), senão a tela pisca clara antes de escurecer. O padrão é o
noturno: o play é à noite, na areia.

⚠️ **O mesmo bug apareceu duas vezes, uma em cada direção.** Ao converter para
escuro, `#fff` que era **texto** virou superfície e o "PLAY" sumiu do cabeçalho.
Ao criar o tema claro, `var(--navy)` que era **texto escuro** virou
`var(--fundo)` e os títulos de seção e os números sumiram na página clara.

A causa é a mesma: **um token de cor não diz qual é o papel dele**. A correção
foi criar dois nomes que não acompanham o tema —

- `--sempre-claro`: texto sobre superfície que é escura nos dois temas
  (cabeçalho, toast, avatar);
- `--sempre-escuro`: texto sobre superfície viva nos dois temas (selo rosa,
  degrau dourado do pódio, fichas de pontuação).

Se um dia surgir um terceiro tema, é por aí. **Nenhum texto deve usar
`var(--fundo)` como cor** — é sempre o sintoma desse bug.

## As cores

O app nasceu claro (creme com topo azul). Virou **escuro**: fundo azul de noite
com o pôr do sol do logo (roxo → rosa → laranja) nos acentos. É a paleta da
apresentação, e faz sentido no uso real — o play é à noite, na areia, com o
celular na mão.

A troca foi feita por **tokens semânticos**, não cor a cor: as 102 cores fixas
do CSS foram mapeadas pelo papel que cumpriam (superfície, tinta de aviso,
texto). Isso expôs um bug de contraste que já existia — o mesmo `#fff` servia
de **texto sobre fundo escuro** e de **superfície clara**, então a tradução
automática apagou o "PLAY" do cabeçalho. Agora cada uso declara o papel:
`var(--text)` sobre fundo escuro, `var(--noite)` sobre fundo vivo.

A arte de fechamento (canvas) segue a mesma paleta.

## Interface

- Tudo pensado para o **celular**, em pé, com a mão molhada de areia.
- Campos numéricos usam o componente `Stepper` (− / +). Os `input[type=number]`
  puros davam bug: apagar o campo virava 1, e digitar "4" resultava em 14.
- **Trocar jogadora não é mais um toque no nome.** O nome ficava dentro de uma
  linha cortada por reticências, então com nome comprido não dava para acertar o
  dedo. Agora é um botão "🔄 Trocar jogadora" que abre um modal de duas etapas
  com **linhas de 60px de altura ocupando a largura toda** — e os nomes das
  duplas quebram em vez de serem cortados.
- As imagens de fechamento (dia e mês, 1080×1350) são desenhadas em canvas, com
  coroa e chamas **vetoriais**. As chamas só têm línguas no arco superior — na
  primeira versão pareciam um sol.
- O fogo e o título de status aparecem **só para o 1º lugar** na arte.
- A classificação da tela inicial mostra o top 10 e expande sob demanda.

## Botão de instalar: dá no Android, não dá no iPhone

O Chrome (Android e computador) avisa que o app é instalável pelo evento
`beforeinstallprompt`. Segurando esse evento — `preventDefault()` e guardar —
o botão abre a caixa de instalação do próprio sistema. Um toque e acabou.

**No iPhone não existe equivalente.** A Apple não expõe nenhuma API para um site
pedir a instalação; o único caminho é o menu de compartilhar do Safari. Então lá
o mesmo botão abre o passo a passo em vez de instalar, e o texto diz por quê —
senão parece defeito do app.

**Onde ele fica** custou três tentativas, e a medição decidiu:

| lugar | custo |
|---|---|
| cartão na tela inicial, com "agora não" | 132px de tela — e quem dispensasse perdia o atalho **para sempre** |
| botão redondo ao lado do tema | **+43px** de altura no cabeçalho, que é fixo: 43px em toda tela do app |
| pastilha na linha de status | **+5px**, e com texto em vez de só ícone |

Ficou a pastilha. O botão redondo apertava a coluna do título de 171px para
123px, e aí o subtítulo quebrava de 2 para 4 linhas — não era o botão que
ocupava espaço, era o que ele empurrava.

Detalhes que custaram atenção:
- o evento **serve uma só vez**; se a pessoa recusar, o botão passa a ensinar na mão;
- `display-mode: standalone` (e `navigator.standalone` no iOS) escondem o convite
  para quem já instalou;
- o iPad moderno se apresenta como **Macintosh** — o que o entrega é
  `maxTouchPoints > 1`;
- quem não quiser some com o cartão, e a escolha fica guardada no aparelho.

## Infra

- **Supabase**: leitura pública (o grupo do WhatsApp só abre o link), escrita só
  autenticada (RLS). Tempo real ligado. Fotos no bucket `photos`.
- A **chave publicável** e a URL ficam versionadas em `src/config.ts` — são
  públicas por natureza, foi escolha consciente.
- ⚠️ A **secret key** (`service_role`) **nunca** entra no app nem no repositório.
  Ela dá acesso total ao banco, ignorando todas as regras de permissão.
  A chave original passou por uma conversa de chat e foi **revogada em
  07/09/2026**. O app não usa chave secreta nenhuma, então nada quebrou —
  conferido na hora: leitura pública 200, escrita sem login 401.
- Publicação por GitHub Actions no GitHub Pages a cada push na `main`.

## Escrita otimista

As alterações aparecem na tela na hora e vão para uma **fila serializável**
(`src/data/queue.ts`) que sobrevive a refresh e a celular sem sinal. Isso é
essencial: a quadra da V3 tem sinal ruim e o play não pode parar.

## Quem é quem: o nome é rótulo, o id é a pessoa

Cada jogadora tem um **id próprio** e as partidas guardam esse id, nunca o nome
escrito. Renomear alguém não mexe em partida, ponto nem sequência — o histórico
está preso ao cadastro. A tela de editar perfil mostra quantas partidas ela tem
justamente para deixar isso visível na hora de trocar o nome.

**Dois nomes, papéis diferentes:**

- `name` é o **nome de cadastro**, completo. Serve para conferir a lista sem
  confundir duas Anas, e só aparece na tela de Meninas.
- `nickname` é o **apelido**, como ela aparece na quadra: ranking, partidas,
  textos do WhatsApp, artes e as iniciais do avatar. Vazio quer dizer "usa o
  nome de cadastro", então quem não tem apelido não muda em nada.

Tudo isso passa por `nameOf()` no store — um lugar só, e a tela inteira segue.
A importação da lista também casa pelo apelido, senão a menina que o grupo
escreve como "Aninha" viraria um segundo cadastro.

O que existe hoje para manter o cadastro único:

- **Editar perfil** — trocar o nome de cadastro, o apelido e as outras grafias.
- **Apelidos** — as grafias que a lista do grupo já usou. São eles que fazem a
  importação do WhatsApp cair na pessoa certa em vez de criar uma segunda.
- **🔗 Juntar** — se mesmo assim nasceram duas, o merge passa partidas, pontos e
  sequência de uma para a outra.

### ⚠️ CPF, não

A ideia de vincular CPF para garantir cadastro único foi levantada e **está
descartada**: a tabela `players` tem **leitura pública** (é o que deixa o grupo
abrir o link sem login). Um CPF ali seria um CPF publicado para qualquer pessoa
que abrisse o endereço — dado sensível, exposto de graça, e sem necessidade
nenhuma: o id já garante unicidade, e ele não é digitado por ninguém.

Se um dia fizer falta um identificador visível para conferência, use algo que
não seja sensível (data de nascimento, por exemplo) — e ainda assim, pensando em
que ele fica público.

## Importação da lista do WhatsApp

Cola a lista numerada de confirmadas; o app casa os nomes sozinho (normalização
sem acento, distância de edição, primeiro nome, apelido/prefixo), pergunta só
nas dúvidas, cria quem falta, guarda as grafias como `aliases` para acertar
sozinho da próxima vez, **preserva pontos e status** ao vincular e permite
**desfazer a importação**. No teste com a lista real de 12 nomes: 8 resolvidos
sozinho, 4 conferidos na mão.

---

## Pendências

- [x] ~~**Rotacionar a secret key do Supabase**~~ — revogada em 07/09/2026.
      Conferido logo depois: a leitura pública continua respondendo 200 e a
      escrita sem login continua sendo negada com 401.
- [x] ~~**Apresentação para o grupo**~~ — feita como uma **página que roda
      sozinha**, em 12 cenas (o que é o app, instalar no iPhone e no Android,
      como o play funciona, a pontuação, o mini-game dos status e a Duquesa com
      a premiação secreta). Dá para mandar o link ou gravar a tela dela para
      virar vídeo. No ar em **`https://playdetodas.com.br/apresentacao/`**, com
      botão de voltar para o app.
- [ ] **Reenviar o link no grupo.** O endereço agora é
      **`https://playdetodas.com.br`**, com HTTPS e certificado válido desde
      07/09/2026. Os links antigos (`play-das-meninas-`, `play-da-sexta`) dão
      **404** — o GitHub Pages não redireciona. Quem instalou na tela de início
      por um link antigo precisa instalar de novo.
- [ ] Mensagem pronta para o grupo pedindo que escrevam o nome completo certo na
      lista de confirmação (facilita a importação).
- [x] ~~Rodar o script `07-apelido.sql`~~ — feito e conferido em 07/09/2026:
      a coluna `nickname` está no banco e responde na leitura pública.
- [x] ~~Rodar os scripts `04`, `05` e `06` no SQL Editor~~ — feito e conferido em
      05/09/2026: `started_at`, `ended_at`, `format`, `groups`, `ranked` e a
      tabela `month_closures` estão no banco, com RLS (leitura pública, escrita
      autenticada) e tempo real ligados nas 5 tabelas.
- [ ] Opcional: tirar o "Mais que um play, uma experiência!" do rodapé das artes
      (já aparece dentro do logo).
