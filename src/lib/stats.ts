import { isPlayed, matchPoints } from './scoring'
import type { AppData, Match, PlaySession } from './types'
import { monthOf } from './types'

export type PlayerStat = {
  player_id: string
  matches: number
  wins: number
  losses: number
  points: number
  gamesWon: number
  gamesLost: number
  days: number
  /** Pontos de bonus por sequencia de vitorias ("em chamas"). */
  bonus: number
  /** Pontos pagos por bye no mata-mata das duplas (ver `pontosDeBye`). */
  bye: number
}

export type PairKeyStat = {
  other_id: string
  matches: number
  wins: number
  losses: number
  points: number
}

export const emptyStat = (player_id: string): PlayerStat => ({
  player_id, matches: 0, wins: 0, losses: 0, points: 0, gamesWon: 0, gamesLost: 0, days: 0, bonus: 0, bye: 0,
})

export function winRate(s: PlayerStat): number {
  return s.matches === 0 ? 0 : s.wins / s.matches
}

export function balance(s: PlayerStat): number {
  return s.gamesWon - s.gamesLost
}

export function avgPoints(s: PlayerStat): number {
  return s.matches === 0 ? 0 : s.points / s.matches
}

/** Partidas ja jogadas (com placar valido), opcionalmente filtradas por mes. */
export function playedMatches(
  data: AppData,
  opts: {
    month?: string
    sessionId?: string
    /** So os plays que valem para o campeonato (deixa de fora os avulsos). */
    ranked?: boolean
  } = {},
): Match[] {
  const byId = new Map(data.sessions.map((s) => [s.id, s]))
  return data.matches.filter((m) => {
    if (!isPlayed(m)) return false
    if (opts.sessionId && m.session_id !== opts.sessionId) return false
    const s = byId.get(m.session_id)
    if (!s) return false
    if (opts.month && monthOf(s.date) !== opts.month) return false
    // plays antigos nao tem o campo: contam como valendo
    if (opts.ranked && s.ranked === false) return false
    return true
  })
}

/**
 * AS PARTIDAS QUE VALEM PONTOS.
 *
 * No `grupos-duplas` a fase de grupos so serve para formar as duplas: ela nao
 * pontua. O ranking do DIA ja sabia disso, mas o do MES somava tudo -- entao o
 * total do mes de uma jogadora nao batia com a soma dos dias dela, e quem caiu
 * cedo no mata-mata aparecia na frente de quem foi longe por causa de pontos
 * de uma fase que, na regra, nao existe.
 *
 * Fica de fora daqui de proposito: o Elo (`ratings`), as parcerias e os
 * confrontos. Aquelas partidas ACONTECERAM -- elas so nao dao ponto.
 */
export function pontuaveis(sessoes: PlaySession[], matches: Match[]): Match[] {
  const semFase1 = new Set(
    sessoes.filter((s) => s.format === 'grupos-duplas').map((s) => s.id),
  )
  if (semFase1.size === 0) return matches
  return matches.filter((m) => !semFase1.has(m.session_id) || (m.fase ?? 1) >= 2)
}

/**
 * Estatisticas COMPLETAS com os pontos CERTOS.
 *
 * Partidas, vitorias, derrotas e games saem de todas as partidas jogadas --
 * elas aconteceram, e sumir com elas tirava da aba de estatisticas quem so
 * jogou a fase de grupos. Os pontos saem so das que pontuam (`pontuaveis`).
 */
export function computeStatsComPontos(sessoes: PlaySession[], matches: Match[]): Map<string, PlayerStat> {
  const tudo = computeStats(matches)
  const soPontos = computeStats(pontuaveis(sessoes, matches))
  for (const [id, s] of tudo) s.points = soPontos.get(id)?.points ?? 0
  return tudo
}

