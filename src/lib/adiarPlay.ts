import { isPlayed } from './scoring'
import type { AppData, CheckinDia, Match, PlaySession } from './types'

/**
 * ADIAR O PLAY (dono, 12/11/2026): choveu e o play de 09/11 nao aconteceu; antes era apagar e montar de novo.
 * So o play aberto em que nenhuma partida foi iniciada nem lancada: a noite ainda nao comecou.
 */
export function podeAdiar(s: PlaySession, matches: Match[]): boolean {
  return s.status === 'open' && !matches.some((m) => m.session_id === s.id && (m.started_at || isPlayed(m)))
}

/**
 * O play na data nova e os dias do Financeiro ligados a ele (com o que ja foi pago neles) indo junto:
 * quem pagou o play adiado continua pago para o mesmo play.
 */
export function adiarPlay(
  data: AppData,
  s: PlaySession,
  novaData: string,
): { erro: string } | { sessao: PlaySession; dias: CheckinDia[] } {
  if (!podeAdiar(s, data.matches)) return { erro: 'Só dá para adiar antes da primeira partida começar.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData) || Number.isNaN(Date.parse(novaData))) return { erro: 'Escolha a data nova.' }
  if (novaData <= s.date) return { erro: 'A data nova precisa ser depois do dia do play.' }
  return {
    sessao: { ...s, date: novaData },
    dias: data.checkinDias.filter((d) => d.session_id === s.id).map((d) => ({ ...d, date: novaData })),
  }
}
