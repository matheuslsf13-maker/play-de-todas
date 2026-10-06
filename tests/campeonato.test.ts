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

/* ------------------------------- colocacao, duplas por categoria e pontos */
import {
  PONTUACAO_PADRAO,
  categoriaTerminou,
  colocacoesDaCategoria,
  duosDaCategoria,
  partidasDaCategoria,
  pontosDeColocacao,
} from '../src/lib/campeonato'
import { duplasDaFase2 } from '../src/lib/pairing'
import type { PlaySession } from '../src/lib/types'

/** Fase de grupos de um grupo de 4 [w, x, y, z] sem empate: w 3V; x 1V 4p; y 1V 3p; z 1V 2p. */
const faseDeGrupos = ([w, x, y, z]: string[]) => [
  partida([w, x], [y, z], 4, 0),
  partida([w, y], [x, z], 4, 1),
  partida([w, z], [x, y], 4, 2),
]
const fase = (m: Match, f: number, disputa3o = false): Match => ({ ...m, fase: f, disputa_3o: disputa3o })

const G = [
  ['a1', 'a2', 'a3', 'a4'],
  ['a5', 'a6', 'a7', 'a8'],
  ['b1', 'b2', 'b3', 'b4'],
  ['b5', 'b6', 'b7', 'b8'],
]
const camp = (extra: Partial<PlaySession> = {}): PlaySession => ({
  id: 's',
  date: '2026-10-12',
  title: 'Campeonato',
  courts: 4,
  rounds: 0,
  target: 4,
  player_ids: G.flat(),
  status: 'open',
  created_at: '',
  format: 'grupos-duplas',
  groups: G,
  categorias: [
    { nome: 'A', grupos: [0, 1], quadras: [1, 2] },
    { nome: 'B', grupos: [2, 3], quadras: [3, 4] },
  ],
  pontuacao: PONTUACAO_PADRAO,
  ranked: true,
  ...extra,
})
const grupos1 = G.flatMap(faseDeGrupos)

test('colocacoes da categoria: posicao no grupo, grupo dentro da categoria', () => {
  const { colocacoes, pendentes } = colocacoesDaCategoria(camp(), 1, grupos1)
  assert.equal(pendentes.length, 0)
  assert.deepEqual(
    colocacoes.map((c) => [c.id, c.grupo, c.posicao]),
    [['b1', 0, 1], ['b2', 0, 2], ['b3', 0, 3], ['b4', 0, 4], ['b5', 1, 1], ['b6', 1, 2], ['b7', 1, 3], ['b8', 1, 4]],
  )
  // 1a com 1a
  assert.deepEqual(duplasDaFase2(colocacoes, 8), [['b1', 'b5'], ['b2', 'b6'], ['b3', 'b7'], ['b4', 'b8']])
})

test('empate pendente aparece por grupo (indice global)', () => {
  const empate = [
    partida(['b1', 'b2'], ['b3', 'b4'], 4, 1),
    partida(['b1', 'b3'], ['b2', 'b4'], 4, 2),
    partida(['b2', 'b3'], ['b1', 'b4'], 4, 2),
  ]
  // troca as 3 partidas do grupo de b1 por um empate entre b1 e b2
  const ms = [...grupos1.filter((m) => m.team_a[0] !== 'b1'), ...empate]
  const { pendentes } = colocacoesDaCategoria(camp(), 1, ms)
  assert.deepEqual(pendentes.map((p) => [p.grupo, [...p.ids].sort()]), [[2, ['b1', 'b2']]])
})

test('duplas e partidas por categoria', () => {
  const s = camp({ duos: [['a1', 'a5'], ['b1', 'b5'], ['a2', 'a6'], ['b2', 'b6']] })
  assert.deepEqual(duosDaCategoria(s, 0), [['a1', 'a5'], ['a2', 'a6']])
  assert.deepEqual(duosDaCategoria(s, 1), [['b1', 'b5'], ['b2', 'b6']])
  assert.equal(partidasDaCategoria(s, 0, grupos1).length, 6)
})

const finalA = fase(partida(['a1', 'a5'], ['a2', 'a6'], 4, 2), 2)