export function computeStats(matches: Match[]): Map<string, PlayerStat> {
  const out = new Map<string, PlayerStat>()
  const daysSeen = new Map<string, Set<string>>()
  const get = (id: string) => {
    let s = out.get(id)
    if (!s) { s = emptyStat(id); out.set(id, s) }
    return s
  }
  for (const m of matches) {
    const a = m.score_a as number
    const b = m.score_b as number
    const [pa, pb] = matchPoints(a, b)
    for (const id of m.team_a) {
      const s = get(id)
      s.matches++; s.points += pa; s.gamesWon += a; s.gamesLost += b
      if (a > b) s.wins++; else s.losses++
      if (!daysSeen.has(id)) daysSeen.set(id, new Set())
      daysSeen.get(id)!.add(m.session_id)
    }
    for (const id of m.team_b) {
      const s = get(id)
      s.matches++; s.points += pb; s.gamesWon += b; s.gamesLost += a
      if (b > a) s.wins++; else s.losses++
      if (!daysSeen.has(id)) daysSeen.set(id, new Set())
      daysSeen.get(id)!.add(m.session_id)
    }
  }
  for (const [id, set] of daysSeen) get(id).days = set.size
  return out
}

/** Ordena o ranking: pontos > saldo de games > vitorias > nome. */
/** O que decide um ranking: pontos (o do mes, e o do dia como sempre foi) ou vitorias. */
export type CriterioDoDia = 'pontos' | 'vitorias'

/**
 * Compara duas linhas pelo criterio. Negativo = `x` na frente.
 *
 * Por vitorias, quem venceu mais fica na frente e os pontos so desempatam --
 * e o que faz sentido para o DIA: ganhar 5 de 6 apertado vale mais do que
 * ganhar 3 de 6 atropelando. O mes continua por pontos: la o que se soma e
 * o que cada noite rendeu.
 */
export function compararPeloCriterio(x: PlayerStat, y: PlayerStat, criterio: CriterioDoDia): number {
  if (criterio === 'vitorias') {
    return y.wins - x.wins || y.points - x.points || balance(y) - balance(x)
  }
  return y.points - x.points || balance(y) - balance(x) || y.wins - x.wins
}

export function rankPlayers(
  stats: Map<string, PlayerStat>,
  nameOf: (id: string) => string,
  criterio: CriterioDoDia = 'pontos',
): PlayerStat[] {
  return [...stats.values()].sort(
    (x, y) =>
      compararPeloCriterio(x, y, criterio) ||
      nameOf(x.player_id).localeCompare(nameOf(y.player_id), 'pt-BR'),
  )
}

/** Estatistica de parceria: com quem cada jogadora jogou e como foi. */
export function partnerStats(matches: Match[]): Map<string, Map<string, PairKeyStat>> {
  const out = new Map<string, Map<string, PairKeyStat>>()
  const bump = (id: string, other: string, win: boolean, pts: number) => {
    if (!out.has(id)) out.set(id, new Map())
    const inner = out.get(id)!
    let s = inner.get(other)
    if (!s) { s = { other_id: other, matches: 0, wins: 0, losses: 0, points: 0 }; inner.set(other, s) }
    s.matches++; s.points += pts
    if (win) s.wins++; else s.losses++
  }
  for (const m of matches) {
    const a = m.score_a as number
    const b = m.score_b as number
    const [pa, pb] = matchPoints(a, b)
    bump(m.team_a[0], m.team_a[1], a > b, pa)
    bump(m.team_a[1], m.team_a[0], a > b, pa)
    bump(m.team_b[0], m.team_b[1], b > a, pb)
    bump(m.team_b[1], m.team_b[0], b > a, pb)
  }
  return out
}

/** Uma dupla que ja jogou junta, com o retrospecto dela. */
export type DuoStat = {
  key: string
  a: string
  b: string
  matches: number
  wins: number
  losses: number
  points: number
  gamesWon: number
  gamesLost: number
  /** Pontos que vieram de bye, ja somados em `points`. */
  bye: number
  /** Ids dos plays em que a dupla jogou. */
  sessions: Set<string>
}

/** O mesmo que `computeStatsComPontos`, para as duplas. */
export function duoStatsComPontos(sessoes: PlaySession[], matches: Match[]): Map<string, DuoStat> {
  const tudo = duoStats(matches)
  const soPontos = duoStats(pontuaveis(sessoes, matches))
  for (const [k, d] of tudo) d.points = soPontos.get(k)?.points ?? 0
  return tudo
}

