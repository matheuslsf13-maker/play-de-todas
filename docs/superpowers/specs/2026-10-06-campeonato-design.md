# Modo Campeonato (categorias + grupos + duplas) — desenho

Data: 06/10/2026 · Prazo: pronto e testado antes do play de **12/10**.
Parte **B** da revisão pós-05/10. A parte **A** (fila confiável e tempo real entre
celulares) tem desenho próprio e vem logo depois; C (força de quem falta), D
(perfil: gráfico e nomes clicáveis), E (abas só da administração) e F (bugs,
textos e visual) vêm em seguida, cada uma com o seu desenho.

## Objetivo

Um play só que divide as meninas em **categorias por nível** (A, B, C, D…), cada
categoria em **grupos por nível**, rodízio dentro do grupo, **duplas fixas** “1ª
com 1ª” e **mata-mata** — com pódio, 🔥 e pontos do mês **por categoria**.
Substitui a gambiarra de 12/10 (três plays `grupos-duplas` no mesmo dia), que zera
o 🔥 de quem está numa categoria por “faltar” nas outras duas.

## Decisões tomadas com a organização

| Tema | Decisão |
|---|---|
| Divisão em categorias | pela **força**: o terço mais forte na A, e assim por diante; dentro da categoria, grupos **por nível** (as mais fortes no grupo 1) |
| Quantas | categorias **configurável** (padrão 3, sem teto além de ter gente); grupos por categoria **configurável**, por ora **2 ou mais** |
| Ajuste na mão | mover qualquer menina para **qualquer categoria e grupo** antes de começar (grupo nunca < 4) |
| Quadras | **fixas por categoria** (padrão: total dividido por igual, numeradas em sequência); categoria que **terminou tudo** cede as quadras |
| Duplas fixas | **1ª com 1ª** (1ª do G1 + 1ª do G2, 2ª + 2ª…) — a regra que já existe (`duplasDaFase2`) |
| Regras de jogo | **as mesmas para todas as categorias**: games e empate por fase, duplas no mata-mata |
| Conta para o mês | **interruptor** (`ranked`); se conta, **cada categoria** tem pódio, 🔥 e pontos |
| Pontos do mês | **por colocação**, tabela única e editável: 🥇 16 · 🥈 12 · 🥉 10 · semifinal 8 · quartas 6 · ficou nos grupos 3 |
| Grupos + duplas | vira o mesmo motor com **uma categoria**; os plays **novos** também pontuam por colocação |
| Classificação do grupo | **vitórias → pontos → saldo de games → confronto direto (só quando justo) → desempate em quadra**; nunca ordem alfabética |
| Ranking do dia na fase de grupos | mostra a classificação de cada grupo **e as duplas “se acabasse agora”** |

## Modelo de dados

O campeonato continua sendo uma `PlaySession` com `format = 'grupos-duplas'`. Por
isso tudo que já testa `format === 'grupos-duplas'` (fase 1 não pontua, bye, fase
2, rótulos de rodada) segue valendo, e grupos + duplas é só o caso de **uma
categoria**.

Campos novos na sessão (script `21-campeonato.sql`, colunas `jsonb` nulas; o app
tolera a falta delas como já tolera as outras):

```ts
type Categoria = {
  nome: string          // 'A', 'B', 'C'...
  grupos: number[]      // indices em session.groups
  quadras: number[]     // quadras fixas, ex. [1, 2]
}
categorias?: Categoria[] | null     // ausente = uma categoria com todos os grupos e todas as quadras
pontuacao?: number[] | null          // [campea, vice, 3o, semifinal, quartas, grupos]; ausente = regra antiga (games + bye)
desempates_grupo?: DesempateDeGrupo[] | null
type DesempateDeGrupo = { grupo: number; ordem: string[]; como: 'simples' | 'par-impar'; at: string }
```

- `session.groups` continua **uma lista só**, na ordem A-G1, A-G2, B-G1… — o
  rodízio, a fila, `grupoDe`, “quem está em quadra” e o refazer não mudam.
