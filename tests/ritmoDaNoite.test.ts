import test from 'node:test'
import assert from 'node:assert/strict'
import { lerRegra } from '../src/lib/desempate'
import { chavesDoPlay, minutosDaPartida, regrasDoPlay, restanteDaNoite, resumoAoVivo, ritmoDaNoite } from '../src/lib/previsaoDaNoite'
import type { Match, PlaySession } from '../src/lib/types'

const MIN = 60000
const T0 = Date.parse('2026-11-09T23:00:00.000Z')
const sessao = { id: 's', date: '2026-11-09', title: 'Play', courts: 2, rounds: 12, target: 4, player_ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], status: 'open', created_at: '2026-11-09T22:00:00Z', format: 'todas', desempate: 'nenhum' } as unknown as PlaySession
const BASE = minutosDaPartida(4, lerRegra('nenhum'))

/** `jogadas` partidas de `duracao` min (duas quadras), e o resto na fila. */
function noite(jogadas: number, duracao: number, total = 12): Match[] {
  return Array.from({ length: total }, (_, i) => {
    const de = T0 + Math.floor(i / 2) * (duracao + 2) * MIN
    const feita = i < jogadas
    return {
      id: `m${i}`, session_id: 's', round: i + 1, court: (i % 2) + 1,
      team_a: ['a', 'b'], team_b: ['c', 'd'],
      score_a: feita ? 4 : null, score_b: feita ? 2 : null, tie: null,
      started_at: feita ? new Date(de).toISOString() : null,
      ended_at: feita ? new Date(de + duracao * MIN).toISOString() : null,
    } as unknown as Match
  })
}

test('ritmo: sem partida medida a previsao e a calibragem de sempre', () => {
  const ms = noite(0, 20)
  const regras = regrasDoPlay(sessao, ms)
  assert.deepEqual(ritmoDaNoite(ms, regras), { fator: 1, medidas: 0, minutosMedidos: null })
  // e o fator 1 deixa a conta igual a de antes
  const chaves = chavesDoPlay(sessao, ms, regras)
  assert.equal(restanteDaNoite(sessao, ms, regras, chaves, null)!.minutos, restanteDaNoite(sessao, ms, regras, chaves, null, undefined, 1)!.minutos)
})

test('ritmo: partidas mais longas que a calibragem esticam a previsao, mais com mais partidas', () => {
  const lento = BASE * 1.4
  const r2 = ritmoDaNoite(noite(2, lento), regrasDoPlay(sessao, noite(2, lento)))
  const r8 = ritmoDaNoite(noite(8, lento), regrasDoPlay(sessao, noite(8, lento)))
  assert.equal(r2.medidas, 2)
  assert.ok(Math.abs(r2.minutosMedidos! - lento) < 0.01)
  // peso n/(n+4): 2 partidas -> 1/3 do caminho, 8 -> 2/3
  assert.ok(Math.abs(r2.fator - (1 + (1 / 3) * 0.4)) < 1e-9)
  assert.ok(Math.abs(r8.fator - (1 + (2 / 3) * 0.4)) < 1e-9)
  // e a previsao do cartao anda junto
  const ms = noite(8, lento)
  const semRitmo = restanteDaNoite(sessao, ms, regrasDoPlay(sessao, ms), chavesDoPlay(sessao, ms), null)!.minutos
  assert.ok(Math.abs(resumoAoVivo(sessao, ms).minutos - semRitmo * r8.fator) < 1e-9)
})

test('ritmo: partidas mais rapidas encurtam; duracoes absurdas ficam de fora; o fator tem trava', () => {
  const rapido = ritmoDaNoite(noite(8, 10), regrasDoPlay(sessao, noite(8, 10)))
  assert.ok(rapido.fator < 1)
  // 2 min (iniciou tarde) e 90 min (placar lancado depois) nao contam
  const absurdas = noite(4, BASE).map((m, i) =>
    i === 0 ? { ...m, ended_at: new Date(Date.parse(m.started_at!) + 2 * MIN).toISOString() }
    : i === 1 ? { ...m, ended_at: new Date(Date.parse(m.started_at!) + 90 * MIN).toISOString() } : m)
  const r = ritmoDaNoite(absurdas, regrasDoPlay(sessao, absurdas))
  assert.equal(r.medidas, 2)
  assert.ok(Math.abs(r.fator - 1) < 1e-9)
  // 59 min cada, 10 partidas: o fator para em 1,8
  const travado = ritmoDaNoite(noite(10, 59), regrasDoPlay(sessao, noite(10, 59)))
  assert.equal(travado.fator, 1.8)
})