/** Todas as duplas ja formadas no periodo, agregadas. */
export function duoStats(matches: Match[]): Map<string, DuoStat> {
  const out = new Map<string, DuoStat>()
  const add = (ids: [string, string], venceu: boolean, pts: number, favor: number, contra: number, sid: string) => {
    const key = pairKey(ids[0], ids[1])
    let d = out.get(key)
    if (!d) {
      const [a, b] = ids[0] < ids[1] ? ids : [ids[1], ids[0]]
      d = { key, a, b, matches: 0, wins: 0, losses: 0, points: 0, gamesWon: 0, gamesLost: 0, bye: 0, sessions: new Set() }
      out.set(key, d)
    }
    d.matches++
    d.points += pts
    d.gamesWon += favor
    d.gamesLost += contra
    d.sessions.add(sid)
    if (venceu) d.wins++
    else d.losses++
  }
  for (const m of matches) {
    const a = m.score_a as number
    const b = m.score_b as number
    const [pa, pb] = matchPoints(a, b)
    add(m.team_a, a > b, pa, a, b, m.session_id)
    add(m.team_b, b > a, pb, b, a, m.session_id)
  }
  return out
}

/** Partidas de uma dupla especifica, da mais recente para a mais antiga. */
export function duoMatches(matches: Match[], a: string, b: string): Match[] {
  const alvo = pairKey(a, b)
  return matches.filter(
    (m) => pairKey(m.team_a[0], m.team_a[1]) === alvo || pairKey(m.team_b[0], m.team_b[1]) === alvo,
  )
}

/** Estatistica de confronto: contra quem cada jogadora jogou e como foi. */
export function opponentStats(matches: Match[]): Map<string, Map<string, PairKeyStat>> {
  const out = new Map<string, Map<string, PairKeyStat>>()
  const bump = (id: string, other: string, win: boolean, pts: number) => {
    if (!out.has(id)) out.set(id, new Map())
    const inner = out.get(id)!
    let s = inner.get(other)
    if (!s) { s = { other_id: other, matches: 0, wins: 0, losses: 0, points: 0 }; inner.set(other, s) }
    s.matches++; s.points += pts
    if (win) s.wins++; else s.losses++
  }
  for (const m of matches) {
    const a = m.score_a as number
    const b = m.score_b as number
    const [pa, pb] = matchPoints(a, b)
    for (const x of m.team_a) for (const y of m.team_b) bump(x, y, a > b, pa)
    for (const x of m.team_b) for (const y of m.team_a) bump(x, y, b > a, pb)
  }
  return out
}

/**
 * FORCA DE CADA JOGADORA
 *
 * Usada para dois trabalhos: equilibrar as duplas de cada partida e dividir os
 * grupos por nivel. E um Elo -- cada partida move a nota das quatro conforme a
 * nota de quem estava do outro lado. **Vencer quem esta melhor rende muito;
 * vencer quem esta pior rende pouco, e perder para quem esta pior custa caro.**
 *
 * O jeito antigo era a media de pontos por partida, e ela nao sabe DE QUEM
 * voce ganhou. No modo em grupos isso quebra: cada grupo e um rodizio fechado,
 * entao dominar o grupo fraco rende a mesma media que dominar o grupo forte --
 * as notas dos dois grupos deixam de ser comparaveis e a divisao dos grupos
 * passa a errar cada vez mais. Medido em 12 sextas simuladas (ver DECISOES.md),
 * correlacao com a habilidade real no modo em grupos:
 *
 *   media de pontos   0,56 -> 0,77 -> 0,73 -> 0,70   (piora com o tempo)
 *   Elo               0,61 -> 0,81 -> 0,89 -> 0,92   (melhora)
 *
 * O Elo tambem resolve sozinho o que a janela de "ultimos 4 plays" resolvia:
 * quem foi boa ha um ano e anda perdendo vai devolvendo nota partida a partida.
 * E quem falta simplesmente fica com a nota parada, que e o certo -- sem jogo,
 * sem informacao nova.
 */

