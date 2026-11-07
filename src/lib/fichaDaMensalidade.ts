import { categoriaDe, mensalistaEmDiaNoPlay } from './mensalidade'
import { monthOf, type AppData, type ItemDaMensalidade, type Player } from './types'

/*
 * A MENSALIDADE NOVA (dono, 07/11/2026; decisoes em QuadraFacil/docs/superpowers/specs/
 * 2026-11-07-mensalidade-impactos.md, secao 5b). Tudo derivado das fichas e dos
 * itens: nada e gravado na virada do dia 6, como o `pago_mes` na virada do mes.
 *
 *  - A mensalidade do mes M vale 180: integral em dinheiro, ou 80 + 4 check-ins
 *    direcionados a ela (cada check-in vale 25; check-in que falta pode virar 25 em dinheiro).
 *  - Ciclo de M: do dia 6 de M-1 ao dia 5 de M (o vencimento).
 *  - Ate o dia 5, vale o ciclo anterior quitado (ou a de M ja iniciada, com dinheiro).
 *  - Dia 6: M quitada -> em dia. Iniciada e faltando -> deve o que falta e joga como
 *    avulsa ate quitar. Nada pago -> avulsa, SEM divida. Quem entra depois do dia 5
 *    comeca na mensalidade do mes seguinte.
 *  - Ate novembro/2026 vale a regra antiga (`pago_mes`).
 */

/** A primeira mensalidade da regra nova (ciclo 06/11 a 05/12/2026). */
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
/** O ultimo dia do prazo da mensalidade do mes. */
export const vencimento = (mes: string) => `${mes}-05`
const dia = (date: string) => Number(date.slice(8, 10))
/** A mensalidade cujo ciclo contem a data (dia 6 em diante ja e a do mes seguinte). */
export const mesDoCiclo = (date: string) => (dia(date) >= 6 ? proximoMes(monthOf(date)) : monthOf(date))

export const idDaFicha = (playerId: string, mes: string) => `mensalidade:${playerId}:${mes}`

export type Ficha = {
  player_id: string
  mes: string
  valor_cheio: number
  valor_checkin: number
  max_checkins: number
  itens: ItemDaMensalidade[]
}

export function fichaDe(data: AppData, playerId: string, mes: string): Ficha {
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

/** Os meses (da regra nova) em que a atleta tem ficha ou item. */
function mesesDaAtleta(data: AppData, playerId: string): string[] {
  const s = new Set<string>()
  for (const m of data.mensalidades) if (m.player_id === playerId && m.mes >= MES_INICIAL) s.add(m.mes)
  for (const i of data.mensalidadeItens) if (i.player_id === playerId && i.mes >= MES_INICIAL) s.add(i.mes)
  return [...s].sort()
}

/**
 * A DIVIDA DA MENSALIDADE na data: o que falta das fichas iniciadas cujo prazo
 * (dia 5) ja passou. Separada do saldo dos plays (dono, 07/11).
 */
export function dividaDaMensalidade(data: AppData, playerId: string, hoje: string): { total: number; porMes: { mes: string; falta: number }[] } {
  const porMes: { mes: string; falta: number }[] = []
  for (const mes of mesesDaAtleta(data, playerId)) {
    if (vencimento(mes) >= hoje) continue
    const f = fichaDe(data, playerId, mes)
    if (!iniciada(f, hoje)) continue
    const falta = faltaDaFicha(f, hoje)
    if (falta > 0) porMes.push({ mes, falta })
  }
  return { total: centavos(porMes.reduce((s, x) => s + x.falta, 0)), porMes }
}

/** O mes anterior a regra nova quitado pelo `pago_mes` (a transicao de novembro). */
const quitadaAntiga = (p: Player, mes: string) => Boolean(p.pago_mes && p.pago_mes >= mes)

/**
 * MENSALISTA EM DIA NA DATA (de um play, ou hoje). Antes da regra nova, a de
 * sempre (`mensalistaEmDiaNoPlay`). Nao em dia = joga como avulsa.
 */
export function emDiaNaData(data: AppData, p: Player, date: string): boolean {
  if (categoriaDe(p) !== 'mensalista') return false
  const mes = monthOf(date)
  if (mes < MES_INICIAL) return mensalistaEmDiaNoPlay(p, date)
  if (dividaDaMensalidade(data, p.id, date).total > 0) return false
  const f = fichaDe(data, p.id, mes)
  if (quitada(f, date)) return true
  if (dia(date) > 5) return false
  // no prazo: a mensalidade do mes ja renovada, ou o ciclo anterior quitado
  if (iniciada(f, date)) return true
  const ant = mesAnterior(mes)
  return ant < MES_INICIAL ? quitadaAntiga(p, ant) : quitada(fichaDe(data, p.id, ant), date)
}

/**
 * PARA QUAL MENSALIDADE VAI UM CHECK-IN (o palpite da tela; a Ingryd pode trocar):
 * primeiro a divida mais antiga (ficha iniciada, vencida e faltando); senao a
 * mensalidade do ciclo da data; cheia de check-ins, a seguinte.
 */
export function mesSugeridoDoCheckin(data: AppData, playerId: string, date: string): string {
  const divida = dividaDaMensalidade(data, playerId, date).porMes[0]
  if (divida) return divida.mes
  let mes = mesDoCiclo(date)
  if (mes < MES_INICIAL) mes = MES_INICIAL
  const f = fichaDe(data, playerId, mes)
  return checkinsDaFicha(f) >= f.max_checkins ? proximoMes(mes) : mes
}
