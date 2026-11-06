import test from 'node:test'
import assert from 'node:assert/strict'
import { escolherListaDoMomento, type Lista, type ListaCompleta, type NomeNaLista } from '../src/lib/listaDePresenca'
import { contagem, decorrido, estaAoVivo, momentoDaInicio, podioDaNoite, type Momento } from '../src/lib/momentoDaInicio'
import type { Match, PlaySession } from '../src/lib/types'

/*
 * O CARTAO DO MOMENTO (D42): qual cartao a tela inicial mostra. Horas em UTC;
 * Sao Paulo = UTC-3 (20h de seg 09/11 = 23h UTC).
 */

const LISTA: Lista = {
  id: 'L', codigo: 'k7m2p9qx4t', titulo: 'Play de Todas',
  play_em: '2026-11-09T23:00:00.000Z', // seg 09/11 20h
  fecha_em: '2026-11-08T21:00:00.000Z', // dom 08/11 18h
  vagas: 16, texto: null, fechada: false, session_id: null, created_at: '2026-11-06T12:00:00.000Z',
}
const nomes = (n: number): NomeNaLista[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `n${i + 1}`, lista_id: 'L', nome: `Atleta ${i + 1}`, player_id: null, chegada: i + 1, ordem: null,
    origem: 'link', garantida: false, entrou_em: '2026-11-06T12:00:00Z', saiu_em: null, saiu_por: null, avisou_24h: null,
  }))
const lc = (l: Partial<Lista> = {}, n = 10): ListaCompleta => ({ lista: { ...LISTA, ...l }, nomes: nomes(n) })

function play(id: string, date: string, extra: Partial<PlaySession> = {}): PlaySession {
  return {
    id, date, title: 'Play', courts: 2, rounds: 4, target: 4, player_ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    status: 'open', created_at: `${date}T12:00:00Z`, format: 'todas', groups: null,
    ...extra,
  } as PlaySession
}
let seq = 0
function partida(session: string, extra: Partial<Match> = {}): Match {
  seq++
  return {
    id: `m${seq}`, session_id: session, round: seq, court: 1,
    team_a: ['a', 'b'], team_b: ['c', 'd'], score_a: null, score_b: null,
    started_at: null, ended_at: null, fase: 1, tie: null, disputa_3o: false,
    ...extra,
  } as Match
}
const em = (iso: string) => new Date(iso)
const tipo = (m: Momento | null) => m?.tipo ?? null

test('sem nada: nenhum cartao', () => {
  assert.equal(momentoDaInicio({ sessions: [], matches: [], lista: null, agora: em('2026-11-06T15:00:00Z') }), null)
})

test('prioridade: ao vivo passa na frente da lista aberta, que passa na frente do play que nao comecou', () => {
  const agora = em('2026-11-09T23:30:00Z') // seg 20h30
  const aberto = play('s1', '2026-11-09')
  const listaAberta = lc({ fecha_em: '2026-11-10T21:00:00Z', play_em: '2026-11-16T23:00:00Z' })
  // play aberto sem partida: a lista aberta da semana que vem ganha dele
  assert.equal(tipo(momentoDaInicio({ sessions: [aberto], matches: [partida('s1')], lista: listaAberta, agora })), 'lista-aberta')
  // sem lista: o cartao de sempre, "Proximo play"
  const semLista = momentoDaInicio({ sessions: [aberto], matches: [partida('s1')], lista: null, agora })
  assert.deepEqual(semLista, { tipo: 'play', session: aberto, parado: false })
  // uma partida iniciada: ao vivo, mesmo com a lista aberta
  const ms = [partida('s1', { started_at: '2026-11-09T23:10:00Z' })]
  assert.equal(tipo(momentoDaInicio({ sessions: [aberto], matches: ms, lista: listaAberta, agora })), 'ao-vivo')
})

