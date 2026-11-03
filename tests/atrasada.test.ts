import test from 'node:test'
import assert from 'node:assert/strict'
import { problemasDaFila } from '../src/lib/arrumarGrupos'
import { filaPorGrupo, proximasPelaFila, type Noite } from '../src/lib/fila'
import { gerarFila, jogadorasDaPartida, planToMatches } from '../src/lib/pairing'
import type { Match } from '../src/lib/types'

/*
 * A ATRASADA (02/11): a Ana Pretti atrasou num grupo de 6. Montado em
 * quartetos, a unica partida sem ela tirava tambem a parceira de par dela -- a
 * Wanessa esperou 1 hora enquanto as outras 4 emendavam 3. Com a atrasada
 * marcada, o rodizio do grupo gira as partidas sem ela entre TODAS as presentes.
 */
const nome = (i: number) => `Grupo ${i + 1}`

function semAtrasada(fila: { team_a: [string, string]; team_b: [string, string] }[], atrasada: string, presentes: string[]) {
  const sem = fila.filter((m) => !jogadorasDaPartida(m).includes(atrasada))
  return presentes.map((id) => sem.filter((m) => jogadorasDaPartida(m).includes(id)).length)
}

test('grupo de 6 com atrasada: ninguem presente fica de fora das partidas sem ela', () => {
  const ids = ['wan', 'dani', 'ana', 'col', 'cam', 'pretti']
  const ratings = new Map(ids.map((id, i) => [id, 1.5 + (i % 3) * 0.4]))
  const presentes = ids.filter((id) => id !== 'pretti')
  // o plano normal (quartetos): alguem fica com zero -- o defeito de 02/11
  const normal = semAtrasada(gerarFila({ playerIds: ids, ratings }), 'pretti', presentes)
  assert.ok(normal.includes(0), `o plano normal deixava alguem esperando: ${normal}`)
  // com a atrasada marcada: todas entram, e a fila continua sendo o rodizio certo
  const fila = gerarFila({ playerIds: ids, ratings, ausentes: new Set(['pretti']) })
  const agora = semAtrasada(fila, 'pretti', presentes)
  assert.ok(Math.min(...agora) >= 1, `todas as presentes jogam antes de ela chegar: ${agora}`)
  assert.deepEqual(problemasDaFila([ids], fila, nome), [])
})

for (const n of [5, 7, 8, 9, 10]) {
  test(`grupo de ${n} com atrasada: fila certa e as partidas sem ela giram entre todas`, () => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`)
    const ratings = new Map(ids.map((id, i) => [id, 1 + (i % 4) * 0.4]))
    const fila = gerarFila({ playerIds: ids, ratings, ausentes: new Set([ids[n - 1]]) })
    assert.deepEqual(problemasDaFila([ids], fila, nome), [])
    const v = semAtrasada(fila, ids[n - 1], ids.slice(0, -1))
    assert.ok(Math.min(...v) >= 1, `${v}`)
    assert.ok(Math.max(...v) - Math.min(...v) <= 2, `equilibrado: ${v}`)
  })
}

test('02/11 simulado: numa quadra, enquanto ela nao chega, ninguem espera todas as partidas', () => {
  const ids = ['wan', 'dani', 'ana', 'col', 'cam', 'pretti']
  const ratings = new Map(ids.map((id, i) => [id, 1.5 + (i % 3) * 0.4]))
  const esperaMaxima = (fila: ReturnType<typeof gerarFila>) => {
    let matches: Match[] = planToMatches('s', fila)
    const jogou = new Map(ids.map((id) => [id, 0]))
    // 3 partidas sem ela (o que da para jogar sem a atrasada no grupo de 6)
    for (let k = 0; k < 3; k++) {
      const n: Noite = { jogadoras: ids, grupos: [ids], matches, quadras: 1, ausentes: new Set(['pretti']) }
      const [[, m]] = [...proximasPelaFila(n, [1], undefined, filaPorGrupo(n))]
      assert.ok(!jogadorasDaPartida(m).includes('pretti'), 'a fila nao chama quem nao chegou')
      for (const id of jogadorasDaPartida(m)) jogou.set(id, (jogou.get(id) ?? 0) + 1)
      matches = matches.map((x) => (x.id === m.id ? { ...x, score_a: 4, score_b: 2, ended_at: new Date(k * 900000).toISOString() } : x))
    }
    return Math.min(...ids.filter((id) => id !== 'pretti').map((id) => jogou.get(id) ?? 0))
  }
  assert.equal(esperaMaxima(gerarFila({ playerIds: ids, ratings })), 0, 'antes: uma ficava sem jogar')
  assert.ok(esperaMaxima(gerarFila({ playerIds: ids, ratings, ausentes: new Set(['pretti']) })) >= 1, 'agora: todas jogam')
})
