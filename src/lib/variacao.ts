import { playedMatches } from './stats'
import type { AppData } from './types'

/*
 * ▲/▼ AO LADO DA COLOCACAO (dono, 07/11): a posicao de agora contra a posicao
 * sem o ultimo play. Vale para a forca (individual e dupla) e o ranking do mes.
 */

/** O ultimo play com partida jogada (opcional: so os do mes, so os que valem). */
export function ultimoPlayJogado(data: AppData, opts: { month?: string; ranked?: boolean } = {}): string | null {
  const jogados = new Set(playedMatches(data, opts).map((m) => m.session_id))
  const s = data.sessions
    .filter((x) => jogados.has(x.id))
    .sort((a, b) => (a.date + a.created_at).localeCompare(b.date + b.created_at))
  return s.length ? s[s.length - 1].id : null
}

export function semOPlay(data: AppData, playId: string): AppData {
  return { ...data, sessions: data.sessions.filter((s) => s.id !== playId), matches: data.matches.filter((m) => m.session_id !== playId) }
}

/** Posicoes ganhas (+) ou perdidas (−); ausente = sem comparacao (estreou no ultimo play). */
export function variacoes(antes: Map<string, number>, agora: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [id, p] of agora) {
    const a = antes.get(id)
    if (a !== undefined) out.set(id, a - p)
  }
  return out
}

/** Lista ja ordenada -> posicao 1, 2, 3... */
export const posicoesDaLista = (ids: string[]) => new Map(ids.map((id, i) => [id, i + 1]))
