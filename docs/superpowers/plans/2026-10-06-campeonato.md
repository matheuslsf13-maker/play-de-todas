# Modo Campeonato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um play `grupos-duplas` com categorias (A, B, C…) por força, grupos por nível, duplas 1ª com 1ª, mata-mata, pódio/🔥/pontos por categoria e pontos por colocação.

**Architecture:** As regras puras vão para `src/lib/campeonato.ts` (testadas em node). A sessão ganha `categorias`, `pontuacao`, `desempates_grupo` e `quadras_cedidas`; `session.groups` continua uma lista só (A-G1, A-G2, B-G1…), então rodízio, fila e “quem está em quadra” não mudam. `Play.tsx` passa a fazer fase 2, rodadas, quadras e pódio **por categoria**; sem `categorias`, tudo se comporta como uma categoria única (grupos + duplas de hoje).

**Tech Stack:** React 18 + TypeScript + Vite 5; Supabase; testes com `node:test` sobre bundle do `esbuild` (já instalado como dependência do Vite).

**Spec:** `docs/superpowers/specs/2026-10-06-campeonato-design.md`

## Global Constraints

- Português do Brasil na interface; identificadores sem acento; `plural()` em vez de “(s)”.
- Sem dependência nova de produção; `esbuild` entra só como devDependency já instalada (0.21.5).
- `npm run build` antes de cada commit; push na `main` publica — **só no fim**, com tudo verde.
- Plays antigos não mudam: sem `pontuacao` pontuam como sempre; sem `categorias` = uma categoria.
- Nada no banco pode recusar o que a tela aceitou: colunas novas `jsonb` nulas, toleradas pelo `upsertTolerante`.
- `.env.local` com `VITE_SUPABASE_URL=local` só durante o teste local; apagar antes de build/commit.
- Pontuação padrão: `[16, 12, 10, 8, 6, 3]` = campeã, vice, 3º, semifinal, quartas (ou antes), fase de grupos.
- Classificação do grupo: vitórias → pontos → saldo de games → confronto direto **só se justo** → desempate em quadra; **nunca** ordem alfabética.

## Review Focus

- Categoria que termina antes das outras: as quadras dela vão para quem ainda joga; a categoria terminada não ganha partida nova.
- Placar corrigido (✏️) na fase de grupos depois do desempate gravado: o desempate só vale se as empatadas continuarem empatadas (o bloco tem de ser o mesmo conjunto).
- Play antigo de grupos + duplas (sem `pontuacao`, sem `categorias`): ranking do mês, 🔥 e arte iguais aos de antes.
- Empate de 3 no grupo: nada de confronto direto; desempate em quadra com a ordem tocada.
- Campeonato que não conta (`ranked = false`): nenhum ponto de colocação no mês e nenhum 🔥.

---

### Task 1: Test runner + tipos + script SQL 21

**Files:**
- Create: `scripts/testar.mjs`, `tests/campeonato.test.ts` (esqueleto), `supabase/21-campeonato.sql`
- Modify: `package.json` (script `test`, devDependency `esbuild`), `src/lib/types.ts`

**Interfaces:**
- Produces: `Categoria`, `DesempateDeGrupo`, campos `categorias`, `pontuacao`, `desempates_grupo`, `quadras_cedidas` em `PlaySession`; `TipoDeEvento` += `'desempate'`; `npm test`.

- [ ] **Step 1: runner** — `scripts/testar.mjs`:

```js
// Roda os testes de tests/*.test.ts: o esbuild empacota cada um (os imports do
// app nao tem extensao, entao o node sozinho nao resolve) e o node:test executa.
import { build } from 'esbuild'
import { readdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const dir = mkdtempSync(join(tmpdir(), 'pdt-testes-'))
const arquivos = readdirSync('tests').filter((f) => f.endsWith('.test.ts'))
const saidas = []
for (const f of arquivos) {
  const out = join(dir, f.replace(/\.ts$/, '.mjs'))
  await build({ entryPoints: [join('tests', f)], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' })
  saidas.push(out)
}
const r = spawnSync(process.execPath, ['--test', ...saidas], { stdio: 'inherit' })
process.exit(r.status ?? 1)
```

