import type { PedidoPagamento } from '../lib/pagamentoNaLista'
import type {
  Acerto,
  Plano,
  AppData,
  Checkin,
  CheckinConta,
  CheckinDia,
  CheckinLocal,
  CheckinPagamento,
  LancamentoDeCaixa,
  Match,
  MonthClosure,
  EventoDoPlay,
  MesclaDoPlay,
  PlaySession,
  Player,
  StreakChoice,
} from '../lib/types'
import type { Lista, ListaCompleta, NomeNaLista, RespostaDaLista } from '../lib/listaDePresenca'

/** O que a organizadora inclui direto na lista (a chegada e o id vem do banco). */
export type NomeIncluido = Pick<NomeNaLista, 'lista_id' | 'nome' | 'player_id' | 'origem' | 'garantida' | 'ordem'>
/** O que a organizadora mexe num nome ja na lista. */
export type MudancaNoNome = Partial<Pick<NomeNaLista, 'player_id' | 'ordem' | 'garantida' | 'saiu_em' | 'saiu_por' | 'avisou_24h'>>

export interface Repo {
  readonly kind: 'local' | 'supabase'
  load(): Promise<AppData>
  savePlayer(p: Player): Promise<void>
  deletePlayer(id: string): Promise<void>
  saveSession(s: PlaySession): Promise<void>
  /** Acrescenta uma linha ao diario do play sem regravar o resto da sessao. */
  anotarNoPlay(sessionId: string, evento: EventoDoPlay): Promise<void>
  /** Uma mudanca pontual (duplas de uma categoria, desempate, quadra cedida), sobre o que esta gravado agora. */
  mesclarNoPlay(sessionId: string, mescla: MesclaDoPlay): Promise<void>
  deleteSession(id: string): Promise<void>
  saveMatches(ms: Match[]): Promise<void>
  deleteMatchesOfSession(sessionId: string): Promise<void>
  saveChoice(choice: StreakChoice): Promise<void>
  /** Fechamento de mes feito na mao pela organizadora. */
  saveClosure(closure: MonthClosure): Promise<void>
  deleteClosure(month: string): Promise<void>
  /* check-ins: locais, contas, dias, lancamentos, pagamentos e caixa */
  gravarPagamento(pedido: PedidoPagamento): Promise<void>
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
  savePlano(plano: Plano): Promise<void>
  deletePlano(id: string): Promise<void>
  uploadPhoto(playerId: string, file: File): Promise<string>
  /** Apaga o arquivo da foto. Silencioso se a url nao for do nosso storage. */
  deletePhoto(url: string): Promise<void>
  /* lista de presenca (so o Play de Todas; script 31). Fora da fila de envio:
     a ordem e decidida no servidor, entao cada escrita espera a resposta. */
  carregarLista(ref: { codigo: string } | { id: string }): Promise<ListaCompleta | null>
  /** A lista do momento (cartao da tela inicial): a aberta, ou a fechada com o play por vir. */
  listaDoMomento(): Promise<ListaCompleta | null>
  listasRecentes(limite: number): Promise<Lista[]>
  /** Visitante: coloca o nome (o banco da a posicao). */
  colocarNaLista(codigo: string, nome: string, aparelho: string): Promise<RespostaDaLista>
  /** Visitante: tira o nome que ESTE celular colocou. */
  tirarDaLista(nomeId: string, aparelho: string): Promise<RespostaDaLista>
  /** `nova` cria; sem ela so altera a que existe (erro se ela foi apagada: nunca recria). */
  salvarLista(l: Lista, nova?: boolean): Promise<void>
  incluirNaLista(nomes: NomeIncluido[]): Promise<void>
  mexerNoNome(id: string, campos: MudancaNoNome): Promise<void>
  trocarNaLista(a: string, b: string): Promise<void>
  /** Apaga a lista; nomes e codigos de aparelho vao junto (cascata no banco). Erro se nao apagou. */
  apagarLista(id: string): Promise<void>
  /** Canal proprio da lista (o geral nao ouve estas tabelas). */
  ouvirLista(listaId: string, cb: () => void): () => void
  /** Notifica mudancas feitas por outras pessoas (so no modo online). */
  subscribe?(cb: () => void): () => void
}
