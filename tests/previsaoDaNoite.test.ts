import test from 'node:test'
import assert from 'node:assert/strict'
import {
  categoriaDaPartida,
  categoriaTerminou,
  categoriasDoPlay,
  duosDaCategoria,
  estimativaDaNoite,
  minutosRestantesDaChave,
  quadrasEfetivas,
} from '../src/lib/campeonato'
import { lerRegra, type Regra } from '../src/lib/desempate'
import { duplasQueEntraram, duplasVivas, nomeDaRodada } from '../src/lib/pairing'
import {
  chavesDoPlay,
  formatarMinutos,
  quadrasEmUso,
  quadrasDaCategoriaAgora,
  regrasDoPlay,
  restanteDaNoite,
  resumoAoVivo,
} from '../src/lib/previsaoDaNoite'
import { isPlayed } from '../src/lib/scoring'
import type { Match, PlaySession } from '../src/lib/types'
// tres noites da semente (campeonato de 3 categorias, grupos, todas), sem nomes: ids p1/s1/m1
import NOITES from './fixtures/noites.json'

const SESSOES = NOITES.sessions as unknown as PlaySession[]
const PARTIDAS = NOITES.matches as unknown as Match[]

/* ------------------------------------------------------------------
   A CONTA ANTIGA, copiada do Play.tsx de antes da D42 (3adc918), com os
   hooks trocados por funcoes. A tela do play passou a usar
   src/lib/previsaoDaNoite.ts; aqui se prova que os numeros sao os mesmos.
   ------------------------------------------------------------------ */
const MINUTOS_POR_GAME = 15 / 5.5
function minutosDaPartida(alvo: number, r: Regra): number {
  const doDesempate = r.modo === 'alvo' ? 0 : r.modo === 'vantagem' ? 1 : r.tie === 10 ? 2 : 1.5
  const games = alvo + (alvo - 1) / 2 + doDesempate
  return games * MINUTOS_POR_GAME
}

