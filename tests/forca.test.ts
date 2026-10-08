import test from 'node:test'
import assert from 'node:assert/strict'
import { pausaNaForca, quedaPorFalta, ratings } from '../src/lib/stats'
import { notaDeForca } from '../src/lib/forca'
import { emptyData, type AppData, type Match, type PlaySession } from '../src/lib/types'

/*
 * FORCA DE QUEM FALTA: a primeira falta nao muda nada; da 2a seguida em
 * diante, acima de 1500 perde 10% da distancia ate 1500 (no minimo 2) e abaixo
 * perde 2 por falta, ate -20 na sequencia. Voltou, zera a contagem.
 */
const sessao = (id: string, date: string, ids: string[], ranked = true): PlaySession => ({
  id, date, title: id, courts: 1, rounds: 1, target: 4, player_ids: ids, status: 'finished', created_at: date, ranked,
})
let n = 0
const partida = (s: string, a: [string, string], b: [string, string], sa: number, sb: number): Match => ({
  id: `m${++n}`, session_id: s, round: n, court: 1, team_a: a, team_b: b, score_a: sa, score_b: sb,
  fase: 1, disputa_3o: false, started_at: null, ended_at: null,
})

function base(forcaInicial: Record<string, number>): AppData {
  const d = emptyData()
  d.players = Object.entries(forcaInicial).map(([id, f]) => ({ id, name: id, photo_url: null, active: true, created_at: '', forca_inicial: f }))
  return d
}

/** Joga um play com todas (A+B x C+D, empate tecnico 4x4 nao existe: 4x3 e 3x4 se anulam pouco). */
function playCom(d: AppData, id: string, date: string, quem: string[], ranked = true) {
  d.sessions.push(sessao(id, date, quem, ranked))
}

const nota = (d: AppData, id: string) => notaDeForca(ratings(d).get(id) as number)

test('forte que falta: 1a falta nada, depois 10%, 15%, 20%... da distancia por play', () => {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500, d: 1500 })
  // x jogou no play 1 (uma partida que quase nao mexe: 4x3 contra iguais)
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  const depoisDoJogo = nota(d, 'x')
  // os plays seguintes sem ela (cada um com uma partida entre as outras)
  for (let i = 2; i <= 4; i++) {
    playCom(d, `s${i}`, `2026-09-0${i}`, ['a', 'b', 'c', 'd'])
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  const dist = depoisDoJogo - 1500
  // 3 faltas: a 1a nao conta, a 2a tira 10% e a 3a, 15% (vai aumentando)
  const esperado = 1500 + dist * 0.9 * 0.85
  assert.ok(Math.abs(nota(d, 'x') - esperado) <= 1, `${nota(d, 'x')} ~ ${esperado}`)
  assert.deepEqual(quedaPorFalta(d).get('x')?.faltas, 3)
})

test('abaixo de 1500 perde 2 por falta, no maximo 20', () => {
  const d = base({ y: 1450, a: 1500, b: 1500, c: 1500, e: 1500 })
  playCom(d, 's1', '2026-09-01', ['y', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['y', 'a'], ['b', 'c'], 4, 3))
  const depois = nota(d, 'y')
  for (let i = 2; i <= 15; i++) {
    const dd = String(i).padStart(2, '0')
    playCom(d, `s${i}`, `2026-09-${dd}`, ['a', 'b', 'c', 'e'])
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'e'], 4, 3))
  }
  // 14 faltas: 13 contam, mas o teto e 20
  assert.ok(Math.abs(nota(d, 'y') - (depois - 20)) <= 1)
})

