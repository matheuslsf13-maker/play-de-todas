/*
 * O CARTAO DO MOMENTO, na tela inicial (D42): um cartao so, que muda com a
 * semana. A regra de qual momento vale e pura e testada
 * (tests/momentoDaInicio.test.ts); a tela so desenha.
 *
 *   a) AO VIVO          play aberto com partida iniciada/lancada, de hoje ou com
 *                       atividade nas ultimas 3 horas
 *   b) LISTA ABERTA     a de play mais cedo
 *   c) LISTA FECHADA    com o play por vir (ate 6h depois da hora do play)
 *   d) PLAY             play aberto que nao esta ao vivo: o "Proximo play" de
 *                       sempre, ou o "Play em andamento" parado de dias atras
 *   e) PODIO DA NOITE   o ultimo play finalizado, no dia e ate o meio-dia seguinte
 *   f) nada
 *
 * Horas no fuso fixo -03:00, como a lista de presenca.
 */
import { categoriasDoPlay, duosDaCategoria, partidasDaCategoria } from './campeonato'
import { desempatesDoGrupo, ordenarComDesempates, partidasDoConfronto } from './desempateDoDia'
import { dataEmSaoPaulo, estaAberta, type ListaCompleta } from './listaDePresenca'
import { isPlayed } from './scoring'
import { computeStats, rankDuplasDoDia, rankPlayers } from './stats'
import { podiosDoDia } from './streaks'
import type { Match, PlaySession } from './types'

const HORA = 3600 * 1000
/** Play aberto sem nada acontecendo ha mais que isto (e de outro dia) nao e ao vivo. */
export const HORAS_AO_VIVO = 3
/** Lista fechada vale ate esse tempo depois da hora marcada (o play pode atrasar). */
export const HORAS_DEPOIS_DO_PLAY = 6
/** O podio da noite fica ate o meio-dia do dia seguinte. */
export const PODIO_ATE_A_HORA = 12

export type Momento =
  | { tipo: 'ao-vivo'; session: PlaySession }
  | { tipo: 'lista-aberta'; lista: ListaCompleta }
  | { tipo: 'lista-fechada'; lista: ListaCompleta; session: PlaySession | null }
  | { tipo: 'play'; session: PlaySession; parado: boolean }
  | { tipo: 'podio'; session: PlaySession }

function ultimaAtividade(ms: Match[]): number {
  let t = 0
  for (const m of ms) {
    for (const iso of [m.started_at, m.ended_at]) {
      const x = iso ? Date.parse(iso) : NaN
      if (Number.isFinite(x) && x > t) t = x
    }
  }
  return t
}

/** O play esta acontecendo agora (ver regra a). */
export function estaAoVivo(s: PlaySession, matches: Match[], agora: Date): boolean {
  if (s.status !== 'open') return false
  const ms = matches.filter((m) => m.session_id === s.id)
  if (!ms.some((m) => !!m.started_at || isPlayed(m))) return false
  const hoje = dataEmSaoPaulo(agora.toISOString())
  return s.date === hoje || agora.getTime() - ultimaAtividade(ms) < HORAS_AO_VIVO * HORA
}

export function momentoDaInicio(opts: {
  sessions: PlaySession[]
  matches: Match[]
  /** A lista do momento (`repo.listaDoMomento`); null sem lista ou fora do Play de Todas. */
  lista: ListaCompleta | null | undefined
  agora: Date
}): Momento | null {
  const { sessions, matches, agora } = opts
  const hoje = dataEmSaoPaulo(agora.toISOString())
  const recentes = (xs: PlaySession[]) =>
    [...xs].sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const abertos = recentes(sessions.filter((s) => s.status === 'open'))

  // a) ao vivo
  const vivo = abertos.find((s) => estaAoVivo(s, matches, agora))
  if (vivo) return { tipo: 'ao-vivo', session: vivo }

  // b) lista aberta / c) lista fechada com o play por vir
  const lc = opts.lista
  if (lc) {
    if (estaAberta(lc.lista, agora)) return { tipo: 'lista-aberta', lista: lc }
    const ligada = lc.lista.session_id ? (sessions.find((s) => s.id === lc.lista.session_id) ?? null) : null
    const porVir = agora.getTime() < Date.parse(lc.lista.play_em) + HORAS_DEPOIS_DO_PLAY * HORA
    if (porVir && ligada?.status !== 'finished') return { tipo: 'lista-fechada', lista: lc, session: ligada }
  }

  // d) play aberto que nao esta ao vivo (o cartao de sempre)
  const aberto = abertos[0]
  if (aberto) return { tipo: 'play', session: aberto, parado: aberto.date < hoje }

  // e) o podio da noite
  const jogado = new Set(matches.filter(isPlayed).map((m) => m.session_id))
  const ultimo = recentes(sessions.filter((s) => s.status === 'finished' && jogado.has(s.id)))[0]
  if (ultimo) {
    const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 24 * HORA).toISOString().slice(0, 10)
    const horaSP = new Date(agora.getTime() - 3 * HORA).getUTCHours()
    if (ultimo.date === hoje || (ultimo.date === ontem && horaSP < PODIO_ATE_A_HORA)) return { tipo: 'podio', session: ultimo }
  }
  return null
}

