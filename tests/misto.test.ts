import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formarGruposMistos,
  gerarFila,
  jogosDoRodizio,
  partidasDoRodizio,
  refazerFila,
  rondasMistas,
  type Generos,
} from '../src/lib/pairing'
import { precisaRefazer } from '../src/lib/fila'
import { pairKey } from '../src/lib/stats'
import { calcularElo, pausaNaForca, quedaPorFalta } from '../src/lib/stats'
import { rankingDeForca } from '../src/lib/forca'
import { emptyData } from '../src/lib/types'
import type { AppData, Match, PlaySession, Player } from '../src/lib/types'

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`)

function cenario(n: number) {
  const mulheres = ids('f', n)
  const homens = ids('h', n)
  const genero: Generos = new Map([...mulheres.map((id) => [id, 'F'] as const), ...homens.map((id) => [id, 'M'] as const)])
  const todos = [...mulheres, ...homens]
  const ratings = new Map(todos.map((id, i) => [id, 2 + (i % 5) * 0.1]))
  return { mulheres, homens, genero, todos, ratings }
}

test('rondas mistas: cada par mulher x homem uma vez', () => {
  const rondas = rondasMistas(ids('f', 5), ids('h', 5))
  assert.equal(rondas.length, 5)
  const pares = new Set(rondas.flat().map((d) => pairKey(d[0], d[1])))
  assert.equal(pares.size, 25)
  for (const r of rondas) assert.equal(new Set(r.flat()).size, 10)
})

for (const n of [2, 3, 4, 5, 6]) {
  test(`rodizio misto ${n}+${n}: so duplas H+M, todos os pares, mesmo numero de jogos`, () => {
    const { genero, todos, ratings } = cenario(n)
    const fila = gerarFila({ playerIds: todos, ratings, genero })
    assert.equal(fila.length, partidasDoRodizio(todos.length, true))
    const jogos = new Map<string, number>()
    const pares = new Set<string>()
    for (const m of fila) {
      for (const d of [m.team_a, m.team_b]) {
        assert.notEqual(genero.get(d[0]), genero.get(d[1]), `dupla do mesmo genero: ${d}`)
        pares.add(pairKey(d[0], d[1]))
      }
      for (const id of [...m.team_a, ...m.team_b]) jogos.set(id, (jogos.get(id) ?? 0) + 1)
    }
    assert.equal(pares.size, n * n)
    assert.deepEqual(new Set(jogos.values()), new Set([jogosDoRodizio(todos.length, true)]))
  })
}

test('sem genero o rodizio continua o de sempre', () => {
  const { todos, ratings } = cenario(4)
  const fila = gerarFila({ playerIds: todos, ratings })
  assert.equal(fila.length, partidasDoRodizio(8))
  const pares = new Set(fila.flatMap((m) => [m.team_a, m.team_b]).map((d) => pairKey(d[0], d[1])))
  assert.equal(pares.size, 28)
})

test('grupos mistos: metade de cada, por nivel', () => {
  const { genero, todos } = cenario(8)
  // f1 e h1 os mais fortes
  const ratings = new Map(todos.map((id) => [id, 3 - Number(id.slice(1)) * 0.1]))
  const grupos = formarGruposMistos(todos, ratings, 8, genero, 1)
  assert.equal(grupos.length, 2)
  for (const g of grupos) {
    assert.equal(g.filter((id) => genero.get(id) === 'F').length, 4)
    assert.equal(g.filter((id) => genero.get(id) === 'M').length, 4)
  }
  assert.ok(grupos[0].includes('f1') && grupos[0].includes('h1'))
  assert.ok(grupos[1].includes('f8') && grupos[1].includes('h8'))
  const fila = gerarFila({ playerIds: todos, ratings, genero, groups: grupos })
  for (const m of fila) for (const d of [m.team_a, m.team_b]) assert.notEqual(genero.get(d[0]), genero.get(d[1]))
})

test('refazer no misto: completa so com duplas H+M e fecha a conta', () => {
  const { genero, todos, ratings } = cenario(4)
  const fila = gerarFila({ playerIds: todos, ratings, genero })
  const jogadas: Match[] = fila.slice(0, 3).map((m, i) => ({
    id: `m${i}`, session_id: 's', round: i + 1, court: 1, team_a: m.team_a, team_b: m.team_b,
    score_a: 4, score_b: 2, fase: 1, started_at: null, ended_at: null,
  }))
  const resto = refazerFila({ playerIds: todos, ratings, genero, jogadas })
  for (const m of resto) for (const d of [m.team_a, m.team_b]) assert.notEqual(genero.get(d[0]), genero.get(d[1]))
  const todas: Match[] = [...jogadas, ...resto.map((m, i) => ({ ...jogadas[0], id: `r${i}`, team_a: m.team_a, team_b: m.team_b }))]
  assert.equal(precisaRefazer(todos, todas, genero), false)
  // sem genero, o mesmo play "precisaria" (faltam as duplas do mesmo genero)
  assert.equal(precisaRefazer(todos, todas), true)
})

/*
 * FORCA DO MISTO: a foto da forca do campeonato (forca_inicial em
 * misto.atletas) e o ponto de partida; dali em diante e o mesmo calculo dos
 * outros plays (Glicko, queda por falta, pausa), so que com os plays do misto.
 */
const sessaoMisto = (id: string, date: string, ids: string[]): PlaySession => ({
  id, date, title: id, courts: 1, rounds: 1, target: 4, player_ids: ids, status: 'finished', created_at: date, ranked: true,
})
let nm = 0
const partidaMisto = (s: string, a: [string, string], b: [string, string], sa: number, sb: number): Match => ({
  id: `mm${++nm}`, session_id: s, round: nm, court: 1, team_a: a, team_b: b, score_a: sa, score_b: sb,
  fase: 1, disputa_3o: false, started_at: null, ended_at: null,
})
function misto(): AppData {
  const d = emptyData()
  const p = (id: string, genero: 'F' | 'M', foto: number, jogos_de_casa: number): Player => ({
    id, name: id, photo_url: null, active: true, created_at: '', genero, forca_inicial: foto, jogos_de_casa,
  })
  d.players = [p('x', 'F', 1560, 12), p('a', 'M', 1500, 8), p('b', 'F', 1500, 8), p('c', 'M', 1500, 8), p('d', 'F', 1500, 8), p('y', 'M', 1520, 10)]
  return d
}

test('misto: cada um parte da foto do campeonato, e quem nunca jogou o misto nao cai', () => {
  const d = misto()
  // y nunca veio ao misto: a nota e a foto, aparece na forca (jogou no campeonato) e nao cai
  for (let i = 1; i <= 3; i++) {
    d.sessions.push(sessaoMisto(`s${i}`, `2026-10-0${i}`, ['a', 'b', 'c', 'd']))
    d.matches.push(partidaMisto(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  assert.ok(Math.abs(calcularElo(d).nota('y') - 1520) < 1e-6)
  assert.equal(quedaPorFalta(d).get('y')?.faltas ?? 0, 0)
  const linha = rankingDeForca(d, (id) => id).find((l) => l.player_id === 'y')
  assert.equal(linha?.nota, 1520)
  assert.equal(linha?.jogos, 0)
  assert.equal(linha?.jogosDeCasa, 10)
})

test('misto: faltar aos plays do misto segue a mesma regra dos outros (2a falta 10%, sai do ranking)', () => {
  const d = misto()
  d.sessions.push(sessaoMisto('s1', '2026-10-01', ['x', 'a', 'b', 'c']))
  d.matches.push(partidaMisto('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  for (let i = 2; i <= 3; i++) {
    d.sessions.push(sessaoMisto(`s${i}`, `2026-10-0${i}`, ['a', 'b', 'c', 'd']))
    d.matches.push(partidaMisto(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  const depoisDoJogo = calcularElo(d, '2026-10-01').nota('x')
  const x2 = calcularElo(d, '2026-10-02').nota('x')
  assert.ok(Math.abs(x2 - depoisDoJogo) < 1, 'a 1a falta nao tira nada')
  const esperado = x2 - (x2 - calcularElo(d, '2026-10-02').media()) * 0.1
  assert.ok(Math.abs(calcularElo(d).nota('x') - esperado) <= 0.5)
  assert.equal(quedaPorFalta(d).get('x')?.faltas, 2)
  assert.equal(pausaNaForca(d).get('x'), 'faltas')
})