- A categoria de uma partida sai de quem joga nela (como hoje o grupo sai de
  `team_a[0]`); as duplas de `session.duos` de cada categoria saem das meninas
  dela, na ordem gravada.
- `pontuacao` fica **gravada no play**: plays antigos (sem ela) pontuam como sempre,
  e nenhum ranking passado muda — mesma ideia do `criterio_dia`.

## Criação (tela “Novo play”)

Formatos na lista: 🔁 Todas com todas · 👥 Em grupos · 🤝 Grupos + duplas ·
**🏆 Campeonato**. Ordem do formulário: quem joga → formato → detalhes.

1. **Divisão** (campeonato): nº de categorias (padrão 3) e grupos por categoria
   (padrão 2, mínimo 2). Aviso se não houver gente (cada grupo ≥ 4).
2. **Distribuição automática**: ordena pela força (`filaPorForca`, empatadas
   sorteadas com semente), corta em categorias de tamanhos o mais iguais possível
   (sobra vai para as de cima) e, dentro de cada uma, `formarGrupos` por nível.
3. **Cartão de ajuste**: categorias → grupos → chips com a nota; tocar numa menina
   e escolher categoria + grupo (`movidas` passa a guardar `{categoria, grupo}`);
   média de força por grupo; “sortear de novo” só reembaralha empatadas.
4. **Quadras por categoria**: padrão `total ÷ categorias`, em sequência; editável.
5. **Regras** (iguais para todas): games e empate por fase (grupos, duplas fixas,
   semifinal, final) e duplas no mata-mata **por categoria** — campos existentes.
6. **Conta para o mês** (`ranked`); ligado, mostra a tabela de pontos (16/12/10/8/6/3).

Grupos + duplas usa a mesma tela com **uma categoria** (sem o passo 1), grupos
**por nível** (deixa de usar `gruposEquilibrados`) e a mesma tabela de pontos.

## Durante o play

- **Fase de grupos**: rodízio de hoje dentro de cada grupo. Cada categoria só usa
  as **quadras dela**; dentro dela cada grupo tem a quadra da casa
  (`atribuirQuadras` passa a olhar as quadras da categoria).
- **Topo**: uma linha por categoria — `A · grupos 4/6` · `B · semifinal` ·
  `C · terminou 🏆`.
- **Filtro** `Todas · A · B · C` para quadras e fila (por aparelho: é preferência
  de quem olha, não estado do play).
- **Quadra**: `Quadra 3 · B · grupo 1` / `Quadra 3 · B · semifinal`.
- **Formar as duplas, por categoria**: quando a fase de grupos da categoria acaba,
  aparece “Formar as duplas da categoria B” (botão, não automático — dá tempo de
  corrigir um placar antes das duplas nascerem). Cada categoria anda no seu ritmo;
  “Próxima rodada” também é por categoria.
- **Quadra cedida**: categoria com a final jogada cede as quadras sozinha para a
  categoria com mais partidas por jogar; o card mostra `cedida pela C → B` com
  chips para trocar o destino. Esperando formar as duplas ainda não cede.

## Classificação do grupo e desempate

Ordem: **vitórias → pontos → saldo de games → confronto direto → desempate em
quadra**.

- **Confronto direto só quando é justo**: entre duas empatadas, conta só se, nas
  partidas em que se enfrentaram, **cada uma teve as mesmas parceiras** (sempre
  verdade em grupo de 4) e uma venceu mais. Senão, e em empate de 3 ou mais, pula.
- **Desempate em quadra**: com empate total ao fim da fase de grupos, “Formar as
  duplas” fica bloqueado e aparece “Desempate no grupo 2: Bia × Carol”; a
  organizadora marca **🎾 simples 1x1** ou **🎲 par ou ímpar** e toca em quem venceu
  (empate de 3: toca na ordem). Fica em `desempates_grupo`, vai ao diário e aparece
  em todos os celulares. Só é pedido quando muda posição.
- Durante a fase de grupos, empatadas aparecem com a mesma posição e “empatadas”.
- O ranking do dia do modo “em grupos” comum não muda (empatada na última vaga do
  pódio sobe junto; a ordem não decide nada).

## Mata-mata, pódio, pontos, 🔥

