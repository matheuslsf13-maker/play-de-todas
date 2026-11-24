import { categoriaDe } from './mensalidade'
import { checkinsDaFicha, dividaDaMensalidade, emDiaNaData, fichaDe } from './fichaDaMensalidade'
import { centavos, checkinDaAtletaNoDia, creditoDisponivel, extratoDaAtleta, formatarReais, pagamentoDoCheckin, palpiteDaConta, valorDevido } from './checkins'
import { dataDoPlay, type Lista } from './listaDePresenca'
import type { Acerto, AppData, Checkin, CheckinDia, CheckinModo, CheckinPagamento, ItemDaMensalidade, Player, PlaySession } from './types'

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
/** A mensalista atrasada (nao renovou, ou novembro sem o pago_mes) tambem paga o play como avulsa: o mesmo "pago" libera e acaba no Finalizar. */
export const pagaComoAvulsa = (p: Player) => categoriaDe(p) === 'avulsa' || categoriaDe(p) === 'mensalista'

export function pagoAvulsoDaLista(data: AppData, lista: Lista, p: Player, pago: boolean): Player | null {
  if (!pagaComoAvulsa(p) || Boolean(p.pago_avulso) === pago) return null
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

/**
 * PENDENTE (dono, 19/11): a avulsa que esta no play (ou na lista) e ainda nao pagou entra no dia sem pagamento,
 * como quando a Ingryd criava o dia e punha as meninas. Integral: com check-in gastaria cota e iria para o Excel
 * da arena um check-in que ninguem fez. O 💰 (ou o Lancar) troca o modo quando ela pagar.
 */
export function lancamentoPendente(dia: CheckinDia, playerId: string, substitui: string | null = null): Checkin {
  return {
    id: idDoLancamento(dia.id, playerId), dia_id: dia.id, player_id: playerId, conta_id: null, local_id: null,
    modo: 'integral', compareceu: true, checkin_confirmado: false, credito_checkin: false, credito_de: null,
    ...(substitui ? { substitui } : {}), created_at: new Date().toISOString(),
  }
}

/** Pendente automatica que ainda pode sair sozinha: id do 💰, veio, sem pagamento e sem divida paga por ele. */
const pendenteSolta = (data: AppData, c: Checkin) =>
  c.id === idDoLancamento(c.dia_id, c.player_id) && c.compareceu && !pagamentoDoCheckin(data, c.id) &&
  !(data.checkinAcertos ?? []).some((a) => a.id.startsWith(`divida:${c.id}:`))

/**
 * O DIA DA LISTA ANDA COM ELA (dono, 19/11): a 1a avulsa confirmada cria o dia de cobranca (so mensalistas, nada a
 * cobrar, nenhum dia) e cada avulsa confirmada entra pendente. Quem sai das confirmadas (saiu, virou suplente,
 * renovou a mensalidade) sai do dia se ainda nao pagou nada. So antes do play montado: dali o play manda.
 * A avulsa com o "pago" de Meninas marcado pagou por fora e nao entra como devedora.
 */
export function pendentesDaLista(data: AppData, lista: Lista, confirmadas: { player_id: string | null; substitui?: string | null }[]): { dia: CheckinDia | null; gravar: Checkin[]; apagar: string[] } {
  const nada = { dia: null, gravar: [], apagar: [] }
  // A copia da lista pode estar velha (session_id ainda nulo logo depois de montar): play na data = ja montado.
  // Em 23/11 isso criou um 2o dia "dia:<data>:<lista>" um minuto depois do play.
  if (lista.session_id || data.sessions.some((s) => s.date === dataDoPlay(lista))) return nada
  let dia: CheckinDia
  try { dia = diaDaLista(data, lista) } catch { return nada }
  const cobra = new Map<string, string | null>()
  for (const n of confirmadas) {
    const p = n.player_id ? data.players.find((x) => x.id === n.player_id) : undefined
    const t = tipoNaLista(data, p, lista)
    if (p && (t === 'avulsa' || t === 'mensalista-atrasada')) cobra.set(p.id, n.substitui ?? null)
  }
  const existe = diaJaExiste(data, dia)
  const gravar = [...cobra].filter(([id]) => !checkinDaAtletaNoDia(data, dia.id, id) && !data.players.find((p) => p.id === id)?.pago_avulso)
    .map(([id, sub]) => lancamentoPendente(dia, id, sub))
  const apagar = existe ? data.checkins.filter((c) => c.dia_id === dia.id && !cobra.has(c.player_id) && pendenteSolta(data, c)).map((c) => c.id) : []
  return { dia: !existe && gravar.length ? dia : null, gravar, apagar }
}

/**
 * Quem joga o play sem pagamento confirmado (criar o play ou o Entra / sai) entra no dia do play como pendente
 * (dono, 19/11). O dia solto da data (o da lista, ou um feito na mao) passa a ser deste play. `ids` = so quem deve.
 */
export function pendentesNoPlay(data: AppData, sessionId: string, date: string, ids: string[], substitui: string | null = null): { dia: CheckinDia | null; gravar: Checkin[] } {
  if (ids.length === 0) return { dia: null, gravar: [] }
  const achado = diaDoPlay(data, sessionId, date)
  const dia = achado.session_id ? achado : { ...achado, session_id: sessionId }
  const gravar = ids.filter((id) => !checkinDaAtletaNoDia(data, dia.id, id)).map((id) => lancamentoPendente(dia, id, substitui))
  return { dia: !diaJaExiste(data, achado) || dia !== achado ? dia : null, gravar }
}

/** Na lista do dia (Financeiro › Dias): sem pagamento nenhum = nao pago (vermelho); lancado sem confirmar = verificar. */
export const naoPago = (data: AppData, c: Checkin) => c.compareceu && !pagamentoDoCheckin(data, c.id)

export function retrato(data: AppData, diaId: string, playerId: string): RetratoPagamento | null {
  const c = checkinDaAtletaNoDia(data, diaId, playerId)
  return c ? { checkin: c, pagamento: pagamentoDoCheckin(data, c.id) ?? null } : null
}

/** O palpite do modo: tem conta de passe (Wellhub/TotalPass) gravada e ativa → check-in. */
export function palpiteDaLista(data: AppData, playerId: string): CheckinModo {
  return data.checkinContas.some((c) => c.player_id === playerId && c.ativo) ? 'checkin' : 'integral'
}

export type ContaDoCheckin = {
  contaId: string | null
  localId: string | null
  /** O play de hoje pago com um check-in de credito (dono, 18/11): leva conta e arena dele, sem gastar cota. Nulo tira; ausente mantem. */
  creditoDe?: string | null
  /** O dia em que ela fez o check-in (script 42): vazio/nulo = o dia do play. */
  dataCheckin?: string | null
}

/**
 * A conta e a arena que a janela mostra marcadas: as do lancamento que ja
 * existe; senao o mesmo palpite do Lancar da aba Financeiro.
 */
export function contaInicial(data: AppData, dia: CheckinDia, playerId: string): ContaDoCheckin {
  const c = retrato(data, dia.id, playerId)?.checkin
  if (c?.modo === 'checkin' && c.local_id) return { contaId: c.conta_id, localId: c.local_id, dataCheckin: c.data_checkin ?? null }
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
  /** O que a organizadora marcou como confirmado (dono, 19/11); ausente = tudo confirmado, como antes. */
  confirmado: { pagamento: boolean; checkin: boolean } = { pagamento: true, checkin: true },
): RetratoPagamento & { pagamento: CheckinPagamento } {
  if (!Number.isFinite(pago) || pago < 0 || pago >= 100000) throw new Error('Confira o valor pago.')
  const antes = retrato(data, dia.id, playerId)
  const checkin: Checkin = {
    id: idDoLancamento(dia.id, playerId), dia_id: dia.id, player_id: playerId,
    conta_id: null, local_id: null, credito_checkin: false, credito_de: null, compareceu: true, created_at: new Date().toISOString(),
    ...antes?.checkin,
    modo, checkin_confirmado: modo === 'checkin' && confirmado.checkin,
  }
  if (conta.creditoDe !== undefined && modo === 'checkin') {
    const cred = conta.creditoDe ? data.checkins.find((c) => c.id === conta.creditoDe) : undefined
    Object.assign(checkin, cred ? { credito_de: cred.id, conta_id: cred.conta_id, local_id: cred.local_id } : { credito_de: null })
  }
  // integral nao tem arena nem check-in de credito (igual ao Lancar da aba Financeiro)
  if (modo === 'integral') Object.assign(checkin, { local_id: null, credito_de: null, credito_checkin: false, data_checkin: null })
  // check-in de credito leva a conta e a arena do credito (sem check-in novo, sem data); senao vale a escolhida
  else if (checkin.credito_de) checkin.data_checkin = null
  else if (conta.dataCheckin !== undefined) Object.assign(checkin, { conta_id: conta.contaId, local_id: conta.localId, data_checkin: conta.dataCheckin && conta.dataCheckin !== dia.date ? conta.dataCheckin : null })
  else Object.assign(checkin, { conta_id: conta.contaId, local_id: conta.localId })
  return {
    checkin,
    pagamento: { checkin_id: checkin.id, valor_devido: null, observacao: null, ...antes?.pagamento, valor_pago: centavos(pago), pagamento_confirmado: confirmado.pagamento },
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

/**
 * A CONTA DO 💰 (dono, 18/11): o play de hoje, o credito que ela tem (sai primeiro) e a divida de antes. A
 * organizadora escolhe cobrar so o play (`soPlay`) ou o play com o atrasado (`comAtrasado`). Credito e divida
 * nunca vem juntos: os dois saem do mesmo saldo.
 */
export type OrigemDoSaldo = ({ date: string; devido: number; pago: number } | { date: string; acerto: number }) & {
  /** O que ainda vale desse lancamento (com sinal: + credito, - divida). */
  resta: number
}

/**
 * De onde veio o credito ou a divida de hoje: so os lancamentos que AINDA valem (dono, 18/11). O que entra do outro
 * lado quita os mais antigos primeiro: credito de 01/11 gasto em 03/11 some, e fica so o de onde veio o credito de agora.
 * O lancamento que esta sendo corrigido fica de fora, como em `saldoAntesDe`.
 */
export function origemDoSaldo(data: AppData, playerId: string, semCheckinId?: string): OrigemDoSaldo[] {
  let abertos: OrigemDoSaldo[] = []
  for (const m of extratoDaAtleta(data, playerId)) {
    if (m.tipo === 'lancamento' && m.checkin.id === semCheckinId) continue
    let efeito = m.tipo === 'acerto' ? m.acerto.valor : centavos(m.pago - m.devido)
    // do outro lado: quita os abertos, do mais antigo para o mais novo
    while (efeito !== 0 && abertos.length > 0 && Math.sign(abertos[0].resta) !== Math.sign(efeito)) {
      const usa = Math.min(Math.abs(efeito), Math.abs(abertos[0].resta)) * Math.sign(efeito)
      abertos[0] = { ...abertos[0], resta: centavos(abertos[0].resta + usa) }
      efeito = centavos(efeito - usa)
      if (abertos[0].resta === 0) abertos = abertos.slice(1)
    }
    if (efeito !== 0) abertos.push(m.tipo === 'acerto' ? { date: m.date, acerto: m.acerto.valor, resta: efeito } : { date: m.date, devido: m.devido, pago: m.pago, resta: efeito })
  }
  return abertos
}

export function contaNoPlay(devido: number, credito: number, divida: number) {
  const doCredito = centavos(Math.min(credito, devido))
  const soPlay = centavos(devido - doCredito)
  return { doCredito, soPlay, comAtrasado: centavos(soPlay + divida) }
}

/** O saldo dela depois do lancamento: positivo = credito para o proximo play, negativo = fica devendo. */
export const saldoDepois = (credito: number, divida: number, devido: number, pago: number) => centavos(credito - divida + pago - devido)

// ---------------------------------------------------------------- dividas pagas no 💰 (dono, 18/11)

/** Um check-in que paga divida: dia, conta e arena; ou um check-in de credito (`credito`). */
export type CheckinDaDivida = { date: string; contaId: string | null; localId: string | null; credito?: string }

/** Tudo o que o 💰 gravou para pagar dividas junto com este lancamento: o id comeca com `divida:<lancamento>:`. */
export const prefixoDaDivida = (checkinId: string) => `divida:${checkinId}:`
export function gravadosDaDivida(data: AppData, checkinId: string) {
  const p = prefixoDaDivida(checkinId)
  return {
    itens: data.mensalidadeItens.filter((i) => i.id.startsWith(p)),
    acertos: (data.checkinAcertos ?? []).filter((a) => a.id.startsWith(p)),
  }
}

/**
 * PAGAR DIVIDAS NO 💰 (dono, 18/11). A divida da mensalidade (ex-mensalista que nao fechou os check-ins) vem
 * primeiro, a mais antiga antes: cada check-in vira um check-in daquela ficha, e o dinheiro (`pixDaMensalidade`)
 * um Pix nela. O que sobra dos check-ins paga a divida dos plays: um acerto de `valorDoCheckin` cada, com conta e
 * arena (entra na cota e no relatorio da arena). O check-in de credito so paga divida de play (a ficha nao guarda
 * credito) e nao gasta cota. `semCheckinId`: o lancamento sendo corrigido (o que ele ja gravou nao conta).
 */
export function pagarDividas(
  data: AppData, playerId: string, checkinId: string, date: string,
  checkins: CheckinDaDivida[], valorDoCheckin: number, pixDaMensalidade: number,
): { itens: ItemDaMensalidade[]; acertos: Acerto[] } {
  const p = prefixoDaDivida(checkinId)
  const semAntigos = { ...data, mensalidadeItens: data.mensalidadeItens.filter((i) => !i.id.startsWith(p)), checkinAcertos: (data.checkinAcertos ?? []).filter((a) => !a.id.startsWith(p)) }
  const agora = new Date().toISOString()
  const itens: ItemDaMensalidade[] = []
  const acertos: Acerto[] = []
  const fila = [...checkins.filter((c) => !c.credito), ...checkins.filter((c) => c.credito)]
  let pix = centavos(pixDaMensalidade)
  for (const d of dividaDaMensalidade(semAntigos, playerId, date).porMes) {
    const f = fichaDe(semAntigos, playerId, d.mes, date)
    let falta = d.falta
    let vagas = Math.max(0, f.max_checkins - checkinsDaFicha(f))
    while (falta > 0 && vagas > 0 && fila[0] && !fila[0].credito) {
      const c = fila.shift()!
      itens.push({ id: `${p}m${itens.length}`, player_id: playerId, mes: d.mes, tipo: 'checkin', date: c.date, valor: null, conta_id: c.contaId, local_id: c.localId, confirmado: true, observacao: 'dívida paga no 💰 da lista', created_at: agora })
      falta = centavos(falta - f.valor_checkin)
      vagas--
    }
    const v = centavos(Math.min(pix, Math.max(0, falta)))
    if (v > 0) {
      itens.push({ id: `${p}pix:${d.mes}`, player_id: playerId, mes: d.mes, tipo: 'dinheiro', date, valor: v, conta_id: null, local_id: null, confirmado: true, observacao: 'dívida paga no 💰 da lista', created_at: agora })
      pix = centavos(pix - v)
    }
  }
  fila.forEach((c, i) => {
    acertos.push({
      id: `${p}${i}`, player_id: playerId, date: c.date, valor: centavos(valorDoCheckin), dinheiro: false,
      descricao: c.credito ? 'check-in de crédito para a dívida' : 'check-in para a dívida', created_at: agora,
      conta_id: c.credito ? null : c.contaId, local_id: c.credito ? null : c.localId, credito_de: c.credito ?? null,
    })
  })
  return { itens, acertos }
}

// ---------------------------------------------------------------- desfazer (apagar lista ou play)

/** O que sai da aba Financeiro e do cadastro ao apagar a lista ou o play (nada disso e gravado aqui). */
/** `itens`: itens da ficha da mensalidade (a compensacao da falta avisada, `falta:...`) que saem junto. */
export type Desfazer = { checkins: string[]; dias: string[]; players: Player[]; itens?: string[]; acertos?: string[] }

const somar = (a: Desfazer, b: Desfazer): Desfazer => ({
  checkins: [...new Set([...a.checkins, ...b.checkins])],
  dias: [...new Set([...a.dias, ...b.dias])],
  players: [...a.players, ...b.players.filter((p) => !a.players.some((x) => x.id === p.id))],
  itens: [...new Set([...(a.itens ?? []), ...(b.itens ?? [])])],
  acertos: [...new Set([...(a.acertos ?? []), ...(b.acertos ?? [])])],
})

/** As dividas pagas no 💰 por estes lancamentos (check-ins e Pix da mensalidade, acertos) saem junto. */
function dividasDosLancamentos(data: AppData, checkinIds: string[]) {
  const g = checkinIds.map((id) => gravadosDaDivida(data, id))
  return { itens: g.flatMap((x) => x.itens.map((i) => i.id)), acertos: g.flatMap((x) => x.acertos.map((a) => a.id)) }
}

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
    // a compensacao da falta avisada nesta lista (R$ 25 de credito ou um check-in a menos) some com ela
    itens: [...data.mensalidadeItens.filter((i) => i.id.startsWith(`falta:${lista.id}:`)).map((i) => i.id), ...dividasDosLancamentos(data, checkins.map((c) => c.id)).itens],
    acertos: dividasDosLancamentos(data, checkins.map((c) => c.id)).acertos,
    checkins: checkins.map((c) => c.id),
    dias: dias
      // o 💰 cria sem titulo: dia com titulo foi feito (ou editado) na aba Financeiro e fica
      .filter((d) => checkins.some((c) => c.dia_id === d.id) && criadosPeloCofre.includes(d.id) && !d.titulo)
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
    if (!pagaComoAvulsa(p)) return []
    if (peloCofre.has(p.id)) return !finalizado && p.pago_avulso ? [{ ...p, pago_avulso: false }] : []
    return gastos.has(p.id) && !p.pago_avulso && !jogouDepois(p.id) ? [{ ...p, pago_avulso: true }] : []
  })
  const itens = data.mensalidadeItens.filter((i) => i.id.startsWith(`falta:play:${s.id}:`)).map((i) => i.id)
  const dividas = dividasDosLancamentos(data, doDia.map((c) => c.id))
  const doPlay: Desfazer = { checkins: doDia.map((c) => c.id), dias: dias.map((d) => d.id), players, itens: [...itens, ...dividas.itens], acertos: dividas.acertos }
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
