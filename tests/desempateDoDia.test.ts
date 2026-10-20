import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenarComDesempates, partidasDoConfronto } from '../src/lib/desempateDoDia'
import { computeStreaks, empatesNoPodio, podiosDoDia } from '../src/lib/streaks'
import { computeStats, rankPlayers, type PlayerStat } from '../src/lib/stats'
import { emptyData, type DesempateDeGrupo, type Match, type PlaySession } from '../src/lib/types'

/*
 * EMPATE NO DIA (todas e grupos): empate exato divide a posicao; o desempate
 * em quadra, gravado para o MESMO conjunto, decide a ordem e o podio. Sem
 * desempate gravado, tudo sai como sempre saiu.
 */
const linha = (id: string, wins: number, points: number, saldo = 0): PlayerStat => ({
  player_id: id, matches: 4, wins, losses: 4 - wins, points, gamesWon: 10 + saldo, gamesLost: 10,
  days: 1, bonus: 0, bye: 0,
})
const desempate = (grupo: number, ordem: string[]): DesempateDeGrupo => ({ grupo, ordem, como: 'par-impar', at: '' })

// a 3 vitorias; b e c empatadas em tudo (2 vit, 5 pts); d 1 vitoria
const DIA = [linha('a', 3, 9), linha('b', 2, 5), linha('c', 2, 5), linha('d', 1, 2)]

test('empate exato sem desempate: dividem a posicao e as duas ficam no podio', () => {
  const { posicao, abertos } = ordenarComDesempates(DIA)
  assert.equal(posicao.get('b'), 2)
  assert.equal(posicao.get('c'), 2)
  assert.equal(posicao.get('d'), 4)
  assert.deepEqual(abertos, [{ posicao: 2, ids: ['b', 'c'] }])
  assert.deepEqual(podiosDoDia(DIA, null)[0].rows.map((x) => x.player_id), ['a', 'b', 'c'])
})

test('com desempate gravado: a ordem e a da quadra', () => {
  const { lista, posicao, abertos } = ordenarComDesempates(DIA, [desempate(0, ['c', 'b'])])
  assert.deepEqual(lista.map((x) => x.player_id), ['a', 'c', 'b', 'd'])
  assert.equal(posicao.get('c'), 2)
  assert.equal(posicao.get('b'), 3)
  assert.equal(abertos.length, 0)
})

