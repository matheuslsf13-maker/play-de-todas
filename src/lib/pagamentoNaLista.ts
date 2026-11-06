import { categoriaDe } from './mensalidade'
import { centavos, checkinDaAtletaNoDia, contasDaAtleta, creditoDisponivel, pagamentoDoCheckin, valorDevido } from './checkins'
import { dataDoPlay, type Lista } from './listaDePresenca'
import type { AppData, Checkin, CheckinDia, CheckinModo, CheckinPagamento, Player } from './types'

/*
 * 💰 NA LISTA: a organizadora lanca o pagamento da avulsa direto da lista de
 * presenca. Nao ha dinheiro novo aqui: grava o mesmo par checkin +
 * checkin_pagamentos da aba Check-ins (pelas mesmas acoes da store), e o
 * saldo/credito sai das contas que ja existem em checkins.ts.
 */

export const VALOR_CHEIO_INICIAL = 50
export const VALOR_COM_CHECKIN_INICIAL = 25
export type RetratoPagamento = { checkin: Checkin; pagamento: CheckinPagamento | null }

/** Sem cadastro ligado: 'vincular'. Mensalista, convidada e isenta nao sao cobradas pela lista. */
export const tipoNaLista = (p?: Player) => (p ? categoriaDe(p) : 'vincular')

/** Id fixo por atleta e dia: dois toques (ou dois celulares) caem no mesmo lancamento. */
export const idDoLancamento = (dia: string, atleta: string) => `checkin:${encodeURIComponent(dia)}:${encodeURIComponent(atleta)}`

/**
 * O dia de check-in do play da lista: o ligado ao play; senao o unico dia
 * daquela data sem play. Nenhum: um dia novo (ainda nao gravado), ligado ao
 * play, com os valores do ultimo dia (como o "Novo dia" da aba Check-ins).
 */
export function diaDaLista(data: AppData, lista: Lista): CheckinDia {
  const date = dataDoPlay(lista)
  const ligados = lista.session_id ? data.checkinDias.filter((d) => d.session_id === lista.session_id) : []
  const candidatos = ligados.length ? ligados : data.checkinDias.filter((d) => d.date === date && !d.session_id)
  if (candidatos.length > 1) throw new Error('Há mais de um dia possível. Ligue o dia correto ao play na aba Check-ins.')
  if (candidatos[0]) return candidatos[0]
  const ultimo = [...data.checkinDias].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))[0]
  return {
    id: data.checkinDias.some((d) => d.id === `dia:${date}`) ? `dia:${date}:${lista.id}` : `dia:${date}`,
    date, session_id: lista.session_id, titulo: null,
    valor_cheio: ultimo?.valor_cheio ?? VALOR_CHEIO_INICIAL, valor_com_checkin: ultimo?.valor_com_checkin ?? VALOR_COM_CHECKIN_INICIAL,
    created_at: new Date().toISOString(),
  }
}

export const diaJaExiste = (data: AppData, dia: CheckinDia) => data.checkinDias.some((d) => d.id === dia.id)

/**
 * Ao montar o play da lista: o dia criado pela lista antes do play (sem
 * play, mesma data, so um) passa a ser ligado a ele. Nulo = nada a ligar.
 */
export function diaParaLigar(data: AppData, lista: Lista, sessionId: string): CheckinDia | null {
  if (data.checkinDias.some((d) => d.session_id === sessionId)) return null
  const soltos = data.checkinDias.filter((d) => d.date === dataDoPlay(lista) && !d.session_id)
  return soltos.length === 1 ? { ...soltos[0], session_id: sessionId } : null
}

export function retrato(data: AppData, diaId: string, playerId: string): RetratoPagamento | null {
  const c = checkinDaAtletaNoDia(data, diaId, playerId)
  return c ? { checkin: c, pagamento: pagamentoDoCheckin(data, c.id) ?? null } : null
}

/** O palpite do modo: tem conta de passe (Wellhub/TotalPass) gravada e ativa → check-in. */
export function palpiteDaLista(data: AppData, playerId: string): CheckinModo {
  return data.checkinContas.some((c) => c.player_id === playerId && c.ativo) ? 'checkin' : 'integral'
}

/**
 * O lancamento confirmado do play: compareceu, pagamento confirmado e, no
 * modo check-in, check-in confirmado. Corrigir mantem o id e o resto do
 * lancamento (arena, conta, preco combinado, observacao).
 */
export function prepararPagamento(data: AppData, dia: CheckinDia, playerId: string, modo: CheckinModo, pago: number): RetratoPagamento & { pagamento: CheckinPagamento } {
  if (!Number.isFinite(pago) || pago < 0 || pago >= 100000) throw new Error('Confira o valor pago.')
  const antes = retrato(data, dia.id, playerId)
  const conta = contasDaAtleta(data, playerId).find((c) => c.local_padrao_id) ?? contasDaAtleta(data, playerId)[0]
  const arena = conta.local_padrao_id ?? data.checkinLocais.filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem)[0]?.id ?? null
  const checkin: Checkin = {
    id: idDoLancamento(dia.id, playerId), dia_id: dia.id, player_id: playerId,
    conta_id: conta.principal ? null : conta.id, local_id: null,
    credito_checkin: false, credito_de: null, compareceu: true, created_at: new Date().toISOString(),
    ...antes?.checkin,
    modo, checkin_confirmado: modo === 'checkin',
  }
  // integral nao tem arena nem check-in de credito (igual ao Lancar da aba Check-ins)
  if (modo === 'integral') Object.assign(checkin, { local_id: null, credito_de: null, credito_checkin: false })
  else if (!checkin.local_id) checkin.local_id = arena
  return {
    checkin,
    pagamento: { checkin_id: checkin.id, valor_devido: null, observacao: null, ...antes?.pagamento, valor_pago: centavos(pago), pagamento_confirmado: true },
  }
}

/** O que o lancamento deve no modo escolhido (regra do dia, ou o preco combinado). */
export function devidoNoModo(data: AppData, dia: CheckinDia, playerId: string, modo: CheckinModo): number {
  const r = prepararPagamento(data, dia, playerId, modo, 0)
  return valorDevido(r.checkin, dia, r.pagamento)
}

/**
 * O valor que ja vem no campo: o pago, se ja havia lancamento; senao o devido
 * menos o credito que ela trouxe (a mesma conta do Lancar da aba Check-ins).
 */
export function valorInicial(data: AppData, dia: CheckinDia, playerId: string, modo: CheckinModo): number {
  const antes = retrato(data, dia.id, playerId)
  if (antes?.pagamento) return antes.pagamento.valor_pago
  return centavos(Math.max(0, devidoNoModo(data, dia, playerId, modo) - creditoDisponivel(data, playerId, antes?.checkin.id)))
}
