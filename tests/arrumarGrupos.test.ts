import test from 'node:test'
import assert from 'node:assert/strict'
import { filaDosGruposArrumados, moverNoRascunho, problemasDaFila, problemasDosGrupos } from '../src/lib/arrumarGrupos'
import { filaPorGrupo, proximasPelaFila, type Noite } from '../src/lib/fila'
import { jogadorasDaPartida, jogosDoRodizio, planToMatches, type Generos, type PlannedMatch } from '../src/lib/pairing'
import type { Match } from '../src/lib/types'

/*
 * ARRUMAR OS GRUPOS DEPOIS DE CRIAR O PLAY: a fila refeita tem que estar certa
 * (cada uma no seu grupo, todas com o mesmo numero de jogos, todas as duplas do
 * rodizio) e a noite tem que andar ate a ultima partida.
 */
function rng(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const nome = (i: number) => `Grupo ${i + 1}`

/** Monta grupos com estes tamanhos e faz `movimentos` mudancas validas (todo grupo fica com 4+). */
function gruposMexidos(tamanhos: number[], movimentos: number, r: () => number) {
  const ids = Array.from({ length: tamanhos.reduce((t, n) => t + n, 0) }, (_, i) => `p${i}`)
  let k = 0
  let grupos = tamanhos.map((n) => ids.slice(k, (k += n)))
  for (let m = 0; m < movimentos; m++) {
    const de = Math.floor(r() * grupos.length)
    const para = Math.floor(r() * grupos.length)
    if (de === para || grupos[de].length <= 4) continue
    const id = grupos[de][Math.floor(r() * grupos[de].length)]
    grupos = moverNoRascunho(grupos, id, para)
  }
  return { ids, grupos }
}

/** Joga a noite pela fila (como a tela faz) e devolve quantas partidas aconteceram. */
function jogarANoite(ids: string[], grupos: string[][], fila: PlannedMatch[], quadras: number, r: () => number) {
  let matches: Match[] = planToMatches('s', fila)
  const naQuadra = new Map<number, string>()
  const fimDe = new Map<number, number>()
  let agora = 0
  for (let passo = 0; passo < 1000; passo++) {
    const n: Noite = { jogadoras: ids, grupos, matches, quadras }
    const livres = Array.from({ length: quadras }, (_, i) => i + 1).filter((q) => !naQuadra.has(q))
    if (livres.length) {
      for (const [q, m] of proximasPelaFila(n, livres, undefined, filaPorGrupo(n))) {
        matches = matches.map((x) => (x.id === m.id ? { ...x, started_at: new Date(agora * 60000).toISOString(), court: q } : x))
        naQuadra.set(q, m.id)
        fimDe.set(q, agora + 8 + r() * 12)
      }
    }
    if (naQuadra.size === 0) break
    const [q] = [...fimDe.entries()].filter(([q]) => naQuadra.has(q)).sort((a, b) => a[1] - b[1])[0]
    agora = fimDe.get(q) as number
    const id = naQuadra.get(q)
    naQuadra.delete(q)
    matches = matches.map((x) =>
      x.id === id ? { ...x, score_a: 4, score_b: Math.floor(r() * 4), started_at: null, ended_at: new Date(agora * 60000).toISOString() } : x,
    )
  }
  const jogadas = matches.filter((m) => m.score_a !== null)
  const jogos = new Map<string, number>()
  for (const m of jogadas) for (const id of jogadorasDaPartida(m)) jogos.set(id, (jogos.get(id) ?? 0) + 1)
  return { jogadas: jogadas.length, total: matches.length, jogos }
}

const CENARIOS: [string, number[], number][] = [
  ['4 + 4', [4, 4], 2],
  ['5 + 4', [5, 4], 2],
  ['6 + 6', [6, 6], 2],
  ['7 + 6', [7, 6], 2],
  ['8 + 8', [8, 8], 3],
  ['6 + 6 + 6', [6, 6, 6], 3],
  ['10 + 9', [10, 9], 3],
  ['5 + 5 + 5 + 5', [5, 5, 5, 5], 4],
]

for (const [titulo, tamanhos, quadras] of CENARIOS) {
  test(`arrumar grupos ${titulo}: a fila refeita esta certa e a noite termina`, () => {
    for (let s = 1; s <= 15; s++) {
      const r = rng(s)
      Math.random = rng(s * 7919)
      const { ids, grupos } = gruposMexidos(tamanhos, 1 + (s % 4), r)
      const ratings = new Map(ids.map((id) => [id, 1 + r() * 2]))
      const { fila, problemas } = filaDosGruposArrumados({ playerIds: ids, groups: grupos, ratings, nomeDoGrupo: nome })
      assert.deepEqual(problemas, [], `semente ${s}, grupos ${grupos.map((g) => g.length)}`)
      const noite = jogarANoite(ids, grupos, fila, quadras, r)
      assert.equal(noite.jogadas, noite.total, `a noite tem que terminar (semente ${s})`)
      // todas do mesmo grupo com o mesmo numero de jogos
      for (const g of grupos) {
        for (const id of g) assert.equal(noite.jogos.get(id), jogosDoRodizio(g.length), `${id} no grupo de ${g.length}`)
      }
    }
  })
}

test('misto: troca que mantem metade de cada genero continua so com duplas mistas', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `p${i}`)
  // pares = mulheres, impares = homens
  const genero: Generos = new Map(ids.map((id, i) => [id, i % 2 === 0 ? 'F' : 'M'] as const))
  let grupos = [ids.slice(0, 8), ids.slice(8)]
  // uma mulher de cada lado trocam de grupo
  grupos = moverNoRascunho(grupos, 'p0', 1)
  grupos = moverNoRascunho(grupos, 'p8', 0)
  Math.random = rng(3)
  const ratings = new Map(ids.map((id) => [id, 2]))
  const { fila, problemas } = filaDosGruposArrumados({ playerIds: ids, groups: grupos, ratings, genero, nomeDoGrupo: nome })
  assert.deepEqual(problemas, [])
  for (const m of fila) for (const d of [m.team_a, m.team_b]) assert.notEqual(genero.get(d[0]), genero.get(d[1]))
})

