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

/* ------------------------------------------- classificacao do grupo */
import { classificarGrupo, confrontoJusto } from '../src/lib/campeonato'
import type { Match } from '../src/lib/types'

let seq = 0
const partida = (a: [string, string], b: [string, string], sa: number, sb: number): Match => ({
  id: `m${++seq}`,
  session_id: 's',
  round: seq,
  court: 1,
  team_a: a,
  team_b: b,
  score_a: sa,
  score_b: sb,
  fase: 1,
  disputa_3o: false,
  started_at: null,
  ended_at: null,
})

test('vitorias vem antes de pontos', () => {
  const ms = [
    partida(['A', 'B'], ['E', 'F'], 4, 3), // A e B +1 ponto
    partida(['A', 'C'], ['E', 'F'], 4, 3), // A: 2 vitorias, 2 pontos
    partida(['D', 'E'], ['B', 'C'], 4, 0), // D: 1 vitoria, 4 pontos
  ]
  const { linhas } = classificarGrupo(['A', 'B', 'C', 'D', 'E', 'F'], ms)
  const pos = (id: string) => linhas.findIndex((l) => l.id === id)
  assert.equal(linhas[0].id, 'A')
  assert.ok(pos('A') < pos('D'))
  assert.equal(linhas[0].vitorias, 2)
  assert.equal(linhas[0].pontos, 2)
})

test('pontos desempatam vitorias', () => {
  // grupo de 4: A, B e C com 2 vitorias cada; os pontos ordenam
  const ms = [
    partida(['A', 'B'], ['C', 'D'], 4, 3),
    partida(['A', 'C'], ['B', 'D'], 4, 2),
    partida(['A', 'D'], ['B', 'C'], 0, 4),
  ]
  const { linhas, pendente } = classificarGrupo(['A', 'B', 'C', 'D'], ms)
  assert.deepEqual(linhas.map((l) => l.id), ['C', 'B', 'A', 'D'])
  assert.equal(pendente.length, 0)
})

test('saldo de games desempata pontos', () => {
  const ms = [
    partida(['A', 'B'], ['C', 'D'], 4, 2), // A e B: 1 vitoria, 2 pontos
    partida(['A', 'C'], ['E', 'F'], 3, 4), // A perde apertado: saldo +1
    partida(['B', 'D'], ['E', 'F'], 0, 4), // B perde feio: saldo -2
  ]
  const { linhas } = classificarGrupo(['A', 'B', 'C', 'D', 'E', 'F'], ms)
  const pos = (id: string) => linhas.findIndex((l) => l.id === id)
  assert.ok(pos('A') < pos('B'))
})

test('confronto justo: as duas tiveram as mesmas parceiras contra a outra', () => {
  const ms = [partida(['A', 'B'], ['C', 'D'], 4, 2), partida(['A', 'D'], ['C', 'B'], 4, 2)]
  assert.ok(confrontoJusto('A', 'C', ms) > 0)
  assert.ok(confrontoJusto('C', 'A', ms) < 0)
})

test('confronto com parceiras diferentes nao decide', () => {
  const ms = [partida(['A', 'B'], ['C', 'D'], 4, 2), partida(['A', 'E'], ['C', 'F'], 4, 2)]
  assert.equal(confrontoJusto('A', 'C', ms), 0)
})

test('quem nunca se enfrentou nao tem confronto', () => {
  assert.equal(confrontoJusto('A', 'B', [partida(['A', 'B'], ['C', 'D'], 4, 2)]), 0)
})

const empateDeDuas = () => [
  partida(['A', 'B'], ['C', 'D'], 4, 1),
  partida(['A', 'C'], ['B', 'D'], 4, 2),
  partida(['B', 'C'], ['A', 'D'], 4, 2),
]

test('empate total fica pendente, com a mesma posicao', () => {
  const r = classificarGrupo(['A', 'B', 'C', 'D'], empateDeDuas())
  assert.deepEqual(r.pendente.map((b) => [...b].sort()), [['A', 'B']])
  const a = r.linhas.find((l) => l.id === 'A')!
  const b = r.linhas.find((l) => l.id === 'B')!
  assert.equal(a.posicao, 1)
  assert.equal(b.posicao, 1)
  assert.deepEqual(a.empatadas, ['B'])
})

test('o desempate em quadra resolve o empate', () => {
  const r = classificarGrupo(['A', 'B', 'C', 'D'], empateDeDuas(), { grupo: 0, ordem: ['B', 'A'], como: 'simples', at: '' })
  assert.equal(r.pendente.length, 0)
  assert.deepEqual(r.linhas.slice(0, 2).map((l) => [l.id, l.posicao]), [['B', 1], ['A', 2]])
})

test('desempate gravado para outro conjunto nao vale (placar corrigido depois)', () => {
  const r = classificarGrupo(['A', 'B', 'C', 'D'], empateDeDuas(), { grupo: 0, ordem: ['C', 'D'], como: 'par-impar', at: '' })
  assert.equal(r.pendente.length, 1)
})

test('empate de 3 vai direto para o desempate em quadra', () => {
  const ms = [
    partida(['A', 'B'], ['C', 'D'], 4, 2),
    partida(['A', 'C'], ['B', 'D'], 4, 2),
    partida(['B', 'C'], ['A', 'D'], 4, 2),
  ]
  const r = classificarGrupo(['A', 'B', 'C', 'D'], ms)
  assert.deepEqual(r.pendente.map((b) => [...b].sort()), [['A', 'B', 'C']])
  const resolvido = classificarGrupo(['A', 'B', 'C', 'D'], ms, { grupo: 0, ordem: ['C', 'A', 'B'], como: 'simples', at: '' })
  assert.deepEqual(resolvido.linhas.map((l) => l.id), ['C', 'A', 'B', 'D'])
})

test('partida sem placar nao conta', () => {
  const ms = [partida(['A', 'B'], ['C', 'D'], 4, 0), { ...partida(['A', 'C'], ['B', 'D'], 0, 0), score_a: null, score_b: null }]
  const { linhas } = classificarGrupo(['A', 'B', 'C', 'D'], ms)
  assert.equal(linhas.find((l) => l.id === 'A')!.jogos, 1)
})

test('dois empates separados no mesmo grupo, cada um com o seu desempate', () => {
  // A=B na frente e C=D atras: todas ganham uma e perdem uma pelo mesmo placar
  const ms = [
    partida(['A', 'B'], ['C', 'D'], 4, 2),
    partida(['A', 'B'], ['E', 'F'], 4, 2),
    partida(['C', 'D'], ['E', 'F'], 4, 2),
  ]
  const r = classificarGrupo(['A', 'B', 'C', 'D', 'E', 'F'], ms, [
    { grupo: 0, ordem: ['B', 'A'], como: 'simples', at: '' },
    { grupo: 0, ordem: ['D', 'C'], como: 'par-impar', at: '' },
  ])
  assert.deepEqual(r.linhas.slice(0, 4).map((l) => l.id), ['B', 'A', 'D', 'C'])
  assert.deepEqual(r.pendente.map((b) => [...b].sort()), [['E', 'F']])
})
