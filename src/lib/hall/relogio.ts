/**
 * O RELOGIO DO HALL: um dia inteiro passa em poucos minutos, e da para travar
 * no dia ou na noite (para mostrar os dois para alguem).
 */

/** Quantos minutos de verdade dura um dia no Hall. */
export const MINUTOS_POR_DIA = 12

export type ModoDoCeu = 'auto' | 'dia' | 'noite'

/** A hora do Hall (0 a 24) num instante `ms` (relogio de verdade). Comeca de manha. */
export function horaDoHall(ms: number): number {
  const dia = MINUTOS_POR_DIA * 60_000
  return (8 + (24 * (ms % dia)) / dia) % 24
}

/**
 * Quanto e noite, de 0 (sol a pino) a 1 (noite fechada), com o por do sol das
 * 17h30 as 19h e o amanhecer das 5h as 6h30 -- nada de virar de uma vez.
 */
export function noite(hora: number, modo: ModoDoCeu = 'auto'): number {
  if (modo === 'dia') return 0
  if (modo === 'noite') return 1
  if (hora >= 19 || hora < 5) return 1
  if (hora >= 17.5) return (hora - 17.5) / 1.5
  if (hora < 6.5) return 1 - (hora - 5) / 1.5
  return 0
}