function contaAntiga(session: PlaySession, matches: Match[], emJogo: Match[]) {
  const regraDoPlay = lerRegra(session.desempate)
  const soFase2 = session.format === 'grupos-duplas'
  const cats = categoriasDoPlay(session)
  const ehCampeonato = cats.length > 1
  const catDe = (m: Match) => Math.max(0, categoriaDaPartida(cats, session.groups, m))
  const rodadaDe = (m: Match): string => {
    const fase = m.fase ?? 1
    const ci = catDe(m)
    const daCategoria = matches.filter((x) => catDe(x) === ci)
    const entraram = duplasQueEntraram(duosDaCategoria(session, ci), daCategoria, fase)
    if (entraram > 0) return nomeDaRodada(entraram)
    const jogos = daCategoria.filter((x) => (x.fase ?? 1) === fase && !x.disputa_3o).length
    return jogos === 1 ? 'Final' : jogos === 2 ? 'Semifinal' : nomeDaRodada(jogos * 2)
  }
  const degrauDe = (m: Match): 0 | 1 | 2 | 3 => {
    if ((m.fase ?? 1) === 1) return 0
    const nome = rodadaDe(m)
    return nome === 'Final' ? 3 : nome === 'Semifinal' ? 2 : 1
  }
  const regraDe = (m: Match): Regra => {
    const lista = session.desempates
    if (!lista?.length) return lerRegra(session.desempate)
    return lerRegra(lista[degrauDe(m)])
  }
  const alvoDe = (m: Match) => {
    const alvos = session.alvos
    if (!alvos?.length) return session.target
    return alvos[degrauDe(m)] ?? session.target
  }
  const porCategoria = cats.map((cat, ci) => {
    const daqui = matches.filter((m) => catDe(m) === ci)
    const daFase1 = daqui.filter((m) => (m.fase ?? 1) === 1)
    const doMataMata = daqui.filter((m) => (m.fase ?? 1) >= 2)
    const ultimaFase = doMataMata.reduce((t, m) => Math.max(t, m.fase ?? 1), 1)
    const daUltimaRodada = doMataMata.filter((m) => (m.fase ?? 1) === ultimaFase && !m.disputa_3o)
    const duos = duosDaCategoria(session, ci)
    const vivas = duos.length ? duplasVivas(duos, doMataMata) : []
    return {
      cat, ci, daFase1, daUltimaRodada, duos, vivas,
      terminou: soFase2 && categoriaTerminou(session, ci, matches),
      porJogar: daqui.filter((m) => !isPlayed(m)).length,
    }
  })
  const emQuadra = new Map<number, Match>()
  for (const m of emJogo) if (!emQuadra.has(m.court)) emQuadra.set(m.court, m)
  const quadrasDaCategoria = (() => {
    if (!ehCampeonato) return null
    const base = quadrasEfetivas(cats, porCategoria.map((c) => c.terminou), porCategoria.map((c) => c.porJogar), session.quadras_cedidas, session.courts)
    for (const [q, m] of emQuadra) {
      const dona = catDe(m)
      base.forEach((qs, i) => {
        const k = qs.indexOf(q)
        if (k >= 0 && i !== dona) qs.splice(k, 1)
      })
      if (base[dona] && !base[dona].includes(q)) base[dona].push(q)
    }
    return base.map((qs) => [...qs].sort((a, b) => a - b))
  })()
  const minutosMedios = (ms: Match[]) =>
    ms.length === 0
      ? minutosDaPartida(session.target, regraDoPlay)
      : ms.reduce((t, m) => t + minutosDaPartida(alvoDe(m), regraDe(m)), 0) / ms.length
  const finished = session.status === 'finished'
  const restante = (() => {
    if (finished) return null
    const falta = matches.filter((m) => !isPlayed(m)).length
    if (!soFase2) {
      return {
        minutos: Math.ceil(falta / Math.max(1, session.courts)) * minutosMedios(matches.filter((m) => !isPlayed(m))),
        falta,
        categorias: [] as { nome: string; minutos: number }[],
      }
    }
    const minutos = [0, 1, 2, 3].map((d) =>
      minutosDaPartida(session.alvos?.[d] ?? session.target, lerRegra(session.desempates?.[d] ?? session.desempate)),
    )
    const categorias = porCategoria.map((c) => {
      const q = Math.max(1, quadrasDaCategoria?.[c.ci]?.length ?? session.courts)
      let t = Math.ceil(c.daFase1.filter((m) => !isPlayed(m)).length / q) * minutos[0]
      if (!c.duos.length) {
        t += estimativaDaNoite({
          grupos: [c.cat.grupos.map((g) => session.groups?.[g]?.length ?? 0)],
          quadras: [q],
          duplasMM: session.duplas_mm ?? 8,
          minutos,
        }).categorias[0].mataMata
      } else {
        t += minutosRestantesDaChave({
          vivas: c.vivas.length,
          pendentesNaRodada: c.daUltimaRodada.filter((m) => !isPlayed(m)).length,
          degrauAtual: c.daUltimaRodada[0] ? degrauDe(c.daUltimaRodada[0]) : 3,
          teveSemi: c.duos.length >= 4,
          quadras: q,
          minutos,
        })
      }
      return { nome: c.cat.nome, minutos: c.terminou ? 0 : t }
    })
    return { minutos: Math.max(0, ...categorias.map((c) => c.minutos)), falta, categorias }
  })()
  return { restante, quadrasDaCategoria, mediaDaNoite: minutosMedios(matches), rodadas: matches.map(rodadaDe) }
}

/* ------------------------------------------------------------------
   Noites pela metade, montadas a partir das de verdade
   ------------------------------------------------------------------ */

const quando = (m: Match) => m.ended_at ?? `~${String(m.round).padStart(4, '0')}`

/** O play aberto com as `k` primeiras partidas lancadas e as seguintes em quadra. */
function meioDeNoite(s: PlaySession, ms: Match[], k: number, emQuadra: number): Match[] {
  const ordem = [...ms].sort((a, b) => quando(a).localeCompare(quando(b)))
  return ordem.map((m, i) =>
    i < k
      ? m
      : { ...m, score_a: null, score_b: null, tie: null, ended_at: null, started_at: i < k + emQuadra ? '2026-11-09T23:30:00.000Z' : null },
  )
}

