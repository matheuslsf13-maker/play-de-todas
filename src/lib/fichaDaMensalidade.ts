import { categoriaDe, mensalistaEmDiaNoPlay } from './mensalidade'
import { saldoDosPlaysAntesDe } from './checkins'
import { monthOf, todayISO, type AppData, type ItemDaMensalidade, type Player } from './types'

/*
 * A MENSALIDADE NOVA (dono, 07/11/2026; D47). Tudo derivado das fichas e dos itens: nada e
 * gravado na virada do dia 6, como o `pago_mes` na virada do mes.
 *
 *  - A mensalidade do mes M vale 180: integral em dinheiro, ou 80 + 4 check-ins direcionados
 *    a ela (cada check-in vale 25; check-in que falta pode virar 25 em dinheiro).
 *  - RENOVAR = pagar a parte em dinheiro (80; ou os 180) ATE O DIA 5 de M (`vencimento`).
 *    Renovada, ela esta em dia o mes todo.
 *  - Os CHECK-INS de M podem ser feitos ao longo do mes: o prazo e o dia 5 de M+1
 *    (`prazoDosCheckins`), junto com a renovacao seguinte.
 *  - Dia 6: nao renovou -> joga como avulsa (e perde a vaga, vagasDeMensalista.ts), SEM divida.
 *    Renovou M mas nao fechou os check-ins de M-1 -> deve o que falta e joga como avulsa ate quitar.
 *  - A nova mensalista que pega uma vaga no meio do mes comeca a mensalidade DO MES ao pagar
 *    (80 ou 180) e faz os check-ins ate o dia 5 do seguinte.
 *  - Ate novembro/2026 vale a regra antiga (`pago_mes`); check-in de novembro conta para dezembro.
 */

/** A primeira mensalidade da regra nova. */
export const MES_INICIAL = '2026-12'
export const MENSALIDADE_PADRAO = { valor_cheio: 180, valor_checkin: 25, max_checkins: 4 }

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}
export function proximoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}
/** Ultimo dia para RENOVAR a mensalidade do mes (pagar os 80). */
export const vencimento = (mes: string) => `${mes}-05`
/** Ultimo dia para fechar os check-ins da mensalidade do mes: o dia 5 do mes seguinte. */
export const prazoDosCheckins = (mes: string) => `${proximoMes(mes)}-05`
const dia = (date: string) => Number(date.slice(8, 10))
/** A mensalidade "do momento" numa data: a do mes (nunca antes da regra nova). */
export const mensalidadeDaData = (date: string) => (monthOf(date) < MES_INICIAL ? MES_INICIAL : monthOf(date))

export const idDaFicha = (playerId: string, mes: string) => `mensalidade:${playerId}:${mes}`

export type Ficha = {
  player_id: string
  mes: string
  valor_cheio: number
  valor_checkin: number
  max_checkins: number
  itens: ItemDaMensalidade[]
}

/** A ficha com o credito usado na divida (automatico, no dia 6). E a que todo o app le. */
export function fichaDe(data: AppData, playerId: string, mes: string): Ficha {
  const f = fichaBruta(data, playerId, mes)
  const uso = usosDoCreditoNaDivida(data, playerId).find((u) => u.mes === mes)
  return uso ? { ...f, itens: [...f.itens, itemDoUso(playerId, uso)] } : f
}

/** So os itens gravados (sem o credito automatico): a base das contas do credito, sem dar voltas. */
export function fichaBruta(data: AppData, playerId: string, mes: string): Ficha {
  const cab = data.mensalidades.find((m) => m.player_id === playerId && m.mes === mes)
  return {
    player_id: playerId,
    mes,
    valor_cheio: cab?.valor_cheio ?? MENSALIDADE_PADRAO.valor_cheio,
    valor_checkin: cab?.valor_checkin ?? MENSALIDADE_PADRAO.valor_checkin,
    max_checkins: cab?.max_checkins ?? MENSALIDADE_PADRAO.max_checkins,
    itens: data.mensalidadeItens.filter((i) => i.player_id === playerId && i.mes === mes),
  }
}

const ate = (f: Ficha, data?: string) => (data ? f.itens.filter((i) => i.date <= data) : f.itens)
const centavos = (n: number) => Math.round(n * 100) / 100

