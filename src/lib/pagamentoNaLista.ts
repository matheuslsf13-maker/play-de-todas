import { categoriaDe } from './mensalidade'
import { emDiaNaData, MES_INICIAL } from './fichaDaMensalidade'
import { centavos, checkinDaAtletaNoDia, creditoDisponivel, formatarReais, pagamentoDoCheckin, palpiteDaConta, valorDevido } from './checkins'
import { dataDoPlay, type Lista } from './listaDePresenca'
import type { AppData, Checkin, CheckinDia, CheckinModo, CheckinPagamento, Player, PlaySession } from './types'
import { monthOf } from './types'

/*
 * 💰 NA LISTA: a organizadora lanca o pagamento da avulsa direto da lista de
 * presenca. Nao ha dinheiro novo aqui: grava o mesmo par checkin +
 * checkin_pagamentos da aba Financeiro (pelas mesmas acoes da store), e o
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
export function tipoNaLista(data: AppData, p: Player | undefined, lista: Lista) {
  if (!p) return 'vincular' as const
  const c = categoriaDe(p)
  if (c === 'mensalista' && !emDiaNaData(data, p, dataDoPlay(lista))) return 'mensalista-atrasada' as const
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
  // desde dezembro/2026 a mensalista que nao renovou tambem paga o play como avulsa
  const comoAvulsa = categoriaDe(p) === 'avulsa' || (categoriaDe(p) === 'mensalista' && monthOf(dataDoPlay(lista)) >= MES_INICIAL)
  if (!comoAvulsa || Boolean(p.pago_avulso) === pago) return null
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
 * play, com os valores do ultimo dia (como o "Novo dia" da aba Financeiro).
 */
export function diaDaLista(data: AppData, lista: Lista): CheckinDia {
  return diaDoPlay(data, lista.session_id, dataDoPlay(lista), lista.id)
}