/** Todo mundo comeca na media; o valor em si nao importa, so as diferencas. */
export const ELO_INICIAL = 1500
/** Quanto uma partida move a nota. Entre 12 e 60 o resultado quase nao muda. */
const ELO_K = 24
/** Quantos pontos de Elo valem 1 ponto na escala 0-4 que o resto do app usa. */
const ELO_ESCALA = 110

/** Nota de quem ainda nao jogou: a media do grupo. */
export const FORCA_PADRAO = 2

export function ratings(data: AppData, upToDate?: string): Map<string, number> {
  const sessao = new Map(data.sessions.map((s) => [s.id, s]))

  // o Elo depende da ordem: cada partida e avaliada com as notas que existiam
  // naquele momento, entao as partidas entram em ordem cronologica
  const jogos = playedMatches(data)
    .filter((m) => {
      const s = sessao.get(m.session_id)
      return Boolean(s) && (!upToDate || (s as PlaySession).date <= upToDate)
    })
    .sort((x, y) => {
      const sx = sessao.get(x.session_id) as PlaySession
      const sy = sessao.get(y.session_id) as PlaySession
      return (
        sx.date.localeCompare(sy.date) ||
        sx.created_at.localeCompare(sy.created_at) ||
        x.round - y.round
      )
    })

  /*
   * DE ONDE CADA PESSOA PARTE
   *
   * O padrao e 1500, o meio da escala -- e nao a media de quem esta cadastrado:
   * como o Elo e soma zero, a media do grupo fica em 1500 sozinha enquanto
   * todo mundo partir dali. Quem organiza pode dar um ponto de partida
   * diferente no cadastro, quando ja conhece o nivel; a partir dai as partidas
   * mandam do mesmo jeito.
   */
  const inicial = new Map(
    data.players.map((p) => [p.id, p.forca_inicial ?? ELO_INICIAL] as const),
  )
  const elo = new Map<string, number>()
  const nota = (id: string) => elo.get(id) ?? inicial.get(id) ?? ELO_INICIAL

  for (const m of jogos) {
    const ga = m.score_a as number
    const gb = m.score_b as number
    if (ga + gb === 0) continue
    const forcaA = (nota(m.team_a[0]) + nota(m.team_a[1])) / 2
    const forcaB = (nota(m.team_b[0]) + nota(m.team_b[1])) / 2
    const esperado = 1 / (1 + Math.pow(10, (forcaB - forcaA) / 400))
    // a margem conta, como na pontuacao do campeonato: 4x0 vale 1,00 e 4x3, 0,57
    const real = ga / (ga + gb)
    const delta = ELO_K * (real - esperado)
    for (const id of m.team_a) elo.set(id, nota(id) + delta)
    for (const id of m.team_b) elo.set(id, nota(id) - delta)
  }

  // devolve na escala 0-4 (a mesma da media de pontos), para os pesos do
  // emparelhamento em pairing.ts continuarem valendo
  const out = new Map<string, number>()
  for (const p of data.players) {
    out.set(p.id, Math.max(0, FORCA_PADRAO + (nota(p.id) - ELO_INICIAL) / ELO_ESCALA))
  }
  return out
}

/** Historico de parcerias/confrontos, para evitar repetir duplas. */
export type History = {
  partner: Map<string, number>
  opponent: Map<string, number>
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function buildHistory(matches: Match[], decay = 1): History {
  const partner = new Map<string, number>()
  const opponent = new Map<string, number>()
  matches.forEach((m, i) => {
    const w = Math.pow(decay, matches.length - 1 - i)
    inc(partner, pairKey(m.team_a[0], m.team_a[1]), w)
    inc(partner, pairKey(m.team_b[0], m.team_b[1]), w)
    for (const x of m.team_a) for (const y of m.team_b) inc(opponent, pairKey(x, y), w)
  })
  return { partner, opponent }
}

function inc(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by)
}