/** "1d 4h" / "3h 20min" / "25 min" (para cima: nunca "0 min"). */
export function contagem(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60000))
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`
  return `${m} min`
}

/** "há 1h10" / "há 45 min" / "há 2h" (para baixo: o tempo que ja passou). */
export function decorrido(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h === 0 ? `há ${m} min` : m === 0 ? `há ${h}h` : `há ${h}h${String(m).padStart(2, '0')}`
}

export type PodioDaNoite =
  /** Um podio so: as tres primeiras (empatadas dividem a posicao). */
  | { tipo: 'um'; lugares: { id: string; posicao: number }[] }
  /** Grupos, categorias ou duplas: uma linha por grupo/categoria (ou por medalha). */
  | { tipo: 'varios'; linhas: { rotulo: string; ids: string[] }[] }

/**
 * O podio de um play finalizado, pelas mesmas regras do 🔥 (`podiosDoDia`, com
 * os desempates em quadra e o confronto direto; no grupos+duplas, a chave).
 */
export function podioDaNoite(s: PlaySession, todas: Match[], nameOf: (id: string) => string): PodioDaNoite | null {
  const doPlay = todas.filter((m) => m.session_id === s.id && isPlayed(m))
  if (s.format === 'grupos-duplas') {
    const ms = doPlay.filter((m) => (m.fase ?? 1) >= 2)
    const cats = categoriasDoPlay(s)
    const porCat = cats.map((_, ci) => {
      const duos = duosDaCategoria(s, ci)
      return rankDuplasDoDia(partidasDaCategoria(s, ci, ms), nameOf, undefined, duos.length ? duos : undefined)
    })
    const MEDALHA = { 3: '🥇', 2: '🥈', 1: '🥉' } as const
    const linhas =
      cats.length === 1
        ? porCat[0]
            .filter((d) => d.medalha > 0)
            .sort((a, b) => b.medalha - a.medalha)
            .map((d) => ({ rotulo: MEDALHA[d.medalha as 1 | 2 | 3], ids: [d.a, d.b] }))
        : porCat.flatMap((ds, ci) => {
            const ouro = ds.find((d) => d.medalha === 3)
            return ouro ? [{ rotulo: `🏆 Categoria ${cats[ci].nome}`, ids: [ouro.a, ouro.b] }] : []
          })
    return linhas.length ? { tipo: 'varios', linhas } : null
  }
  if (doPlay.length === 0) return null
  const criterio = s.criterio_dia ?? 'pontos'
  const confronto = partidasDoConfronto(s, doPlay)
  const podios = podiosDoDia(rankPlayers(computeStats(doPlay), nameOf, criterio), s.groups, criterio, s.desempates_grupo, confronto)
  const ordem = (rows: (typeof podios)[number]['rows'], grupo: number) =>
    ordenarComDesempates(rows, desempatesDoGrupo(s.desempates_grupo, grupo), confronto)
  if (podios.length === 1) {
    const { lista, posicao } = ordem(podios[0].rows, 0)
    return { tipo: 'um', lugares: lista.slice(0, 3).map((x) => ({ id: x.player_id, posicao: posicao.get(x.player_id) ?? 1 })) }
  }
  const linhas = podios.flatMap((p) => {
    const { lista, posicao } = ordem(p.rows, (p.grupo ?? 1) - 1)
    const campeas = lista.filter((x) => posicao.get(x.player_id) === 1).map((x) => x.player_id)
    return campeas.length ? [{ rotulo: `🏆 Grupo ${p.grupo}`, ids: campeas }] : []
  })
  return linhas.length ? { tipo: 'varios', linhas } : null
}
