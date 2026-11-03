import test from 'node:test'
import assert from 'node:assert/strict'
import { filaPorGrupo, proximasPelaFila, type Noite } from '../src/lib/fila'
import { formarGrupos, gerarFila, planToMatches } from '../src/lib/pairing'
import type { Match } from '../src/lib/types'

/*
 * MENOS QUADRAS QUE GRUPOS (02/11: 5 grupos de 6 e uma quadra indisponivel).
 * Antes cada grupo tinha a "quadra da casa" e o grupo sem quadra so entrava
 * quando outro nao tinha partida -- esperava ate um grupo acabar. Agora a
 * quadra que vaga vai para o grupo parado ha mais tempo.
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

export function noiteComPoucasQuadras(tamanhos: number[], quadras: number, semente: number) {
  const r = rng(semente)
  Math.random = rng(semente * 7919)
  const ids = Array.from({ length: tamanhos.reduce((t, n) => t + n, 0) }, (_, i) => `p${i}`)
  const ratings = new Map(ids.map((id) => [id, 1 + r() * 2]))
  const grupos = formarGrupos(ids, ratings, tamanhos[0], semente)
  let matches: Match[] = planToMatches('s', gerarFila({ playerIds: ids, ratings, groups: grupos }))
  const naQuadra = new Map<number, string>()
  const fimDe = new Map<number, number>()
  let agora = 0
  for (let passo = 0; passo < 2000; passo++) {
    const n: Noite = { jogadoras: ids, grupos, matches, quadras }
    const livres = Array.from({ length: quadras }, (_, i) => i + 1).filter((q) => !naQuadra.has(q))
    if (livres.length) {
      for (const [q, m] of proximasPelaFila(n, livres, undefined, filaPorGrupo(n))) {
        matches = matches.map((x) => (x.id === m.id ? { ...x, started_at: new Date(agora * 60000).toISOString(), court: q } : x))
        naQuadra.set(q, m.id)
        fimDe.set(q, agora + 12 + r() * 6)
      }
    }
    if (naQuadra.size === 0) break
    const [q] = [...fimDe.entries()].filter(([q]) => naQuadra.has(q)).sort((a, b) => a[1] - b[1])[0]
    agora = fimDe.get(q) as number
    const id = naQuadra.get(q)
    naQuadra.delete(q)
    matches = matches.map((x) =>
      x.id === id ? { ...x, score_a: 4, score_b: 2, started_at: x.started_at, ended_at: new Date(agora * 60000).toISOString() } : x,
    )
  }
  // a maior espera de um grupo: do comeco (ou do fim da partida dele) ate a proxima comecar
  let pior = 0
  for (const g of grupos) {
    const doGrupo = matches.filter((m) => g.includes(m.team_a[0])).sort((a, b) => Date.parse(a.started_at as string) - Date.parse(b.started_at as string))
    let livreDesde = 0
    for (const m of doGrupo) {
      pior = Math.max(pior, Date.parse(m.started_at as string) / 60000 - livreDesde)
      livreDesde = Math.max(livreDesde, Date.parse(m.ended_at as string) / 60000)
    }
  }
  return { pior: Math.round(pior), jogadas: matches.filter((m) => m.score_a !== null).length, total: matches.length, fim: Math.round(agora) }
}

for (const [titulo, tamanhos, quadras] of [
  ['5 grupos de 6 em 4 quadras (02/11)', [6, 6, 6, 6, 6], 4],
  ['4 grupos de 6 em 3 quadras', [6, 6, 6, 6], 3],
  ['3 grupos de 5 em 2 quadras', [5, 5, 5], 2],
] as const) {
  test(`revezar: ${titulo} -- nenhum grupo fica parado mais que ~1 partida e meia`, () => {
    let pior = 0
    for (let s = 1; s <= 10; s++) {
      const r = noiteComPoucasQuadras([...tamanhos], quadras, s)
      assert.equal(r.jogadas, r.total, 'a noite termina')
      pior = Math.max(pior, r.pior)
    }
    console.log(`  ${titulo}: maior espera de um grupo ${pior} min`)
    assert.ok(pior <= 30, `um grupo ficou ${pior} min parado`)
  })
}