/**
 * AS DUPLAS DO MATA-MATA, DA CAMPEA A PRIMEIRA ELIMINADA
 *
 * Ordena por ATE ONDE A DUPLA CHEGOU, nao por vitorias: com bye, quem passou
 * direto para a semi e perdeu tem uma vitoria a menos que quem ganhou as
 * quartas e perdeu a semi -- e as duas cairam na mesma altura. A fase mais
 * alta que a dupla jogou e a medida honesta; vitorias so desempatam dentro
 * dela, o que separa a campea da vice.
 *
 * Recebe so as partidas que valem (fase 2 em diante). Serve tanto ao podio
 * mostrado na tela quanto ao 🔥 -- de proposito: um podio visivel que nao
 * bate com o que segura a sequencia e bug esperando para ser reportado.
 */
export type DuplaDoDia = DuoStat & {
  /** A maior `fase` em que a dupla jogou: 2 = caiu na primeira, 4 = final. */
  ateFase: number
  saldo: number
  /** Venceu a disputa de 3o lugar -- o bronze saiu da quadra, nao do desempate. */
  bronze: boolean
  /** 3 ouro, 2 prata, 1 bronze, 0 fora do podio. Sai da chave, nao do saldo. */
  medalha: 0 | 1 | 2 | 3
  /** Onde a campanha acabou, com preposicao: "na semifinal", "nas quartas". */
  saiuEm: string
}

/** A menor potencia de 2 que comporta `n`. */
function chaveDe(n: number): number {
  let t = 1
  while (t < n) t *= 2
  return t
}

/**
 * O nome da rodada em que a dupla caiu, pelo tanto de duplas que ENTRARAM
 * nela.
 *
 * Contar jogos erraria duas vezes: uma rodada de 5 duplas tem 3 byes e um
 * jogo so -- nao e "a final" -- e o numero da fase tambem nao serve, porque
 * com 4 duplas a fase 3 ja e a final e com 5 ela e a semi.
 */
function rodadaDeSaida(entraram: number): string {
  const sobram = chaveDe(entraram) / 2
  if (sobram <= 1) return 'na final'
  if (sobram === 2) return 'na semifinal'
  if (sobram === 4) return 'nas quartas de final'
  if (sobram === 8) return 'nas oitavas de final'
  return `na rodada de ${entraram} duplas`
}

