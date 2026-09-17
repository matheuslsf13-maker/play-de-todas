# 🏐 Play de Todas — Beach Tennis

App para organizar o **Play de Todas**, o campeonato de **beach tennis** da V3 Arena: monta as duplas equilibradas,
lança os placares, fecha o dia, soma os pontos no ranking do mês e mostra as
estatísticas individuais, de duplas e de confrontos.

Duas páginas prontas para mostrar o campeonato a quem chega de fora:
[**a apresentação**](public/apresentacao/index.html) (as cenas que rodam
sozinhas, em `/apresentacao/`) e [**como a noite é montada**](public/como-funciona/index.html)
(o documento de apoio sobre balanceamento, formatos e fechamento, em
`/como-funciona/` — e é ele que imprime bem em PDF).

## O que ele faz

- **Rodízio completo** — cada menina faz dupla com **cada uma das outras
  exatamente uma vez**. As duplas são montadas pela pontuação de cada jogadora
  para os jogos ficarem parelhos, e **quem enfrenta quem também é escolhido**:
  entre as adversárias possíveis o app pega sempre a dupla que menos se
  enfrentou com aquela, para os confrontos se espalharem por igual.
- **Sem rodadas: uma fila de partidas** — as quadras nunca terminam juntas, então
  não faz sentido esperar a rodada fechar. Cada quadra que vaga puxa da fila a
  próxima partida cujas quatro meninas estão livres, **dando preferência a quem
  está fora há mais tempo** — ninguém emenda dois jogos cansada enquanto outra
  espera sentada.
- **Três formatos** — *Todas com todas* (o rodízio inteiro), **em grupos** e
  **grupos + duplas**. Em grupos você escolhe quantas meninas por grupo e o app
  monta os grupos **por nível** (grupo 1 com quem está jogando melhor); cada
  grupo é um rodízio próprio, mas **os pontos continuam individuais e o ranking
  do dia é um só** — o pódio, esse sim, é um por grupo. Serve para noite curta:
  com 16 meninas o rodízio inteiro dá 15 jogos para cada uma; em grupos de 8, dá
  7. Já o **grupos + duplas** usa a fase de grupos só para classificar: a
  colocação vira **dupla fixa** (1ª com 1ª, 2ª com 2ª) e o dia termina em
  **mata-mata**, com final e disputa de 3º lugar.
- **Quantidade livre** — você informa quantas jogadoras vieram e quantas quadras
  temos. O app avisa quando o número não fecha e explica a conta.
- **Pontuação do cartaz** — partida até 4 pontos, sem empate:
  `4x0 = 4 pts · 4x1 = 3 pts · 4x2 = 2 pts · 4x3 = 1 pt` (a derrota não pontua).
  Dá para mudar o "vai até" na criação do play.
- **Status de sequência 🔥** — terminar semanas seguidas no **pódio do dia** dá
  status, de 🔥 *Em chamas* (2 semanas) até 👑💎🌟 **Duquesa da V3** (8 ou mais).
  No fechamento do mês a jogadora escolhe **usar** o status (vira pontos e zera)
  ou **preservar** (segue crescendo e ganha 1 vida).
- **Fechar o mês quando você quiser** — botão com confirmação no Ranking, porque
  a premiação acontece no último play do mês e não na virada do calendário. Dá para
  reabrir se foi engano ou teste.
- **Histórico completo** — o ranking zera todo mês, mas **nada é apagado**. Dá
  para ver o acumulado de sempre no Ranking e nas Stats.
- **Play avulso** — na criação dá para marcar que o play **não vale para o
  campeonato** (aquele jogo de segunda). Ele conta no histórico da jogadora e
  ajuda a equilibrar as duplas dos próximos plays, mas não soma pontos no
  ranking do mês nem mexe nas sequências 🔥.
- **Ranking do dia e do mês** — pódio com as fotos do top 3 e classificação
  (pontos, jogos, vitórias, derrotas, saldo de games, aproveitamento). A tela
  mostra o top 10 e expande para a lista inteira quando você quiser.
- **Finalizar o dia** — soma os pontos ao ranking do mês, mostra o ranking do dia
  e oferece o botão para **gerar as duplas do próximo play**.
- **Estatísticas** — em dois modos. *Por jogadora*: aproveitamento, saldo,
  sequência e status, pódios, dias vencidos, com quem mais venceu, parceria mais
  difícil, de quem mais ganha e para quem mais perde. *Por dupla*: a lista de
  todas as duplas que já se formaram, com busca e ordenação, e o retrospecto
  completo de cada uma — inclusive contra quem jogaram e o placar de cada partida.