type Cenario = { nome: string; session: PlaySession; matches: Match[] }

function cenarios(): Cenario[] {
  const out: Cenario[] = []
  for (const s0 of SESSOES) {
    const s: PlaySession = { ...s0, status: 'open' }
    const ms = PARTIDAS.filter((m) => m.session_id === s.id)
    if (s.format !== 'grupos-duplas') {
      for (let k = 0; k < ms.length; k += 3) {
        for (const emQuadra of [0, Math.min(2, s.courts)]) {
          out.push({ nome: `${s.format} ${s.date} k=${k} q=${emQuadra}`, session: s, matches: meioDeNoite(s, ms, k, emQuadra) })
        }
      }
      continue
    }
    const fase1 = ms.filter((m) => (m.fase ?? 1) === 1)
    const chave = ms.filter((m) => (m.fase ?? 1) >= 2)
    // fase de grupos rolando: o mata-mata ainda nao existe (sem duplas)
    for (let k = 0; k <= fase1.length; k += 2) {
      out.push({ nome: `campeonato sem chave k=${k}`, session: { ...s, duos: null }, matches: meioDeNoite(s, fase1, k, 3) })
    }
    // mata-mata rolando: as fases seguintes ainda nao foram montadas
    const porOrdem = [...chave].sort((a, b) => quando(a).localeCompare(quando(b)))
    for (let k = 0; k < porOrdem.length; k++) {
      const faseAtual = porOrdem[k].fase ?? 2
      const montadas = chave.filter((m) => (m.fase ?? 2) <= faseAtual)
      const jaForam = new Set(porOrdem.slice(0, k).map((m) => m.id))
      const doMataMata = montadas.map((m) =>
        jaForam.has(m.id) ? m : { ...m, score_a: null, score_b: null, tie: null, ended_at: null, started_at: m.id === porOrdem[k].id ? '2026-11-09T23:30:00.000Z' : null },
      )
      out.push({ nome: `campeonato com chave k=${k}`, session: s, matches: [...fase1, ...doMataMata] })
    }
  }
  return out
}

/** A conta nova, chamada como a tela do play chama. */
function contaNova(session: PlaySession, matches: Match[], emJogo: Match[]) {
  const regras = regrasDoPlay(session, matches)
  const chaves = chavesDoPlay(session, matches, regras)
  const emQuadra = new Map<number, Match>()
  for (const m of emJogo) if (!emQuadra.has(m.court)) emQuadra.set(m.court, m)
  const quadrasDaCategoria = quadrasDaCategoriaAgora(session, chaves, emQuadra, regras.catDe)
  const r = restanteDaNoite(session, matches, regras, chaves, quadrasDaCategoria)
  return {
    restante: r && { ...r, categorias: r.categorias.map(({ nome, minutos }) => ({ nome, minutos })) },
    quadrasDaCategoria,
    mediaDaNoite: regras.minutosMedios(matches),
    rodadas: matches.map(regras.rodadaDe),
  }
}

test('a tela do play mostra os MESMOS numeros de antes (noites da semente pela metade, 3 formatos)', () => {
  const todos = cenarios()
  const formatos = new Set(todos.map((c) => c.nome.split(' ')[0]))
  assert.ok(todos.length > 60, `poucos cenarios: ${todos.length}`)
  assert.deepEqual([...formatos].sort(), ['campeonato', 'grupos', 'todas'])
  for (const c of todos) {
    const ms = [...c.matches].sort((a, b) => a.round - b.round || a.court - b.court)
    const emJogo = ms.filter((m) => !isPlayed(m) && !!m.started_at)
    assert.deepEqual(contaNova(c.session, ms, emJogo), contaAntiga(c.session, ms, emJogo), c.nome)
  }
})

