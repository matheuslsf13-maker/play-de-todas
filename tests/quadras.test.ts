import test from 'node:test'
import assert from 'node:assert/strict'
import { quadrasAbertas, estadoDasQuadras, mudarQuadra, preservarQuadras, garantirQuadrasEmJogo } from '../src/lib/quadras'
import type { Match, PlaySession } from '../src/lib/types'

const grupos = Array.from({ length: 4 }, (_, g) => Array.from({ length: 4 }, (_, i) => `p${g * 4 + i}`))
const s = (courts = 2): PlaySession => ({ id: 's', date: '2026-11-06', created_at: '2026-11-06T20:00:00Z', title: 'Teste', courts, rounds: 4, target: 4, status: 'open', format: 'grupos', groups: grupos, player_ids: grupos.flat() })
const ms = (): Match[] => grupos.map((g, i) => ({ id: `m${i}`, session_id: 's', round: i + 1, court: 0, team_a: [g[0], g[1]], team_b: [g[2], g[3]], score_a: null, score_b: null }))
const inicio = (m: Match, court: number): Match => ({ ...m, court, started_at: '2026-11-06T20:00:00Z' })

test('antigo le 1..courts; numeros fisicos nao renumeram e jogo sempre tem card', () => {
  assert.deepEqual(quadrasAbertas(s(4)), [1, 2, 3, 4])
  assert.deepEqual(quadrasAbertas({ ...s(), quadras_abertas: [1, 4] }, [inicio(ms()[0], 3)]), [1, 3, 4])
})

test('selo desconta quadras vazias: 2 -> 1 -> 0; zero nao abre', () => {
  let atual = s()
  assert.equal(estadoDasQuadras(atual, ms()).abrir.length, 2)
  atual = mudarQuadra(atual, ms(), 'abrir_quadra', 'a')
  assert.equal(estadoDasQuadras(atual, ms()).abrir.length, 1)
  atual = mudarQuadra(atual, ms(), 'abrir_quadra', 'b')
  assert.equal(estadoDasQuadras(atual, ms()).abrir.length, 0)
  assert.equal(mudarQuadra(atual, ms(), 'abrir_quadra', 'c').courts, 4)
})

test('dois celulares aplicam dois incrementos; repetir o envio nao abre de novo', () => {
  const a = mudarQuadra(s(), ms(), 'abrir_quadra', 'a')
  const b = mudarQuadra(a, ms(), 'abrir_quadra', 'b')
  assert.equal(b.courts, 4)
  assert.deepEqual(mudarQuadra(b, ms(), 'abrir_quadra', 'a'), b)
})

test('tira quadra do meio e dois toques tiram duas livres, preservando a 4 em jogo', () => {
  const partidas = [inicio(ms()[0], 4)]
  const a = mudarQuadra(s(4), partidas, 'tirar_quadra', 'a')
  const b = mudarQuadra(a, partidas, 'tirar_quadra', 'b')
  assert.deepEqual(quadrasAbertas(a), [1, 2, 4])
  assert.deepEqual(quadrasAbertas(b), [1, 4])
  assert.equal(b.courts, 2)
})

test('todas em jogo nao tira; conserva pelo menos uma quadra', () => {
  assert.equal(mudarQuadra(s(2), ms().slice(0, 2).map((m, i) => inicio(m, i + 1)), 'tirar_quadra', 'a').courts, 2)
  assert.equal(mudarQuadra(s(1), [], 'tirar_quadra', 'b').courts, 1)
})

test('ausentes e atletas ocupadas nao contam como jogo pronto', () => {
  const atual = { ...s(1), ausentes: [grupos[2][0], grupos[3][0]] }
  assert.equal(estadoDasQuadras(atual, [inicio(ms()[0], 1), ...ms().slice(1)]).abrir.length, 1)
})

test('nao conta duas partidas com a mesma atleta nem mata-mata ainda nao montado', () => {
  const partidas = ms().slice(0, 1)
  partidas.push({ ...partidas[0], id: 'outra', fase: 2 })
  assert.equal(estadoDasQuadras({ ...s(1), format: 'grupos-duplas' }, partidas).abrir.length, 0)
})

test('campeonato e duplas fixas permitem tirar quadra fixa; reabrir vai a categoria pronta', () => {
  const atual = { ...s(4), format: 'grupos-duplas' as const, categorias: [{ nome: 'A', grupos: [0, 1], quadras: [1, 2] }, { nome: 'B', grupos: [2, 3], quadras: [3, 4] }] }
  const partidas = ms().map((m, i) => i === 3 ? m : inicio(m, i + 1))
  const a = mudarQuadra(atual, partidas, 'tirar_quadra', 'a')
  assert.deepEqual(quadrasAbertas(a), [1, 2, 3])
  assert.equal(estadoDasQuadras(a, partidas).abrir.length, 1)
  const b = mudarQuadra(a, partidas, 'abrir_quadra', 'b')
  assert.deepEqual(quadrasAbertas(b), [1, 2, 3, 4])
  assert.deepEqual(estadoDasQuadras(b, partidas).porCategoria, [[1, 2], [3, 4]])
})