- **Compartilhar no WhatsApp** — botões que copiam o ranking do mês, o ranking do
  dia e a ordem das partidas do dia já formatados para colar no grupo.
- **Imagem de fechamento do mês** — gera a arte do pódio (1080×1350, formato de
  post/status) com as fotos do top 3, coroa na campeã, pontos, vitórias e as
  demais colocadas. Um toque para compartilhar ou salvar.
- **Fotos** — cada jogadora pode ter foto de perfil (aparece no pódio e na arte
  do mês); dá para pôr, trocar e remover, e o arquivo antigo é apagado do
  armazenamento junto.
- **✅ Check-ins** — a planilha da organizadora dentro do app. Cada conta de
  passe (Wellhub/TotalPass) dá **12 check-ins por mês**; as aulas na arena gastam
  parte (1x por semana usa 8, 2x usa os 12) e a aba mostra quantos **sobram** para
  cada menina, somando as contas dela — inclusive a conta de outra pessoa (o
  marido) quando a dela acaba. Por dia de play lança-se quem veio, com qual conta,
  em qual arena, como pagou (check-in + valor ou integral), quanto pagou e o que
  ficou de **crédito ou débito** — o crédito de um play cobre o seguinte sozinho, e
  quem deve vê o total para quitar; acertos fora de play (pagou depois, devolveram,
  perdoaram) têm tela própria. O relatório **para as arenas** (texto de
  WhatsApp ou Excel, por mês ou período, uma arena ou todas) sai **sem valores**.
  O **caixa** (receitas extras, brindes, aluguel…) e o **resumo mensal** só
  aparecem para quem está logada, e o **Excel completo** reproduz as abas da
  planilha antiga.

## Como as meninas acessam

O app é um site. Quem organiza entra com e-mail e senha para lançar resultados;
**todas as outras só abrem o link** e já veem o ranking atualizado em tempo real.

## Rodando localmente

```bash
npm install
npm run dev
```

Sem configuração o app roda em **modo local**: funciona 100%, mas os dados ficam
salvos apenas no navegador de quem está usando. Ótimo para testar.

## Ligando o Supabase (para o grupo todo acessar)

1. Crie um projeto grátis em <https://supabase.com>.
2. No **SQL Editor**, cole e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
   Isso cria as tabelas, libera a leitura pública, ativa o tempo real e cria o
   bucket `photos` para as fotos de perfil. Depois rode os arquivos numerados
   da pasta [`supabase/`](supabase) **na ordem** (`02` em diante): são as
   migrações que vieram depois (o `15-checkins.sql` cria as tabelas da aba
   Check-ins — as de dinheiro só quem está logada lê —, o `16` carrega a
   planilha de setembro de 2026 e o `17` cria os acertos de saldo). O app funciona sem elas — guarda o que falta no
   celular de quem organiza — mas aí o modo em grupos, o tempo de descanso e o
   fechamento do mês não chegam aos outros aparelhos.
3. Em **Authentication → Users**, clique em *Add user* e crie o login de quem vai
   organizar os plays (e-mail + senha). Só quem tem login consegue editar.
4. Preencha [`src/config.ts`](src/config.ts) com os dados de
   **Project Settings → API**:

   ```ts
   export const SUPABASE_URL = 'https://xxxx.supabase.co'   // Project URL
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...'         // anon public
   ```

   (Também dá para usar as variáveis `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY` num `.env` — elas têm prioridade sobre o config.)

5. `npm run dev` — o cabeçalho passa a mostrar a bolinha verde.

> A `anon key` é pública por natureza: quem tem o link consegue **ler** os dados.
> A escrita é protegida pelas políticas de RLS do `schema.sql` (só autenticadas).

## Publicando (GitHub Pages)

O workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publica
o site a cada push na `main`.

1. No repositório: **Settings → Pages → Source: GitHub Actions**.
2. Com `src/config.ts` preenchido não precisa de mais nada. (Se preferir não
   versionar as chaves, apague-as do config e crie os secrets
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em
   **Settings → Secrets and variables → Actions**.)
3. Faça um push na `main`. O link fica
   `https://<seu-usuario>.github.io/<nome-do-repo>/` — é esse link que você manda
   no grupo do WhatsApp.

Também funciona direto na Vercel/Netlify: build `npm run build`, pasta `dist`,
e as mesmas duas variáveis de ambiente.

## No celular da organizadora

O app foi feito para ser usado com uma mão, na beira da quadra:

- **Placar em 2 toques** — toca na dupla que venceu, toca em quantos games a
  adversária fez. Pronto, partida lançada. Para corrigir, *Trocar placar*.