- **Chave por categoria**: a de hoje (`rodadaDoMataMata`: melhores passam de bye,
  o resto cruza pelas pontas), nas quadras da categoria.
- **Pódio por categoria**: 🥇 e 🥈 da **final**, 🥉 a melhor semifinalista (regra
  atual) — 6 meninas por categoria.
- **Pontos do mês** com `pontuacao`: cada menina leva a colocação da dupla dela;
  quem perdeu nas quartas **ou antes** (oitavas, rodada preliminar) leva “quartas”;
  quem não entrou no mata-mata (corte de `duplas_mm`) leva “grupos”. Nesses plays as partidas **não**
  pontuam por games e o bye não paga (`pontuaveis` e `pontosDeBye` respeitam
  `pontuacao`). A **força (Elo) continua contando todas as partidas**.
- **🔥**: pódio de cada categoria mantém o status; o campeonato é **um** play —
  estar em qualquer categoria é presença.

## Ranking do dia, texto e arte

- **Fase de grupos**: por categoria, a classificação de cada grupo (posição,
  vitórias, pontos, saldo) e as **duplas “se acabasse agora”** (`duplasDaFase2` sobre
  a classificação parcial), marcadas como **parciais**; nada mostrado enquanto
  ninguém do grupo jogou.
- **Mata-mata**: a chave e, no fim, o pódio por categoria com os pontos da tabela.
- **Texto e arte do fechamento**: chips `Tudo · A · B · C`, carimbados com a
  categoria e com o status de cada medalhista (o que já existe para grupos).

## Arquivos

- `src/lib/types.ts` — `Categoria`, `DesempateDeGrupo`, campos novos na sessão.
- `src/lib/campeonato.ts` (novo) — divisão em categorias, categoria de partida e de
  dupla, classificação do grupo (critério + confronto justo + desempate gravado),
  empates pendentes, colocação final e pontos por colocação. Funções puras,
  testadas em node.
- `src/lib/pairing.ts` — `atribuirQuadras` por categoria; quadras cedidas.
- `src/lib/stats.ts` — `pontuaveis`/`pontosDeBye` respeitam `pontuacao`; pontos por
  colocação somados no mês (`Ranking.tsx`, `Stats.tsx`).
- `src/lib/streaks.ts` — pódio do dia por categoria.
- `src/lib/poster.ts` — chips por categoria.
- `src/pages/Play.tsx` — criação (divisão, ajuste, quadras, tabela), linha de
  situação, filtro, formar duplas/rodada por categoria, desempate, ranking do dia
  da fase de grupos. Partes novas em componentes próprios para não engordar mais o
  arquivo de 4.000 linhas.
- `supabase/21-campeonato.sql` — `categorias`, `pontuacao`, `desempates_grupo`.
- `CLAUDE.md`, `DECISOES.md` — as regras acima, com o porquê.

## Testes

- Scripts node no scratchpad (como `testa_refazer.mjs`) para `campeonato.ts`:
  divisão 24 → 3×(4+4), 25/26/27 (sobra nas de cima), 2 a 5 categorias; ajuste
  manual; classificação com empates de 2 e 3; confronto justo (grupo de 4) e
  injusto (grupo de 6); desempate gravado; pontos por colocação com e sem bye.
- Modo local (`VITE_SUPABASE_URL=local`): campeonato de 24 com 3 categorias e
  6 quadras do começo ao fim — grupos, desempate, duplas, chave, cessão de
  quadras, pódios, ranking do mês, 🔥, texto e arte por categoria; grupos + duplas
  de 1 categoria; um play antigo de grupos + duplas continua com os mesmos pontos.
- `npm run build`; conferir a 375px.

## Fora deste desenho

- **Categoria de grupo único** (o que fazer depois do rodízio) — decidir depois;
  por ora o mínimo é 2 grupos.
- Fila confiável e tempo real (parte A), inclusive o refazer respeitar o rodízio de
  6 e o aviso de 3 seguidas.
- Os três plays de 12/10 criados na mão: a organização recria como um campeonato e
  apaga os três; o app não apaga nada sozinho.
