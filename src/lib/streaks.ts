import {
  compararPeloCriterio,
  type CriterioDoDia,
  balance,
  computeStats,
  playedMatches,
  rankPlayers,
  type PlayerStat,
} from './stats'
import { podioDoMataMata } from './campeonato'
import type { AppData, StreakChoice } from './types'
import { monthOf, todayISO } from './types'

/**
 * STATUS DE SEQUENCIA ("em chamas")
 *
 * Como as duplas sao equilibradas, a campea do dia e quase sorteio: medindo em
 * 400 plays simulados, emendar duas vitorias acontece em 11% das vezes e
 * ninguem chega perto de 4. Por isso o que mantem o status nao e vencer o dia,
 * e sim terminar no PODIO (o do play, o do grupo dela ou o do mata-mata).
 *
 * REGRA NOVA (plays desde `STATUS_NOVO_DESDE`): o status NAO vale pontos. Ele
 * segue de play em play, atravessando o mes, e zera quando ela sai do podio ou
 * falta -- sem vida. No 5o podio seguido ela vira DUQUESA: entra no Hall, ganha
 * os premios (camisa dourada + presente) e o status recomeca do zero, mas o nome
 * fica dourado com a coroa para sempre. Os pontos de status "roubavam" o podio
 * do mes de quem tinha jogado mais, e isso desanimava.
 *
 * REGRA ANTIGA (ate 05/10/2026, so para o passado nao mudar): no fechamento do
 * mes ela escolhia USAR (pontos naquele mes, status zera) ou PRESERVAR (segue e
 * ganha 1 VIDA, que segurava um play fora do podio). Setembro foi assim.
 */

export type StreakLevel = { emoji: string; title: string }

/** O 1o play da regra nova: o status deixa de valer pontos e de ter vida. */
export const STATUS_NOVO_DESDE = '2026-10-06'

export const STREAK_LADDER = [
  { from: 2, emoji: '🔥', title: 'Em chamas' },
  { from: 3, emoji: '⚡', title: 'Imparável' },
  { from: 4, emoji: '💎', title: 'Rainha do Play' },
  { from: 5, emoji: '👑', title: 'Duquesa da V3' },
] as const

/** A escada de ate 05/10/2026, com os pontos -- so para os status usados naquela epoca. */
const ESCADA_ANTIGA = [
  { from: 2, emoji: '🔥', title: 'Em chamas', value: 3 },
  { from: 3, emoji: '🔥🔥', title: 'Pegando fogo', value: 6 },
  { from: 4, emoji: '🔥🔥🔥', title: 'Imparável', value: 10 },
  { from: 5, emoji: '👑🔥', title: 'Lenda do Play', value: 16 },
  { from: 6, emoji: '👑💎', title: 'Rainha do Play', value: 24 },
  { from: 7, emoji: '👑🌟', title: 'Imperatriz do Play', value: 34 },
  { from: 8, emoji: '👑💎🌟', title: 'Duquesa da V3', value: 50 },
] as const

const faixaAntiga = (streak: number) => [...ESCADA_ANTIGA].reverse().find((x) => streak >= x.from)

/** Quanto o status valia na regra antiga (no fechamento de mes). */
function valorAntigo(streak: number): number {
  return faixaAntiga(streak)?.value ?? 0
}

export function streakLevel(streak: number): StreakLevel | null {
  if (streak <= 1) return null
  const faixa = [...STREAK_LADDER].reverse().find((x) => streak >= x.from)
  return faixa ? { emoji: faixa.emoji, title: faixa.title } : null
}

/** Quantas jogadoras sobem ao podio -- de cada grupo, quando ha grupos. */
export const PODIO = 3

/**
 * Quantas sobem ao podio de um grupo desse tamanho.
 *
 * Nunca mais da METADE do grupo: num grupo de 4, tres subirem seria dar status
 * a quase todo mundo e o 🔥 perderia a graca. Fora isso a conta e simples --
 * a chance de podio e `vagas / tamanho do grupo`, entao o tamanho do grupo e o
 * que decide se o 🔥 e disputado (grupos de 8+) ou barato (grupos pequenos).
 */
export function vagasDoPodio(tamanhoDoGrupo: number): number {
  return Math.max(1, Math.min(PODIO, Math.floor(tamanhoDoGrupo / 2)))
}