test('play finalizado: sem previsao (a tela mostra a "noite de")', () => {
  const s = SESSOES[0]
  const ms = PARTIDAS.filter((m) => m.session_id === s.id)
  const regras = regrasDoPlay(s, ms)
  assert.equal(restanteDaNoite(s, ms, regras, chavesDoPlay(s, ms, regras), null), null)
})

test('cartao ao vivo: grupos pela metade -- N de M, quadras jogando e a mesma previsao', () => {
  const s0 = SESSOES.find((x) => x.format === 'grupos')!
  const s: PlaySession = { ...s0, status: 'open' }
  const ms = meioDeNoite(s, PARTIDAS.filter((m) => m.session_id === s.id), 18, 3)
  const r = resumoAoVivo(s, ms)
  assert.equal(r.jogadas, 18)
  assert.equal(r.total, ms.length)
  assert.equal(r.fase, null)
  assert.equal(r.marca, null)
  assert.equal(r.jogando, 3)
  const ordenadas = [...ms].sort((a, b) => a.round - b.round || a.court - b.court)
  assert.equal(r.minutos, contaAntiga(s, ordenadas, ordenadas.filter((m) => !isPlayed(m) && !!m.started_at)).restante!.minutos)
})

test('cartao ao vivo: campeonato na fase de grupos conta o mata-mata que ainda nao existe', () => {
  const s0 = SESSOES.find((x) => x.format === 'grupos-duplas')!
  const s: PlaySession = { ...s0, status: 'open', duos: null }
  const fase1 = PARTIDAS.filter((m) => m.session_id === s.id && (m.fase ?? 1) === 1)
  const r = resumoAoVivo(s, meioDeNoite(s, fase1, 10, 2))
  // 3 categorias de 8: 4 duplas no mata-mata (duplas_mm 4) = semi, final e 3o lugar = 4 partidas cada
  assert.equal(fase1.length, 18)
  assert.equal(r.total, 18 + 3 * 4)
  assert.equal(r.jogadas, 10)
  assert.equal(r.fase, 'fase de grupos')
  assert.equal(r.marca, 18 / 30)
  assert.equal(r.jogando, 2)
  // o campeonato inteiro tem mesmo 30 partidas
  assert.equal(PARTIDAS.filter((m) => m.session_id === s.id).length, 30)
})

test('cartao ao vivo: campeonato com a semifinal rolando conta so a final e o 3o que faltam', () => {
  const s0 = SESSOES.find((x) => x.format === 'grupos-duplas')!
  const s: PlaySession = { ...s0, status: 'open' }
  const todas = PARTIDAS.filter((m) => m.session_id === s.id)
  const semis = todas.filter((m) => m.fase === 2)
  assert.equal(semis.length, 6)
  // fase 1 inteira e as semifinais montadas, nenhuma lancada
  const ms = [...todas.filter((m) => (m.fase ?? 1) === 1), ...semis.map((m) => ({ ...m, score_a: null, score_b: null, ended_at: null, started_at: null }))]
  const r = resumoAoVivo(s, ms)
  assert.equal(r.total, 30)
  assert.equal(r.fase, 'mata-mata')
  assert.equal(r.jogadas, 18)
})

test('formatarMinutos segue igual', () => {
  assert.equal(formatarMinutos(45), '45 min')
  assert.equal(formatarMinutos(120), '2h')
  assert.equal(formatarMinutos(95), '1h35')
})

/* ------------------------------------------------------------------
   D43: A HORA DE INICIO GUARDADA E AS QUADRAS EM USO DE VERDADE
   ------------------------------------------------------------------ */

const MIN = 60000

/**
 * A noite com a hora de inicio de cada partida, como o app passa a guardar:
 * a anterior da mesma quadra terminou, 2 min depois a proxima comeca; a
 * primeira de cada quadra comeca 15 min antes de terminar. (A semente nao tem
 * inicio: e o que o app gravava antes da D43.)
 */
