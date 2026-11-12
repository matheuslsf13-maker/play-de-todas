import assert from 'node:assert/strict'
import test from 'node:test'
import { adiarPlay, podeAdiar } from '../src/lib/adiarPlay'
import { emptyData, type Match, type PlaySession } from '../src/lib/types'

const play = { id: 's', date: '2026-11-09', status: 'open' } as PlaySession
const partida = (extra: Partial<Match>) => ({ id: 'm', session_id: 's', team_a: [], team_b: [], score_a: null, score_b: null, ...extra }) as unknown as Match

test('adiar: so o play aberto sem partida iniciada nem lancada', () => {
  assert.equal(podeAdiar(play, [partida({})]), true)
  assert.equal(podeAdiar(play, [partida({ started_at: '2026-11-09T23:10:00Z' })]), false)
  assert.equal(podeAdiar(play, [partida({ score_a: 4, score_b: 2 })]), false)
  assert.equal(podeAdiar({ ...play, status: 'finished' } as PlaySession, []), false)
  // partida iniciada de OUTRO play nao trava
  assert.equal(podeAdiar(play, [partida({ session_id: 'outro', started_at: 'x' })]), true)
})

test('adiar: muda a data do play e leva junto o dia do Financeiro ligado a ele', () => {
  const data = emptyData()
  data.sessions = [play]
  data.checkinDias = [
    { id: 'd', date: '2026-11-09', session_id: 's', titulo: null, valor_cheio: 50, valor_com_checkin: 25, created_at: '' },
    { id: 'outro', date: '2026-11-09', session_id: null, titulo: null, valor_cheio: 50, valor_com_checkin: 25, created_at: '' },
  ]
  const r = adiarPlay(data, play, '2026-11-16')
  assert.ok(!('erro' in r))
  assert.equal(r.sessao.date, '2026-11-16')
  assert.deepEqual(r.dias.map((d) => [d.id, d.date]), [['d', '2026-11-16']])
  assert.match((adiarPlay(data, play, '2026-11-09') as { erro: string }).erro, /depois/)
  assert.match((adiarPlay(data, play, '') as { erro: string }).erro, /data nova/)
  data.matches = [partida({ started_at: 'x' })]
  assert.match((adiarPlay(data, play, '2026-11-16') as { erro: string }).erro, /primeira partida/)
})
