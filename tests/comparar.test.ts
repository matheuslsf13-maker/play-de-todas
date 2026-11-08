import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chanceDeVitoria,
  confrontosDeAtletas,
  confrontosDeDuplas,
  juntarSeries,
  ladoDaAtleta,
  placarDosConfrontos,
  sequenciaFinal,
  textoDaForma,
  ultimosResultados,
} from '../src/lib/comparar'
import { emptyData, type AppData, type Match } from '../src/lib/types'

/*
 * O COMPARADOR: confronto direto (uma contra a outra) nao se mistura com "jogaram juntas", a forma recente sai das
 * mesmas bolinhas que a tela mostra e a chance e a do Elo.
 */
function cenario(): AppData {
  const d = emptyData()
  for (const id of ['c', 'b', 'i', 'l', 'n']) d.players.push({ id, name: id, photo_url: null, active: true, created_at: '' })
  const play = (id: string, date: string, ms: [string[], string[], number, number][]) => {
    d.sessions.push({
      id, date, title: id, courts: 1, rounds: 0, target: 4, player_ids: ['c', 'b', 'i', 'l', 'n'],
      status: 'finished', created_at: `${date}T20:00:00Z`, format: 'todas',
    })
    ms.forEach(([ta, tb, sa, sb], k) => {
      const m: Match = { id: `${id}-${k}`, session_id: id, round: k + 1, court: 1, team_a: ta as [string, string], team_b: tb as [string, string], score_a: sa, score_b: sb, tie: null }
      d.matches.push(m)
    })
  }
  play('p1', '2026-01-05', [[['c', 'b'], ['i', 'l'], 4, 3], [['c', 'i'], ['b', 'l'], 4, 0]]) // c x i; c+i juntas
  play('p2', '2026-01-12', [[['i', 'n'], ['c', 'b'], 4, 1], [['c', 'l'], ['i', 'b'], 4, 2]]) // c x i duas vezes
  return d
}

test('confronto de atletas: so quando estavam em times opostos, com o time de A sempre do lado A', () => {
  const d = cenario()
  const lista = confrontosDeAtletas(d, 'c', 'i')
  // p1 jogo 1 (c+b x i+l), p2 jogo 1 (i+n x c+b), p2 jogo 2 (c+l x i+b); o p1 jogo 2 foi c+i juntas: fora
  assert.equal(lista.length, 3)
  assert.deepEqual(lista.map((c) => c.date), ['2026-01-05', '2026-01-12', '2026-01-12'])
  assert.ok(lista.every((c) => c.timeA.includes('c') && c.timeB.includes('i')))
  assert.deepEqual(lista.map((c) => [c.gamesA, c.gamesB]), [[4, 3], [1, 4], [4, 2]])
  assert.deepEqual(placarDosConfrontos(lista), { vitoriasA: 2, vitoriasB: 1, gamesA: 9, gamesB: 9 })
})

test('confronto entre duplas: as duas duplas exatas, em qualquer lado da quadra', () => {
  const d = cenario()
  const lista = confrontosDeDuplas(d, ['c', 'b'], ['i', 'l'])
  assert.equal(lista.length, 1)
  assert.equal(lista[0].venceuA, true)
  // invertendo, o lado A passa a ser a outra dupla
  const invertida = confrontosDeDuplas(d, ['i', 'l'], ['c', 'b'])
  assert.equal(invertida[0].venceuA, false)
  assert.equal(confrontosDeDuplas(d, ['c', 'b'], ['i', 'n']).length, 1)
  assert.equal(confrontosDeDuplas(d, ['c', 'n'], ['i', 'l']).length, 0)
})

test('forma recente: ultimas partidas em ordem do calendario e o texto bate com as bolinhas', () => {
  const d = cenario()
  const r = ultimosResultados(d, ladoDaAtleta('c'), 5)
  // c jogou 4 vezes: V (4x3), V (4x0), D (1x4), V (4x2)
  assert.deepEqual(r, [true, true, false, true])
  assert.equal(sequenciaFinal(r), 1)
  assert.equal(textoDaForma(r), '3V 1D nas últimas 4 · 1 vitória seguida')
  assert.equal(textoDaForma([true, true, false, true, true]), '4V 1D nas últimas 5 · 2 vitórias seguidas')
  assert.equal(textoDaForma([true, false]), '1V 1D nas últimas 2 · perdeu a última')
  assert.equal(textoDaForma([]), 'ainda sem partidas')
  assert.equal(ultimosResultados(d, ladoDaAtleta('c'), 2).length, 2)
})

test('chance de vitoria: Elo, simetrica e dentro de 1 a 99', () => {
  assert.equal(chanceDeVitoria(1500, 1500), 50)
  assert.equal(chanceDeVitoria(1594, 1568) + chanceDeVitoria(1568, 1594), 100)
  assert.ok(chanceDeVitoria(1594, 1568) > 50)
  assert.equal(chanceDeVitoria(2500, 1000), 99)
  assert.equal(chanceDeVitoria(1000, 2500), 1)
})

test('series juntas: a ultima nota de cada lado vale ate o proximo play; antes do 1o ponto e nulo', () => {
  const a = [{ date: '2026-01-05', nota: 1500 }, { date: '2026-01-19', nota: 1520 }]
  const b = [{ date: '2026-01-12', nota: 1510 }]
  assert.deepEqual(juntarSeries(a, b), [
    { date: '2026-01-05', a: 1500, b: null },
    { date: '2026-01-12', a: 1500, b: 1510 },
    { date: '2026-01-19', a: 1520, b: 1510 },
  ])
})