function comInicio(ms: Match[]): Match[] {
  const ordem = [...ms].sort((a, b) => a.ended_at!.localeCompare(b.ended_at!))
  const fimDaQuadra = new Map<number, number>()
  return ordem.map((m) => {
    const fim = Date.parse(m.ended_at!)
    const antes = fimDaQuadra.get(m.court)
    fimDaQuadra.set(m.court, fim)
    return { ...m, started_at: new Date(antes === undefined ? fim - 15 * MIN : antes + 2 * MIN).toISOString() }
  })
}

/** A noite com `k` partidas lancadas: a hora e o fim da k-esima; quem ja tinha comecado esta em quadra. */
function aoVivo(ms: Match[], k: number): { matches: Match[]; agora: number } {
  const ordem = comInicio(ms)
  const agora = Date.parse(ordem[k - 1].ended_at!)
  const matches = ordem.map((m, i) =>
    i < k
      ? m
      : Date.parse(m.started_at!) <= agora
        ? { ...m, score_a: null, score_b: null, tie: null, ended_at: null }
        : { ...m, score_a: null, score_b: null, tie: null, ended_at: null, started_at: null, court: 0 },
  )
  return { matches, agora }
}

const S2: PlaySession = { ...SESSOES.find((x) => x.id === 's2')!, status: 'open' }
const DE_S2 = PARTIDAS.filter((m) => m.session_id === 's2')
const QUADRAS = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

test('D43: o cartao ao vivo mostra a hora em que a 1a partida comecou (nao a que terminou)', () => {
  const { matches } = aoVivo(DE_S2, 22)
  const primeira = matches.filter((m) => m.started_at).sort((a, b) => a.started_at!.localeCompare(b.started_at!))[0]
  const r = resumoAoVivo(S2, matches)
  assert.equal(r.comecouEm, primeira.started_at)
  assert.ok(Date.parse(r.comecouEm!) < Date.parse(matches.filter(isPlayed).map((m) => m.ended_at!).sort()[0]))
  // a jogada com inicio guardado nao conta como quadra jogando
  assert.equal(r.jogando, matches.filter((m) => !isPlayed(m) && m.started_at).length)
  assert.ok(r.jogando >= 1 && r.jogando <= 4)
})

test('D43: 02/11 -- 5 quadras no app e so 4 de verdade: a previsao usa as 4', () => {
  // na semente as quadras 1 a 4 levam a noite; a 5 so aparece no fim
  const { matches, agora } = aoVivo(DE_S2, 22)
  assert.equal(quadrasEmUso(matches, QUADRAS(5), agora, 30), 4)
  // 23 partidas por fazer, 15 min cada: em 5 quadras 5 levas (75 min), em 4 sao 6 (90; faltaram 103 de verdade)
  assert.equal(Math.round(resumoAoVivo(S2, matches).minutos), 75)
  assert.equal(Math.round(resumoAoVivo(S2, matches, agora).minutos), 90)
  const k15 = aoVivo(DE_S2, 15)
  assert.equal(Math.round(resumoAoVivo(S2, k15.matches, k15.agora).minutos), 120)
  const k30 = aoVivo(DE_S2, 30)
  assert.equal(Math.round(resumoAoVivo(S2, k30.matches, k30.agora).minutos), 60)
})

