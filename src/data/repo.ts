import type {
  Acerto,
  AppData,
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

export interface Repo {
  readonly kind: 'local' | 'supabase'
  load(): Promise<AppData>
  savePlayer(p: Player): Promise<void>
  deletePlayer(id: string): Promise<void>
  saveSession(s: PlaySession): Promise<void>
  deleteSession(id: string): Promise<void>
  saveMatches(ms: Match[]): Promise<void>
  deleteMatchesOfSession(sessionId: string): Promise<void>
  saveChoice(choice: StreakChoice): Promise<void>
  /** Fechamento de mes feito na mao pela organizadora. */
  saveClosure(closure: MonthClosure): Promise<void>
  deleteClosure(month: string): Promise<void>
  /* check-ins: locais, contas, dias, lancamentos, pagamentos e caixa */
  saveCheckinLocal(local: CheckinLocal): Promise<void>
  deleteCheckinLocal(id: string): Promise<void>
  saveCheckinConta(conta: CheckinConta): Promise<void>
  deleteCheckinConta(id: string): Promise<void>
  saveCheckinDia(dia: CheckinDia): Promise<void>
  deleteCheckinDia(id: string): Promise<void>
  saveCheckin(checkin: Checkin): Promise<void>
  deleteCheckin(id: string): Promise<void>
  saveCheckinPagamento(pagamento: CheckinPagamento): Promise<void>
  deleteCheckinPagamento(checkinId: string): Promise<void>
  saveCaixa(lancamento: LancamentoDeCaixa): Promise<void>
  deleteCaixa(id: string): Promise<void>
  saveAcerto(acerto: Acerto): Promise<void>
  deleteAcerto(id: string): Promise<void>
  uploadPhoto(playerId: string, file: File): Promise<string>
  /** Apaga o arquivo da foto. Silencioso se a url nao for do nosso storage. */
  deletePhoto(url: string): Promise<void>
  /** Notifica mudancas feitas por outras pessoas (so no modo online). */
  subscribe?(cb: () => void): () => void
}
