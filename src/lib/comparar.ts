import { playedMatches } from './stats'
import type { AppData, Match } from './types'

/*
 * O COMPARADOR (Desempenho, 08/11/2026): duas atletas ou duas duplas frente a frente. So regra pura aqui; a tela fica
 * em `components/Comparador*.tsx`. "Quando se enfrentaram" = uma contra a outra, cada uma numa dupla; "quando jogaram
 * juntas" = parceiras na mesma dupla (isso ja sai de `partnerStats`/`forcaDeDuplas`).
 */

export type Time = [string, string]
/** Uma partida entre os dois lados: `timeA` e sempre o time do 1o comparado. */
export type Confronto = { id: string; sessionId: string; date: string; timeA: Time; timeB: Time; gamesA: number; gamesB: number; venceuA: boolean }
export type PlacarDosConfrontos = { vitoriasA: number; vitoriasB: number; gamesA: number; gamesB: number }

/** Todas as partidas jogadas, do calendario mais antigo ao mais novo (data, criacao do play, ordem na fila). */
function cronologicas(data: AppData): { m: Match; date: string }[] {
  const sessao = new Map(data.sessions.map((s) => [s.id, s]))
  return playedMatches(data)
    .map((m) => ({ m, date: sessao.get(m.session_id)?.date ?? '', criado: sessao.get(m.session_id)?.created_at ?? '' }))
    .sort((x, y) => x.date.localeCompare(y.date) || x.criado.localeCompare(y.criado) || x.m.round - y.m.round)
    .map(({ m, date }) => ({ m, date }))
}

const mesmaDupla = (t: readonly string[], a: string, b: string) => t.includes(a) && t.includes(b)

function comoConfronto(m: Match, date: string, timeA: Time, timeB: Time, golsA: number, golsB: number): Confronto {
  return { id: m.id, sessionId: m.session_id, date, timeA, timeB, gamesA: golsA, gamesB: golsB, venceuA: golsA > golsB }
}

/** As partidas em que a atleta `a` jogou CONTRA a `b` (do mais antigo ao mais novo). */
export function confrontosDeAtletas(data: AppData, a: string, b: string): Confronto[] {
  const out: Confronto[] = []
  for (const { m, date } of cronologicas(data)) {
    const sa = m.score_a as number
    const sb = m.score_b as number
    if (m.team_a.includes(a) && m.team_b.includes(b)) out.push(comoConfronto(m, date, m.team_a, m.team_b, sa, sb))
    else if (m.team_b.includes(a) && m.team_a.includes(b)) out.push(comoConfronto(m, date, m.team_b, m.team_a, sb, sa))
  }
  return out
}

/** As partidas entre a dupla `p` e a dupla `q` (qualquer lado da quadra). */
export function confrontosDeDuplas(data: AppData, p: Time, q: Time): Confronto[] {
  const out: Confronto[] = []
  for (const { m, date } of cronologicas(data)) {
    const sa = m.score_a as number
    const sb = m.score_b as number
    if (mesmaDupla(m.team_a, p[0], p[1]) && mesmaDupla(m.team_b, q[0], q[1])) out.push(comoConfronto(m, date, m.team_a, m.team_b, sa, sb))
    else if (mesmaDupla(m.team_b, p[0], p[1]) && mesmaDupla(m.team_a, q[0], q[1])) out.push(comoConfronto(m, date, m.team_b, m.team_a, sb, sa))
  }
  return out
}

export function placarDosConfrontos(lista: Confronto[]): PlacarDosConfrontos {
  return lista.reduce(
    (t, c) => ({
      vitoriasA: t.vitoriasA + (c.venceuA ? 1 : 0),
      vitoriasB: t.vitoriasB + (c.venceuA ? 0 : 1),
      gamesA: t.gamesA + c.gamesA,
      gamesB: t.gamesB + c.gamesB,
    }),
    { vitoriasA: 0, vitoriasB: 0, gamesA: 0, gamesB: 0 },
  )
}

/**
 * Resultado das ultimas `n` partidas de um lado (da mais antiga para a mais nova): `true` = venceu.
 * `lado` diz de que time o lado esta na partida, ou nulo se nao jogou.
 */
export function ultimosResultados(data: AppData, lado: (m: Match) => 'a' | 'b' | null, n = 5): boolean[] {
  const todos: boolean[] = []
  for (const { m } of cronologicas(data)) {
    const l = lado(m)
    if (!l) continue
    const sa = m.score_a as number
    const sb = m.score_b as number
    todos.push(l === 'a' ? sa > sb : sb > sa)
  }
  return todos.slice(-n)
}

export const ladoDaAtleta = (id: string) => (m: Match): 'a' | 'b' | null => (m.team_a.includes(id) ? 'a' : m.team_b.includes(id) ? 'b' : null)
export const ladoDaDupla = (p: Time) => (m: Match): 'a' | 'b' | null =>
  mesmaDupla(m.team_a, p[0], p[1]) ? 'a' : mesmaDupla(m.team_b, p[0], p[1]) ? 'b' : null

/** Quantas vitorias seguidas terminam na ultima partida (0 se a ultima foi derrota). */
export function sequenciaFinal(r: boolean[]): number {
  let n = 0
  for (let i = r.length - 1; i >= 0 && r[i]; i--) n++
  return n
}

/** "4V 1D nas últimas 5 · 2 vitórias seguidas": sai das mesmas bolinhas que a tela mostra, sem contradizer. */
export function textoDaForma(r: boolean[]): string {
  if (r.length === 0) return 'ainda sem partidas'
  const v = r.filter(Boolean).length
  const seq = sequenciaFinal(r)
  const fim = seq === 0 ? 'perdeu a última' : seq === 1 ? '1 vitória seguida' : `${seq} vitórias seguidas`
  return `${v}V ${r.length - v}D nas últimas ${r.length} · ${fim}`
}

/** Chance de vitoria de A pela formula do Elo, em % (1 a 99). E estimativa, nao promessa. */
export function chanceDeVitoria(notaA: number, notaB: number): number {
  const p = 1 / (1 + 10 ** ((notaB - notaA) / 400))
  return Math.max(1, Math.min(99, Math.round(p * 100)))
}

export type PontoComparado = { date: string; a: number | null; b: number | null }

/**
 * Junta duas series de forca (cada uma com a nota depois de cada play) numa linha do tempo so: em cada data vale a
 * ultima nota de cada lado (a nota nao some entre um play e outro); antes do 1o ponto de um lado fica nulo.
 */
export function juntarSeries(a: { date: string; nota: number }[], b: { date: string; nota: number }[]): PontoComparado[] {
  const datas = [...new Set([...a, ...b].map((p) => p.date))].sort()
  const ate = (s: { date: string; nota: number }[], d: string): number | null => {
    let v: number | null = null
    for (const p of s) if (p.date <= d) v = p.nota
    return v
  }
  return datas.map((date) => ({ date, a: ate(a, date), b: ate(b, date) }))
}