test('D43: sem dados suficientes a previsao e IDENTICA a de hoje', () => {
  // partidas antigas (sem inicio): a semente pela metade, nos 3 formatos. A
  // unica hora de inicio nela e a das que estao em quadra, 10 min antes de
  // `agora`: ainda nao da uma janela inteira
  const agora = Date.parse('2026-11-09T23:40:00.000Z')
  for (const c of cenarios()) {
    const ms = [...c.matches].sort((a, b) => a.round - b.round || a.court - b.court)
    const emJogo = ms.filter((m) => !isPlayed(m) && !!m.started_at)
    const regras = regrasDoPlay(c.session, ms)
    const chaves = chavesDoPlay(c.session, ms, regras)
    const emQuadra = new Map<number, Match>()
    for (const m of emJogo) if (!emQuadra.has(m.court)) emQuadra.set(m.court, m)
    const q = quadrasDaCategoriaAgora(c.session, chaves, emQuadra, regras.catDe)
    const r = restanteDaNoite(c.session, ms, regras, chaves, q, agora)
    assert.deepEqual(
      r && r.categorias.map((x) => x.minutos).concat(r.minutos),
      (({ restante }) => restante && restante.categorias.map((x) => x.minutos).concat(restante.minutos))(contaAntiga(c.session, ms, emJogo)),
      c.nome,
    )
  }
  // comeco da noite: com inicio, mas ninguem comecou ha mais de uma janela
  const k1 = aoVivo(DE_S2, 1)
  assert.equal(quadrasEmUso(k1.matches, QUADRAS(5), k1.agora, 30), null)
  assert.equal(resumoAoVivo(S2, k1.matches, k1.agora).minutos, resumoAoVivo(S2, k1.matches).minutos)
  // sem `agora`
  const k22 = aoVivo(DE_S2, 22)
  assert.equal(quadrasEmUso(k22.matches, QUADRAS(5), undefined, 30), null)
  // noite de transicao: jogadas sem inicio (app antigo) e 2 rolando ha 40 min -- a trava pede JOGADA com inicio
  const antigas = cenarios().find((c) => c.session.id === 's2' && c.nome.endsWith('q=2') && c.matches.filter(isPlayed).length >= 15)!.matches.map((m) =>
    !isPlayed(m) && m.started_at ? { ...m, started_at: new Date(agora - 40 * MIN).toISOString() } : m,
  )
  assert.equal(quadrasEmUso(antigas, QUADRAS(5), agora, 30), null)
})

test('D43: pausa e volta escalonada nao derrubam as quadras (o pico da noite)', () => {
  // 22 jogadas, nada rolando, 50 min de pausa e so a quadra 1 volta
  const { matches, agora } = aoVivo(DE_S2, 22)
  const parado = matches.map((m) => (isPlayed(m) ? m : { ...m, started_at: null, court: 0 }))
  const volta = agora + 50 * MIN
  const i = parado.findIndex((m) => !isPlayed(m))
  const umaVolta = parado.map((m, k) => (k === i ? { ...m, court: 1, started_at: new Date(volta - MIN).toISOString() } : m))
  assert.equal(quadrasEmUso(parado, QUADRAS(5), volta, 30), 4)
  assert.equal(quadrasEmUso(umaVolta, QUADRAS(5), volta, 30), 4)
  assert.equal(Math.round(resumoAoVivo(S2, umaVolta, volta).minutos), 90)
  // a hora de quem olha nao muda a conta (o Play recalcula so ao tocar, o cartao a cada 30 s)
  assert.equal(resumoAoVivo(S2, umaVolta, volta + 25 * MIN).minutos, resumoAoVivo(S2, umaVolta, volta).minutos)
})

test('D43: jogada sem fim (o banco nao guarda o ended_at) e um ponto, nao vai ate agora', () => {
  const t0 = Date.parse('2026-11-02T22:00:00.000Z')
  const iso = (min: number) => new Date(t0 + min * MIN).toISOString()
  const base = { session_id: 'x', round: 1, team_a: [], team_b: [], score_a: 6, score_b: 3, tie: null } as unknown as Match
  // quadras 1 a 3 a noite toda; a 4 so no comeco e a 5 so no meio, as duas sem ended_at
  const ms: Match[] = [
    ...[1, 2, 3].flatMap((q) => [0, 15, 30, 45, 60, 75].map((t) => ({ ...base, id: `${q}-${t}`, court: q, started_at: iso(t), ended_at: iso(t + 14) }))),
    { ...base, id: 'q4', court: 4, started_at: iso(0), ended_at: null },
    { ...base, id: 'q5', court: 5, started_at: iso(60), ended_at: null },
  ]
  assert.equal(quadrasEmUso(ms, QUADRAS(5), t0 + 95 * MIN, 30), 4)
})