- **Uma quadra por vez** — nada de rolar 28 partidas procurando a atual. A tela
  começa com um cartão por quadra, mostrando o que está em jogo ali agora ou a
  próxima partida que entra. A fila e as partidas já jogadas ficam recolhidas
  logo abaixo.
- **Fora do roteiro também funciona** — *Trocar jogadora* abre uma lista de
  linhas grandes (nome comprido não é mais problema no celular), *Outra partida*
  escolhe na mão qual entra naquela quadra, e quando nenhuma partida da fila tem
  quatro meninas livres o app diz quem está livre e monta uma partida com elas.
- **Salva na hora** — o placar aparece na tela imediatamente e vai para o banco
  em segundo plano. O topo mostra *tudo salvo* / *salvando…* / *N para enviar*.
- **Aguenta sinal ruim** — sem internet, os lançamentos ficam guardados no
  celular (sobrevivem até a fechar o app) e sobem sozinhos quando o sinal volta.
  O app também abre offline mostrando o último estado conhecido.
- **Tela não apaga** enquanto um play está aberto.
- **Dá para instalar** como aplicativo: no celular, abrir o link e escolher
  *Adicionar à tela de início* (Android: menu ⋮ → *Instalar app*).

## Importando a lista do grupo

Na criação do play, **Colar lista de confirmação do grupo** aceita a lista do
WhatsApp do jeito que ela vem, numerada e com a grafia de cada uma:

```
1- Ingryd
2- Pamella
8-Figueiredo
10 - Mariana Valério
```

O app tira a numeração e casa cada nome com a base, tolerando acento, caixa,
apelido e erro de digitação. Na lista de exemplo acima (12 nomes), ele reconhece
8 sozinho e destaca só os 4 duvidosos, já com o palpite: *"Figueiredo — é a Ana
Figueiredo (85%)?"*. Cada linha vira uma escolha: vincular a quem já joga ou
criar atleta nova.

Ao confirmar, as grafias usadas ficam guardadas como **apelidos** da jogadora,
então na semana seguinte "Carol", "Tete" e "Gabi" são reconhecidas sozinhas.
Logo depois da importação há um botão para **desfazer** tudo, e se uma atleta
repetida escapar, a aba **Meninas** tem o 🔗 para **juntar duas jogadoras** —
as partidas, os pontos e a sequência das duas passam para a que ficar.

## Play montado antes da hora

O play pode ser criado horas antes de acontecer. Enquanto ele não é finalizado,
aparece na tela inicial como **Próximo play**, e qualquer pessoa que abrir o link
— mesmo sem login — vê a fila de partidas e com quem vai jogar.

## Como usar no dia do play

1. **Meninas** — cadastre as jogadoras (e as fotos).
2. **Play → Novo Play** — escolha data, quadras, o formato (todas com todas ou
   em grupos) e marque quem veio.
3. **Gerar partidas e começar** — o app monta a fila inteira.
   Use *Enviar partidas* para colar a ordem no grupo.
4. Durante os jogos: **▶️ Partida iniciada** quando a quadra começa, e o placar
   em 2 toques quando termina. A próxima partida da quadra aparece sozinha,
   chamando quem está fora há mais tempo.
5. **Finalizar o dia e somar os pontos** — aparece o ranking do dia para
   compartilhar, e o botão para já deixar o próximo play montado.

## Status de sequência ("em chamas")

Terminar o play no **pódio do dia** (top 3 — e, no modo em grupos, o top 3 de
cada grupo) mantém o status vivo e faz a sequência crescer:

| Semanas seguidas no pódio | Status | Vale |
| --- | --- | --- |
| 2 | 🔥 Em chamas | 3 pontos |
| 3 | 🔥🔥 Pegando fogo | 6 pontos |
| 4 | 🔥🔥🔥 Imparável | 10 pontos |
| 5 | 👑🔥 Lenda do Play | 16 pontos |
| 6 | 👑💎 Rainha do Play | 24 pontos |
| 7 | 👑🌟 Imperatriz do Play | 34 pontos |
| **8 ou mais** | **👑💎🌟 Duquesa da V3** | **50 pontos** |

### Por que pódio e não vitória do dia

Não é porque o dia seja sorteio — habilidade aparece, e muito: medindo 600
plays simulados com 16 jogadoras, **a melhor termina no pódio em 61% das vezes**
(o acaso puro daria 18%) e vence o dia em 31% (contra 6%). O ponto é que
**nem a melhor da quadra vence toda semana**: a campeã de um dia repete no dia
seguinte em 16% a 27% das vezes, então com a vitória do dia como critério os
degraus de 4 para cima seriam enfeite. Pelo pódio a escada inteira passa a ser
alcançável, e a Duquesa continua rara.

