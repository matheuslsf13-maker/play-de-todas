export type Player = {
  id: string
  name: string
  photo_url: string | null
  active: boolean
  created_at: string
  /**
   * Como ela aparece na quadra: nos rankings, nas partidas, nos textos e nas
   * artes. Vazio quer dizer "usa o nome do cadastro".
   *
   * `name` e o nome de cadastro, completo -- serve para nao confundir duas
   * Anas na hora de conferir a lista. `nickname` e o que o grupo chama.
   */
  nickname?: string | null
  /** Outras grafias que a lista do grupo ja usou para essa jogadora. */
  aliases?: string[]
  /**
   * Como ela paga: `mensalista`, `avulsa`, `convidada` ou `isenta`.
   * Ver `src/lib/mensalidade.ts` -- e la que mora a regra de quem pode entrar.
   */
  categoria?: string | null
  /** Mensalista: ate que mes esta paga (AAAA-MM). */
  pago_mes?: string | null
  /** Avulsa: credito de UMA participacao, gasto quando o play e finalizado. */
  pago_avulso?: boolean | null
  /**
   * De onde o Elo parte para esta pessoa (escala de 1500). Vazio = 1500, o
   * meio da escala. Quem organiza pode ajustar no cadastro quando ja sabe o
   * nivel -- ver `ratings()`.
   */
  forca_inicial?: number | null
}

export type SessionStatus = 'open' | 'finished'

/**
 * Formato do dia:
 *  - 'todas'  : rodizio unico, cada uma faz dupla com cada uma das outras;
 *  - 'grupos' : o mesmo rodizio, mas dentro de grupos formados por nivel.
 *               Os pontos continuam individuais e o ranking do dia e unico.
 */
export type PlayFormat = 'todas' | 'grupos' | 'grupos-duplas'

/** Um "Play de Todas": um dia de jogos. */
export type PlaySession = {
  id: string
  date: string // YYYY-MM-DD
  title: string
  courts: number
  /**
   * Quantas partidas o play tem no total.
   * A coluna do banco se chama `rounds` de quando o play era organizado em
   * rodadas; hoje as partidas sao uma fila unica (ver DECISOES.md).
   */
  rounds: number
  target: number // pontos para vencer a partida (padrao 4)
  player_ids: string[]
  status: SessionStatus
  created_at: string
  format?: PlayFormat
  /** No modo em grupos, quem esta em cada grupo (o grupo 1 e o de nivel mais alto). */
  groups?: string[][] | null
  /**
   * O que decide o ranking DO DIA: `pontos` (como sempre foi) ou `vitorias`
   * (quem venceu mais; os pontos so desempatam). Fica gravado no play para o
   * podio de um dia ja anunciado nunca mudar de criterio. Ausente = pontos.
   * O ranking do MES e sempre por pontos.
   */
  criterio_dia?: 'pontos' | 'vitorias' | null
  /**
   * O que fazer quando as duas duplas chegam em `target - 1` (o 3x3):
   * `nenhum`, `vantagem` (vai a 2), `vantagem-tie7` ou `vantagem-tie10`.
   * Ver `src/lib/desempate.ts`. Ausente = `nenhum`, como os plays antigos.
   */
  desempate?: string | null
  /**
   * No formato `grupos-duplas`, o desempate de CADA fase:
   * [grupos, duplas fixas, semifinal, final]. Ausente = `desempate` em todas.
   */
  desempates?: string[] | null
  /**
   * No formato `grupos-duplas`, as duplas fixas da fase 2 ja formadas, na
   * ordem de forca. Nulo enquanto a fase 1 nao terminou.
   */
  duos?: [string, string][] | null
  /**
   * Quantas duplas entram no mata-mata. Padrao 8 (= 16 jogadoras, quartas de
   * final). Com mais gente, as piores colocadas na fase de grupos ficam de
   * fora; com menos, todas entram e as melhores passam de bye.
   */
  duplas_mm?: number | null
  /**
   * No formato `grupos-duplas`, quantos games fecham a partida em cada fase:
   * [grupos, duplas fixas, semifinal, final]. Ausente = usa `target` em todas.
   */
  alvos?: number[] | null
  /** Historico: hoje o tie sempre vai a 2, entao isto e sempre `true`. */
  desempate_vai2?: boolean | null
  /**
   * O play vale para o campeonato? `false` = play avulso: as partidas contam
   * no historico e no equilibrio das duplas, mas nao somam pontos no ranking
   * do mes nem mexem nas sequencias. Ausente conta como `true` (plays antigos).
   */
  ranked?: boolean
}