/** Check-ins da ficha (ate a data, se dada). */
export const checkinsDaFicha = (f: Ficha, data?: string) => ate(f, data).filter((i) => i.tipo === 'checkin').length

/** Dinheiro que entrou na ficha (ate a data): e o que vai para a receita. */
export const dinheiroDaFicha = (f: Ficha, data?: string) =>
  centavos(ate(f, data).filter((i) => i.tipo === 'dinheiro').reduce((s, i) => s + (i.valor ?? 0), 0))

/** Quanto a ficha ja vale: dinheiro + abatimentos + check-ins (no maximo `max_checkins`). */
export function valorDaFicha(f: Ficha, data?: string): number {
  const abat = ate(f, data).filter((i) => i.tipo === 'abatimento').reduce((s, i) => s + (i.valor ?? 0), 0)
  return centavos(dinheiroDaFicha(f, data) + abat + f.valor_checkin * Math.min(checkinsDaFicha(f, data), f.max_checkins))
}

export const faltaDaFicha = (f: Ficha, data?: string) => Math.max(0, centavos(f.valor_cheio - valorDaFicha(f, data)))
/** Renovou: entrou dinheiro (o valor inicial). So check-in, sem pagar, nao inicia (e nao gera divida). */
export const iniciada = (f: Ficha, data?: string) => dinheiroDaFicha(f, data) > 0
export const quitada = (f: Ficha, data?: string) => f.itens.length > 0 && faltaDaFicha(f, data) === 0
/** A parte em dinheiro que renova (80 no padrao): o cheio menos o que os check-ins valem. */
export const valorParaRenovar = (f: Ficha) => centavos(f.valor_cheio - f.max_checkins * f.valor_checkin)
/** Renovou: o dinheiro (e abatimentos, como o credito de uma falta avisada) cobre a parte que renova. */
export function renovada(f: Ficha, data?: string): boolean {
  const abat = ate(f, data).filter((i) => i.tipo === 'abatimento').reduce((s, i) => s + (i.valor ?? 0), 0)
  return quitada(f, data) || (f.itens.length > 0 && centavos(dinheiroDaFicha(f, data) + abat) >= valorParaRenovar(f))
}

/** Os meses (da regra nova) em que a atleta tem ficha ou item. */
function mesesDaAtleta(data: AppData, playerId: string): string[] {
  const s = new Set<string>()
  for (const m of data.mensalidades) if (m.player_id === playerId && m.mes >= MES_INICIAL) s.add(m.mes)
  for (const i of data.mensalidadeItens) if (i.player_id === playerId && i.mes >= MES_INICIAL) s.add(i.mes)
  return [...s].sort()
}

/**
 * A DIVIDA DA MENSALIDADE na data: o que falta das fichas RENOVADAS cujo prazo dos check-ins
 * (dia 5 do mes seguinte) ja passou. Separada do saldo dos plays (dono, 07/11). Dinheiro pago sem
 * renovar nao gera divida: vira credito (`creditoDaMensalidade`).
 */
export function dividaDaMensalidade(data: AppData, playerId: string, hoje: string): { total: number; porMes: { mes: string; falta: number }[] } {
  const porMes: { mes: string; falta: number }[] = []
  for (const mes of mesesDaAtleta(data, playerId)) {
    if (prazoDosCheckins(mes) >= hoje) continue
    const f = fichaDe(data, playerId, mes)
    if (!renovada(f, hoje)) continue
    const falta = faltaDaFicha(f, hoje)
    if (falta > 0) porMes.push({ mes, falta })
  }
  return { total: centavos(porMes.reduce((s, x) => s + x.falta, 0)), porMes }
}

/**
 * CREDITO DA MENSALIDADE (dono, 07/11): dinheiro que entrou numa mensalidade que NAO renovou (passou o
 * dia 5 sem completar os 80). A Ingryd devolve (apaga o Pix) ou ele vira credito no saldo dos plays
 * (`acertosDaMensalidade` em checkins.ts): os avulsos descontam dele, e na rematricula o que sobrou
 * completa os 80 (`contaDaRenovacao`). A receita fica no mes em que o Pix entrou.
 */
