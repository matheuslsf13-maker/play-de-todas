import { colocacaoPorDupla } from './campeonato'
import { aplicarByeNasDuplas, duoStatsComPontos, pontosDeBye, type DuoStat, type playedMatches } from './stats'
import type { AppData } from './types'

/**
 * As duplas do recorte com os pontos certos: o bye conta (a dupla que passou direto nao pode aparecer com menos
 * pontos) e no campeonato vale a colocacao.
 */
export function duplasDoRecorte(sessions: AppData['sessions'], matches: ReturnType<typeof playedMatches>): DuoStat[] {
  return [
    ...aplicarByeNasDuplas(
      aplicarByeNasDuplas(duoStatsComPontos(sessions, matches), pontosDeBye(sessions, matches).porDupla),
      colocacaoPorDupla(sessions, matches),
    ).values(),
  ]
}