test('lista fechada com o play por vir: na mao ou pelo prazo, e leva o play ligado', () => {
  const agora = em('2026-11-09T21:00:00Z') // seg 18h
  const fechadaNaMao = lc({ fechada: true, fecha_em: '2026-11-09T22:00:00Z' })
  assert.equal(tipo(momentoDaInicio({ sessions: [], matches: [], lista: fechadaNaMao, agora })), 'lista-fechada')
  const pelaHora = lc() // fechou dom 18h
  const m = momentoDaInicio({ sessions: [], matches: [], lista: pelaHora, agora })
  assert.deepEqual(m, { tipo: 'lista-fechada', lista: pelaHora, session: null })
  // montou o play: o cartao continua o da lista, com o play junto
  const s = play('s1', '2026-11-09')
  const ligada = lc({ fechada: true, session_id: 's1' })
  assert.deepEqual(momentoDaInicio({ sessions: [s], matches: [partida('s1')], lista: ligada, agora }), { tipo: 'lista-fechada', lista: ligada, session: s })
})

test('janela de 6h: a lista fechada some 6h depois da hora do play', () => {
  const l = lc({ fechada: true })
  assert.equal(tipo(momentoDaInicio({ sessions: [], matches: [], lista: l, agora: em('2026-11-10T04:59:00Z') })), 'lista-fechada')
  assert.equal(momentoDaInicio({ sessions: [], matches: [], lista: l, agora: em('2026-11-10T05:00:00Z') }), null)
})

test('lista fechada cujo play ja foi finalizado nao volta', () => {
  const s = play('s1', '2026-11-09', { status: 'finished' })
  const l = lc({ fechada: true, session_id: 's1' })
  const ms = [partida('s1', { score_a: 4, score_b: 1, ended_at: '2026-11-10T00:00:00Z' })]
  assert.equal(tipo(momentoDaInicio({ sessions: [s], matches: ms, lista: l, agora: em('2026-11-10T01:30:00Z') })), 'podio')
})

test('lista fechada sem play ligado: play finalizado na data da lista encerra a noite (podio)', () => {
  // play montado a mao (ou o ligado apagado: o banco zera o session_id)
  const s = play('s1', '2026-11-09', { status: 'finished' })
  const l = lc({ fechada: true, session_id: null })
  const ms = [partida('s1', { score_a: 4, score_b: 1, ended_at: '2026-11-10T00:00:00Z' })]
  for (const t of ['2026-11-10T02:30:00Z', '2026-11-10T04:59:00Z'])
    assert.equal(tipo(momentoDaInicio({ sessions: [s], matches: ms, lista: l, agora: em(t) })), 'podio')
  // play finalizado de outra data nao conta: a lista de hoje segue
  const velho = play('s0', '2026-11-02', { status: 'finished' })
  const ms0 = [partida('s0', { score_a: 4, score_b: 1 })]
  assert.equal(tipo(momentoDaInicio({ sessions: [velho], matches: ms0, lista: l, agora: em('2026-11-09T21:00:00Z') })), 'lista-fechada')
})

test('ao vivo de verdade: data de hoje, ou atividade nas ultimas 3 horas', () => {
  const ms = [partida('s1', { started_at: '2026-11-09T23:05:00Z', score_a: 4, score_b: 2, ended_at: '2026-11-09T23:20:00Z' })]
  const s = play('s1', '2026-11-09')
  assert.equal(estaAoVivo(s, ms, em('2026-11-10T02:10:00Z')), true) // seg 23h10: ainda e o dia do play
  assert.equal(estaAoVivo(s, ms, em('2026-11-10T03:00:00Z')), false) // ter 00h00, 3h40 desde o fim
  // sem nenhuma partida iniciada ou lancada nunca e ao vivo
  assert.equal(estaAoVivo(s, [partida('s1')], em('2026-11-09T23:30:00Z')), false)
  // play finalizado nao e ao vivo
  assert.equal(estaAoVivo({ ...s, status: 'finished' }, ms, em('2026-11-09T23:30:00Z')), false)
})

