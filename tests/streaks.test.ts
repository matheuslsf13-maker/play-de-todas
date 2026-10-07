import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStreaks, streakLevel, STATUS_NOVO_DESDE } from '../src/lib/streaks'
import { emptyData, type AppData, type Match, type PlaySession } from '../src/lib/types'

/*
 * Cada play tem 8 meninas e duas partidas: quem vence a 1a por 4x0 e a 2a por
 * 4x2 sobe ao podio (4 e 2 pontos); quem perde fica com 0, fora do podio.
 */
const TODAS = ['p', 'q', 'r', 's', 'w', 'x', 'y', 'z']

function play(date: string, vencedoras: string[]): { s: PlaySession; ms: Match[] } {
  const perdedoras = TODAS.filter((id) => !vencedoras.includes(id))
  const id = `s-${date}`
  const s = {
    id, date, title: id, courts: 2, rounds: 2, target: 4, player_ids: TODAS,
    status: 'finished', created_at: `${date}T20:00:00Z`, format: 'todas',
  } as PlaySession
  const m = (n: number, a: string[], b: string[], sb: number): Match => ({
    id: `${id}-${n}`, session_id: id, round: n, court: n,
    team_a: [a[0], a[1]], team_b: [b[0], b[1]], score_a: 4, score_b: sb,
  })
  return { s, ms: [m(1, vencedoras.slice(0, 2), perdedoras.slice(0, 2), 0), m(2, vencedoras.slice(2, 4), perdedoras.slice(2, 4), 2)] }
}

function dados(plays: [string, string[]][]): AppData {
  const d = emptyData()
  d.players = TODAS.map((id) => ({ id, name: id, photo_url: null, active: true, created_at: '' }) as never)
  for (const [date, v] of plays) {
    const { s, ms } = play(date, v)
    d.sessions.push(s)
    d.matches.push(...ms)
  }
  return d
}

const P = ['p', 'q', 'r', 's'] // p no podio
const SEM_P = ['w', 'q', 'r', 's'] // p fora do podio
const DEPOIS = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']

test('escada nova: um simbolo e um nome por nivel, Duquesa com 5', () => {
  assert.equal(streakLevel(1), null)
  assert.deepEqual(streakLevel(2), { emoji: '🔥', title: 'Em chamas' })
  assert.deepEqual(streakLevel(3), { emoji: '⚡', title: 'Imparável' })
  assert.deepEqual(streakLevel(4), { emoji: '💎', title: 'Rainha do Play' })
  assert.deepEqual(streakLevel(5), { emoji: '👑', title: 'Duquesa da V3' })
  assert.ok(STATUS_NOVO_DESDE > '2026-10-05')
})

test('5 podios seguidos: vira Duquesa, entra no Hall e o status recomeca', () => {
  const d = dados(DEPOIS.slice(0, 5).map((dt) => [dt, P]))
  const st = computeStreaks(d)
  assert.deepEqual(st.duquesas.map((x) => [x.player_id, x.date]).filter(([id]) => id === 'p'), [['p', '2026-11-09']])
  assert.equal(st.current.get('p'), 0)
  const passo = st.steps.find((x) => x.player_id === 'p' && x.date === '2026-11-09')
  assert.equal(passo?.streak, 5)

  const d2 = dados(DEPOIS.map((dt) => [dt, P]))
  assert.equal(computeStreaks(d2).current.get('p'), 1)
})

test('fora do podio zera, sem vida, mesmo como Rainha', () => {
  const d = dados([...DEPOIS.slice(0, 4).map((dt): [string, string[]] => [dt, P]), [DEPOIS[4], SEM_P]])
  const st = computeStreaks(d)
  assert.equal(st.current.get('p'), 0)
  assert.equal(st.duquesas.some((x) => x.player_id === 'p'), false)
})

test('a virada do mes nao pergunta nada e nao da pontos: o status segue', () => {
  const d = dados([['2026-10-26', P], ['2026-11-02', P]])
  d.closures = [{ id: '2026-10', month: '2026-10', closed_at: '' }]
  const st = computeStreaks(d)
  assert.equal(st.decisions.length, 0)
  assert.equal(st.awards.length, 0)
  assert.equal(st.current.get('p'), 2)
})

test('antes da regra nova: o "usar" de setembro continua valendo, com o titulo da epoca', () => {
  const d = dados([['2026-09-14', P], ['2026-09-21', P]])
  d.closures = [{ id: '2026-09', month: '2026-09', closed_at: '' }]
  d.choices = [{ id: 'p:2026-09', player_id: 'p', month: '2026-09', action: 'sacar', streak: 2, bonus: 3, created_at: '' }]
  const st = computeStreaks(d)
  const a = st.awards.find((x) => x.player_id === 'p')
  assert.equal(a?.bonus, 3)
  assert.equal(a?.title, 'Em chamas')
  assert.equal(st.current.get('p'), 0)
})

test('a vida ganha antes da regra nova nao segura o status depois dela', () => {
  // setembro fecha com p preservando (o padrao): pela regra antiga ela ganharia 1 vida
  const d = dados([['2026-09-21', P], ['2026-09-28', P], ['2026-10-12', SEM_P]])
  d.closures = [{ id: '2026-09', month: '2026-09', closed_at: '' }]
  assert.equal(computeStreaks(d).current.get('p'), 0)
})

test('a sequencia de antes continua contando na regra nova', () => {
  const d = dados([['2026-09-28', P], ['2026-10-05', P], ['2026-10-12', P], ['2026-10-19', P], ['2026-10-26', P]])
  const st = computeStreaks(d)
  assert.deepEqual(st.duquesas.filter((x) => x.player_id === 'p').map((x) => x.date), ['2026-10-26'])
})

test('conquistas: quantas vezes chegou em cada nivel e o maior status', () => {
  const d = dados([...DEPOIS.map((dt): [string, string[]] => [dt, P]), ['2026-11-23', P], ['2026-11-30', SEM_P]])
  const c = computeStreaks(d).conquistas.get('p')
  // 5 seguidos (Duquesa) e depois mais 2 (Em chamas de novo)
  assert.deepEqual(c?.vezes, { 2: 2, 3: 1, 4: 1, 5: 1 })
  assert.equal(c?.melhor, 5)
  assert.deepEqual(c?.duquesas, ['2026-11-09'])
  assert.equal(computeStreaks(d).conquistas.get('w')?.melhor ?? 0, 0)
})