export function creditoDaMensalidade(data: AppData, playerId: string, hoje: string): { total: number; porMes: { mes: string; valor: number }[] } {
  const porMes: { mes: string; valor: number }[] = []
  for (const mes of mesesDaAtleta(data, playerId)) {
    if (vencimento(mes) >= hoje) continue
    const f = fichaBruta(data, playerId, mes)
    if (renovada(f, hoje)) continue
    const valor = valorDaFicha({ ...f, itens: f.itens.filter((i) => i.tipo !== 'checkin') }, hoje)
    if (valor > 0) porMes.push({ mes, valor })
  }
  return { total: centavos(porMes.reduce((s, x) => s + x.valor, 0)), porMes }
}

export type ItemNovo = Pick<ItemDaMensalidade, 'mes' | 'tipo' | 'valor' | 'observacao'>

/**
 * RENOVAR COM CREDITO (dono, 07/11): quanto do credito dela (o saldo positivo dos plays, onde entra o
 * que foi pago sem renovar) completa a parte que renova, e quanto a Ingryd ainda cobra no Pix (com a
 * divida da mensalidade, se houver). Nada e gravado aqui: so na hora em que ela recebe.
 */
export function contaDaRenovacao(f: Ficha, credito: number, divida: number, hoje: string): { usa: number; cobrar: number } {
  const ja = centavos(ate(f, hoje).filter((i) => i.tipo !== 'checkin').reduce((s, i) => s + (i.valor ?? 0), 0))
  const falta = Math.max(0, centavos(valorParaRenovar(f) - ja))
  const usa = Math.min(Math.max(0, credito), falta)
  return { usa: centavos(usa), cobrar: centavos(falta - usa + divida) }
}

/**
 * UM PIX DE QUEM DEVE (dono, 07/11): primeiro quita a divida (a mais antiga primeiro), o resto vai
 * para a mensalidade escolhida.
 */
export function dividirPix(data: AppData, playerId: string, mes: string, valor: number, hoje: string): ItemNovo[] {
  const out: ItemNovo[] = []
  let resta = centavos(valor)
  for (const d of dividaDaMensalidade(data, playerId, hoje).porMes) {
    if (resta <= 0 || d.mes === mes) continue
    const v = Math.min(resta, d.falta)
    out.push({ mes: d.mes, tipo: 'dinheiro', valor: v, observacao: 'quitou a dívida' })
    resta = centavos(resta - v)
  }
  if (resta > 0) out.push({ mes, tipo: 'dinheiro', valor: resta, observacao: null })
  return out
}

/**
 * O CREDITO COBRE A DIVIDA NO DIA 6 (dono, 07/11): quem renovou e nao fechou os check-ins no prazo, e tem
 * credito (o saldo positivo dos plays, onde entra o pago sem renovar), tem a divida coberta sozinha --
 * inteira se der, senao em parte -- e o credito cai do mesmo tanto. Calculado, nao gravado: aparece na
 * ficha como um abatimento "credito usado na divida" e no saldo dos plays como um acerto negativo.
 */
export type UsoDoCredito = { mes: string; date: string; valor: number }
const memoDosUsos = new WeakMap<AppData, Map<string, UsoDoCredito[]>>()

export function usosDoCreditoNaDivida(data: AppData, playerId: string, hoje = todayISO()): UsoDoCredito[] {
  let porAtleta = memoDosUsos.get(data)
  if (!porAtleta) memoDosUsos.set(data, (porAtleta = new Map()))
  const chave = `${playerId}|${hoje}`
  const pronto = porAtleta.get(chave)
  if (pronto) return pronto
  const usos: UsoDoCredito[] = []
  let usado = 0
  for (const mes of mesesDaAtleta(data, playerId)) {
    const prazo = prazoDosCheckins(mes)
    const dia6 = `${prazo.slice(0, 8)}06`
    if (dia6 > hoje) break
    const f = fichaBruta(data, playerId, mes)
    if (!renovada(f, prazo)) continue
    const falta = faltaDaFicha(f, prazo)
    if (falta <= 0) continue
    const livre = centavos(saldoDosPlaysAntesDe(data, playerId, dia6) - usado)
    const valor = centavos(Math.min(Math.max(0, livre), falta))
    if (valor <= 0) continue
    usos.push({ mes, date: dia6, valor })
    usado = centavos(usado + valor)
  }
  porAtleta.set(chave, usos)
  return usos
}