test('ao vivo: virada da meia-noite e as 3 horas', () => {
  const s = play('s1', '2026-11-09')
  // ultima atividade 01h30 de terca (04h30 UTC)
  const ms = [partida('s1', { started_at: '2026-11-10T04:00:00Z', score_a: 4, score_b: 2, ended_at: '2026-11-10T04:30:00Z' })]
  assert.equal(estaAoVivo(s, ms, em('2026-11-10T07:29:00Z')), true) // 2h59 depois
  assert.equal(estaAoVivo(s, ms, em('2026-11-10T07:30:00Z')), false) // 3h depois, e ja nao e o dia do play
  // ainda segunda em SP (23h59), mesmo parado: e o dia do play
  const cedo = [partida('s1', { started_at: '2026-11-09T19:00:00Z' })]
  assert.equal(estaAoVivo(s, cedo, em('2026-11-10T02:59:00Z')), true)
  assert.equal(estaAoVivo(s, cedo, em('2026-11-10T03:00:00Z')), false) // terca 00h00, 8h parado
})

test('play aberto parado de dias atras: nao e ao vivo, e o cartao antigo "Play em andamento"', () => {
  const s = play('s1', '2026-11-02')
  const ms = [partida('s1', { score_a: 4, score_b: 0, ended_at: '2026-11-02T23:30:00Z', started_at: '2026-11-02T23:10:00Z' }), partida('s1')]
  const m = momentoDaInicio({ sessions: [s], matches: ms, lista: null, agora: em('2026-11-06T15:00:00Z') })
  assert.deepEqual(m, { tipo: 'play', session: s, parado: true })
  // a lista aberta da semana passa na frente dele
  const l = lc({ fecha_em: '2026-11-08T21:00:00Z' })
  assert.equal(tipo(momentoDaInicio({ sessions: [s], matches: ms, lista: l, agora: em('2026-11-06T15:00:00Z') })), 'lista-aberta')
})

test('podio da noite: no dia e ate o meio-dia seguinte (SP), so o ultimo play finalizado com partida', () => {
  const s = play('s1', '2026-11-09', { status: 'finished' })
  const ms = [partida('s1', { score_a: 4, score_b: 1 })]
  const m = (agora: string, sessions = [s], matches = ms) => tipo(momentoDaInicio({ sessions, matches, lista: null, agora: em(agora) }))
  assert.equal(m('2026-11-09T23:59:00Z'), 'podio') // seg 20h59
  assert.equal(m('2026-11-10T14:59:00Z'), 'podio') // ter 11h59
  assert.equal(m('2026-11-10T15:00:00Z'), null) // ter 12h00
  assert.equal(m('2026-11-11T02:00:00Z'), null) // ter 23h: ja nao e "ontem antes do meio-dia"
  // play finalizado sem partida lancada nao tem podio
  assert.equal(m('2026-11-09T23:59:00Z', [s], [partida('s1')]), null)
  // o ultimo e o que vale: um mais antigo nao aparece
  const velho = play('s0', '2026-11-02', { status: 'finished' })
  assert.equal(m('2026-11-09T23:59:00Z', [velho, s], [...ms, partida('s0', { score_a: 4, score_b: 1 })]), 'podio')
})

test('transicoes de uma semana: lista aberta -> fechada -> ao vivo -> podio -> nada', () => {
  const s = play('s1', '2026-11-09')
  const ligada = (fechada: boolean): ListaCompleta => lc({ fechada, session_id: fechada ? 's1' : null }, 18)
  const p1 = partida('s1')
  const p2 = partida('s1')
  const linha = [
    // qui 15h: aberta
    { agora: '2026-11-05T18:00:00Z', lista: ligada(false), sessions: [] as PlaySession[], matches: [] as Match[], esperado: 'lista-aberta' },
    // dom 18h01: fechou pelo prazo
    { agora: '2026-11-08T21:01:00Z', lista: lc({}, 18), sessions: [], matches: [], esperado: 'lista-fechada' },
    // seg 19h: montou o play, ninguem em quadra
    { agora: '2026-11-09T22:00:00Z', lista: ligada(true), sessions: [s], matches: [p1, p2], esperado: 'lista-fechada' },
    // seg 20h10: a 1a partida entrou em quadra
    { agora: '2026-11-09T23:10:00Z', lista: ligada(true), sessions: [s], matches: [{ ...p1, started_at: '2026-11-09T23:05:00Z' }, p2], esperado: 'ao-vivo' },
    // seg 22h40: finalizado
    {
      agora: '2026-11-10T01:40:00Z', lista: ligada(true), sessions: [{ ...s, status: 'finished' as const }],
      matches: [{ ...p1, score_a: 4, score_b: 2 }, { ...p2, score_a: 1, score_b: 4 }], esperado: 'podio',
    },
    // ter 12h: acabou
    {
      agora: '2026-11-10T15:00:00Z', lista: ligada(true), sessions: [{ ...s, status: 'finished' as const }],
      matches: [{ ...p1, score_a: 4, score_b: 2 }, { ...p2, score_a: 1, score_b: 4 }], esperado: null,
    },
  ]
  for (const passo of linha) {
    const m = momentoDaInicio({ sessions: passo.sessions, matches: passo.matches, lista: passo.lista, agora: em(passo.agora) })
    assert.equal(tipo(m), passo.esperado, passo.agora)
  }
})