`package.json`: `"test": "node scripts/testar.mjs"`, devDependencies `"esbuild": "^0.21.5"`.

- [ ] **Step 2: tipos** — em `src/lib/types.ts`, antes de `PlaySession`:

```ts
/** Uma categoria do campeonato: os grupos dela (indices em `groups`) e as quadras fixas. */
export type Categoria = { nome: string; grupos: number[]; quadras: number[] }

/** Desempate decidido em quadra (simples 1x1 ou par ou impar) no fim da fase de grupos. */
export type DesempateDeGrupo = { grupo: number; ordem: string[]; como: 'simples' | 'par-impar'; at: string }
```

Em `PlaySession`: `categorias?: Categoria[] | null`, `pontuacao?: number[] | null`, `desempates_grupo?: DesempateDeGrupo[] | null`, `quadras_cedidas?: Record<string, number> | null` (quadra → índice da categoria que recebe), cada um com doc-comment. `TipoDeEvento` ganha `'desempate'`.

- [ ] **Step 3: SQL** — `supabase/21-campeonato.sql` no padrão dos outros (cabeçalho, “pode rodar de novo”, conferência):

```sql
alter table public.sessions add column if not exists categorias jsonb;
alter table public.sessions add column if not exists pontuacao jsonb;
alter table public.sessions add column if not exists desempates_grupo jsonb;
alter table public.sessions add column if not exists quadras_cedidas jsonb;
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'sessions'
   and column_name in ('categorias', 'pontuacao', 'desempates_grupo', 'quadras_cedidas');
```

- [ ] **Step 4:** `tests/campeonato.test.ts` com um teste trivial (`assert.equal(1, 1)`); `npm test` → PASS; `npx tsc --noEmit -p .` limpo.
- [ ] **Step 5: Commit** `Campeonato: tipos, script 21 e npm test`.

### Task 2: Divisão em categorias e quadras padrão

**Files:** Create `src/lib/campeonato.ts`; Test `tests/campeonato.test.ts`

**Interfaces:**
- Consumes: `filaPorForca(ids, ratings, semente)` de `pairing.ts` (exportar se não for).
- Produces:
  - `nomeDaCategoria(i: number): string` → `'A'`, `'B'`…
  - `dividirEmCategorias(ids: string[], ratings: Map<string, number>, nCategorias: number, gruposPorCategoria: number, semente?: number): string[][][]` — `[categoria][grupo][ids]`, por força, sobras nas de cima.
  - `fatiar<T>(lista: T[], partes: number): T[][]` — tamanhos o mais iguais possível, sobra nas primeiras.
  - `quadrasPadrao(nCategorias: number, total: number): number[][]` — em sequência, sobra nas de cima, cada categoria ≥ 1.
  - `montarCategorias(estrutura: string[][][], quadras: number[][]): { groups: string[][]; categorias: Categoria[] }`
  - `categoriasDoPlay(s: Pick<PlaySession, 'categorias' | 'groups' | 'courts'>): Categoria[]` — ausente = uma categoria `'A'` com todos os grupos e quadras `1..courts`.
  - `categoriaDaJogadora(cats: Categoria[], groups: string[][], id: string): number` (−1 se nenhuma); `categoriaDaPartida(cats, groups, m: Match): number`.

- [ ] **Step 1: testes que falham:**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { dividirEmCategorias, fatiar, quadrasPadrao, categoriasDoPlay, montarCategorias, nomeDaCategoria } from '../src/lib/campeonato'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)
const forca = (lista: string[]) => new Map(lista.map((id, i) => [id, 100 - i])) // p1 a mais forte