test('revezamento chama grupo parado antes de repetir o que esta jogando', () => {
  const partidas = [inicio(ms()[0], 1), ...ms().slice(1)]
  const e = estadoDasQuadras(s(2), partidas)
  assert.equal(e.proximas.get(2)?.id, 'm1')
  assert.equal(e.abrir.length, 2)
})

test('campeonato com quadra retirada reveza os grupos da categoria', () => {
  const atual = { ...s(2), quadras_abertas: [1, 3], categorias: [{ nome: 'A', grupos: [0, 1], quadras: [1, 2] }, { nome: 'B', grupos: [2, 3], quadras: [3, 4] }] }
  const jogada = { ...ms()[0], id: 'jogada', court: 1, score_a: 4, score_b: 1, ended_at: '2026-11-06T20:10:00Z' }
  assert.equal(estadoDasQuadras(atual, [...ms(), jogada]).proximas.get(1)?.id, 'm1')
})

test('escolhas manuais nao escalam ausente nem a mesma atleta duas vezes', () => {
  const atual = { ...s(3), ausentes: [grupos[2][0]], escolhas: { '1': 'm0', '2': 'm0', '3': 'm2' } }
  const e = estadoDasQuadras(atual, ms())
  const ids = [...e.proximas.values()].flatMap((m) => [...m.team_a, ...m.team_b])
  assert.equal(ids.length, new Set(ids).size)
  assert.ok(!ids.includes(grupos[2][0]))
  assert.equal(e.abrir.length, 0)
})

test('sem script 33 preserva representacao antiga e nao tira fixa ou ultima ocupada', () => {
  const a = mudarQuadra(s(2), ms(), 'abrir_quadra', 'a', true)
  assert.equal(a.courts, 3)
  assert.equal(a.quadras_abertas, undefined)
  assert.equal(mudarQuadra(s(2), [inicio(ms()[0], 2)], 'tirar_quadra', 'b', true).courts, 2)
})

test('uma categoria sem quadra usa a unica vazia se a dona nao tem jogo pronto', () => {
  const atual = { ...s(1), quadras_abertas: [1], categorias: [{ nome: 'A', grupos: [0, 1], quadras: [1, 2] }, { nome: 'B', grupos: [2, 3], quadras: [3, 4] }] }
  const e = estadoDasQuadras(atual, ms().slice(2, 3))
  assert.deepEqual(e.porCategoria, [[], [1]])
  assert.equal(e.proximas.get(1)?.id, 'm2')
  assert.equal(e.abrir.length, 0)
})

test('editar sessao antiga nao desfaz quadras nem identificadores ja enviados', () => {
  const atual = mudarQuadra(s(4), [], 'tirar_quadra', 'op')
  const editada = preservarQuadras({ ...s(4), title: 'Outro titulo' }, atual)
  assert.equal(editada.title, 'Outro titulo')
  assert.equal(editada.courts, 3)
  assert.deepEqual(editada.quadras_operacoes, ['op'])
  assert.deepEqual(editada.quadras_abertas, [1,2,3])
  assert.equal('quadras_abertas' in preservarQuadras({ ...s(), title: 'Antigo' }, s()), false)
})

test('inicio tardio restaura quadra fisica e ela continua aberta depois do placar', () => {
  const atual = { ...s(1), quadras_abertas: [1] }
  const iniciada = inicio(ms()[0], 4)
  const restaurada = garantirQuadrasEmJogo(atual, [iniciada])
  assert.deepEqual(restaurada.quadras_abertas, [1,4])
  assert.deepEqual(garantirQuadrasEmJogo(restaurada, [{ ...iniciada, score_a:4, score_b:1 }]).quadras_abertas, [1,4])
  assert.equal(garantirQuadrasEmJogo(atual, [{ ...iniciada, session_id: 'outro' }]), atual)
})

test('mata-mata conta final e terceiro prontos, mas nao uma semifinal com atleta em jogo', () => {
  const partidas = ms().map((m,i) => ({ ...m, fase: 3, disputa_3o: i===1 }))
  const atual = { ...s(1), format: 'grupos-duplas' as const }
  assert.equal(estadoDasQuadras(atual, partidas.slice(0,2)).abrir.length,1)
  const emJogo = inicio(partidas[0], 1)
  assert.equal(estadoDasQuadras(atual, [emJogo,{...partidas[1],team_a:emJogo.team_a}]).abrir.length,0)
})
