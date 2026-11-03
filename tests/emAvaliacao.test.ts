import test from 'node:test'
import assert from 'node:assert/strict'
import { emAvaliacao, PLAYS_EM_AVALIACAO, rankingDeForca } from '../src/lib/forca'
import { emptyData, type Match, type PlaySession } from '../src/lib/types'

/*
 * FORCA EM AVALIACAO: ate completar 3 plays jogados a nota e oculta para quem
 * nao e admin. Conta plays (noites), nao partidas; quem so foi escalada e nao
 * jogou nao conta; no misto, quem tem jogos no proprio campeonato nao entra.
 */
function dados(plays: number) {
  const d = emptyData()
  const ids = ['nova', 'b', 'c', 'd', 'vet']
  d.players = ids.map((id) => ({ id, name: id, photo_url: null, active: true, created_at: '' }))
  for (let k = 0; k < 5; k++) {
    const s: PlaySession = {
      id: `s${k}`, date: `2026-10-0${k + 1}`, title: '', courts: 1, rounds: 2, target: 4,
      player_ids: ids, status: 'finished', created_at: `2026-10-0${k + 1}T20:00:00Z`, format: 'todas',
    }
    d.sessions.push(s)
    const quem = k < plays ? 'nova' : 'vet'
    // duas partidas por noite: conta como UM play
    for (let j = 0; j < 2; j++) {
      const m: Match = { id: `m${k}${j}`, session_id: s.id, round: j + 1, court: 1, team_a: [quem, 'b'], team_b: ['c', 'd'], score_a: 4, score_b: 2 }
      d.matches.push(m)
    }
  }
  return d
}

test('conta plays, nao partidas: com 2 plays (4 partidas) ainda esta em avaliacao', () => {
  assert.equal(PLAYS_EM_AVALIACAO, 3)
  assert.equal(emAvaliacao(dados(2)).get('nova'), 2)
  assert.equal(emAvaliacao(dados(3)).has('nova'), false, 'no 3o play completo a forca aparece')
  // quem tem 5 plays nao esta
  assert.equal(emAvaliacao(dados(2)).has('b'), false)
})

test('quem nunca jogou conta 0; partida sem placar nao conta', () => {
  const d = dados(0)
  d.matches.push({ id: 'x', session_id: 's0', round: 9, court: 1, team_a: ['nova', 'b'], team_b: ['c', 'd'], score_a: null, score_b: null })
  assert.equal(emAvaliacao(d).get('nova'), 0)
})

test('misto: quem tem jogos no proprio campeonato ja chega com forca', () => {
  const d = dados(1)
  d.players = d.players.map((p) => (p.id === 'nova' ? { ...p, jogos_de_casa: 20 } : p))
  assert.equal(emAvaliacao(d).has('nova'), false)
})

test('o ranking da forca marca quem esta em avaliacao (a tela esconde para quem nao e admin)', () => {
  const linhas = rankingDeForca(dados(1), (id) => id)
  assert.equal(linhas.find((l) => l.player_id === 'nova')?.emAvaliacao, 1)
  assert.equal(linhas.find((l) => l.player_id === 'b')?.emAvaliacao, undefined)
})