export function rankDuplasDoDia(
  matches: Match[],
  nameOf: (id: string) => string,
  /** Pontos de bye por dupla, de `pontosDeBye().porDupla`. */
  bye?: Map<string, number>,
  /**
   * As duplas da chave (`session.duos`). Com elas da para saber quantas ainda
   * estao vivas -- e so ha campea quando sobra UMA. Sem elas, vale o que
   * apareceu nas partidas jogadas, que nao enxerga quem ainda nao jogou.
   */
  duos?: readonly (readonly string[])[],
): DuplaDoDia[] {
  const stats = bye ? aplicarByeNasDuplas(duoStats(matches), bye) : duoStats(matches)
  const ateFase = new Map<string, number>()
  for (const m of matches) {
    // a disputa de 3o divide a fase com a final; contar ela aqui poria as
    // semifinalistas no mesmo degrau das finalistas
    if (m.disputa_3o) continue
    const fase = m.fase ?? 2
    for (const time of [m.team_a, m.team_b]) {
      const k = pairKey(time[0], time[1])
      ateFase.set(k, Math.max(ateFase.get(k) ?? 0, fase))
    }
  }

  // quem venceu a disputa de 3o fica na frente da outra semifinalista, e nao
  // no desempate por pontos: o bronze foi decidido em quadra
  const bronze = new Set<string>()
  for (const m of matches) {
    if (!m.disputa_3o || m.score_a === null || m.score_b === null) continue
    const venceu = m.score_a > m.score_b ? m.team_a : m.team_b
    bronze.add(pairKey(venceu[0], venceu[1]))
  }

  /*
   * OURO E PRATA SAEM DA FINAL, NAO DA CONTA DE VITORIAS
   *
   * Com bye a conta engana: a vice que subiu da preliminar chega a final com
   * as MESMAS vitorias da campea que passou direto, e com mais pontos, porque
   * jogou uma partida a mais. O desempate por pontos entao virava o podio de
   * cabeca para baixo -- a campea aparecia em 2o e as duas saiam rotuladas
   * como "caiu na final". A chave ja sabe quem ganhou; e so perguntar a ela.
   */
  const ultimaFase = matches.reduce((t, m) => (m.disputa_3o ? t : Math.max(t, m.fase ?? 2)), 0)
  const finais = matches.filter(
    (m) => !m.disputa_3o && (m.fase ?? 2) === ultimaFase && isPlayed(m),
  )
  let ouro = ''
  let prata = ''
  /*
   * So ha campea quando a chave ACABOU: um jogo so na ultima rodada E uma
   * dupla so sem derrota. Esta funcao recebe apenas partidas jogadas, entao
   * "um jogo na ultima fase" sozinho nao distingue a final de um play
   * encerrado no meio da semifinal com uma semi lancada e a outra nao -- e
   * ai a vencedora daquela semi sairia campea do dia.
   */
  const chaveDa = (d: readonly string[]) => [...d].sort().join('|')
  const perderam = new Set<string>()
  const apareceram = new Set<string>()
  for (const m of matches) {
    if (m.disputa_3o) continue
    apareceram.add(chaveDa(m.team_a))
    apareceram.add(chaveDa(m.team_b))
    perderam.add(chaveDa((m.score_a as number) > (m.score_b as number) ? m.team_b : m.team_a))
  }
  const todas = duos?.length ? duos.map(chaveDa) : [...apareceram]
  const vivas = todas.filter((k) => !perderam.has(k)).length
  if (finais.length === 1 && vivas === 1) {
    const f = finais[0]
    const ganhouA = (f.score_a as number) > (f.score_b as number)
    const venceu = ganhouA ? f.team_a : f.team_b
    const perdeu = ganhouA ? f.team_b : f.team_a
    ouro = pairKey(venceu[0], venceu[1])
    prata = pairKey(perdeu[0], perdeu[1])
  }

  const linhas = [...stats.values()].map((d) => ({
    ...d,
    ateFase: ateFase.get(d.key) ?? 0,
    saldo: d.gamesWon - d.gamesLost,
    bronze: bronze.has(d.key),
    medalha: (d.key === ouro ? 3 : d.key === prata ? 2 : bronze.has(d.key) ? 1 : 0) as 0 | 1 | 2 | 3,
    saiuEm: '',
  }))

  // quantas duplas entraram na rodada em que cada uma caiu: as que chegaram
  // ate aquela fase, contando as que passaram dela
  for (const d of linhas) {
    d.saiuEm = rodadaDeSaida(linhas.filter((x) => x.ateFase >= d.ateFase).length)
  }

  return linhas.sort(
    (x, y) =>
      y.medalha - x.medalha ||
      y.ateFase - x.ateFase ||
      Number(y.bronze) - Number(x.bronze) ||
      y.wins - x.wins ||
      y.points - x.points ||
      y.saldo - x.saldo ||
      nameOf(x.a).localeCompare(nameOf(y.a), 'pt-BR'),
  )
}

/** Quantas duplas sobem ao podio do mata-mata: ouro, prata e bronze. */
export const DUPLAS_NO_PODIO = 3


/** Os pontos que o bye pagou, pelos dois lados: por pessoa e por dupla. */
export type PontosDeBye = {
  porJogadora: Map<string, number>
  porDupla: Map<string, number>
}