test('D43: quadra a mais conta quando a 1a partida comeca nela; quadra tirada sai na hora', () => {
  const { matches, agora } = aoVivo(DE_S2, 22)
  const seis: PlaySession = { ...S2, courts: 6 }
  assert.equal(quadrasEmUso(matches, QUADRAS(6), agora, 30), 4)
  assert.equal(Math.round(resumoAoVivo(seis, matches, agora).minutos), 90)
  // uma pendente entra na quadra 6
  const i = matches.findIndex((m) => !isPlayed(m) && !m.started_at)
  const naSeis = matches.map((m, k) => (k === i ? { ...m, court: 6, started_at: new Date(agora - MIN).toISOString() } : m))
  assert.equal(quadrasEmUso(naSeis, QUADRAS(6), agora, 30), 5)
  assert.equal(Math.round(resumoAoVivo(seis, naSeis, agora).minutos), 75)
  // tirar quadras: 3 no app vale na hora, as partidas da 4 ficam de fora
  const tres: PlaySession = { ...S2, courts: 3 }
  assert.equal(quadrasEmUso(matches, QUADRAS(3), agora, 30), 3)
  assert.equal(resumoAoVivo(tres, matches, agora).minutos, resumoAoVivo(tres, matches).minutos)
})

test('D43: horas trocadas e relogio adiantado nao quebram a conta', () => {
  const { matches, agora } = aoVivo(DE_S2, 22)
  // fim antes do inicio (celulares com relogios diferentes)
  const trocadas = matches.map((m) => (isPlayed(m) ? { ...m, started_at: m.ended_at, ended_at: m.started_at } : m))
  assert.equal(quadrasEmUso(trocadas, QUADRAS(5), agora, 30), 4)
  // o outro celular 20 min adiantado: o que ele gravou esta "no futuro"
  const mais20 = (iso?: string | null) => iso && new Date(Date.parse(iso) + 20 * MIN).toISOString()
  const adiantadas = matches.map((m) => ({ ...m, started_at: mais20(m.started_at), ended_at: mais20(m.ended_at) }))
  assert.equal(quadrasEmUso(adiantadas, QUADRAS(5), agora, 30), 4)
  // so o fim (partida lancada por um app antigo, sem o inicio) tambem conta
  const soFim = matches.map((m) => (isPlayed(m) && m.court === 4 ? { ...m, started_at: null } : m))
  assert.equal(quadrasEmUso(soFim, QUADRAS(5), agora, 30), 4)
})

test('D43: campeonato -- a categoria com uma quadra parada demora mais, as outras nao mudam', () => {
  const s0 = SESSOES.find((x) => x.id === 's1')!
  const s: PlaySession = { ...s0, status: 'open', duos: null }
  const fase1 = PARTIDAS.filter((m) => m.session_id === 's1' && (m.fase ?? 1) === 1)
  const { matches, agora } = aoVivo(fase1, 10)
  // a categoria A (quadras 1 e 2) so usou a quadra 1
  const regras0 = regrasDoPlay(s, matches)
  const soUma = matches.map((m) => (regras0.catDe(m) === 0 && m.court === 2 ? { ...m, court: 1 } : m))
  const conta = (ms: Match[], t?: number) => {
    const regras = regrasDoPlay(s, ms)
    const chaves = chavesDoPlay(s, ms, regras)
    const emQuadra = new Map<number, Match>()
    for (const m of ms.filter((x) => !isPlayed(x) && x.started_at)) if (!emQuadra.has(m.court)) emQuadra.set(m.court, m)
    return restanteDaNoite(s, ms, regras, chaves, quadrasDaCategoriaAgora(s, chaves, emQuadra, regras.catDe), t)!.categorias.map((c) => c.minutos)
  }
  const hoje = conta(soUma)
  const novo = conta(soUma, agora)
  assert.ok(novo[0] > hoje[0], `A: ${hoje[0]} -> ${novo[0]}`)
  assert.deepEqual(novo.slice(1), hoje.slice(1))
  // com as duas quadras em uso nada muda
  assert.deepEqual(conta(matches, agora), conta(matches))
})