/** O dia de check-in de um play (com ou sem lista): o ligado a ele, o solto da data, ou um novo. */
export function diaDoPlay(data: AppData, sessionId: string | null, date: string, sufixo = 'play'): CheckinDia {
  const ligados = sessionId ? data.checkinDias.filter((d) => d.session_id === sessionId) : []
  const candidatos = ligados.length ? ligados : data.checkinDias.filter((d) => d.date === date && !d.session_id)
  if (candidatos.length > 1) throw new Error('Há mais de um dia possível. Ligue o dia correto ao play na aba Financeiro.')
  if (candidatos[0]) return candidatos[0]
  const ultimo = [...data.checkinDias].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))[0]
  return {
    id: data.checkinDias.some((d) => d.id === `dia:${date}`) ? `dia:${date}:${sufixo}` : `dia:${date}`,
    date, session_id: sessionId, titulo: null,
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
 * existe; senao o mesmo palpite do Lancar da aba Financeiro.
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
  // integral nao tem arena nem check-in de credito (igual ao Lancar da aba Financeiro)
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
 * menos o credito que ela trouxe (a mesma conta do Lancar da aba Financeiro).
 */
export function valorInicial(data: AppData, dia: CheckinDia, playerId: string, modo: CheckinModo): number {
  const antes = retrato(data, dia.id, playerId)
  if (antes?.pagamento) return antes.pagamento.valor_pago
  return centavos(Math.max(0, devidoNoModo(data, dia, playerId, modo) - creditoDisponivel(data, playerId, antes?.checkin.id)))
}

// ---------------------------------------------------------------- desfazer (apagar lista ou play)

/** O que sai da aba Financeiro e do cadastro ao apagar a lista ou o play (nada disso e gravado aqui). */
export type Desfazer = { checkins: string[]; dias: string[]; players: Player[] }

const somar = (a: Desfazer, b: Desfazer): Desfazer => ({
  checkins: [...new Set([...a.checkins, ...b.checkins])],
  dias: [...new Set([...a.dias, ...b.dias])],
  players: [...a.players, ...b.players.filter((p) => !a.players.some((x) => x.id === p.id))],
})

/**
 * O que o 💰 desta lista lancou: os lancamentos com o id do 💰 (`idDoLancamento`;
 * um lancamento da aba Financeiro que o 💰 so corrigiu guarda o id dele e fica), o
 * dia que o 💰 criou se ele ficar vazio, e o "pago" da avulsa que o 💰 marcou
 * (so enquanto o play nao foi finalizado, como em `pagoAvulsoDaLista`).
 */
export function lancadosPelaLista(data: AppData, lista: Lista, playerIds: string[]): Desfazer {
  const date = dataDoPlay(lista)
  const dias = data.checkinDias.filter((d) => d.date === date && (lista.session_id ? d.session_id === lista.session_id : !d.session_id))
  const quem = new Set(playerIds)
  const checkins = data.checkins.filter(
    (c) => dias.some((d) => d.id === c.dia_id) && quem.has(c.player_id) && c.id === idDoLancamento(c.dia_id, c.player_id),
  )
  const sai = new Set(checkins.map((c) => c.id))
  const criadosPeloCofre = [`dia:${date}`, `dia:${date}:${lista.id}`]
  return {
    checkins: checkins.map((c) => c.id),
    dias: dias
      .filter((d) => checkins.some((c) => c.dia_id === d.id) && criadosPeloCofre.includes(d.id))
      .filter((d) => data.checkins.every((c) => c.dia_id !== d.id || sai.has(c.id)))
      .map((d) => d.id),
    players: [...new Set(checkins.map((c) => c.player_id))].flatMap((id) => {
      const p = data.players.find((x) => x.id === id)
      const novo = p ? pagoAvulsoDaLista(data, lista, p, false) : null
      return novo ? [novo] : []
    }),
  }
}

/** As avulsas que o Finalizar deste play deixou sem credito (`consumirAvulsos`), gravado no diario. */
export function creditosGastos(s: PlaySession): string[] {
  return (s.eventos ?? []).flatMap((e) => (e.tipo === 'creditos' ? (e.ids ?? []) : []))
}

/**
 * APAGAR O PLAY desfaz o que ele causou no financeiro (dono, 07/11): o dia de
 * check-in ligado a ele sai inteiro (lancamentos e pagamentos vao junto); a
 * avulsa que pagou pelo 💰 volta ao "pago" de antes (o pagamento sumiu); a que
 * pagou por fora tem o credito gasto no Finalizar devolvido -- se nao jogou outro
 * play finalizado depois (esse ja usaria o credito). Play finalizado antes de o
 * diario guardar os creditos (07/11) nao tem como saber quem gastou: nada volta.
 * `lista` = a lista ligada ao play, com quem esta nela (o 💰 de antes do play montado).
 */
export function desfazerDoPlay(data: AppData, s: PlaySession, lista?: { lista: Lista; playerIds: string[] }): Desfazer {
  const dias = data.checkinDias.filter((d) => d.session_id === s.id)
  const doDia = data.checkins.filter((c) => dias.some((d) => d.id === c.dia_id))
  const peloCofre = new Set(
    doDia.filter((c) => c.id === idDoLancamento(c.dia_id, c.player_id) && pagamentoDoCheckin(data, c.id)?.pagamento_confirmado).map((c) => c.player_id),
  )
  const gastos = new Set(creditosGastos(s))
  const finalizado = s.status === 'finished' || gastos.size > 0 || (s.eventos ?? []).some((e) => e.tipo === 'reabrir')
  const jogouDepois = (id: string) =>
    data.sessions.some((x) => x.id !== s.id && x.status === 'finished' && x.date > s.date && x.player_ids.includes(id))
  const players = data.players.flatMap((p) => {
    if (categoriaDe(p) !== 'avulsa') return []
    if (peloCofre.has(p.id)) return !finalizado && p.pago_avulso ? [{ ...p, pago_avulso: false }] : []
    return gastos.has(p.id) && !p.pago_avulso && !jogouDepois(p.id) ? [{ ...p, pago_avulso: true }] : []
  })
  const doPlay: Desfazer = { checkins: doDia.map((c) => c.id), dias: dias.map((d) => d.id), players }
  // o 💰 lancado num dia ainda sem play que nao foi ligado ao montar (havia dois dias soltos na data)
  return lista ? somar(doPlay, lancadosPelaLista(data, { ...lista.lista, session_id: null }, lista.playerIds)) : doPlay
}

/** Uma linha para a janela de apagar: "3 pagamentos lançados ... (R$ 75,00)". Nulo sem nada. */
export function avisoDoFinanceiro(data: AppData, d: Desfazer, peloCofre: boolean): string | null {
  if (d.checkins.length === 0 && d.dias.length === 0) return null
  const pago = d.checkins.reduce((t, id) => t + (pagamentoDoCheckin(data, id)?.valor_pago ?? 0), 0)
  const n = d.checkins.length
  const dias = d.dias.map((id) => data.checkinDias.find((x) => x.id === id)?.date).filter(Boolean).map((x) => `${x!.slice(8, 10)}/${x!.slice(5, 7)}`)
  const quais = peloCofre ? `${n === 1 ? 'O pagamento lançado' : `Os ${n} pagamentos lançados`} pelo 💰 desta lista` : `${n === 1 ? 'O lançamento' : `Os ${n} lançamentos`} do dia deste play`
  const valor = pago > 0 ? ` (${formatarReais(pago)} pagos)` : ''
  const dia = dias.length ? `, junto com o dia ${dias.join(', ')}` : ''
  return n > 0 ? `${quais}${valor} ${n === 1 ? 'sai' : 'saem'} da aba Financeiro${dia}.` : `O dia ${dias.join(', ')} sai da aba Financeiro.`
}