test('a lista do momento: aberta primeiro; senao a fechada de play mais cedo ate 6h atras', () => {
  const agora = em('2026-11-09T21:00:00Z')
  const fechada = { ...LISTA, id: 'F', fechada: true }
  const aberta = { ...LISTA, id: 'A', play_em: '2026-11-16T23:00:00Z', fecha_em: '2026-11-15T21:00:00Z' }
  const velha = { ...LISTA, id: 'V', play_em: '2026-11-02T23:00:00Z', fechada: true }
  assert.equal(escolherListaDoMomento([velha, fechada, aberta], agora)?.id, 'A')
  assert.equal(escolherListaDoMomento([velha, fechada], agora)?.id, 'F')
  assert.equal(escolherListaDoMomento([velha], agora), undefined)
  // 5h59 depois do play ainda vale; 6h depois, nao
  assert.equal(escolherListaDoMomento([fechada], em('2026-11-10T04:59:00Z'))?.id, 'F')
  assert.equal(escolherListaDoMomento([fechada], em('2026-11-10T05:00:00Z')), undefined)
})

test('contagem e tempo decorrido', () => {
  const min = 60000
  assert.equal(contagem((28 * 60) * min), '1d 4h')
  assert.equal(contagem(24 * 60 * min), '1d')
  assert.equal(contagem((3 * 60 + 20) * min), '3h 20min')
  assert.equal(contagem(2 * 60 * min), '2h')
  assert.equal(contagem(25 * min), '25 min')
  assert.equal(contagem(24.2 * min), '25 min') // para cima
  assert.equal(contagem(1000), '1 min') // nunca "0 min"
  assert.equal(decorrido(70 * min), 'há 1h10')
  assert.equal(decorrido(45 * min + 50000), 'há 45 min')
  assert.equal(decorrido(120 * min), 'há 2h')
})

test('podio de um play todas: as tres primeiras; de grupos: a campea de cada grupo', () => {
  const s = play('s1', '2026-11-09', { status: 'finished', criterio_dia: 'vitorias' })
  const ms = [
    partida('s1', { team_a: ['a', 'b'], team_b: ['c', 'd'], score_a: 4, score_b: 1 }),
    partida('s1', { team_a: ['a', 'c'], team_b: ['b', 'd'], score_a: 4, score_b: 2 }),
    partida('s1', { team_a: ['a', 'd'], team_b: ['b', 'c'], score_a: 4, score_b: 3 }),
  ]
  const p = podioDaNoite(s, ms, (id) => id.toUpperCase())
  assert.equal(p?.tipo, 'um')
  if (p?.tipo === 'um') {
    assert.equal(p.lugares[0].id, 'a')
    assert.equal(p.lugares[0].posicao, 1)
    assert.equal(p.lugares.length, 3)
  }
  const g = podioDaNoite({ ...s, format: 'grupos', groups: [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']] }, [
    ...ms,
    partida('s1', { team_a: ['e', 'f'], team_b: ['g', 'h'], score_a: 4, score_b: 0 }),
  ], (id) => id)
  assert.equal(g?.tipo, 'varios')
  if (g?.tipo === 'varios') {
    assert.deepEqual(g.linhas.map((l) => l.rotulo), ['🏆 Grupo 1', '🏆 Grupo 2'])
    assert.deepEqual(g.linhas[0].ids, ['a'])
    assert.deepEqual(g.linhas[1].ids, ['e', 'f']) // empate exato: as duas sobem juntas
  }
})
