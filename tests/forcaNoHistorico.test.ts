import test from 'node:test'
import assert from 'node:assert/strict'
import { forcaDasDuplasNasPartidas, historicoDaDupla } from '../src/lib/forca'
import { forcaNasPartidas, historicoDeForca } from '../src/lib/stats'
import { emptyData, type Match, type PlaySession } from '../src/lib/types'

/*
 * O 🕑 HISTORICO MOSTRA QUANTO CADA PARTIDA MEXEU NA FORCA: as partidas de um
 * play somam exatamente o total do play, e o total e a mesma variacao do
 * grafico (de jogadora e de dupla) -- senao a tela diria dois numeros.
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

function temporada(semente: number) {
  const r = rng(semente)
  const ids = Array.from({ length: 8 }, (_, i) => `p${i}`)
  const d = emptyData()
  d.players = ids.map((id) => ({ id, name: id, photo_url: null, active: true, created_at: '' }))
  for (let k = 0; k < 8; k++) {
    const date = `2026-0${1 + Math.floor(k / 4)}-${String(5 + (k % 4) * 7).padStart(2, '0')}`
    // alguem falta de vez em quando (a falta mexe na nota entre os plays)
    const vieram = ids.filter(() => r() > 0.2)
    if (vieram.length < 4) continue
    const s: PlaySession = {
      id: `s${k}`, date, title: date, courts: 1, rounds: 0, target: 4, player_ids: vieram,
      status: 'finished', created_at: `${date}T20:00:00Z`, format: 'todas',
    }
    d.sessions.push(s)
    for (let j = 0; j < 6; j++) {
      const q = [...vieram].sort(() => r() - 0.5).slice(0, 4)
      const ganhou = Math.floor(r() * 4)
      const m: Match = {
        id: `m${k}-${j}`, session_id: s.id, round: j + 1, court: 1,
        team_a: [q[0], q[1]], team_b: [q[2], q[3]],
        score_a: r() > 0.5 ? 4 : ganhou, score_b: 0,
      }
      m.score_b = m.score_a === 4 ? ganhou : 4
      d.matches.push(m)
    }
  }
  return { d, ids }
}

test('jogadora: as partidas somam o play, e o play e a variacao do grafico', () => {
  for (let semente = 1; semente <= 5; semente++) {
    const { d, ids } = temporada(semente)
    const f = forcaNasPartidas(d)
    for (const id of ids) {
      const pontos = historicoDeForca(d, id, true)
      pontos.forEach((p, i) => {
        if (!p.jogou || i === 0) return
        const noPlay = f.porPlay.get(`${p.sessionId}|${id}`)
        assert.equal(noPlay, p.nota - pontos[i - 1].nota, `${id} em ${p.date}: o play bate com o grafico`)
        const partidas = d.matches.filter((m) => m.session_id === p.sessionId && [...m.team_a, ...m.team_b].includes(id))
        const soma = partidas.reduce((t, m) => t + (f.porPartida.get(`${m.id}|${id}`) ?? NaN), 0)
        assert.equal(soma, noPlay, `${id} em ${p.date}: as partidas somam o play`)
      })
    }
  }
})

test('dupla: as partidas somam o play, e o play e a variacao do grafico da dupla', () => {
  for (let semente = 1; semente <= 5; semente++) {
    const { d } = temporada(semente)
    const f = forcaDasDuplasNasPartidas(d)
    const duplas = new Set(d.matches.flatMap((m) => [[...m.team_a].sort().join('|'), [...m.team_b].sort().join('|')]))
    for (const chave of duplas) {
      const [a, b] = chave.split('|')
      const { pontos } = historicoDaDupla(d, a, b)
      pontos.forEach((p, i) => {
        const partidas = d.matches.filter(
          (m) => m.session_id === p.sessionId && ([...m.team_a].sort().join('|') === chave || [...m.team_b].sort().join('|') === chave),
        )
        const soma = partidas.reduce((t, m) => t + (f.porPartida.get(`${m.id}|${chave}`) ?? NaN), 0)
        assert.equal(soma, f.porPlay.get(`${p.sessionId}|${chave}`), `${chave} em ${p.date}: as partidas somam o play`)
        if (i > 0) assert.equal(f.porPlay.get(`${p.sessionId}|${chave}`), p.nota - pontos[i - 1].nota, `${chave} em ${p.date}: bate com o grafico`)
      })
    }
  }
})