/** Um podio: o do dia inteiro, ou o de um grupo. */
export type PodioDoDia = {
  /** Numero do grupo (1, 2, 3...) ou null quando o play e todas com todas. */
  grupo: number | null
  /** As primeiras do grupo, com empate exato na ultima vaga subindo junto. */
  rows: PlayerStat[]
  /** Todas as jogadoras do grupo, para saber de onde vem quem ficou de fora. */
  membros: string[]
}

/**
 * Os podios de um dia de play.
 *
 * No modo em grupos e UM PODIO POR GRUPO -- cada grupo e um rodizio fechado, e
 * dominar o grupo 2 tem o mesmo merito que dominar o grupo 1 (ja medido: as
 * duas coisas rendem a mesma media de pontos). Um podio unico obrigaria os
 * grupos a competirem entre si numa conta que nao se comunica.
 */
export function podiosDoDia(
  rank: PlayerStat[],
  grupos?: string[][] | null,
  criterio: CriterioDoDia = 'pontos',
): PodioDoDia[] {
  const primeiras = (lista: PlayerStat[], vagas: number): PlayerStat[] => {
    if (lista.length === 0) return []
    const corte = lista[Math.min(vagas, lista.length) - 1]
    // empate exato na ultima vaga sobe junto -- pelo mesmo criterio que ordenou
    return lista.filter((x) => compararPeloCriterio(x, corte, criterio) <= 0)
  }

  if (!grupos || grupos.length <= 1) {
    return [{ grupo: null, rows: primeiras(rank, PODIO), membros: rank.map((x) => x.player_id) }]
  }

  return grupos.map((g, i) => {
    const doGrupo = new Set(g)
    // `rank` ja vem ordenado, entao filtrar preserva a classificacao
    const doRank = rank.filter((x) => doGrupo.has(x.player_id))
    return { grupo: i + 1, rows: primeiras(doRank, vagasDoPodio(g.length)), membros: g }
  })
}

/** Duquesa: 5 podios seguidos. */
export const MAX_STREAK = 5

/** Pontos creditados num mes porque a jogadora decidiu usar o status (so regra antiga). */
export type StreakAward = {
  month: string
  player_id: string
  streak: number
  bonus: number
  /** O status com o nome e o simbolo da epoca (a escada mudou depois). */
  emoji: string
  title: string
}

/** Uma vez em que ela chegou a Duquesa (entra no Hall). */
export type Duquesa = { player_id: string; date: string; session_id: string }

/** O que ela ja conquistou: quantas vezes chegou em cada nivel e o maior. */
export type Conquistas = {
  /** O maior nivel ja alcancado (2 a 5; 0 = nunca teve status). */
  melhor: number
  /** Nivel (2 a 5) -> quantas vezes ela chegou nele. */
  vezes: Record<number, number>
  /** As datas em que virou Duquesa. */
  duquesas: string[]
}

/** O que aconteceu com a sequencia de alguem num play. */
export type StreakStep = {
  session_id: string
  date: string
  player_id: string
  streak: number
  /** true quando a vida foi gasta para segurar o status neste play. */
  usouVida: boolean
  value: number
}

/** Decisao de fechamento de mes: preservar (padrao) ou usar. */
export type MonthDecision = {
  month: string
  player_id: string
  streak: number
  /** Quanto vale usar o status agora. */
  value: number
  action: 'usar' | 'preservar'
  respondido: boolean
}

export type Streaks = {
  awards: StreakAward[]
  steps: StreakStep[]
  current: Map<string, number>
  /** Vidas disponiveis de cada jogadora (0 ou 1). */
  lives: Map<string, number>
  best: Map<string, number>
  winnersOf: Map<string, string[]>
  /** Quem subiu ao podio de cada play. */
  podiumOf: Map<string, string[]>
  decisions: MonthDecision[]
  closedMonths: string[]
  /** O Hall das Duquesas, na ordem em que aconteceu. */
  duquesas: Duquesa[]
  conquistas: Map<string, Conquistas>
}

/** O mes ja foi fechado (na mao, ou porque o calendario passou dele)? */
export function mesFechado(data: AppData, mes: string): boolean {
  if (data.closures.some((c) => c.month === mes)) return true
  return mes < monthOf(todayISO())
}

