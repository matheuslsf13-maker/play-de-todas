import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classificarDuplas,
  dividirDuplasEmCategorias,
  filaDeDuplas,
  montarDuplasPorNivel,
  moverDupla,
  partidasEntreDuplas,
  trocarNasDuplas,
  type Duo,
} from '../src/lib/duplasFixas'
import { rodadaDoMataMata } from '../src/lib/pairing'
import type { Match } from '../src/lib/types'

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`)
// forca decrescente pela ordem: x1 e a mais forte
const forcaDe = (lista: string[]) => new Map(lista.map((id, i) => [id, 3 - i * 0.05]))

test('um genero: forte com forte, em pares pela forca', () => {
  const g = ids('a', 6)
  const r = montarDuplasPorNivel(g, forcaDe(g))
  assert.deepEqual(r.duplas, [['a1', 'a2'], ['a3', 'a4'], ['a5', 'a6']])
  assert.equal(r.semPar, null)
})

test('numero impar: a mais fraca fica sem par e e avisada', () => {
  const g = ids('a', 5)
  const r = montarDuplasPorNivel(g, forcaDe(g))
  assert.equal(r.duplas.length, 2)
  assert.equal(r.semPar, 'a5')
})

test('misto igual: i-esima mulher com i-esimo homem', () => {
  const f = ids('f', 3)
  const m = ids('m', 3)
  const forca = new Map([...forcaDe(f), ...forcaDe(m)])
  const genero = new Map([...f.map((id) => [id, 'F'] as const), ...m.map((id) => [id, 'M'] as const)])
  const r = montarDuplasPorNivel([...m, ...f], forca, genero)
  assert.deepEqual(r.duplas, [['f1', 'm1'], ['f2', 'm2'], ['f3', 'm3']])
  assert.deepEqual(r.mesmoGenero, [])
})

test('misto com sobra: as mistas primeiro, a sobra forma dupla do mesmo genero e avisa', () => {
  const f = ids('f', 5)
  const m = ids('m', 3)
  const forca = new Map([...forcaDe(f), ...forcaDe(m)])
  const genero = new Map([...f.map((id) => [id, 'F'] as const), ...m.map((id) => [id, 'M'] as const)])
  const r = montarDuplasPorNivel([...f, ...m], forca, genero)
  assert.equal(r.duplas.length, 4)
  assert.deepEqual(r.mesmoGenero, [['f4', 'f5']])
  assert.ok(r.duplas.slice(0, 3).every(([a, b]) => genero.get(a) !== genero.get(b)))
})

test('trocar duas pessoas de dupla e mover dupla de categoria', () => {
  const d: Duo[] = [['a', 'b'], ['c', 'd']]
  assert.deepEqual(trocarNasDuplas(d, 'b', 'c'), [['a', 'c'], ['b', 'd']])
  const cats = moverDupla([[['a', 'b']], [['c', 'd']]], 'c', 0)
  assert.deepEqual(cats, [[['a', 'b'], ['c', 'd']], []])
})

test('categorias pela forca da dupla: A com as mais fortes', () => {
  const g = ids('a', 12)
  const forca = forcaDe(g)
  const duplas = montarDuplasPorNivel(g, forca).duplas
  const cats = dividirDuplasEmCategorias([...duplas].reverse(), forca, 2)
  assert.deepEqual(cats.map((c) => c.length), [3, 3])
  assert.deepEqual(cats[0][0], ['a1', 'a2'])
})

test('fase 1: cada dupla enfrenta todas as outras uma vez, em cada categoria', () => {
  for (const k of [3, 4, 5, 6]) {
    const duplas: Duo[] = Array.from({ length: k }, (_, i) => [`x${i}a`, `x${i}b`])
    const outra: Duo[] = [['y1', 'y2'], ['y3', 'y4'], ['y5', 'y6']]
    const fila = filaDeDuplas([duplas, outra], [0, 1])
    const daPrimeira = fila.filter((m) => m.grupo === 0)
    assert.equal(daPrimeira.length, partidasEntreDuplas(k))
    const vistos = new Set(daPrimeira.map((m) => [m.team_a[0], m.team_b[0]].sort().join('|')))
    assert.equal(vistos.size, partidasEntreDuplas(k), `k=${k}: confronto repetido`)
    assert.equal(fila.filter((m) => m.grupo === 1).length, 3)
    // ninguem joga de parceiro trocado
    for (const m of fila) assert.ok([...duplas, ...outra].some((d) => d[0] === m.team_a[0] && d[1] === m.team_a[1]))
  }
})

const partida = (a: Duo, b: Duo, sa: number, sb: number): Match =>
  ({ id: `${a}${b}`, session_id: 's', round: 1, court: 1, team_a: a, team_b: b, score_a: sa, score_b: sb }) as Match

test('classificacao das duplas: vitorias, pontos, saldo, confronto direto', () => {
  const A: Duo = ['a1', 'a2']
  const B: Duo = ['b1', 'b2']
  const C: Duo = ['c1', 'c2']
  // A e B com 1 vitoria cada e mesmos pontos/saldo; A venceu B no confronto
  const ps = [partida(A, B, 4, 2), partida(B, C, 4, 2), partida(C, A, 4, 2)]
  const { linhas, pendente } = classificarDuplas([A, B, C], ps)
  assert.equal(pendente.length, 1) // as tres empatadas em tudo: vai para a quadra
  assert.ok(linhas.every((l) => l.posicao === 1))
  const r = classificarDuplas([A, B, C], ps, [{ grupo: 0, ordem: ['b1', 'a1', 'c1'], como: 'simples', at: '' }])
  assert.deepEqual(r.linhas.map((l) => l.dupla[0]), ['b1', 'a1', 'c1'])
  assert.equal(r.pendente.length, 0)
  // duas empatadas: o confronto direto decide sozinho
  const D: Duo = ['d1', 'd2']
  const ps2 = [partida(A, D, 4, 1), partida(B, D, 4, 1), partida(B, A, 4, 3), partida(A, C, 4, 1), partida(C, B, 4, 1)]
  const r2 = classificarDuplas([A, B, C, D], ps2)
  assert.equal(r2.pendente.length, 0)
  assert.deepEqual(r2.linhas.slice(0, 2).map((l) => l.dupla[0]), ['a1', 'b1'])
})

test('chave a partir da classificacao: 6 duplas, 2 byes para as melhores', () => {
  const duplas: Duo[] = Array.from({ length: 6 }, (_, i) => [`d${i}a`, `d${i}b`])
  const { byes, jogos } = rodadaDoMataMata(duplas)
  assert.deepEqual(byes, [duplas[0], duplas[1]])
  assert.deepEqual(jogos, [[duplas[2], duplas[5]], [duplas[3], duplas[4]]])
})

import { aplicarMescla, refazerDuplasFixas } from '../src/lib/campeonato'
import type { PlaySession } from '../src/lib/types'

const sessaoFixa = (): PlaySession =>
  ({
    id: 's', date: '2026-10-14', title: 't', courts: 2, rounds: 6, target: 4, status: 'open', created_at: '',
    player_ids: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2'],
    format: 'grupos-duplas',
    groups: [['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2']],
    categorias: [{ nome: 'A', grupos: [0], quadras: [1, 2] }],
    duplas_definidas: [['a1', 'a2'], ['b1', 'b2'], ['c1', 'c2'], ['d1', 'd2']],
  }) as PlaySession

test('trocar na dupla fixa: quem entra de fora assume o lugar, e dois de duplas diferentes trocam', () => {
  const s = aplicarMescla(sessaoFixa(), { campo: 'substituir', sai: 'a2', entra: 'z9' })
  assert.deepEqual(s.duplas_definidas?.[0], ['a1', 'z9'])
  assert.ok(s.player_ids.includes('z9') && s.player_ids.includes('a2')) // a2 jogou: continua na presenca
  assert.ok(s.groups?.[0].includes('z9'))
  const t = aplicarMescla(sessaoFixa(), { campo: 'substituir', sai: 'a2', entra: 'b1' })
  assert.deepEqual(t.duplas_definidas?.slice(0, 2), [['a1', 'b1'], ['a2', 'b2']])
})

test('refazer nas duplas fixas: fica o jogado, volta so o confronto que falta', () => {
  const s = sessaoFixa()
  const A: Duo = ['a1', 'a2'], B: Duo = ['b1', 'b2'], C: Duo = ['c1', 'c2'], D: Duo = ['d1', 'd2']
  const jogadas = [partida(A, B, 4, 1), partida(C, D, 4, 2)]
  const pendente = { ...partida(A, C, 0, 0), score_a: null, score_b: null } as Match
  const { preservadas, novas } = refazerDuplasFixas(s, [...jogadas, pendente], (m) => m.score_a != null)
  assert.equal(preservadas.length, 2)
  // 6 confrontos no total, 2 jogados: voltam os outros 4 (inclusive o A x C que estava na fila)
  assert.equal(novas.length, 4)
})
