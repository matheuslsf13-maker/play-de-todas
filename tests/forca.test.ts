import test from 'node:test'
import assert from 'node:assert/strict'
import { quedaPorFalta, ratings } from '../src/lib/stats'
import { notaDeForca } from '../src/lib/forca'
import { emptyData, type AppData, type Match, type PlaySession } from '../src/lib/types'

/*
 * FORCA DE QUEM FALTA: a primeira falta nao muda nada; da 2a seguida em
 * diante, acima de 1500 perde 10% da distancia ate 1500 (no minimo 2) e abaixo
 * perde 2 por falta, ate -20 na sequencia. Voltou, zera a contagem.
 */
const sessao = (id: string, date: string, ids: string[], ranked = true): PlaySession => ({
  id, date, title: id, courts: 1, rounds: 1, target: 4, player_ids: ids, status: 'finished', created_at: date, ranked,
})
let n = 0
const partida = (s: string, a: [string, string], b: [string, string], sa: number, sb: number): Match => ({
  id: `m${++n}`, session_id: s, round: n, court: 1, team_a: a, team_b: b, score_a: sa, score_b: sb,
  fase: 1, disputa_3o: false, started_at: null, ended_at: null,
})

function base(forcaInicial: Record<string, number>): AppData {
  const d = emptyData()
  d.players = Object.entries(forcaInicial).map(([id, f]) => ({ id, name: id, photo_url: null, active: true, created_at: '', forca_inicial: f }))
  return d
}

/** Joga um play com todas (A+B x C+D, empate tecnico 4x4 nao existe: 4x3 e 3x4 se anulam pouco). */
function playCom(d: AppData, id: string, date: string, quem: string[], ranked = true) {
  d.sessions.push(sessao(id, date, quem, ranked))
}

const nota = (d: AppData, id: string) => notaDeForca(ratings(d).get(id) as number)

test('forte que falta: 1a falta nada, depois 10% da distancia por play', () => {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500, d: 1500 })
  // x jogou no play 1 (uma partida que quase nao mexe: 4x3 contra iguais)
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  const depoisDoJogo = nota(d, 'x')
  // os plays seguintes sem ela (cada um com uma partida entre as outras)
  for (let i = 2; i <= 4; i++) {
    playCom(d, `s${i}`, `2026-09-0${i}`, ['a', 'b', 'c', 'd'])
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  const dist = depoisDoJogo - 1500
  // 3 faltas: a 1a nao conta, a 2a e a 3a tiram 10% cada
  const esperado = 1500 + dist * 0.9 * 0.9
  assert.ok(Math.abs(nota(d, 'x') - esperado) <= 1, `${nota(d, 'x')} ~ ${esperado}`)
  assert.deepEqual(quedaPorFalta(d).get('x')?.faltas, 3)
})

test('abaixo de 1500 perde 2 por falta, no maximo 20', () => {
  const d = base({ y: 1450, a: 1500, b: 1500, c: 1500, e: 1500 })
  playCom(d, 's1', '2026-09-01', ['y', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['y', 'a'], ['b', 'c'], 4, 3))
  const depois = nota(d, 'y')
  for (let i = 2; i <= 15; i++) {
    const dd = String(i).padStart(2, '0')
    playCom(d, `s${i}`, `2026-09-${dd}`, ['a', 'b', 'c', 'e'])
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'e'], 4, 3))
  }
  // 14 faltas: 13 contam, mas o teto e 20
  assert.ok(Math.abs(nota(d, 'y') - (depois - 20)) <= 1)
})

test('voltou a jogar: a contagem zera', () => {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  playCom(d, 's2', '2026-09-02', ['a', 'b', 'c', 'd'])
  d.matches.push(partida('s2', ['a', 'b'], ['c', 'd'], 4, 3))
  playCom(d, 's3', '2026-09-03', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s3', ['x', 'a'], ['b', 'c'], 4, 3))
  assert.equal(quedaPorFalta(d).get('x')?.faltas ?? 0, 0)
})

test('play avulso nao conta como falta, e quem nunca jogou nao cai', () => {
  const d = base({ x: 1560, z: 1600, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  const depois = nota(d, 'x')
  for (let i = 2; i <= 4; i++) {
    playCom(d, `s${i}`, `2026-09-0${i}`, ['a', 'b', 'c', 'd'], false)
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  assert.equal(nota(d, 'x'), depois)
  assert.equal(nota(d, 'z'), 1600)
})