export type Match = {
  id: string
  session_id: string
  /**
   * Posicao na fila de partidas do dia (1, 2, 3...).
   * A coluna do banco se chama `round` por historia; nao ha mais rodadas.
   */
  round: number
  /** Quadra em que a partida aconteceu. 0 = ainda nao entrou em quadra. */
  court: number
  team_a: [string, string]
  team_b: [string, string]
  score_a: number | null
  score_b: number | null
  /**
   * Pontos que o PERDEDOR fez no tie, quando a partida foi decidida nele.
   *
   * So o perdedor: os do vencedor saem da regra, que e sempre a mesma -- chega
   * no alvo do tie, ou abre dois. Nulo quando nao houve tie.
   */
  tie?: number | null
  /**
   * Formato `grupos-duplas`: 1 = fase de grupos, 2 = duplas fixas,
   * 3 = semifinal, 4 = final. Ausente conta como 1.
   */
  fase?: number
  /**
   * A disputa de 3o lugar, entre as duas que perderam a semifinal.
   *
   * Fica na MESMA fase da final e roda em paralelo com ela, na quadra ao
   * lado -- por isso nao alonga a noite. Precisa de marca propria porque
   * senao a fase da final teria duas partidas, e o app usa esse numero para
   * saber qual rodada e (1 jogo = final, 2 = semifinal).
   */
  disputa_3o?: boolean | null
  /** Quando a partida entrou em quadra. Null = ainda nao comecou. */
  started_at?: string | null
  /** Quando o placar foi lancado. Alimenta o "quem esta fora ha mais tempo". */
  ended_at?: string | null
}

/**
 * Escolha da jogadora no fechamento do mes, quando ela esta em chamas:
 * sacar o bonus acumulado agora (e zerar a sequencia) ou continuar apostando
 * para valer mais la na frente.
 */
export type StreakChoice = {
  id: string // `${player_id}:${month}`
  player_id: string
  month: string // YYYY-MM do mes que fechou
  action: 'sacar' | 'continuar'
  streak: number // sequencia no momento da decisao
  bonus: number // bonus acumulado em jogo
  created_at: string
}

/**
 * Fechamento de mes feito na mao pela organizadora ("finalizar o mes").
 * Sem isso o mes so fecha quando o calendario vira, o que atrapalha testes e
 * impede fechar no ultimo play do mes, que e quando a premiacao acontece.
 */
export type MonthClosure = {
  id: string // o proprio mes, YYYY-MM
  month: string // YYYY-MM
  closed_at: string
}

export type AppData = {
  players: Player[]
  sessions: PlaySession[]
  matches: Match[]
  choices: StreakChoice[]
  closures: MonthClosure[]
}

export const emptyData = (): AppData => ({
  players: [], sessions: [], matches: [], choices: [], closures: [],
})

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function todayISO(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7) // YYYY-MM
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const name = MONTHS[Number(m) - 1] ?? m
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`
}

export function dateLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-')
  return `${d}/${m}/${y}`
}

/**
 * "1 partida" / "3 partidas".
 *
 * O "(s)" entre parenteses e o jeito preguicoso de resolver plural, e aparece
 * em texto que a organizadora le no meio do play. Quando o plural nao e so
 * juntar um "s" (jogadora/jogadoras funciona; mulher/mulheres nao), passe o
 * segundo argumento.
 */
export function plural(n: number, uma: string, varias?: string): string {
  return `${n} ${n === 1 ? uma : (varias ?? uma + 's')}`
}
