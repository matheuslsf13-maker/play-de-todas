import test from 'node:test'
import assert from 'node:assert/strict'
import { filaPorGrupo, proximasPelaFila, proximasSemFila, type Noite } from '../src/lib/fila'
import { formarGrupos, gerarFila, jogadorasDaPartida, planToMatches, quadrasSimultaneas } from '../src/lib/pairing'
import type { Match } from '../src/lib/types'

/*
 * SIMULACAO DE NOITES: partidas de 8 a 20 minutos, quadras terminando em horas
 * diferentes. Mede o pior encadeamento (partidas seguidas de uma menina dentro
 * do grupo) e se a partida que entra na quadra e a primeira da fila mostrada.
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

type Politica = 'sem-fila' | 'pela-fila'

function noite(tamanhos: number[], quadras: number, politica: Politica, semente: number) {
  const r = rng(semente)
  // o gerador tem sorteios internos: com a mesma semente as duas politicas
  // recebem exatamente a mesma noite, e a comparacao nao e ruido
  Math.random = rng(semente * 7919)
  const ids = Array.from({ length: tamanhos.reduce((t, n) => t + n, 0) }, (_, i) => `p${i}`)
  const ratings = new Map(ids.map((id) => [id, 1 + r() * 2]))
  const grupos = tamanhos.length > 1 ? formarGrupos(ids, ratings, tamanhos[0], semente) : null
  const fila = gerarFila({ playerIds: ids, ratings, groups: grupos ?? undefined })
  let matches: Match[] = planToMatches('s', fila)
  const nq = Math.min(quadras, quadrasSimultaneas(grupos ? grupos.map((g) => g.length) : [ids.length]))
  const fimDe = new Map<number, number>() // quadra -> minuto em que termina
  const naQuadra = new Map<number, string>() // quadra -> id da partida
  let agora = 0
  let divergiu = 0
  let paradas = 0
  for (let passo = 0; passo < 500; passo++) {
    const n: Noite = { jogadoras: ids, grupos, matches, quadras: nq }
    const livres = Array.from({ length: nq }, (_, i) => i + 1).filter((q) => !naQuadra.has(q))
    if (livres.length) {
      const filas = filaPorGrupo(n)
      const escolha = politica === 'sem-fila' ? proximasSemFila(n, livres) : proximasPelaFila(n, livres, undefined, filas)
      // a partida que entrou era a primeira possivel da fila mostrada? (as
      // quadras que escolhem juntas tiram as meninas umas das outras)
      if (politica === 'pela-fila') {
        const ocupadas = new Set(matches.filter((x) => x.started_at && x.score_a === null).flatMap(jogadorasDaPartida))
        const usadas = new Set<string>()
        for (const [, m] of escolha) {
          const fila = filas.find((f) => f.some((x) => x.id === m.id)) ?? []
          const antes = fila.slice(0, fila.findIndex((x) => x.id === m.id)).filter((x) => !usadas.has(x.id))
          if (antes.some((x) => jogadorasDaPartida(x).every((id) => !ocupadas.has(id)))) divergiu++
          usadas.add(m.id)
          for (const id of jogadorasDaPartida(m)) ocupadas.add(id)
        }
      }
      for (const [q, m] of escolha) {
        matches = matches.map((x) => (x.id === m.id ? { ...x, started_at: new Date(agora * 60000).toISOString(), court: q } : x))
        naQuadra.set(q, m.id)
        fimDe.set(q, agora + 8 + r() * 12)
      }
    }
    if (naQuadra.size === 0) {
      if (matches.every((m) => m.score_a !== null)) break
      paradas++
      break
    }
    const [q] = [...fimDe.entries()].filter(([q]) => naQuadra.has(q)).sort((a, b) => a[1] - b[1])[0]
    agora = fimDe.get(q) as number
    const id = naQuadra.get(q)
    naQuadra.delete(q)
    const perdeu = Math.floor(r() * 4)
    matches = matches.map((x) =>
      x.id === id ? { ...x, score_a: 4, score_b: perdeu, started_at: null, ended_at: new Date(agora * 60000).toISOString() } : x,
    )
  }
  // pior encadeamento por grupo, na ordem em que as partidas terminaram
  let pior = 0
  for (const g of grupos ?? [ids]) {
    const doGrupo = matches
      .filter((m) => g.includes(m.team_a[0]))
      .sort((a, b) => Date.parse(a.ended_at as string) - Date.parse(b.ended_at as string))
    for (const id of g) {
      let seq = 0
      for (const m of doGrupo) {
        seq = jogadorasDaPartida(m).includes(id) ? seq + 1 : 0
        pior = Math.max(pior, seq)
      }
    }
  }
  return { pior, divergiu, paradas, jogadas: matches.filter((m) => m.score_a !== null).length, total: matches.length }
}

const CENARIOS: [string, number[], number][] = [
  ['grupo de 6, 1 quadra', [6], 1],
  ['grupo de 7, 1 quadra', [7], 1],
  ['grupo de 8, 2 quadras', [8], 2],
  ['grupo de 9, 2 quadras', [9], 2],
  ['6 + 6, 2 quadras', [6, 6], 2],
  ['6+6+6, 3 quadras (05/10)', [6, 6, 6], 3],
  ['8 + 8, 4 quadras', [8, 8], 4],
  ['todas com todas, 11 em 2 quadras', [11], 2],
  ['todas com todas, 13 em 3 quadras', [13], 3],
]
const NOITES = 20

for (const [nome, tamanhos, quadras] of CENARIOS) {
  test(`fila: ${nome}`, () => {
    let com3Antes = 0
    let com3Agora = 0
    let divergencias = 0
    for (let s = 1; s <= NOITES; s++) {
      const antes = noite(tamanhos, quadras, 'sem-fila', s)
      const agora = noite(tamanhos, quadras, 'pela-fila', s)
      assert.equal(agora.jogadas, agora.total, 'a noite tem que terminar')
      if (antes.pior >= 3) com3Antes++
      if (agora.pior >= 3) com3Agora++
      divergencias += agora.divergiu
    }
    console.log(`  ${nome}: alguem emendou 3 — antes ${com3Antes}/${NOITES}, agora ${com3Agora}/${NOITES}; fila furada ${divergencias}x`)
    // a fila mostrada e a que acontece
    assert.equal(divergencias, 0)
    // e nao pode ficar pior do que era. Excecao medida e aceita: "todas com
    // todas" com mais de 16 partidas por fazer usa a ordem gulosa, e la a fila
    // firme custa um pouco (11 em 2 quadras: 6/20 contra 4/20) -- a troca e a
    // lista mostrada ser a que acontece, que a organizacao pediu (05/10)
    const folga = tamanhos.length === 1 && tamanhos[0] > 9 ? 2 : 0
    assert.ok(com3Agora <= com3Antes + folga, `piorou: ${com3Agora} contra ${com3Antes}`)
  })
}

import { precisaRefazer } from '../src/lib/fila'

test('grupo com o plano intacto nao precisa refazer', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  const plano = planToMatches('s', gerarFila({ playerIds: ids, ratings: new Map() }))
  assert.equal(precisaRefazer(ids, plano), false)
  // com metade jogada, continua intacto
  const meio = plano.map((m, i) => (i < 4 ? { ...m, score_a: 4, score_b: 1 } : m))
  assert.equal(precisaRefazer(ids, meio), false)
})

test('troca na mao (uma a mais, outra a menos) precisa refazer', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const plano = planToMatches('s', gerarFila({ playerIds: ids, ratings: new Map() }))
  const alvo = plano.findIndex((m) => m.team_a.includes('a') && !jogadorasDaPartida(m).includes('h'))
  const trocado = plano.map((m, i) =>
    i === alvo ? { ...m, team_a: m.team_a.map((x) => (x === 'a' ? 'h' : x)) as [string, string] } : m,
  )
  assert.equal(precisaRefazer(ids, trocado), true)
})

test('mata-mata: a dupla fixa junta meninas de grupos diferentes e mesmo assim entra na fila', () => {
  const grupos = [['a1', 'a2', 'a3', 'a4'], ['a5', 'a6', 'a7', 'a8']]
  const jogadas = planToMatches('s', gerarFila({ playerIds: grupos.flat(), ratings: new Map(), groups: grupos })).map((m) => ({
    ...m,
    score_a: 4,
    score_b: 1,
    ended_at: new Date(1000 * m.round).toISOString(),
  }))
  const semis = planToMatches('s', [
    { team_a: ['a1', 'a5'], team_b: ['a4', 'a8'], grupo: 0, fase: 2 },
    { team_a: ['a2', 'a6'], team_b: ['a3', 'a7'], grupo: 0, fase: 2 },
  ]).map((m, i) => ({ ...m, id: `semi${i}`, round: 100 + i }))
  const n: Noite = { jogadoras: grupos.flat(), grupos, matches: [...jogadas, ...semis], quadras: 2 }
  const filas = filaPorGrupo(n)
  assert.equal(filas.flat().filter((m) => m.id.startsWith('semi')).length, 2, 'as duas semis estao na fila')
  const quadras = proximasPelaFila(n, [1, 2], undefined, filas)
  assert.equal(quadras.size, 2, 'as duas quadras recebem uma semi')
})
