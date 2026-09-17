import { CHAVE } from '../lib/chaves'
import type {
  Checkin,
  CheckinConta,
  CheckinDia,
  CheckinLocal,
  CheckinPagamento,
  LancamentoDeCaixa,
  Match,
  MonthClosure,
  PlaySession,
  Player,
  StreakChoice,
} from '../lib/types'

/**
 * Operacoes de escrita em formato serializavel: assim a fila sobrevive a um
 * refresh ou a um celular sem sinal no meio do play.
 */
export type WriteOp =
  | { id: string; type: 'savePlayer'; player: Player }
  | { id: string; type: 'deletePlayer'; playerId: string }
  | { id: string; type: 'saveSession'; session: PlaySession }
  | { id: string; type: 'deleteSession'; sessionId: string }
  | { id: string; type: 'saveMatches'; matches: Match[] }
  | { id: string; type: 'replaceSessionMatches'; sessionId: string; matches: Match[] }
  | { id: string; type: 'saveChoice'; choice: StreakChoice }
  | { id: string; type: 'saveClosure'; closure: MonthClosure }
  | { id: string; type: 'deleteClosure'; month: string }
  | { id: string; type: 'saveCheckinLocal'; local: CheckinLocal }
  | { id: string; type: 'deleteCheckinLocal'; localId: string }
  | { id: string; type: 'saveCheckinConta'; conta: CheckinConta }
  | { id: string; type: 'deleteCheckinConta'; contaId: string }
  | { id: string; type: 'saveCheckinDia'; dia: CheckinDia }
  | { id: string; type: 'deleteCheckinDia'; diaId: string }
  | { id: string; type: 'saveCheckin'; checkin: Checkin }
  | { id: string; type: 'deleteCheckin'; checkinId: string }
  | { id: string; type: 'saveCheckinPagamento'; pagamento: CheckinPagamento }
  | { id: string; type: 'deleteCheckinPagamento'; checkinId: string }
  | { id: string; type: 'saveCaixa'; lancamento: LancamentoDeCaixa }
  | { id: string; type: 'deleteCaixa'; lancamentoId: string }
  | {
      id: string
      type: 'mergePlayers'
      fromId: string
      intoId: string
      matches: Match[]
      sessions: PlaySession[]
      /** Opcionais: uma op antiga persistida na fila nao os tem. */
      contas?: CheckinConta[]
      checkins?: Checkin[]
    }

const QUEUE_KEY = CHAVE.fila
const CACHE_KEY = CHAVE.cache

export function loadQueue(): WriteOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as WriteOp[]) : []
  } catch {
    return []
  }
}

export function saveQueue(ops: WriteOp[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops))
  } catch {
    /* sem espaco: a fila continua so em memoria */
  }
}

export function loadCache<T>(): T | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveCache(data: unknown) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    /* sem espaco: segue sem cache offline */
  }
}
