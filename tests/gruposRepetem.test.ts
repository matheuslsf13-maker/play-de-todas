import test from 'node:test'
import assert from 'node:assert/strict'
import { filaDosGruposArrumados, problemasDaFila } from '../src/lib/arrumarGrupos'
import { planoDoRefazer, precisaRefazer } from '../src/lib/fila'
import { chaveDoGrupo, gruposQueRepetem, jogadorasDaPartida, planToMatches, podeRepetirRodizio } from '../src/lib/pairing'
import { pairKey } from '../src/lib/stats'

/* "Todas repetem uma vez" (dono, 17/11/2026): o grupo joga o rodizio duas vezes. */
const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`)
const nome = (i: number) => `Grupo ${i + 1}`

test('so grupo em que o rodizio fecha sem repetir pode repetir', () => {
  assert.deepEqual([4, 5, 6, 7, 8, 9].map((n) => podeRepetirRodizio(n)), [true, true, false, false, true, true])
  // indice de grupo de 6 e ignorado
  const g = [ids('a', 4), ids('b', 6)]
  assert.deepEqual([...gruposQueRepetem(g, [0, 1])], [chaveDoGrupo(g[0])])
})

test('22 meninas: 6, 6, 6 e o grupo de 4 repetindo', () => {
  const grupos = [ids('a', 4), ids('b', 6), ids('c', 6), ids('d', 6)]
  const repetem = gruposQueRepetem(grupos, [0])
  const ratings = new Map(grupos.flat().map((id, i) => [id, 1500 - i]))
  const { fila, problemas } = filaDosGruposArrumados({ playerIds: grupos.flat(), groups: grupos, nomeDoGrupo: nome, ratings, repetem })
  assert.deepEqual(problemas, [])
  const g1 = fila.filter((m) => m.grupo === 0)
  assert.equal(g1.length, 6)
  // cada dupla do grupo de 4 se forma duas vezes; cada uma joga 6
  const duplas = new Map<string, number>()
  for (const m of g1) for (const d of [m.team_a, m.team_b]) duplas.set(pairKey(d[0], d[1]), (duplas.get(pairKey(d[0], d[1])) ?? 0) + 1)
  assert.equal(duplas.size, 6)
  assert.ok([...duplas.values()].every((n) => n === 2))
  assert.equal(fila.filter((m) => m.grupo !== 0).length, 27)
  // o refazer nao ve nada para arrumar (nao corta a 2a volta)
  const matches = planToMatches('s', fila)
  assert.equal(precisaRefazer(grupos[0], matches.filter((m) => jogadorasDaPartida(m).every((x) => grupos[0].includes(x))), undefined, repetem), false)
  const plano = planoDoRefazer({ grupos, jogadoras: grupos.flat(), matches, fixa: () => false, repetem })
  assert.equal(plano.precisam.length, 0)
  // sem a marca, a mesma fila estaria "errada" para o grupo de 4
  assert.ok(problemasDaFila(grupos, fila, nome).some((p) => p.startsWith('Grupo 1')))
})

test('grupo de 8 repetindo: 28 partidas, 14 jogos cada', () => {
  const grupos = [ids('a', 8), ids('b', 8)]
  const repetem = gruposQueRepetem(grupos, [1])
  const ratings = new Map(grupos.flat().map((id) => [id, 1500]))
  const { fila, problemas } = filaDosGruposArrumados({ playerIds: grupos.flat(), groups: grupos, nomeDoGrupo: nome, ratings, repetem })
  assert.deepEqual(problemas, [])
  assert.equal(fila.filter((m) => m.grupo === 0).length, 14)
  assert.equal(fila.filter((m) => m.grupo === 1).length, 28)
})

test('divisao recomendada: 22 = 8, 8 e 6; evita o grupo de 7', async () => {
  const { gruposRecomendados, melhoresTamanhos } = await import('../src/lib/pairing')
  assert.equal(gruposRecomendados(22), 3)
  assert.deepEqual(melhoresTamanhos(22, 3), [8, 8, 6])
  assert.deepEqual(melhoresTamanhos(16, 2), [8, 8])
  assert.equal(gruposRecomendados(16), 2)
  assert.equal(melhoresTamanhos(30, 4).includes(7), false)
  assert.deepEqual(melhoresTamanhos(7, 3), [7])
  for (let n = 8; n <= 40; n++) {
    for (let k = 1; k <= Math.floor(n / 4); k++) {
      const t = melhoresTamanhos(n, k)
      assert.equal(t.reduce((a, b) => a + b, 0), n)
      assert.equal(t.length, k)
      assert.ok(t.every((x) => x >= 4))
    }
  }
})
