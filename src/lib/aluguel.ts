import { centavos, relatorioDasArenas } from './checkins'
import type { AppData } from './types'

export function checkinsNaArena(data: AppData, localId: string, mes: string): number {
  return relatorioDasArenas(data, { mes, de: null, ate: null, locais: [localId] }, (id) => id).total
}

type DadosDoAluguel = {
  valorNoPlano: number
  desconto?: number
  checkinsMesAnterior: number
  valorPorCheckin?: number
}

export function contaDoAluguel({ valorNoPlano, desconto = 0.05, checkinsMesAnterior, valorPorCheckin = 25 }: DadosDoAluguel) {
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

export type EconomiaDoAluguel = { economia: number }

// shortcut: recebe só as economias do aluguel até o dono decidir onde gravar a marca "pago no plano mensal".
export function caixaDeEventos(data: readonly EconomiaDoAluguel[]): number {
  return centavos(data.reduce((total, aluguel) => total + aluguel.economia, 0))
}
