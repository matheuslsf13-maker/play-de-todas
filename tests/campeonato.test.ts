import test from 'node:test'
import assert from 'node:assert/strict'
import {
  categoriasDoPlay,
  dividirEmCategorias,
  fatiar,
  montarCategorias,
  nomeDaCategoria,
  quadrasPadrao,
} from '../src/lib/campeonato'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)
/** p1 e a mais forte, p2 a segunda... (nota em escala 0-4, todas diferentes) */
const forca = (lista: string[]) => new Map(lista.map((id, i) => [id, 4 - i * 0.01]))

test('24 em 3 categorias de 2 grupos: A tem as 8 mais fortes, grupo 1 as 4 mais fortes', () => {
  const l = ids(24)
  const e = dividirEmCategorias(l, forca(l), 3, 2, 1)
  assert.deepEqual(e.map((c) => c.map((g) => g.length)), [[4, 4], [4, 4], [4, 4]])
  assert.deepEqual([...e[0][0]].sort(), ['p1', 'p2', 'p3', 'p4'])
  assert.deepEqual([...e[0][1]].sort(), ['p5', 'p6', 'p7', 'p8'])
  assert.deepEqual([...e[2][1]].sort(), ['p21', 'p22', 'p23', 'p24'])
})

test('26 em 3: a sobra vai para as categorias de cima', () => {
  const l = ids(26)
  assert.deepEqual(dividirEmCategorias(l, forca(l), 3, 2, 1).map((c) => c.flat().length), [9, 9, 8])
})

test('fatiar: tamanhos o mais iguais possivel, sobra nas primeiras', () => {
  assert.deepEqual(fatiar([1, 2, 3, 4, 5], 2), [[1, 2, 3], [4, 5]])
  assert.deepEqual(fatiar([1, 2, 3], 3), [[1], [2], [3]])
})

test('quadras padrao: em sequencia, sobra nas de cima', () => {
  assert.deepEqual(quadrasPadrao(3, 6), [[1, 2], [3, 4], [5, 6]])
  assert.deepEqual(quadrasPadrao(3, 7), [[1, 2, 3], [4, 5], [6, 7]])
  assert.deepEqual(quadrasPadrao(3, 2), [[1], [2], [2]])
})

test('montar e ler as categorias', () => {
  const { groups, categorias } = montarCategorias([[['a'], ['b']], [['c'], ['d']]], [[1, 2], [3, 4]])
  assert.deepEqual(groups, [['a'], ['b'], ['c'], ['d']])
  assert.deepEqual(categorias, [
    { nome: 'A', grupos: [0, 1], quadras: [1, 2] },
    { nome: 'B', grupos: [2, 3], quadras: [3, 4] },
  ])
})

test('play sem categorias vira uma categoria com tudo', () => {
  assert.deepEqual(categoriasDoPlay({ categorias: null, groups: [['a'], ['b']], courts: 2 }), [
    { nome: 'A', grupos: [0, 1], quadras: [1, 2] },
  ])
  assert.deepEqual(categoriasDoPlay({ categorias: undefined, groups: null, courts: 1 }), [
    { nome: 'A', grupos: [0], quadras: [1] },
  ])
  assert.equal(nomeDaCategoria(4), 'E')
})