test('24 em 3 categorias de 2 grupos: A tem as 8 mais fortes, grupo 1 as 4 mais fortes', () => {
  const l = ids(24)
  const e = dividirEmCategorias(l, forca(l), 3, 2, 1)
  assert.deepEqual(e.map((c) => c.map((g) => g.length)), [[4, 4], [4, 4], [4, 4]])
  assert.deepEqual(e[0][0].sort(), ['p1', 'p2', 'p3', 'p4'])
  assert.deepEqual(e[2][1].sort(), ['p21', 'p22', 'p23', 'p24'])
})
test('26 em 3: sobra vai para as de cima', () => {
  const l = ids(26)
  assert.deepEqual(dividirEmCategorias(l, forca(l), 3, 2, 1).map((c) => c.flat().length), [9, 9, 8])
})
test('fatiar', () => assert.deepEqual(fatiar([1, 2, 3, 4, 5], 2), [[1, 2, 3], [4, 5]]))
test('quadras padrao', () => {
  assert.deepEqual(quadrasPadrao(3, 6), [[1, 2], [3, 4], [5, 6]])
  assert.deepEqual(quadrasPadrao(3, 7), [[1, 2, 3], [4, 5], [6, 7]])
  assert.deepEqual(quadrasPadrao(3, 2), [[1], [2], [2]])
})
test('montar e ler categorias', () => {
  const { groups, categorias } = montarCategorias([[['a'], ['b']], [['c'], ['d']]], [[1, 2], [3, 4]])
  assert.deepEqual(groups, [['a'], ['b'], ['c'], ['d']])
  assert.deepEqual(categorias, [{ nome: 'A', grupos: [0, 1], quadras: [1, 2] }, { nome: 'B', grupos: [2, 3], quadras: [3, 4] }])
  assert.deepEqual(categoriasDoPlay({ categorias: null, groups: [['a'], ['b']], courts: 2 }), [{ nome: 'A', grupos: [0, 1], quadras: [1, 2] }])
  assert.equal(nomeDaCategoria(4), 'E')
})
```

- [ ] **Step 2:** `npm test` → FAIL (módulo não existe).
- [ ] **Step 3: implementação** — `fatiar` (base = floor, sobra nas primeiras); `dividirEmCategorias` = `filaPorForca` → `fatiar(ordem, nCategorias)` → cada fatia `fatiar(fatia, gruposPorCategoria)` (a fila já está por força, então fatias contíguas = por nível); `quadrasPadrao`: com `total >= n` usa `fatiar([1..total], n)`; com menos quadras que categorias, a categoria `i` recebe `[min(i + 1, total)]` (divide a última); `montarCategorias` concatena grupos e anota índices; `categoriasDoPlay` normaliza.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `Campeonato: divisao em categorias por forca`.

### Task 3: Classificação do grupo, confronto justo e desempate

**Files:** Modify `src/lib/campeonato.ts`; Test `tests/campeonato.test.ts`

**Interfaces:**
- Consumes: `matchPoints`, `isPlayed` (`scoring.ts`); `DesempateDeGrupo`.
- Produces:
  - `type LinhaDoGrupo = { id: string; jogos: number; vitorias: number; pontos: number; saldo: number; posicao: number; empatadas: string[] }`
  - `confrontoJusto(a: string, b: string, partidas: Match[]): number` — `>0` a na frente, `<0` b, `0` não decide (não se enfrentaram, parceiras diferentes ou empate).
  - `classificarGrupo(grupo: string[], partidas: Match[], desempate?: DesempateDeGrupo): { linhas: LinhaDoGrupo[]; pendente: string[][] }` — `pendente` = blocos ainda empatados (cada um com 2+ ids).

- [ ] **Step 1: testes:**

```ts
import { classificarGrupo, confrontoJusto } from '../src/lib/campeonato'
import type { Match } from '../src/lib/types'
let n = 0
const p = (a: [string, string], b: [string, string], sa: number, sb: number): Match =>
  ({ id: `m${++n}`, session_id: 's', round: n, court: 1, team_a: a, team_b: b, score_a: sa, score_b: sb, fase: 1, disputa_3o: false, started_at: null, ended_at: null })

