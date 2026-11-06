import { categoriaDe, mensalistaEmDiaNoPlay } from './mensalidade'
import { centavos, checkinDaAtletaNoDia, creditoDisponivel, pagamentoDoCheckin, palpiteDaConta, valorDevido } from './checkins'
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

/**
 * Quem a lista cobra. Sem cadastro: 'vincular'. Convidada e isenta nao pagam.
 * Mensalista em dia no play (mes pago, ou ate o dia 5 com o anterior pago) nao
 * e cobrada; atrasada e cobrada como avulsa naquele play ('mensalista-atrasada').
 */
export function tipoNaLista(p: Player | undefined, lista: Lista) {
  if (!p) return 'vincular' as const
  const c = categoriaDe(p)
  if (c === 'mensalista' && !mensalistaEmDiaNoPlay(p, dataDoPlay(lista))) return 'mensalista-atrasada' as const
  return c
}

/**
 * O "pago" da avulsa na aba Meninas (`pago_avulso`, o mesmo do confirmar
 * pagamento) acompanha o 💰: marca ao lancar, desmarca ao desfazer. So para a
 * avulsa (a mensalista atrasada nao ganha mes pago por pagar um play) e so
 * enquanto o play da lista nao foi finalizado: finalizar gasta o credito
 * (consumirAvulsos), e mexer depois daria ou tiraria o credito do PROXIMO play.
 * Nulo = nada a gravar.
 */
export function pagoAvulsoDaLista(data: AppData, lista: Lista, p: Player, pago: boolean): Player | null {
  if (categoriaDe(p) !== 'avulsa' || Boolean(p.pago_avulso) === pago) return null
  const play = lista.session_id ? data.sessions.find((s) => s.id === lista.session_id) : undefined
  // reaberto para corrigir: o 2o Finalizar nao gasta de novo, entao tambem nao mexe
  if (play && (play.status === 'finished' || (play.eventos ?? []).some((e) => e.tipo === 'reabrir'))) return null
  return { ...p, pago_avulso: pago }
}

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

export type ContaDoCheckin = { contaId: string | null; localId: string | null }

/**
 * A conta e a arena que a janela mostra marcadas: as do lancamento que ja
 * existe; senao o mesmo palpite do Lancar da aba Check-ins.
 */
export function contaInicial(data: AppData, dia: CheckinDia, playerId: string): ContaDoCheckin {
  const c = retrato(data, dia.id, playerId)?.checkin
  if (c?.modo === 'checkin' && c.local_id) return { contaId: c.conta_id, localId: c.local_id }
  const p = palpiteDaConta(data, playerId, dia)
  return { contaId: p.contaId, localId: p.localId }
}

/**
 * O lancamento confirmado do play: compareceu, pagamento confirmado e, no
 * modo check-in, check-in confirmado na conta e arena escolhidas (conta nula
 * = a principal). Corrigir mantem o id e o resto (preco combinado, observacao).
 */
export function prepararPagamento(
  data: AppData, dia: CheckinDia, playerId: string, modo: CheckinModo, pago: number,
  conta: ContaDoCheckin = contaInicial(data, dia, playerId),
): RetratoPagamento & { pagamento: CheckinPagamento } {
  if (!Number.isFinite(pago) || pago < 0 || pago >= 100000) throw new Error('Confira o valor pago.')
  const antes = retrato(data, dia.id, playerId)
  const checkin: Checkin = {
    id: idDoLancamento(dia.id, playerId), dia_id: dia.id, player_id: playerId,
    conta_id: null, local_id: null, credito_checkin: false, credito_de: null, compareceu: true, created_at: new Date().toISOString(),
    ...antes?.checkin,
    modo, checkin_confirmado: modo === 'checkin',
  }
  // integral nao tem arena nem check-in de credito (igual ao Lancar da aba Check-ins)
  if (modo === 'integral') Object.assign(checkin, { local_id: null, credito_de: null, credito_checkin: false })
  // check-in de credito leva a conta e a arena do credito; senao vale a escolhida
  else if (!checkin.credito_de) Object.assign(checkin, { conta_id: conta.contaId, local_id: conta.localId })
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