test('voltou a jogar: a contagem zera', () => {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  playCom(d, 's2', '2026-09-02', ['a', 'b', 'c', 'd'])
  d.matches.push(partida('s2', ['a', 'b'], ['c', 'd'], 4, 3))
  playCom(d, 's3', '2026-09-03', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s3', ['x', 'a'], ['b', 'c'], 4, 3))
  assert.equal(quedaPorFalta(d).get('x')?.faltas ?? 0, 0)
})

/** x joga o s1 e falta os dois seguintes (2 faltas); o 4o play e o "especial". */
function duasFaltasEDepois(especial: Partial<PlaySession>, xVem: boolean): AppData {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  for (const i of [2, 3]) {
    playCom(d, `s${i}`, `2026-09-0${i}`, ['a', 'b', 'c', 'd'])
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  const quem = xVem ? ['x', 'a', 'b', 'c'] : ['a', 'b', 'c', 'd']
  d.sessions.push({ ...sessao('s4', '2026-09-04', quem), ...especial })
  d.matches.push(xVem ? partida('s4', ['x', 'a'], ['b', 'c'], 4, 3) : partida('s4', ['a', 'b'], ['c', 'd'], 4, 3))
  return d
}

test('play sem status: faltar nao conta, mas quem vem zera as faltas', () => {
  assert.equal(quedaPorFalta(duasFaltasEDepois({ conta_status: false }, false)).get('x')?.faltas, 2)
  assert.equal(quedaPorFalta(duasFaltasEDepois({ conta_status: false }, true)).get('x')?.faltas ?? 0, 0)
})

test('play avulso: faltar nao conta, mas quem vem zera as faltas', () => {
  assert.equal(quedaPorFalta(duasFaltasEDepois({ ranked: false }, false)).get('x')?.faltas, 2)
  assert.equal(quedaPorFalta(duasFaltasEDepois({ ranked: false }, true)).get('x')?.faltas ?? 0, 0)
})

test('pausada na mao: jogar (mesmo avulso ou sem status) tira da pausa; faltar nao', () => {
  const pausada = (especial: Partial<PlaySession>, xVem: boolean) => {
    const d = duasFaltasEDepois(especial, xVem)
    d.players = d.players.map((p) => (p.id === 'x' ? { ...p, pausas: [{ de: '2026-09-02', ate: null }] } : p))
    return pausaNaForca(d).get('x')
  }
  assert.equal(pausada({ ranked: false }, true), undefined)
  assert.equal(pausada({ conta_status: false }, true), undefined)
  assert.equal(pausada({}, true), undefined)
  assert.equal(pausada({ ranked: false }, false), 'manual')
})

test('pausada na mao no dia de um play que ela jogou: continua pausada', () => {
  const d = duasFaltasEDepois({}, false)
  d.players = d.players.map((p) => (p.id === 'x' ? { ...p, pausas: [{ de: '2026-09-01', ate: null }] } : p))
  assert.equal(pausaNaForca(d).get('x'), 'manual')
})

test('play avulso nao conta como falta, e quem nunca jogou nao cai', () => {
  const d = base({ x: 1560, z: 1600, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  const depois = nota(d, 'x')
  for (let i = 2; i <= 4; i++) {
    playCom(d, `s${i}`, `2026-09-0${i}`, ['a', 'b', 'c', 'd'], false)
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  assert.equal(nota(d, 'x'), depois)
  assert.equal(nota(d, 'z'), 1600)
})

import { historicoDeForca } from '../src/lib/stats'

test('historico da forca: um ponto por play jogado, e as faltas que derrubaram a nota', () => {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 0))
  for (let i = 2; i <= 3; i++) {
    playCom(d, `s${i}`, `2026-09-0${i}`, ['a', 'b', 'c', 'd'])
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  playCom(d, 's4', '2026-09-04', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s4', ['x', 'b'], ['a', 'c'], 2, 4))
  const h = historicoDeForca(d, 'x')
  assert.deepEqual(h.map((p) => [p.sessionId, p.jogou]), [['s1', true], ['s3', false], ['s4', true]])
  // a nota do s3 (falta que contou) e menor que a do s1
  assert.ok(h[1].nota < h[0].nota)
  // ponto de partida, para o grafico comecar de algum lugar
  assert.equal(historicoDeForca(d, 'x', true)[0].nota, 1560)
})

test('a queda acima de 1500 aumenta a cada falta e para em 30%', () => {
  const d = base({ x: 1600, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's01', '2026-08-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s01', ['x', 'a'], ['b', 'c'], 4, 3))
  const inicio = nota(d, 'x') - 1500
  for (let i = 2; i <= 9; i++) {
    const dd = String(i).padStart(2, '0')
    playCom(d, `s${dd}`, `2026-08-${dd}`, ['a', 'b', 'c', 'd'])
    d.matches.push(partida(`s${dd}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  // 8 faltas, a 1a nao conta: 2a..8a -> 10, 15, 20, 25, 30, 30, 30 %
  const fator = [0.9, 0.85, 0.8, 0.75, 0.7, 0.7, 0.7].reduce((t, f) => t * f, 1)
  assert.ok(Math.abs(nota(d, 'x') - (1500 + inicio * fator)) <= 2, `${nota(d, 'x')} ~ ${1500 + inicio * fator}`)
})

import { pausaNaForca } from '../src/lib/stats'

test('pausada na mao: sai do ranking, mas as faltas continuam derrubando a forca', () => {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  const antes = nota(d, 'x')
  ;(d.players.find((p) => p.id === 'x') as { pausas?: unknown }).pausas = [{ de: '2026-09-02', ate: null }]
  for (let i = 2; i <= 5; i++) {
    playCom(d, `s${i}`, `2026-09-0${i}`, ['a', 'b', 'c', 'd'])
    d.matches.push(partida(`s${i}`, ['a', 'b'], ['c', 'd'], 4, 3))
  }
  // 4 faltas (a 1a nao conta): cai como quem nao esta pausada
  const dist = antes - 1500
  const esperado = 1500 + dist * 0.9 * 0.85 * 0.8
  assert.ok(Math.abs(nota(d, 'x') - esperado) <= 1, `${nota(d, 'x')} ~ ${esperado}`)
  assert.equal(pausaNaForca(d).get('x'), 'manual')
})

test('2 faltas seguidas: sai do ranking da forca sozinha; reativar na mao traz de volta', () => {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500, d: 1500 })
  playCom(d, 's1', '2026-09-01', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s1', ['x', 'a'], ['b', 'c'], 4, 3))
  playCom(d, 's2', '2026-09-02', ['a', 'b', 'c', 'd'])
  d.matches.push(partida('s2', ['a', 'b'], ['c', 'd'], 4, 3))
  assert.equal(pausaNaForca(d).get('x'), undefined, '1 falta: continua no ranking')
  playCom(d, 's3', '2026-09-03', ['a', 'b', 'c', 'd'])
  d.matches.push(partida('s3', ['a', 'b'], ['c', 'd'], 4, 3))
  assert.equal(pausaNaForca(d).get('x'), 'faltas')
  ;(d.players.find((p) => p.id === 'x') as { reativada_em?: string }).reativada_em = '2026-09-03'
  assert.equal(pausaNaForca(d).get('x'), undefined, 'reativada na mao: volta ao ranking')
  // e jogando de novo, a contagem zera
  playCom(d, 's4', '2026-09-04', ['x', 'a', 'b', 'c'])
  d.matches.push(partida('s4', ['x', 'a'], ['b', 'c'], 4, 3))
  ;(d.players.find((p) => p.id === 'x') as { reativada_em?: string | null }).reativada_em = null
  assert.equal(pausaNaForca(d).get('x'), undefined)
})

import { pausaAberta } from '../src/lib/stats'

test('despausada ao entrar num play: apagar o play devolve a pausa', () => {
  const d = base({ x: 1560, a: 1500, b: 1500, c: 1500 })
  const x = d.players.find((p) => p.id === 'x') as { pausas?: unknown }
  x.pausas = [{ de: '2026-09-02', ate: '2026-09-08', play: 's9' }]
  playCom(d, 's9', '2026-09-08', ['x', 'a', 'b', 'c'])
  assert.equal(pausaNaForca(d).get('x'), undefined, 'o play existe: despausada')
  d.sessions = d.sessions.filter((s) => s.id !== 's9')
  assert.equal(pausaNaForca(d).get('x'), 'manual', 'o play foi apagado: volta a pausa')
  assert.ok(pausaAberta(d, d.players.find((p) => p.id === 'x')!))
  // despausada na mao (sem play) continua despausada
  x.pausas = [{ de: '2026-09-02', ate: '2026-09-08' }]
  assert.equal(pausaNaForca(d).get('x'), undefined)
})

import { passoDaSequencia, proximaSequencia } from '../src/lib/stats'

test('passo: cada surpresa boa seguida aumenta o passo, ate o dobro', () => {
  let q = proximaSequencia(undefined, 0.2)
  const passos = [passoDaSequencia(q, 0.2)]
  for (let i = 0; i < 5; i++) {
    q = proximaSequencia(q, 0.2)
    passos.push(passoDaSequencia(q, 0.2))
  }
  assert.deepEqual(passos, [24, 30, 36, 42, 48, 48])
})

test('passo: ir pior que o esperado custa o normal e zera a sequencia; o neutro nao mexe', () => {
  let q = proximaSequencia(proximaSequencia(proximaSequencia(undefined, 0.2), 0.2), 0.2) // 3 boas: 36
  assert.equal(passoDaSequencia(q, 0.2), 36)
  // dentro do esperado (menos de 5% dos games): nao soma nem quebra
  q = proximaSequencia(q, -0.03)
  assert.equal(passoDaSequencia(q, -0.03), 24, 'perder do jeito esperado custa o normal')
  assert.equal(passoDaSequencia(q, 0.2), 36, 'e a sequencia continua parada em 3')
  // claramente pior: custa o normal e zera
  q = proximaSequencia(q, -0.2)
  assert.equal(passoDaSequencia(q, -0.2), 24)
  q = proximaSequencia(q, 0.2)
  assert.equal(passoDaSequencia(q, 0.2), 24, 'a proxima surpresa boa recomeca em 24')
})

test('passo que acelera: quem surpreende sobe mais rapido e a media continua em 1500', () => {
  const d = base({ x: 1500, p: 1500, a: 1500, b: 1500 })
  playCom(d, 's1', '2026-10-12', ['x', 'p', 'a', 'b'])
  // x + p atropelam 3 vezes seguidas
  for (let i = 0; i < 3; i++) d.matches.push(partida('s1', ['x', 'p'], ['a', 'b'], 4, 0))
  // com o passo fixo seria: +12, depois menos (a nota ja subiu)
  let fx = 1500
  let fa = 1500
  for (let i = 0; i < 3; i++) {
    const esp = 1 / (1 + Math.pow(10, (fa - fx) / 400))
    const delta = 24 * (1 - esp)
    fx += delta
    fa -= delta
  }
  const r = ratings(d)
  const notaX = notaDeForca(r.get('x') as number)
  assert.ok(notaX > Math.round(fx), `${notaX} > ${Math.round(fx)} (passo fixo)`)
  const media = ['x', 'p', 'a', 'b'].reduce((t, id) => t + (1500 + ((r.get(id) as number) - 2) * 110), 0) / 4
  assert.ok(Math.abs(media - 1500) < 0.01, `media ${media}`)
})

test('passo que acelera so vale do play de 12/10 em diante: a forca de antes nao muda', () => {
  const d = base({ x: 1500, p: 1500, a: 1500, b: 1500 })
  playCom(d, 's1', '2026-10-05', ['x', 'p', 'a', 'b'])
  for (let i = 0; i < 3; i++) d.matches.push(partida('s1', ['x', 'p'], ['a', 'b'], 4, 0))
  let fx = 1500
  let fa = 1500
  for (let i = 0; i < 3; i++) {
    const esp = 1 / (1 + Math.pow(10, (fa - fx) / 400))
    const delta = 24 * (1 - esp)
    fx += delta
    fa -= delta
  }
  assert.equal(nota(d, 'x'), Math.round(fx), 'play antigo: passo fixo de 24')
})
