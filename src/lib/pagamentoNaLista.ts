import { categoriaDe } from './mensalidade'
import { centavos, pagamentoDoCheckin, valorDevido } from './checkins'
import { dataDoPlay, type Lista } from './listaDePresenca'
import type { AppData, Checkin, CheckinDia, CheckinModo, CheckinPagamento, Player } from './types'

export const VALOR_CHEIO_INICIAL = 50
export const VALOR_COM_CHECKIN_INICIAL = 25
export type RetratoPagamento = { checkin: Checkin; pagamento: CheckinPagamento | null }
export type PedidoPagamento = { dia: CheckinDia; antes: RetratoPagamento | null; depois: RetratoPagamento | null; listaId?: string; nomeId?: string }
export const tipoNaLista = (p?: Player) => p ? categoriaDe(p) : 'vincular'
export const idDoLancamento = (dia: string, atleta: string) => `checkin:${encodeURIComponent(dia)}:${encodeURIComponent(atleta)}`

export function diaDaLista(data: AppData, lista: Lista): CheckinDia {
  const ligados = lista.session_id ? data.checkinDias.filter((d) => d.session_id === lista.session_id) : []
  const candidatos = ligados.length ? ligados : data.checkinDias.filter((d) => d.date === dataDoPlay(lista) && !d.session_id)
  if (candidatos.length > 1) throw new Error('Há mais de um dia possível. Ligue o dia correto ao play na aba Check-ins.')
  if (candidatos[0]) return candidatos[0]
  const ultimo = [...data.checkinDias].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))[0]
  return { id: `dia:${dataDoPlay(lista)}`, date: dataDoPlay(lista), session_id: lista.session_id, titulo: lista.titulo,
    valor_cheio: ultimo?.valor_cheio ?? VALOR_CHEIO_INICIAL, valor_com_checkin: ultimo?.valor_com_checkin ?? VALOR_COM_CHECKIN_INICIAL,
    created_at: new Date().toISOString() }
}

export function retrato(data: AppData, diaId: string, playerId: string): RetratoPagamento | null {
  const cs = data.checkins.filter((c) => c.dia_id === diaId && c.player_id === playerId)
  if (cs.length > 1) throw new Error('Há lançamentos duplicados. Confira esta atleta na aba Check-ins antes de continuar.')
  return cs[0] ? { checkin: cs[0], pagamento: pagamentoDoCheckin(data, cs[0].id) ?? null } : null
}

export function palpiteDaLista(data: AppData, playerId: string): CheckinModo {
  return data.checkinContas.some((c) => c.player_id === playerId && c.ativo) ? 'checkin' : 'integral'
}

export function prepararPagamento(data: AppData, dia: CheckinDia, playerId: string, modo: CheckinModo, pago: number): RetratoPagamento & { pagamento: CheckinPagamento } {
  if (!Number.isFinite(pago) || pago < 0 || pago >= 100000000) throw new Error('Confira o valor pago.')
  const antes = retrato(data, dia.id, playerId)
  const conta = data.checkinContas.filter((c) => c.player_id === playerId && c.ativo).sort((a, b) => Number(b.principal) - Number(a.principal))[0]
  const checkin: Checkin = { id: idDoLancamento(dia.id, playerId), dia_id: dia.id, player_id: playerId,
    conta_id: conta && !conta.principal ? conta.id : null, local_id: conta?.local_padrao_id ?? data.checkinLocais.find((l) => l.ativo)?.id ?? null,
    credito_checkin: false, credito_de: null, compareceu: true, created_at: new Date().toISOString(), ...antes?.checkin, modo, checkin_confirmado: modo === 'checkin' }
  if (modo === 'integral') { checkin.local_id = null; checkin.credito_de = null; checkin.credito_checkin = false }
  if (modo === 'checkin' && !checkin.local_id) checkin.local_id = conta?.local_padrao_id ?? data.checkinLocais.find((l) => l.ativo)?.id ?? null
  return { checkin, pagamento: { checkin_id: checkin.id, valor_devido: null, observacao: null, ...antes?.pagamento, valor_pago: centavos(pago), pagamento_confirmado: true } }
}

export function valorInicial(data: AppData, dia: CheckinDia, playerId: string, modo: CheckinModo): number {
  const antes = retrato(data, dia.id, playerId)
  return antes?.pagamento?.valor_pago ?? valorDevido(prepararPagamento(data, dia, playerId, modo, 0).checkin, dia, antes?.pagamento ?? undefined)
}

function chave(r: RetratoPagamento | null): string {
  if (!r) return 'null'
  const c = r.checkin
  return JSON.stringify([c.id, c.dia_id, c.player_id, c.conta_id, c.local_id, c.modo, c.compareceu, c.checkin_confirmado,
    c.credito_de ?? null, c.credito_checkin ?? false, r.pagamento && [r.pagamento.valor_pago, r.pagamento.valor_devido, r.pagamento.pagamento_confirmado, r.pagamento.observacao]])
}

/** Uma escrita local atomica; o RPC repete a comparacao sob trava no servidor. */
export function aplicarPagamento(data: AppData, dia: CheckinDia, antes: RetratoPagamento | null, depois: RetratoPagamento | null): AppData {
  const alvo = depois?.checkin ?? antes?.checkin
  if (!alvo || alvo.dia_id !== dia.id) throw new Error('Lançamento inválido.')
  if (chave(retrato(data, dia.id, alvo.player_id)) !== chave(antes)) throw new Error('O lançamento mudou em outro aparelho. Feche e abra novamente.')
  if (depois?.pagamento && (!Number.isFinite(depois.pagamento.valor_pago) || depois.pagamento.valor_pago < 0)) throw new Error('Confira o valor pago.')
  return { ...data, checkinDias: data.checkinDias.some((d) => d.id === dia.id) ? data.checkinDias : [...data.checkinDias, dia],
    checkins: [...data.checkins.filter((c) => c.id !== alvo.id), ...(depois ? [depois.checkin] : [])],
    checkinPagamentos: [...data.checkinPagamentos.filter((p) => p.checkin_id !== alvo.id), ...(depois?.pagamento ? [depois.pagamento] : [])] }
}

/** O cache publico nunca carrega dados privados de uma sessao anterior. */
export function semFinanceiro(data: AppData): AppData {
  return { ...data, checkinLocais: [], checkinContas: [], checkinDias: [], checkins: [], checkinPagamentos: [], checkinPlanos: [], checkinAcertos: [], caixa: [] }
}
