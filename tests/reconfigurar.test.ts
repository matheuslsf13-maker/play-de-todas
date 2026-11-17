import test from 'node:test'
import assert from 'node:assert/strict'
import { manterDuplas, montarDuplasPorNivel, type Duo } from '../src/lib/duplasFixas'
import { aplicarMovidasNoCampeonato, lugaresNoCampeonato } from '../src/lib/campeonato'

const forca = new Map<string, number>()
const montar = (ids: string[]) => montarDuplasPorNivel(ids, forca)

test('reconfigurar duplas fixas: duplas inteiras ficam, so as novas e as orfas se montam', () => {
  const antigas: Duo[] = [['a', 'b'], ['c', 'd'], ['e', 'f']]
  // f saiu; g e h chegaram: e fica sem par e entra na montagem nova
  const r = manterDuplas(antigas, ['a', 'b', 'c', 'd', 'e', 'g', 'h'], montar)
  assert.deepEqual(r.duplas.slice(0, 2), [['a', 'b'], ['c', 'd']])
  const novas = r.duplas.slice(2).flat().concat(r.semPar ? [r.semPar] : [])
  assert.deepEqual(novas.sort(), ['e', 'g', 'h'])
  assert.equal(r.duplas.length, 3)
})

test('reconfigurar campeonato: cada uma volta para a categoria e o grupo dela', () => {
  const s = {
    groups: [['a', 'b'], ['c', 'd'], ['e', 'f']],
    categorias: [
      { nome: 'A', grupos: [0, 1], quadras: [1] },
      { nome: 'B', grupos: [2], quadras: [2] },
    ],
  }
  const lugares = lugaresNoCampeonato(s)
  assert.deepEqual(lugares.d, { c: 0, g: 1 })
  assert.deepEqual(lugares.e, { c: 1, g: 0 })
  // a divisao nova pela forca embaralhou tudo e trouxe a "g": as de antes voltam, a nova fica onde a forca a pos
  const nova = [[['f', 'e'], ['a', 'g']], [['c', 'b', 'd']]]
  const ordenado = (e: string[][][]) => e.map((cat) => cat.map((g) => [...g].sort()))
  assert.deepEqual(ordenado(aplicarMovidasNoCampeonato(nova, lugares)), [[['a', 'b'], ['c', 'd', 'g']], [['e', 'f']]])
})
