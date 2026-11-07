import { centavos, DESCONTO_DO_PLANO, gastaCheckin } from './checkins'
import { MES_INICIAL } from './fichaDaMensalidade'
import { monthOf, type AppData } from './types'

/**
 * Os check-ins que a arena RECEBEU no mes (o que a V3 abate no aluguel): os de play que gastam
 * cota (inclui o "nao veio, mas fez o check-in") e os da mensalidade, pela data. O dia em que ela
 * USA um check-in de credito aparece no relatorio da arena, mas nao e check-in novo: nao conta.
 */
export function checkinsNaArena(data: AppData, localId: string, mes: string): number {
  const dias = new Map(data.checkinDias.map((d) => [d.id, d.date]))
  const dePlay = data.checkins.filter((c) => gastaCheckin(c) && c.local_id === localId && monthOf(dias.get(c.dia_id) ?? '') === mes).length
  const daMensalidade = data.mensalidadeItens.filter((i) => i.tipo === 'checkin' && i.mes >= MES_INICIAL && i.local_id === localId && monthOf(i.date) === mes).length
  return dePlay + daMensalidade
}

type DadosDoAluguel = {
  valorNoPlano: number
  desconto?: number
  checkinsMesAnterior: number
  valorPorCheckin?: number
}

export function contaDoAluguel({ valorNoPlano, desconto = DESCONTO_DO_PLANO, checkinsMesAnterior, valorPorCheckin = 25 }: DadosDoAluguel) {
  if (!(desconto >= 0 && desconto < 1)) throw new RangeError('O desconto deve estar entre 0 e 1, sem incluir 1.')
  const plano = centavos(valorNoPlano)
  const semPlano = centavos(plano / (1 - desconto))
  const economia = centavos(semPlano - plano)
  const credito = centavos(checkinsMesAnterior * valorPorCheckin)
  const restante = centavos(plano - credito)
  return {
    semPlano, economia, credito, pagarNoPix: Math.max(0, restante),
    ...(restante < 0 ? { sobraDeCredito: -restante } : {}),
  }
}

// o caixa de eventos sai do resumo do caixa (`eventos`/`eventosAcumulado` em resumoDoCaixa): a economia de cada
// aluguel lancado no plano mensal (`economiaDoAluguel`).