> A versão anterior deste trecho dizia que vencer o dia era "quase sorteio
> porque as duplas são equilibradas". Está errado e foi corrigido: no rodízio
> completo a parceira de cada partida já está determinada e todas jogam com
> todas, então a soma da força das parceiras é idêntica para todo mundo — o que
> o app escolhe é só a **adversária**. Ver `DECISOES.md`.

### A decisão do fechamento

Os pontos do ranking **zeram todo mês**; o status, não. No fechamento, quem
terminou o mês com status escolhe:

- **Usar** — os pontos do status entram naquele mês e a sequência **zera**.
  É irreversível, então o app pede confirmação.
- **Preservar** (padrão) — não pontua, o status segue crescendo no mês seguinte
  e ela ganha **1 vida**.

A **vida** absorve um play fora do pódio: o status sobrevive, mas não cresce
naquela semana. Não acumula (no máximo uma por vez). **Faltar zera o status
mesmo com vida** — tem que estar lá.

O ponto de equilíbrio: como a distância entre 1ª e 2ª colocada num mês é de
apenas ~3,6 pontos, usar um status de 10 pontos praticamente decide o mês. Vale
a pena preservar justamente quando ela já está fora da briga daquele mês.

## Como as duplas são montadas

**As parceiras** saem do *método do círculo* (uma 1-fatoração do grafo completo):
fixa uma jogadora e gira as outras, gerando conjuntos de duplas em que ninguém se
repete e toda combinação aparece uma única vez. Quando o total de combinações é
ímpar (9, 10, 11, 14, 15, 18… jogadoras) uma dupla precisa jogar duas vezes,
porque cada partida consome duas duplas; é inevitável, e o app repete só uma —
marcada com 🔁 na tela.

**As adversárias** são escolhidas, não sorteadas. Entre as duplas que cabem, o app
pega a que **menos se enfrentou** com aquela — primeiro olhando o próprio dia,
depois os plays anteriores. Não dá para "nunca se enfrentar": num grupo de 8 são
28 duplas, 14 partidas e **56 confrontos individuais para só 28 pares possíveis**,
ou seja, na média cada par se cruza duas vezes. O alvo é espalhar, e o resultado
medido fica entre **1 e 3 confrontos por par, com média exata de 2,00**.

**A força de cada jogadora** é um **Elo**: cada partida move a nota das quatro
conforme a nota de quem estava do outro lado, então **vencer quem está jogando
melhor rende muito mais** do que vencer quem está jogando pior — e perder para
quem está pior custa caro. Não é o ranking do mês (senão o primeiro play do mês
sairia desequilibrado) nem média de pontos, que não sabe de quem você ganhou e
por isso quebrava no modo em grupos, onde dominar o grupo fraco rendia a mesma
média que dominar o forte.

**A ordem da fila** é montada para espalhar o descanso, e durante o play a próxima
partida de cada quadra é escolhida olhando **todas as quadras livres de uma vez** —
senão a mesma menina acaba sugerida em duas quadras ao mesmo tempo. A lista
"Próximas na fila" mostra a **ordem prevista**, não a ordem em que as partidas
foram geradas, e marca com 🆕 quem ainda não entrou em quadra nenhuma vez.

> Uma quadra só roda sem parar se sobrar gente: quando `quadras × 4` é igual ao
> número de meninas, ninguém fica de fora e a quadra que terminar primeiro
> espera as outras. Com pelo menos 4 de folga o rodízio anda sozinho — o app
> avisa isso na criação do play.

## Estrutura

```
src/lib/pairing.ts   fila de partidas, grupos e duplas equilibradas
src/lib/scoring.ts   regra de pontuação (4x0=4, 4x1=3, 4x2=2, 4x3=1)
src/lib/stats.ts     rankings, força estimada, parcerias e confrontos
src/lib/streaks.ts   sequências de vitórias e bônus "em chamas"
src/lib/share.ts     textos prontos para o WhatsApp
src/lib/poster.ts    arte do fechamento do mês (canvas 1080x1350)
src/lib/checkins.ts  cota de check-ins, saldo, relatório das arenas e caixa
src/lib/xlsx.ts      escritor mínimo de .xlsx (sem dependência)
src/data/            armazenamento (localStorage ou Supabase)
src/pages/           Ranking · Play · Estatísticas · Jogadoras · Check-ins
supabase/schema.sql  banco, permissões e bucket de fotos
```