/** A escolha guardada no banco usa os nomes antigos; aqui viram usar/preservar. */
function acaoDe(c: StreakChoice | undefined): 'usar' | 'preservar' | null {
  if (!c) return null
  return c.action === 'sacar' ? 'usar' : 'preservar'
}

export function computeStreaks(data: AppData): Streaks {
  const escolhas = new Map(data.choices.map((c) => [`${c.player_id}:${c.month}`, c]))
  const finished = data.sessions
    // play avulso nao mexe em sequencia: o status e sobre o campeonato
    .filter((s) => s.status === 'finished' && s.ranked !== false)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))

  const current = new Map<string, number>()
  const lives = new Map<string, number>()
  const best = new Map<string, number>()
  const awards: StreakAward[] = []
  const steps: StreakStep[] = []
  const decisions: MonthDecision[] = []
  const closedMonths: string[] = []
  const winnersOf = new Map<string, string[]>()
  const podiumOf = new Map<string, string[]>()
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? id

  const duquesas: Duquesa[] = []

  const fecharMes = (mes: string) => {
    closedMonths.push(mes)
    // da regra nova em diante o mes fecha sem pergunta: o status so segue
    if (mes >= monthOf(STATUS_NOVO_DESDE)) return
    for (const p of data.players) {
      const seq = current.get(p.id) ?? 0
      if (seq < 2) continue // sem status, nao ha o que decidir
      const escolha = escolhas.get(`${p.id}:${mes}`)
      // preservar e o padrao: usar o status e irreversivel, entao so acontece
      // quando alguem escolhe de proposito
      const action = acaoDe(escolha) ?? 'preservar'
      decisions.push({
        month: mes,
        player_id: p.id,
        streak: seq,
        value: valorAntigo(seq),
        action,
        respondido: Boolean(escolha),
      })
      if (action === 'usar') {
        const f = faixaAntiga(seq)
        awards.push({
          month: mes, player_id: p.id, streak: seq, bonus: valorAntigo(seq),
          emoji: f?.emoji ?? '🔥', title: f?.title ?? 'Em chamas',
        })
        current.set(p.id, 0)
        lives.set(p.id, 0)
      } else {
        lives.set(p.id, 1) // preservou: ganha uma vida (nao acumula)
      }
    }
  }

  let mesCorrente: string | null = null

  for (const s of finished) {
    const mes = monthOf(s.date)
    if (mesCorrente && mes !== mesCorrente) fecharMes(mesCorrente)
    mesCorrente = mes

    const todas = playedMatches(data, { sessionId: s.id })
    // no grupos+duplas a fase de grupos so serviu para formar as duplas:
    // ela nao pontua, entao nao pode decidir quem sobe ao podio
    const soFase2 = s.format === 'grupos-duplas'
    const ms = soFase2 ? todas.filter((m) => (m.fase ?? 1) >= 2) : todas
    if (ms.length === 0) continue
    // o criterio do dia fica gravado no play: um podio ja anunciado nao muda
    const criterio: CriterioDoDia = s.criterio_dia ?? 'pontos'
    const rank = rankPlayers(computeStats(ms), nameOf, criterio)
    if (rank.length === 0) continue

    // no grupos+duplas quem decide o dia e a DUPLA, e a chave ja disse tudo --
    // no campeonato, a chave de CADA categoria (cada uma tem o seu podio)
    const mataMata = soFase2 ? podioDoMataMata(s, ms, nameOf) : null

    /*
     * CAMPEAS DO DIA (para os titulos e a arte do mes).
     *
     * No grupos+duplas o titulo foi decidido na quadra, na final -- nao no
     * somatorio de pontos. Com bye a vice chega a somar MAIS pontos que a
     * campea, porque jogou uma partida a mais, e o "dia vencido" iria para
     * quem perdeu a final. Nos outros formatos nao ha final: o dia e do
     * somatorio mesmo, e o empate exato divide o titulo.
     */
    if (mataMata) {
      winnersOf.set(s.id, mataMata.campeas)
    } else {
      const top = rank[0]
      winnersOf.set(
        s.id,
        rank
          .filter(
            (x) => x.points === top.points && balance(x) === balance(top) && x.wins === top.wins,
          )
          .map((c) => c.player_id),
      )
    }

    /*
     * Podio do dia.
     *
     * No grupos+duplas os grupos ja se misturaram no mata-mata -- entao nao
     * ha podio por grupo: sobem as tres duplas medalhistas, com os dois de
     * cada uma. Sao 6 de 16 num play tipico (37%), menos generoso que o modo
     * em grupos, onde 4 grupos de 4 ja levam 8 ao podio.
     */
    const noPodio = mataMata
      ? new Set(mataMata.podio)
      : new Set(podiosDoDia(rank, s.groups, criterio).flatMap((p) => p.rows.map((x) => x.player_id)))
    podiumOf.set(s.id, [...noPodio])

    const jogaram = new Set<string>()
    for (const m of ms) for (const id of [...m.team_a, ...m.team_b]) jogaram.add(id)

    const regraNova = s.date >= STATUS_NOVO_DESDE
    // a vida era da regra antiga: quem tinha uma nao leva para a nova
    if (regraNova) lives.clear()

    for (const p of data.players) {
      const seq = current.get(p.id) ?? 0
      if (noPodio.has(p.id)) {
        const nova = seq + 1
        current.set(p.id, nova)
        if (nova > (best.get(p.id) ?? 0)) best.set(p.id, nova)
        steps.push({
          session_id: s.id, date: s.date, player_id: p.id,
          streak: nova, usouVida: false, value: regraNova ? 0 : valorAntigo(nova),
        })
        if (regraNova && nova >= MAX_STREAK) {
          // virou Duquesa: entra no Hall e recomeca do zero
          duquesas.push({ player_id: p.id, date: s.date, session_id: s.id })
          current.set(p.id, 0)
        }
      } else if (!regraNova && seq >= 2 && jogaram.has(p.id) && (lives.get(p.id) ?? 0) > 0) {
        // veio, ficou fora do podio, mas tinha vida: o status sobrevive
        lives.set(p.id, 0)
        steps.push({
          session_id: s.id, date: s.date, player_id: p.id,
          streak: seq, usouVida: true, value: valorAntigo(seq),
        })
      } else {
        // faltou, ou ficou fora do podio sem vida: perde tudo
        current.set(p.id, 0)
        lives.set(p.id, 0)
      }
    }
  }

  // O ultimo mes fecha quando a organizadora aperta "finalizar o mes" ou,
  // como rede de seguranca, quando o calendario ja passou dele.
  const fechadoNaMao = new Set(data.closures.map((c) => c.month))
  if (mesCorrente && (fechadoNaMao.has(mesCorrente) || mesCorrente < monthOf(todayISO()))) {
    fecharMes(mesCorrente)
  }

  // conquistas: cada vez que a sequencia CHEGA num nivel conta uma
  const conquistas = new Map<string, Conquistas>()
  for (const st of steps) {
    if (st.usouVida || st.streak < 2 || st.streak > MAX_STREAK) continue
    const c = conquistas.get(st.player_id) ?? { melhor: 0, vezes: {}, duquesas: [] }
    c.vezes[st.streak] = (c.vezes[st.streak] ?? 0) + 1
    c.melhor = Math.max(c.melhor, st.streak)
    conquistas.set(st.player_id, c)
  }
  for (const d of duquesas) conquistas.get(d.player_id)?.duquesas.push(d.date)

  return {
    awards, steps, current, lives, best, winnersOf, podiumOf, decisions, closedMonths,
    duquesas, conquistas,
  }
}

/** Soma no ranking os status usados no periodo. */
export function applyBonuses(
  stats: Map<string, PlayerStat>,
  awards: StreakAward[],
): Map<string, PlayerStat> {
  const out = new Map<string, PlayerStat>()
  for (const [id, s] of stats) out.set(id, { ...s })
  for (const a of awards) {
    const s = out.get(a.player_id)
    if (!s) continue
    s.points += a.bonus
    s.bonus += a.bonus
  }
  return out
}

/** Jogadoras com status vivo, da maior sequencia para a menor. */
export function onFire(streaks: Streaks): { player_id: string; streak: number }[] {
  return [...streaks.current.entries()]
    .filter(([, n]) => n >= 2)
    .map(([player_id, streak]) => ({ player_id, streak }))
    .sort((a, b) => b.streak - a.streak)
}

/** Quem ja foi Duquesa alguma vez (nome dourado com a coroa para sempre). */
export function jaForamDuquesa(streaks: Streaks): Set<string> {
  return new Set(streaks.duquesas.map((d) => d.player_id))
}