test('misto: grupo que perde o equilibrio sai com duplas livres, e certas', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `p${i}`)
  const genero: Generos = new Map(ids.map((id, i) => [id, i % 2 === 0 ? 'F' : 'M'] as const))
  // uma mulher sai do grupo 1 para o 2: 7 (3F) e 9 (5F)
  const grupos = moverNoRascunho([ids.slice(0, 8), ids.slice(8)], 'p0', 1)
  Math.random = rng(5)
  const ratings = new Map(ids.map((id) => [id, 2]))
  const { fila, problemas } = filaDosGruposArrumados({ playerIds: ids, groups: grupos, ratings, genero, nomeDoGrupo: nome })
  assert.deepEqual(problemas, [])
  const r = rng(9)
  const noite = jogarANoite(ids, grupos, fila, 3, r)
  assert.equal(noite.jogadas, noite.total)
})

test('grupos que nao podem virar play: menos de 4, alguem fora, alguem em dois', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  assert.deepEqual(problemasDosGrupos(ids, [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']], nome), [])
  assert.deepEqual(problemasDosGrupos(ids, [['a', 'b', 'c'], ['d', 'e', 'f', 'g', 'h']], nome), ['Grupo 1 ficaria com menos de 4'])
  assert.ok(problemasDosGrupos(ids, [['a', 'b', 'c', 'd'], ['e', 'f', 'g']], nome).length > 0, 'h ficou sem grupo')
  assert.ok(problemasDosGrupos(ids, [['a', 'b', 'c', 'd', 'e'], ['e', 'f', 'g', 'h']], nome).length > 0, 'e em dois grupos')
  // e sem nada para gerar: a fila nem e montada
  const { fila, problemas } = filaDosGruposArrumados({
    playerIds: ids,
    groups: [['a', 'b', 'c'], ['d', 'e', 'f', 'g', 'h']],
    ratings: new Map(),
    nomeDoGrupo: nome,
  })
  assert.equal(fila.length, 0)
  assert.ok(problemas.length > 0)
})

test('a conferencia pega fila errada: partida a menos, gente de outro grupo, pessoa repetida', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const grupos = [ids.slice(0, 4), ids.slice(4)]
  Math.random = rng(1)
  const { fila } = filaDosGruposArrumados({ playerIds: ids, groups: grupos, ratings: new Map(), nomeDoGrupo: nome })
  assert.deepEqual(problemasDaFila(grupos, fila, nome), [])
  // falta uma partida do grupo 1
  const semUma = fila.filter((m, i) => i !== fila.findIndex((x) => x.grupo === 0))
  assert.ok(problemasDaFila(grupos, semUma, nome).some((p) => p.startsWith('Grupo 1')))
  // alguem do grupo 2 numa partida do grupo 1
  const i1 = fila.findIndex((x) => x.grupo === 0)
  const invasora = fila.map((m, i) => (i === i1 ? { ...m, team_a: ['e', m.team_a[1]] as [string, string] } : m))
  assert.ok(problemasDaFila(grupos, invasora, nome).includes('Grupo 1: partida com gente de outro grupo'))
  // a mesma pessoa dos dois lados
  const repetida = fila.map((m, i) => (i === i1 ? { ...m, team_b: [m.team_a[0], m.team_b[1]] as [string, string] } : m))
  assert.ok(problemasDaFila(grupos, repetida, nome).includes('Grupo 1: partida com a mesma pessoa duas vezes'))
  // a fila velha (de antes de mover alguem) nao serve para os grupos novos
  const novos = moverNoRascunho(moverNoRascunho(grupos, 'a', 1), 'e', 0)
  assert.ok(problemasDaFila(novos, fila, nome).length > 0)
})