/**
 * PONTOS DE BYE
 *
 * No mata-mata das duplas, quem foi melhor na fase de grupos passa direto de
 * uma rodada. O atalho e o premio -- mas do jeito que estava ele COBRAVA um
 * preco: a dupla que passa joga uma partida a menos, e como os pontos saem do
 * placar, ela terminava o mes atras de quem precisou jogar para chegar no
 * mesmo lugar da chave.
 *
 * Entao o bye paga o que uma vitoria daquela rodada pagou, NA MEDIA. Nem
 * menos, que seria punir quem foi bem nos grupos, nem mais, que faria valer
 * mais a pena nao jogar. Se as vencedoras da rodada fizeram 4 e 2 pontos, o
 * bye paga 3.
 *
 * NAO vira partida: bye nao tem adversario, entao nao pode mexer no Elo, no
 * retrospecto (V/D) nem na forca da dupla. E so pontos, somados no fim.
 */
export function pontosDeBye(sessoes: PlaySession[], matches: Match[]): PontosDeBye {
  const porJogadora = new Map<string, number>()
  const porDupla = new Map<string, number>()
  const chave = (d: readonly string[]) => [...d].sort().join('|')

  for (const s of sessoes) {
    if (s.format !== 'grupos-duplas' || !s.duos?.length) continue
    // a disputa de 3o fica de fora: ela divide a fase com a final e nao e uma
    // rodada da chave, entao nao ha bye para calcular nela
    const daChave = matches.filter(
      (m) => m.session_id === s.id && (m.fase ?? 1) >= 2 && !m.disputa_3o,
    )
    if (daChave.length === 0) continue

    const fases = [...new Set(daChave.map((m) => m.fase as number))].sort((x, y) => x - y)
    let vivas = s.duos
    for (const fase of fases) {
      const daFase = daChave.filter((m) => m.fase === fase)
      const jogadas = daFase.filter(isPlayed)
      // rodada que nem comecou nao paga nada ainda: sem placar nenhum nao da
      // para saber quanto uma vitoria valeu nela
      if (jogadas.length === 0) break

      // quem tem partida marcada nesta rodada nao passou de bye -- inclusive
      // quem ainda vai jogar, senao a dupla que esta em quadra viraria bye
      const comPartida = new Set<string>()
      for (const m of daFase) {
        comPartida.add(chave(m.team_a))
        comPartida.add(chave(m.team_b))
      }

      const ganhos = jogadas.map((m) => {
        const [pa, pb] = matchPoints(m.score_a as number, m.score_b as number)
        return Math.max(pa, pb)
      })
      const media = Math.max(1, Math.round(ganhos.reduce((t, x) => t + x, 0) / ganhos.length))

      for (const d of vivas) {
        if (comPartida.has(chave(d))) continue
        porDupla.set(pairKey(d[0], d[1]), (porDupla.get(pairKey(d[0], d[1])) ?? 0) + media)
        for (const id of d) porJogadora.set(id, (porJogadora.get(id) ?? 0) + media)
      }

      const caiu = new Set(
        jogadas.map((m) =>
          chave((m.score_a as number) > (m.score_b as number) ? m.team_b : m.team_a),
        ),
      )
      vivas = vivas.filter((d) => !caiu.has(chave(d)))
    }
  }
  return { porJogadora, porDupla }
}

/** Soma os pontos de bye nas estatisticas individuais, sem mexer no resto. */
export function aplicarBye(
  stats: Map<string, PlayerStat>,
  bye: Map<string, number>,
): Map<string, PlayerStat> {
  const out = new Map<string, PlayerStat>()
  for (const [id, s] of stats) out.set(id, { ...s })
  for (const [id, pontos] of bye) {
    const s = out.get(id)
    // quem so tem bye e nenhuma partida nao existe na tabela: no mata-mata a
    // dupla sempre joga pelo menos a rodada seguinte
    if (!s) continue
    s.points += pontos
    s.bye += pontos
  }
  return out
}

/** O mesmo, nas estatisticas das duplas. */
export function aplicarByeNasDuplas(
  duos: Map<string, DuoStat>,
  bye: Map<string, number>,
): Map<string, DuoStat> {
  const out = new Map<string, DuoStat>()
  for (const [k, d] of duos) out.set(k, { ...d, sessions: new Set(d.sessions) })
  for (const [k, pontos] of bye) {
    const d = out.get(k)
    if (!d) continue
    d.points += pontos
    d.bye += pontos
  }
  return out
}
