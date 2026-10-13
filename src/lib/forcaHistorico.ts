import { isPlayed } from './scoring'
import type { AppData } from './types'

/**
 * A FORCA PELO HISTORICO INTEIRO (em teste -- ver scripts/medir-forca).
 *
 * O Elo olha cada partida uma vez, com as notas daquele dia: a vitoria sobre
 * uma novata que ainda estava em 1500 vale pouco para sempre, mesmo que depois
 * se descubra que ela era forte. Aqui as notas de todas saem de um ajuste unico
 * sobre todas as partidas: cada game e uma "moeda" com a chance do Elo pela
 * diferenca das duplas (a media das duas), e as notas sao as que melhor
 * explicam todos os placares juntos. Um puxao para o ponto de partida (`sigma`)
 * evita que quem jogou pouco va para os extremos; `meiaVidaSemanas` faz o
 * resultado antigo pesar menos (quem melhorou nao fica presa ao passado).
 */
export type OpcoesDoHistorico = {
  /** Quanto a nota pode se afastar do ponto de partida (desvio, em pontos). */
  sigma: number
  /** Em quantas semanas um resultado passa a valer a metade (null = tudo igual). */
  meiaVidaSemanas: number | null
}

const K = Math.LN10 / 400

export function forcaPeloHistorico(data: AppData, op: OpcoesDoHistorico, upToDate?: string): (id: string) => number {
  const dia = new Map(data.sessions.filter((s) => !upToDate || s.date <= upToDate).map((s) => [s.id, s.date]))
  const jogos = data.matches.filter((m) => isPlayed(m) && dia.has(m.session_id) && (m.score_a as number) + (m.score_b as number) > 0)
  const inicio = new Map(data.players.map((p) => [p.id, p.forca_inicial ?? 1500]))
  const r = new Map<string, number>()
  const nota = (id: string) => r.get(id) ?? inicio.get(id) ?? 1500
  if (jogos.length === 0) return nota

  const ultima = [...dia.values()].sort().pop() as string
  const semanas = (d: string) => (Date.parse(ultima) - Date.parse(d)) / (7 * 86400000)
  const peso = jogos.map((m) => {
    const n = (m.score_a as number) + (m.score_b as number)
    const idade = semanas(dia.get(m.session_id) as string)
    return n * (op.meiaVidaSemanas ? Math.pow(0.5, idade / op.meiaVidaSemanas) : 1)
  })
  const ids = new Set(jogos.flatMap((m) => [...m.team_a, ...m.team_b]))
  for (const id of ids) r.set(id, inicio.get(id) ?? 1500)
  const prior = 1 / (op.sigma * op.sigma)

  // Newton na diagonal: converge em poucas dezenas de passadas
  for (let it = 0; it < 60; it++) {
    const grad = new Map<string, number>()
    const hess = new Map<string, number>()
    jogos.forEach((m, i) => {
      const ra = (nota(m.team_a[0]) + nota(m.team_a[1])) / 2
      const rb = (nota(m.team_b[0]) + nota(m.team_b[1])) / 2
      const e = 1 / (1 + Math.exp(-K * (ra - rb)))
      const s = (m.score_a as number) / ((m.score_a as number) + (m.score_b as number))
      const g = peso[i] * (s - e) * K * 0.5
      const h = peso[i] * e * (1 - e) * K * K * 0.25
      for (const id of m.team_a) {
        grad.set(id, (grad.get(id) ?? 0) + g)
        hess.set(id, (hess.get(id) ?? 0) + h)
      }
      for (const id of m.team_b) {
        grad.set(id, (grad.get(id) ?? 0) - g)
        hess.set(id, (hess.get(id) ?? 0) + h)
      }
    })
    let maior = 0
    for (const id of ids) {
      const g = (grad.get(id) ?? 0) - (nota(id) - (inicio.get(id) ?? 1500)) * prior
      const h = (hess.get(id) ?? 0) + prior
      const passo = g / h
      r.set(id, nota(id) + passo)
      maior = Math.max(maior, Math.abs(passo))
    }
    if (maior < 0.05) break
  }
  return nota
}

/**
 * A FORCA DE CADA EPOCA (o "historico inteiro" do jeito certo).
 *
 * Com uma nota so por pessoa, se a Pretti melhorou DEPOIS de perder para a
 * Beatriz, a conta tratava como se ela ja fosse forte naquele dia -- e a
 * Beatriz ganhava um credito que nao merecia. Aqui cada menina tem uma nota
 * POR PLAY em que jogou, e a nota so pode andar devagar de um play para o
 * outro (`deriva` pontos por raiz de semana, como um passeio). Entao:
 *  - se a Pretti ja era forte na epoca, os outros resultados dela naquela epoca
 *    mostram, e a vitoria da Beatriz vale mais;
 *  - se ela melhorou depois, a nota dela daquela epoca fica onde estava.
 * A nota de hoje e a do ultimo play de cada uma.
 */