test('vitorias antes de pontos', () => {
  // grupo de 4: AB x CD, AC x BD, AD x BC
  const ms = [p(['A', 'B'], ['C', 'D'], 4, 0), p(['A', 'C'], ['B', 'D'], 4, 3), p(['A', 'D'], ['B', 'C'], 3, 4)]
  const { linhas } = classificarGrupo(['A', 'B', 'C', 'D'], ms)
  assert.equal(linhas[0].id, 'A') // 2 vitorias
  assert.deepEqual(linhas.map((l) => l.vitorias), [2, 2, 1, 1].slice(0, 4).sort((x, y) => y - x))
})
test('confronto justo no grupo de 4: cada uma teve as mesmas parceiras', () => {
  const ms = [p(['A', 'B'], ['C', 'D'], 4, 2), p(['A', 'D'], ['C', 'B'], 4, 2)]
  assert.ok(confrontoJusto('A', 'C', ms) > 0)
})
test('confronto injusto (parceiras diferentes) nao decide', () => {
  const ms = [p(['A', 'B'], ['C', 'D'], 4, 2), p(['A', 'E'], ['C', 'F'], 4, 2)]
  assert.equal(confrontoJusto('A', 'C', ms), 0)
})
test('empate total fica pendente ate o desempate gravado', () => {
  const ms = [p(['A', 'B'], ['C', 'D'], 4, 2), p(['A', 'C'], ['B', 'D'], 2, 4), p(['A', 'D'], ['B', 'C'], 4, 2)]
  const sem = classificarGrupo(['A', 'B', 'C', 'D'], ms)
  // B e A: 2 vitorias, mesmos pontos e saldo, confronto 1x1 -> pendente
  assert.ok(sem.pendente.some((b) => b.includes('A') && b.includes('B')))
  const com = classificarGrupo(['A', 'B', 'C', 'D'], ms, { grupo: 0, ordem: ['B', 'A'], como: 'simples', at: '' })
  assert.equal(com.pendente.length, 0)
  assert.equal(com.linhas.findIndex((l) => l.id === 'B') < com.linhas.findIndex((l) => l.id === 'A'), true)
})
test('desempate gravado para outro conjunto nao vale (placar corrigido)', () => {
  const ms = [p(['A', 'B'], ['C', 'D'], 4, 2), p(['A', 'C'], ['B', 'D'], 2, 4), p(['A', 'D'], ['B', 'C'], 4, 2)]
  const r = classificarGrupo(['A', 'B', 'C', 'D'], ms, { grupo: 0, ordem: ['C', 'D'], como: 'par-impar', at: '' })
  assert.ok(r.pendente.length > 0)
})
test('empate de 3 vai direto para o desempate em quadra', () => {
  const ms = [p(['A', 'B'], ['C', 'D'], 4, 3), p(['C', 'B'], ['A', 'D'], 4, 3), p(['A', 'C'], ['B', 'D'], 3, 4)]
  const r = classificarGrupo(['A', 'B', 'C', 'D'], ms)
  assert.ok(r.pendente.some((b) => b.length >= 2))
})
```

(Ajustar os placares do 1º teste ao implementar para que a asserção reflita exatamente a ordem vitórias → pontos; o que importa é: mais vitórias na frente mesmo com menos pontos.)

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: implementação:**
  - estatística por jogadora do grupo só com partidas jogadas (`isPlayed`) em que ela está: vitórias, pontos (`matchPoints`), saldo (games feitos − sofridos);
  - ordenar por `vitorias`, `pontos`, `saldo` (desc) e, só para estabilidade de exibição, por `id`;
  - percorrer blocos iguais nos três números: bloco de 2 → `confrontoJusto`; decidiu, ordena; senão, se `desempate` existe e `new Set(desempate.ordem)` tem **exatamente** os ids do bloco, ordena pela `ordem`; senão o bloco vai para `pendente` e todas as do bloco recebem a mesma `posicao` (a do primeiro) e `empatadas` = as outras;
  - bloco de 3+: só o desempate gravado (mesma regra do conjunto exato) resolve;
  - `confrontoJusto`: partidas jogadas em que `a` e `b` estão em lados opostos; parceiras de `a` (ordenadas) e de `b` (ordenadas) têm de ser iguais e não vazias; retorna `vitoriasDeA − vitoriasDeB`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `Campeonato: classificacao do grupo com confronto justo e desempate em quadra`.

### Task 4: Colocações, duplas por categoria, colocação final e pontos

**Files:** Modify `src/lib/campeonato.ts`; Test `tests/campeonato.test.ts`

**Interfaces:**
- Consumes: `Colocacao`, `duplasDaFase2` (`pairing.ts`); `rankDuplasDoDia` (`stats.ts`); `classificarGrupo`.
- Produces:
  - `PONTUACAO_PADRAO = [16, 12, 10, 8, 6, 3]`
  - `colocacoesDaCategoria(s: PlaySession, cat: number, partidas: Match[]): { colocacoes: Colocacao[]; pendentes: { grupo: number; ids: string[] }[] }` (grupo = índice global em `groups`; `Colocacao.grupo` = índice **dentro** da categoria, para `duplasDaFase2` cruzar grupos).
  - `duosDaCategoria(s: PlaySession, cat: number): [string, string][]` — de `s.duos`, na ordem gravada.
  - `partidasDaCategoria(s: PlaySession, cat: number, partidas: Match[]): Match[]`
  - `categoriaTerminou(s: PlaySession, cat: number, partidas: Match[]): boolean` — duplas formadas, nada sem placar na categoria e no máximo uma dupla viva.
  - `pontosDeColocacao(s: PlaySession, partidas: Match[]): Map<string, number>` — vazio sem `s.pontuacao` ou `s.ranked === false`; por categoria **terminada**: medalha 3/2/1 → índices 0/1/2; `saiuEm === 'na semifinal'` → 3; demais duplas da chave → 4; quem é da categoria e não está em dupla → 5.

- [ ] **Step 1: testes** — montar uma sessão de 2 categorias × 2 grupos de 4 com fase 1 completa e chave de 2 duplas por categoria (final só): conferir `colocacoesDaCategoria(...).colocacoes` posições 1–4 por grupo; `duplasDaFase2` sobre elas dá 1ª+1ª; `categoriaTerminou` false antes da final e true depois; `pontosDeColocacao` dá 16 às campeãs, 12 às vices e 3 para quem ficou de fora com `duplas_mm = 2`; zero com `ranked: false`; zero sem `pontuacao`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** `Campeonato: colocacao final e pontos por colocacao`.

### Task 5: Quadras por categoria e cessão

**Files:** Modify `src/lib/campeonato.ts`, `src/lib/pairing.ts` (`EscolhaOpts.quadrasDaCasa`, `atribuirQuadras`); Test `tests/campeonato.test.ts`

**Interfaces:**
- Produces:
  - `quadrasEfetivas(cats: Categoria[], terminou: boolean[], pendentes: number[], cedidas?: Record<string, number> | null): number[][]` — cada categoria fica com as suas; as de categoria terminada vão para `cedidas[quadra]` (se essa não terminou) ou para a não terminada com mais `pendentes`.
  - `EscolhaOpts.quadrasDaCasa?: number[]` — a quadra da casa do grupo `i` é `quadrasDaCasa[i] ?? i + 1`.

- [ ] **Step 1: testes** — `quadrasEfetivas([{A,[1,2]},{B,[3,4]},{C,[5,6]}], [false,false,true], [3,7,0])` → C cede 5 e 6 para B; com `cedidas {'5': 0}` → 5 vai para A e 6 para B; todas terminadas → cada uma com as suas.
- [ ] **Step 2–4:** FAIL → implementar → PASS (`npm test`), `npx tsc --noEmit -p .`.
- [ ] **Step 5: Commit** `Campeonato: quadras fixas por categoria e cessao`.

### Task 6: Pontos do mês, bye e 🔥 por categoria

**Files:** Modify `src/lib/stats.ts`, `src/lib/streaks.ts`, `src/pages/Ranking.tsx`, `src/pages/Stats.tsx`; Test `tests/campeonato.test.ts`

**Interfaces:**
- Produces:
  - `pontuaveis` exclui **todas** as partidas de sessões com `pontuacao`.
  - `pontosDeBye` pula sessões com `pontuacao`.
  - `pontosExtras(sessoes: PlaySession[], matches: Match[]): Map<string, number>` = bye + `pontosDeColocacao` das sessões que têm partidas em `matches`.
  - `computeStreaks`: no `grupos-duplas`, pódio = união do pódio de cada categoria (`rankDuplasDoDia` por categoria, `DUPLAS_NO_PODIO` duplas cada); campeãs do dia = as duplas ouro de todas as categorias.

- [ ] **Step 1: testes** — sessão campeonato terminada com `pontuacao`: `computeStatsComPontos` dá 0 de partidas; `pontosExtras` dá a tabela; sessão antiga de grupos-duplas sem `pontuacao` mantém os pontos de antes (fase ≥ 2 pontua, bye paga).
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** `Ranking.tsx` e `Stats.tsx` trocam `pontosDeBye(...).porJogadora` por `pontosExtras(...)` (a coluna “bye” passa a se chamar pelo que é: só aparece quando há bye de verdade — conferir o rótulo). `npm run build`.
- [ ] **Step 6: Commit** `Campeonato: pontos por colocacao no mes e podio por categoria no fogo`.

### Task 7: Criar o campeonato (tela Novo Play)

**Files:** Modify `src/pages/Play.tsx` (`FORMATOS`, `NewPlay`); Create `src/components/DivisaoDoCampeonato.tsx`

**Interfaces:**
- Consumes: `dividirEmCategorias`, `quadrasPadrao`, `montarCategorias`, `PONTUACAO_PADRAO`, `formarGrupos`.
- Produces: sessão gravada com `format: 'grupos-duplas'`, `groups`, `categorias`, `courts = soma das quadras`, `pontuacao` (se `ranked`), `alvos`, `desempates`, `duplas_mm`.

- [ ] **Step 1:** `FORMATOS` ganha `{ valor: 'campeonato', rotulo: '🏆 Campeonato', explica: 'categorias por nível (A, B, C…), grupos dentro de cada uma, duplas fixas e mata-mata' }`; o estado da tela vira `FormatoDaTela = PlayFormat | 'campeonato'`; `emDuplas` = grupos-duplas **ou** campeonato.
- [ ] **Step 2:** grupos + duplas passa a usar `formarGrupos` (por nível) em vez de `gruposEquilibrados`; o texto do “Meninas por grupo” deixa de dizer “mesma força média”.
- [ ] **Step 3:** campeonato: estados `nCategorias` (3), `gruposPorCategoria` (2), `quadrasDaCategoria: number[]` (padrão de `quadrasPadrao` sobre `courts`), `movidasCat: Record<string, { c: number; g: number }>`, `pontuacao` (`PONTUACAO_PADRAO`). Estrutura = `dividirEmCategorias(...)` + ajustes (pular o que deixaria grupo < 4). `DivisaoDoCampeonato` mostra categoria → grupos → chips com nota; tocar numa menina abre os destinos “A·G1, A·G2, B·G1…”; Steppers de categorias, grupos e quadras por categoria; aviso quando falta gente (`nCategorias × gruposPorCategoria × 4`).
- [ ] **Step 4:** cartão “Pontos por colocação” (só com `ranked`): 6 Steppers rotulados 🥇 Campeã · 🥈 Vice · 🥉 3º lugar · Semifinal · Quartas · Fase de grupos; vale também para grupos + duplas.
- [ ] **Step 5:** `create()` grava como acima; `gerarFila` com `groups` achatados.
- [ ] **Step 6:** conferir em modo local a 375px; `npm run build`; **Commit** `Campeonato: criar com categorias, quadras e pontos por colocacao`.

### Task 8: O campeonato rolando (fase 2 e quadras por categoria, desempate)

**Files:** Modify `src/pages/Play.tsx` (`PlayDetail`); Create `src/components/DesempateEmQuadra.tsx`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: `gerarFase2(cat)`, `gerarProximaRodada(cat)`, sugestões por categoria com `quadrasDaCasa`, linha de situação, filtro, rótulo da quadra, desempate em quadra.

- [ ] **Step 1:** `cats = categoriasDoPlay(session)`; por categoria: `daFase1`, `doMataMata`, `duos`, `vivas`, `ultimaFase`, `daUltimaRodada`, `podeGerarFase2`, `podeGerarRodada`, `pendentesDeDesempate`. `rodadaDe(m)`/`degrauDe`/`rotuloDaPartida` usam a categoria da partida.
- [ ] **Step 2:** `gerarFase2(cat)` usa `colocacoesDaCategoria`; bloqueia com pendência; grava `duos` = as das outras categorias + as novas; `round` novo = maior `round` + 1… (não `daFase1.length`). `gerarProximaRodada(cat)` igual, com disputa de 3º da categoria.
- [ ] **Step 3:** `proximas` roda `proximasDasQuadras` por categoria com as quadras livres de `quadrasEfetivas(...)`, pendentes da categoria e `quadrasDaCasa` = quadras da categoria, e junta os mapas. Escolha na mão continua valendo por quadra.
- [ ] **Step 4:** linha de situação por categoria (`grupos x/y`, nome da rodada, `terminou 🏆`), filtro `Todas · A · B…` (localStorage por play), rótulo `Quadra 3 · B · grupo 1` e `cedida pela C → B` com chips que gravam `quadras_cedidas`.
- [ ] **Step 5:** `DesempateEmQuadra`: por pendência, chips 🎾 Simples 1x1 / 🎲 Par ou ímpar e toque na ordem; grava `desempates_grupo` (substitui o do mesmo grupo) + evento `'desempate'`; o card de formar duplas mostra o desempate antes do botão.
- [ ] **Step 6:** play antigo de grupos + duplas (sem `categorias`) abre e anda igual; `npm run build`; **Commit** `Campeonato: fase 2, quadras e desempate por categoria`.

### Task 9: Ranking do dia, texto e arte por categoria

**Files:** Modify `src/pages/Play.tsx`; Create `src/components/ClassificacaoDosGrupos.tsx`

- [ ] **Step 1:** `ClassificacaoDosGrupos`: por categoria, por grupo, tabela posição · nome · V · pts · saldo (empatadas com a mesma posição e “empatadas”); “Se acabasse agora” com `duplasDaFase2(colocacoesDaCategoria(...).colocacoes, duplas_mm)`, marcado **parcial**; grupo sem partida jogada mostra “ainda não começou”.
- [ ] **Step 2:** o modal do ranking do dia mostra isso enquanto alguma categoria está na fase de grupos (hoje mostra vazio até a fase 2); depois, chave e pódio **por categoria** (`rankDuplasDoDia` por categoria) com os pontos da tabela.
- [ ] **Step 3:** chips `Tudo · A · B…` reaproveitando `grupoArte` como índice de categoria no campeonato; texto e arte com “Categoria A” no cabeçalho; status de cada medalhista.
- [ ] **Step 4:** `npm run build`; **Commit** `Campeonato: ranking do dia com a fase de grupos e podio por categoria`.

### Task 10: Docs, teste ponta a ponta, publicação

- [ ] **Step 1:** `CLAUDE.md` (regras do campeonato, classificação, pontos, quadras) e `DECISOES.md` (por que um play só; por que 1ª com 1ª com grupos por nível; por que confronto só quando justo; por que pontos por colocação — o exemplo da vice com mais pontos).
- [ ] **Step 2:** modo local: campeonato de 24 (3 × 2 × 4), 6 quadras, do começo ao fim, com um empate total resolvido em quadra, uma categoria terminando antes (quadras cedidas), pódios, ranking do mês, 🔥, texto e arte por categoria; grupos + duplas de 1 categoria; play antigo de 05/10 intocado.
- [ ] **Step 3:** apagar `.env.local`; `npm test`; `npm run build`; commit; push (publica); avisar a organização de rodar `21-campeonato.sql`.
