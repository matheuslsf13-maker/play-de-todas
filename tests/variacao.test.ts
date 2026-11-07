import test from 'node:test'
import assert from 'node:assert/strict'
import { posicoesDaLista, semOPlay, ultimoPlayJogado, variacoes } from '../src/lib/variacao'
import { emptyData, type AppData } from '../src/lib/types'

test('variacoes: subiu +, caiu −, estreante fica de fora', () => {
  const v = variacoes(posicoesDaLista(['a', 'b', 'c']), posicoesDaLista(['b', 'a', 'd', 'c']))
  assert.equal(v.get('b'), 1)
  assert.equal(v.get('a'), -1)
  assert.equal(v.get('c'), -1)
  assert.equal(v.has('d'), false)
})

test('ultimoPlayJogado ignora play sem placar e semOPlay tira o play e as partidas', () => {
  const d: AppData = emptyData()
  const s = (id: string, date: string) => ({ id, date, created_at: date }) as never
  d.sessions = [s('p1', '2026-11-02'), s('p2', '2026-11-09'), s('p3', '2026-11-16')]
  const m = (id: string, session_id: string, placar: number | null) =>
    ({ id, session_id, team_a: ['a', 'b'], team_b: ['c', 'd'], score_a: placar, score_b: placar === null ? null : 0, round: 1 }) as never
  d.matches = [m('m1', 'p1', 4), m('m2', 'p2', 4), m('m3', 'p3', null)]
  assert.equal(ultimoPlayJogado(d), 'p2')
  const sem = semOPlay(d, 'p2')
  assert.deepEqual(sem.sessions.map((x) => x.id), ['p1', 'p3'])
  assert.deepEqual(sem.matches.map((x) => x.id), ['m1', 'm3'])
})
