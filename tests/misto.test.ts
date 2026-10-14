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
import { calcularElo } from '../src/lib/stats'
import { emptyData } from '../src/lib/types'
import type { Match } from '../src/lib/types'

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

test('forca do misto comeca da forca de casa', () => {
  const data = emptyData()
  data.players = [
    { id: 'a', name: 'A', active: true, forca_de_casa: 1580 },
    { id: 'b', name: 'B', active: true, forca_de_casa: 1430 },
  ] as typeof data.players
  const elo = calcularElo(data)
  assert.ok(Math.abs(elo.nota('a') - 1580) < 1e-6)
  assert.ok(Math.abs(elo.nota('b') - 1430) < 1e-6)
})