export type OpcoesDaEpoca = {
  /** Quanto a nota pode se afastar do ponto de partida no 1o play. */
  sigma: number
  /** Quanto a nota pode andar por semana (desvio por raiz de semana). */
  deriva: number
}

export function forcaPorEpoca(data: AppData, op: OpcoesDaEpoca, upToDate?: string): (id: string) => number {
  const dia = new Map(data.sessions.filter((s) => !upToDate || s.date <= upToDate).map((s) => [s.id, s.date]))
  const jogos = data.matches.filter((m) => isPlayed(m) && dia.has(m.session_id) && (m.score_a as number) + (m.score_b as number) > 0)
  const inicio = new Map(data.players.map((p) => [p.id, p.forca_inicial ?? 1500]))
  const final = new Map<string, number>()
  const nota = (id: string) => final.get(id) ?? inicio.get(id) ?? 1500
  if (jogos.length === 0) return nota

  // as epocas de cada menina: os plays em que jogou, em ordem
  const epocas = new Map<string, string[]>()
  for (const m of jogos)
    for (const id of [...m.team_a, ...m.team_b]) {
      const l = epocas.get(id) ?? []
      if (!l.includes(m.session_id)) l.push(m.session_id)
      epocas.set(id, l)
    }
  for (const l of epocas.values()) l.sort((a, b) => (dia.get(a) as string).localeCompare(dia.get(b) as string))
  const chave = (id: string, sid: string) => `${id}@${sid}`
  const r = new Map<string, number>()
  for (const [id, l] of epocas) for (const sid of l) r.set(chave(id, sid), inicio.get(id) ?? 1500)
  const em = (id: string, sid: string) => r.get(chave(id, sid)) as number
  const semanas = (a: string, b: string) => Math.max(0.5, (Date.parse(dia.get(b) as string) - Date.parse(dia.get(a) as string)) / (7 * 86400000))
  const priorInicio = 1 / (op.sigma * op.sigma)
  const priorPasso = (dt: number) => 1 / (op.deriva * op.deriva * dt)

  // as partidas de cada play, para achar rapido as da menina naquela epoca
  const doPlay = new Map<string, typeof jogos>()
  for (const m of jogos) doPlay.set(m.session_id, [...(doPlay.get(m.session_id) ?? []), m])

  // uma menina por vez, a linha do tempo inteira dela de uma vez (Newton com a
  // matriz tridiagonal do passeio), com as outras paradas; repete ate assentar
  for (let it = 0; it < 80; it++) {
    let maior = 0
    for (const [id, l] of epocas) {
      const n = l.length
      const g = new Array<number>(n).fill(0)
      const h = new Array<number>(n).fill(0)
      l.forEach((sid, j) => {
        for (const m of doPlay.get(sid) ?? []) {
          const lado = m.team_a.includes(id) ? 1 : m.team_b.includes(id) ? -1 : 0
          if (lado === 0) continue
          const ra = (em(m.team_a[0], sid) + em(m.team_a[1], sid)) / 2
          const rb = (em(m.team_b[0], sid) + em(m.team_b[1], sid)) / 2
          const e = 1 / (1 + Math.exp(-K * (ra - rb)))
          const jogosNaPartida = (m.score_a as number) + (m.score_b as number)
          g[j] += lado * ((m.score_a as number) - jogosNaPartida * e) * K * 0.5
          h[j] += jogosNaPartida * e * (1 - e) * K * K * 0.25
        }
      })
      const r0 = l.map((sid) => em(id, sid))
      const w = l.slice(1).map((sid, j) => priorPasso(semanas(l[j], sid)))
      // gradiente e diagonal com o ponto de partida e o passeio
      g[0] -= (r0[0] - (inicio.get(id) ?? 1500)) * priorInicio
      h[0] += priorInicio
      for (let j = 0; j < n - 1; j++) {
        const dif = r0[j + 1] - r0[j]
        g[j] += dif * w[j]
        g[j + 1] -= dif * w[j]
        h[j] += w[j]
        h[j + 1] += w[j]
      }
      // resolve (diag h, fora da diagonal -w) . passo = g  (algoritmo de Thomas)
      const c = new Array<number>(n).fill(0)
      const dd = new Array<number>(n).fill(0)
      for (let j = 0; j < n; j++) {
        const sub = j > 0 ? -w[j - 1] : 0
        const den = h[j] - (j > 0 ? sub * c[j - 1] : 0)
        c[j] = j < n - 1 ? -w[j] / den : 0
        dd[j] = (g[j] - (j > 0 ? sub * dd[j - 1] : 0)) / den
      }
      const passo = new Array<number>(n).fill(0)
      for (let j = n - 1; j >= 0; j--) passo[j] = dd[j] - (j < n - 1 ? c[j] * passo[j + 1] : 0)
      l.forEach((sid, j) => {
        r.set(chave(id, sid), r0[j] + passo[j])
        maior = Math.max(maior, Math.abs(passo[j]))
      })
    }
    if (maior < 0.02) break
  }
  for (const [id, l] of epocas) final.set(id, em(id, l[l.length - 1]))
  return nota
}