test('categoria termina quando a final e lancada', () => {
  const s = camp({ duos: [['a1', 'a5'], ['a2', 'a6'], ['b1', 'b5'], ['b2', 'b6']], duplas_mm: 2 })
  const semFinal = [...grupos1, { ...finalA, score_a: null, score_b: null }]
  assert.equal(categoriaTerminou(s, 0, semFinal), false)
  assert.equal(categoriaTerminou(s, 0, [...grupos1, finalA]), true)
  assert.equal(categoriaTerminou(s, 1, [...grupos1, finalA]), false)
})

test('pontos por colocacao: campea, vice e quem ficou nos grupos', () => {
  const s = camp({ duos: [['a1', 'a5'], ['a2', 'a6'], ['b1', 'b5'], ['b2', 'b6']], duplas_mm: 2 })
  const p = pontosDeColocacao(s, [...grupos1, finalA])
  assert.equal(p.get('a1'), 16)
  assert.equal(p.get('a5'), 16)
  assert.equal(p.get('a2'), 12)
  assert.equal(p.get('a3'), 3)
  assert.equal(p.get('a8'), 3)
  // a categoria B nao terminou: ninguem dela pontua ainda
  assert.equal(p.has('b1'), false)
})

test('pontos com semifinal: 3o lugar e semifinalista', () => {
  const duos: [string, string][] = [['a1', 'a5'], ['a2', 'a6'], ['a3', 'a7'], ['a4', 'a8']]
  const s = camp({ duos, categorias: [{ nome: 'A', grupos: [0, 1], quadras: [1, 2] }], groups: G.slice(0, 2), player_ids: G.slice(0, 2).flat() })
  const ms = [
    ...grupos1.slice(0, 6),
    fase(partida(['a1', 'a5'], ['a4', 'a8'], 4, 0), 2),
    fase(partida(['a2', 'a6'], ['a3', 'a7'], 4, 3), 2),
    fase(partida(['a1', 'a5'], ['a2', 'a6'], 4, 1), 3),
  ]
  const p = pontosDeColocacao(s, ms)
  assert.deepEqual(['a1', 'a2', 'a3', 'a4'].map((id) => p.get(id)), [16, 12, 10, 8])
})

test('sem pontuacao ou play avulso: nenhum ponto de colocacao', () => {
  const duos: [string, string][] = [['a1', 'a5'], ['a2', 'a6'], ['b1', 'b5'], ['b2', 'b6']]
  assert.equal(pontosDeColocacao(camp({ duos, pontuacao: null }), [...grupos1, finalA]).size, 0)
  assert.equal(pontosDeColocacao(camp({ duos, ranked: false }), [...grupos1, finalA]).size, 0)
})

/* ------------------------------------------------ quadras por categoria */
import { quadrasEfetivas } from '../src/lib/campeonato'

const tres = [
  { nome: 'A', grupos: [0, 1], quadras: [1, 2] },
  { nome: 'B', grupos: [2, 3], quadras: [3, 4] },
  { nome: 'C', grupos: [4, 5], quadras: [5, 6] },
]

test('cada categoria com as suas quadras enquanto ninguem terminou', () => {
  assert.deepEqual(quadrasEfetivas(tres, [false, false, false], [3, 7, 2]), [[1, 2], [3, 4], [5, 6]])
})

test('categoria terminada cede para a que tem mais partidas por jogar', () => {
  assert.deepEqual(quadrasEfetivas(tres, [false, false, true], [3, 7, 0]), [[1, 2], [3, 4, 5, 6], []])
})

test('cessao escolhida na mao vale por quadra', () => {
  assert.deepEqual(quadrasEfetivas(tres, [false, false, true], [3, 7, 0], { '5': 0 }), [[1, 2, 5], [3, 4, 6], []])
})

test('cessao para categoria que tambem terminou e ignorada', () => {
  assert.deepEqual(quadrasEfetivas(tres, [true, false, true], [0, 7, 0], { '5': 0 }), [[], [1, 2, 3, 4, 5, 6], []])
})

test('todas terminadas: cada uma fica com as suas', () => {
  assert.deepEqual(quadrasEfetivas(tres, [true, true, true], [0, 0, 0]), [[1, 2], [3, 4], [5, 6]])
})

import { proximasDasQuadras } from '../src/lib/pairing'