test('empate na ultima vaga: sem desempate sobem as duas; decidido, so quem venceu', () => {
  // a e b na frente; c e d empatadas em 3o
  const dia = [linha('a', 3, 9), linha('b', 3, 8), linha('c', 2, 5), linha('d', 2, 5), linha('e', 0, 0)]
  assert.deepEqual(podiosDoDia(dia, null)[0].rows.map((x) => x.player_id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(empatesNoPodio(dia, null, []).map((e) => e.ids), [['c', 'd']])
  const decidido = podiosDoDia(dia, null, 'vitorias', [desempate(0, ['d', 'c'])])
  assert.deepEqual(decidido[0].rows.map((x) => x.player_id), ['a', 'b', 'd'])
  assert.equal(empatesNoPodio(dia, null, [desempate(0, ['d', 'c'])]).length, 0)
})

test('empate abaixo do podio nao pede desempate', () => {
  const dia = [linha('a', 3, 9), linha('b', 2, 6), linha('c', 2, 5), linha('d', 1, 2), linha('e', 1, 2)]
  assert.deepEqual(empatesNoPodio(dia, null, []), [])
})

test('desempate de outro conjunto (o placar mudou depois) nao vale', () => {
  const { abertos } = ordenarComDesempates(DIA, [desempate(0, ['c', 'd'])])
  assert.deepEqual(abertos, [{ posicao: 2, ids: ['b', 'c'] }])
})

test('grupos: cada grupo com o seu podio e o seu desempate', () => {
  // grupo 1 (indice 0): a, b, c, d -> 2 vagas; b e c empatadas em 2o
  // grupo 2 (indice 1): e, f, g, h -> f e g empatadas em 2o
  const dia = [
    linha('a', 3, 9), linha('e', 3, 9), linha('b', 2, 5), linha('c', 2, 5),
    linha('f', 2, 4), linha('g', 2, 4), linha('d', 0, 0), linha('h', 0, 0),
  ]
  const grupos = [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']]
  const pendentes = empatesNoPodio(dia, grupos, [])
  assert.deepEqual(pendentes.map((e) => [e.grupo, e.numero, e.ids]), [[0, 1, ['b', 'c']], [1, 2, ['f', 'g']]])
  // o desempate do grupo 1 nao vale no grupo 2
  const podios = podiosDoDia(dia, grupos, 'vitorias', [desempate(0, ['c', 'b'])])
  assert.deepEqual(podios[0].rows.map((x) => x.player_id), ['a', 'c'])
  assert.deepEqual(podios[1].rows.map((x) => x.player_id), ['e', 'f', 'g'])
})

test('🔥 e dia vencido seguem o desempate; sem ele, o titulo e dividido como antes', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const s: PlaySession = {
    id: 's1', date: '2026-10-19', title: 's1', courts: 2, rounds: 2, target: 4, player_ids: ids,
    status: 'finished', created_at: '2026-10-19T20:00:00Z', format: 'todas', criterio_dia: 'vitorias',
  }
  const m = (n: number, a: [string, string], b: [string, string], sa: number, sb: number): Match => ({
    id: `m${n}`, session_id: 's1', round: n, court: n, team_a: a, team_b: b, score_a: sa, score_b: sb,
  })
  // a e b vencem igualzinho (4x1): empatadas no topo
  const d = emptyData()
  d.players = ids.map((id) => ({ id, name: id, photo_url: null, active: true, created_at: '' }))
  d.sessions = [s]
  d.matches = [m(1, ['a', 'b'], ['c', 'd'], 4, 1), m(2, ['e', 'f'], ['g', 'h'], 4, 2)]
  const rank = rankPlayers(computeStats(d.matches), (id) => id, 'vitorias')
  // a e b empatadas em 1o, e e f em 3o (4x2): os dois empates mexem no podio
  assert.deepEqual(empatesNoPodio(rank, null, []).map((e) => [e.posicao, e.ids]), [[1, ['a', 'b']], [3, ['e', 'f']]])
  const semDesempate = computeStreaks(d, (id) => id)
  assert.deepEqual([...(semDesempate.winnersOf.get('s1') ?? [])].sort(), ['a', 'b'])

  s.desempates_grupo = [desempate(0, ['b', 'a'])]
  const comDesempate = computeStreaks(d, (id) => id)
  assert.deepEqual(comDesempate.winnersOf.get('s1'), ['b'])
})

test('confronto direto justo decide antes da quadra; injusto vai para a quadra', () => {
  const p = (n: number, a: [string, string], b: [string, string], sa: number, sb: number): Match => ({
    id: `c${n}`, session_id: 's', round: n, court: 1, team_a: a, team_b: b, score_a: sa, score_b: sb,
  })
  // b na frente pela ordem de entrada, mas a venceu b duas vezes com as mesmas parceiras (c e d)
  const dia = [linha('b', 2, 5), linha('a', 2, 5), linha('e', 0, 0)]
  const justo = [p(1, ['a', 'c'], ['b', 'd'], 4, 1), p(2, ['a', 'd'], ['b', 'c'], 4, 2)]
  const r = ordenarComDesempates(dia, [], justo)
  assert.deepEqual(r.lista.map((x) => x.player_id), ['a', 'b', 'e'])
  assert.equal(r.posicao.get('b'), 2)
  assert.equal(r.abertos.length, 0)
  // parceiras diferentes: o confronto nao e justo, segue para a quadra
  const injusto = [p(1, ['a', 'c'], ['b', 'd'], 4, 1), p(2, ['a', 'e'], ['b', 'c'], 4, 2)]
  assert.deepEqual(ordenarComDesempates(dia, [], injusto).abertos, [{ posicao: 1, ids: ['b', 'a'] }])
  // o decidido na quadra vale mesmo contra o confronto
  assert.deepEqual(ordenarComDesempates(dia, [desempate(0, ['b', 'a'])], justo).lista.map((x) => x.player_id), ['b', 'a', 'e'])
  // play de antes de 19/10: sem confronto (o podio anunciado nao muda)
  assert.equal(partidasDoConfronto({ date: '2026-10-12' }, justo), undefined)
  assert.equal(partidasDoConfronto({ date: '2026-10-19' }, justo), justo)
})