const itemDoUso = (playerId: string, u: UsoDoCredito): ItemDaMensalidade => ({
  id: `credito-na-divida:${playerId}:${u.mes}`, player_id: playerId, mes: u.mes, tipo: 'abatimento', date: u.date, valor: u.valor,
  conta_id: null, local_id: null, confirmado: true, observacao: 'crédito usado na dívida (automático)', created_at: u.date,
})

/** O mes anterior a regra nova quitado pelo `pago_mes` (a transicao de novembro). */
const quitadaAntiga = (p: Player, mes: string) => Boolean(p.pago_mes && p.pago_mes >= mes)

/**
 * MENSALISTA EM DIA NA DATA (de um play, ou hoje). Antes da regra nova, a de sempre
 * (`mensalistaEmDiaNoPlay`). Nao em dia = joga como avulsa.
 */
export function emDiaNaData(data: AppData, p: Player, date: string): boolean {
  if (categoriaDe(p) !== 'mensalista') return false
  const mes = monthOf(date)
  if (mes < MES_INICIAL) return mensalistaEmDiaNoPlay(p, date)
  if (dividaDaMensalidade(data, p.id, date).total > 0) return false
  if (renovada(fichaDe(data, p.id, mes), date)) return true
  if (dia(date) > 5) return false
  // ate o dia 5 vale a renovacao do mes anterior
  const ant = mesAnterior(mes)
  return ant < MES_INICIAL ? quitadaAntiga(p, ant) : renovada(fichaDe(data, p.id, ant), date)
}

/**
 * PARA QUAL MENSALIDADE VAI UM CHECK-IN (o palpite da tela; a Ingryd pode trocar): a mais
 * antiga ja paga (iniciada) que ainda falta check-in -- divida primeiro, depois a que esta
 * correndo --; sem nenhuma, a do mes da data (cheia, a seguinte).
 */
export function mesSugeridoDoCheckin(data: AppData, playerId: string, date: string): string {
  const doMes = mensalidadeDaData(date)
  for (const mes of mesesDaAtleta(data, playerId)) {
    if (mes > doMes) break
    const f = fichaDe(data, playerId, mes)
    if (iniciada(f) && checkinsDaFicha(f) < f.max_checkins && faltaDaFicha(f) > 0) return mes
  }
  let mes = doMes
  for (let f = fichaDe(data, playerId, mes); quitada(f) || checkinsDaFicha(f) >= f.max_checkins; f = fichaDe(data, playerId, mes)) mes = proximoMes(mes)
  return mes
}

/**
 * FALTA AVISADA COM 24H (dono, 07/11): R$ 25 de credito na proxima mensalidade ou um check-in a
 * menos na que ela esta fechando. Os dois viram um abatimento de `valor_checkin` na ficha; muda o
 * mes: 'checkin' = a dos check-ins em andamento; 'credito' = a do mes seguinte ao play (a primeira
 * nao quitada dali em diante).
 */
export function mesDaCompensacao(data: AppData, playerId: string, dataDoPlay: string, tipo: 'credito' | 'checkin'): string {
  if (tipo === 'checkin') return mesSugeridoDoCheckin(data, playerId, dataDoPlay)
  let mes = proximoMes(monthOf(dataDoPlay))
  if (mes < MES_INICIAL) mes = MES_INICIAL
  while (quitada(fichaDe(data, playerId, mes))) mes = proximoMes(mes)
  return mes
}

/** Em que pe a mensalista esta no mes (uma pode ter varias marcas): o que a administradora filtra na aba Mensalistas. */
export type MarcaDaMensalista = 'quitada' | 'integral' | 'parcial' | 'falta' | 'deve' | 'sem-pagamento'

export function marcasDaMensalista(f: Ficha, devendoAntes: number): MarcaDaMensalista[] {
  const marcas: MarcaDaMensalista[] = []
  const dinheiro = dinheiroDaFicha(f)
  if (quitada(f)) marcas.push('quitada')
  if (dinheiro >= f.valor_cheio) marcas.push('integral')
  else if (dinheiro > 0) marcas.push('parcial')
  if (iniciada(f) && !quitada(f)) marcas.push('falta')
  if (devendoAntes > 0) marcas.push('deve')
  if (dinheiro === 0) marcas.push('sem-pagamento')
  return marcas
}