test('a quadra da casa do grupo e a da categoria (grupo 1 da B na quadra 3)', () => {
  const g0 = partida(['b1', 'b2'], ['b3', 'b4'], 0, 0)
  const g1 = partida(['b5', 'b6'], ['b7', 'b8'], 0, 0)
  const pendentes = [g0, g1].map((m) => ({ ...m, score_a: null, score_b: null }))
  const r = proximasDasQuadras({
    pendentes,
    ocupadas: new Set(),
    espera: new Map(),
    jogos: new Map(),
    quadrasLivres: [4, 3],
    grupos: [G[2], G[3]],
    quadrasDaCasa: [3, 4],
  })
  assert.equal(r.get(3)?.id, pendentes[0].id)
  assert.equal(r.get(4)?.id, pendentes[1].id)
})

/* ---------------------------------------- pontos do mes e fogo do dia */
import { pontosExtras } from '../src/lib/campeonato'
import { computeStatsComPontos, pontosDeBye, pontuaveis } from '../src/lib/stats'
import { computeStreaks } from '../src/lib/streaks'
import { emptyData } from '../src/lib/types'

const comSessao = (ms: Match[], id: string) => ms.map((m) => ({ ...m, session_id: id }))
const finalB = fase(partida(['b1', 'b5'], ['b2', 'b6'], 4, 3), 2)
const duos4: [string, string][] = [['a1', 'a5'], ['a2', 'a6'], ['b1', 'b5'], ['b2', 'b6']]

test('com pontuacao, nenhuma partida pontua por games (nem a do mata-mata)', () => {
  const s = camp({ duos: duos4, duplas_mm: 2 })
  const ms = comSessao([...grupos1, finalA, finalB], 's')
  assert.equal(pontuaveis([s], ms).length, 0)
  assert.equal(computeStatsComPontos([s], ms).get('a1')?.points, 0)
  assert.equal(pontosDeBye([s], ms).porJogadora.size, 0)
})

test('play antigo de grupos+duplas (sem pontuacao) pontua como antes', () => {
  const s = camp({ duos: duos4, duplas_mm: 2, pontuacao: null, categorias: null })
  const ms = comSessao([...grupos1, finalA], 's')
  assert.deepEqual(pontuaveis([s], ms).map((m) => m.id), [finalA.id])
  assert.equal(computeStatsComPontos([s], ms).get('a1')?.points, 2)
})

test('pontosExtras soma a colocacao dos plays que estao no recorte', () => {
  const s = camp({ duos: duos4, duplas_mm: 2 })
  const ms = comSessao([...grupos1, finalA, finalB], 's')
  const p = pontosExtras([s, { ...s, id: 'outro' }], ms)
  assert.equal(p.get('a1'), 16)
  assert.equal(p.get('b2'), 12)
  assert.equal(pontosExtras([s], []).size, 0)
})

test('fogo: o podio de CADA categoria segura o status', () => {
  const data = emptyData()
  data.players = G.flat().map((id) => ({ id, name: id, photo_url: null, active: true, created_at: '' }) as never)
  const s = camp({ duos: duos4, duplas_mm: 2, status: 'finished' })
  data.sessions = [s]
  data.matches = comSessao([...grupos1, finalA, finalB], 's')
  const podio = new Set(computeStreaks(data).podiumOf.get('s'))
  for (const id of ['a1', 'a5', 'a2', 'a6', 'b1', 'b5', 'b2', 'b6']) assert.ok(podio.has(id), id)
  assert.equal(podio.has('a3'), false)
  assert.deepEqual([...(computeStreaks(data).winnersOf.get('s') ?? [])].sort(), ['a1', 'a5', 'b1', 'b5'])
})

import { colocacaoNoRecorte } from '../src/lib/campeonato'
import { aplicarColocacao, computeStats } from '../src/lib/stats'

test('colocacao entra nos pontos e na coluna propria (nao na do bye)', () => {
  const s = camp({ duos: duos4, duplas_mm: 2 })
  const ms = comSessao([...grupos1, finalA, finalB], 's')
  const col = colocacaoNoRecorte([s], ms)
  const st = aplicarColocacao(computeStatsComPontos([s], ms), col).get('a1')!
  assert.equal(st.points, 16)
  assert.equal(st.colocacao, 16)
  assert.equal(st.bye, 0)
  // quem nao tem partida no recorte nao ganha linha nova
  assert.equal(aplicarColocacao(computeStats([]), col).size, 0)
})
