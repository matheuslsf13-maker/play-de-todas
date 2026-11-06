import { calcularElo, playedMatches, REGRA_DA_FORCA } from './stats'
import { computeStreaks } from './streaks'
import type { AppData, Match } from './types'

/**
 * OS SELOS DA LISTA DE PLAYS.
 *
 * Cada play finalizado mostra a FORCA DO PLAY: a media da forca de quem jogou
 * (pelo menos uma partida com placar), com a forca que cada uma tinha NAQUELE
 * DIA, antes do play -- entao o numero de um play nunca muda depois. Atleta em
 * avaliacao entra na media (a media nao revela ninguem).
 *
 * E no maximo UM selo, o mais raro que ele detem AGORA (a ordem de `SELOS`).
 * Quem detem e o lider da metrica (na historia ou no mes da data do play); no
 * empate fica o mais antigo -- o novo precisa superar. Se o lider ja mostra um
 * selo mais raro, o menor nao passa para o segundo colocado: so nao aparece.
 *
 * Play avulso (`ranked = false`) mostra a forca mas nao concorre: como no
 * ranking do mes, ele nao e o campeonato. As partidas dele contam na forca do
 * dia dos plays seguintes, como em todo o app.
 */
export type Selo = {
  chave: string
  emoji: string
  nome: string
  /** Contra quem disputa: a historia toda, o mes do play ou ninguem (cada play o seu). */
  por: 'historia' | 'mes' | 'play'
}

export const SELOS: Selo[] = [
  { chave: 'recorde-forca', emoji: '📈', nome: 'Recorde de força', por: 'historia' },
  { chave: 'recorde-publico', emoji: '🏟️', nome: 'Recorde de público', por: 'historia' },
  { chave: 'coroacao', emoji: '👑', nome: 'Noite da coroação', por: 'play' },
  { chave: 'zebra', emoji: '💥', nome: 'Zebra do mês', por: 'mes' },
  { chave: 'forte-mes', emoji: '🏆', nome: 'Mais forte do mês', por: 'mes' },
  { chave: 'disputado', emoji: '🔥', nome: 'Mais disputado do mês', por: 'mes' },
  { chave: 'ties', emoji: '🎯', nome: 'Noite dos ties', por: 'mes' },
  { chave: 'casa-cheia', emoji: '👥', nome: 'Casa cheia do mês', por: 'mes' },
  { chave: 'estreias', emoji: '🆕', nome: 'Noite das estreias', por: 'mes' },
  { chave: 'maratona', emoji: '⏱️', nome: 'Maratona do mês', por: 'mes' },
]

/** Zebra so a partir desta diferenca de forca entre as duplas (menos que isso e ruido). */
export const ZEBRA_MINIMA = 40
/** "Mais disputado" so em play com pelo menos tantas partidas. */
export const PARTIDAS_PARA_DISPUTADO = 6
/** "Noite das estreias" so com pelo menos tantas estreantes. */
export const ESTREIAS_MINIMAS = 2

export type SeloDoPlay = { forca: number; selo?: Selo }

/**
 * A forca de cada uma ANTES de cada play que jogou (`${sessionId}|${id}`), numa
 * passada so do calculo da forca: a nota de partida dela mais o quanto ja tinha
 * andado (partidas e faltas) ate a 1a partida daquele play.
 */
function forcaAntesDosPlays(data: AppData): Map<string, number> {
  const andou = new Map<string, number>()
  const antes = new Map<string, number>()
  const { inicial } = calcularElo(data, undefined, undefined, {
    ...REGRA_DA_FORCA,
    aoMudar: (p) => {
      const a = andou.get(p.id) ?? 0
      const k = `${p.sessionId}|${p.id}`
      if (p.motivo === 'partida' && !antes.has(k)) antes.set(k, a)
      andou.set(p.id, a + p.delta)
    },
  })
  const out = new Map<string, number>()
  for (const [k, a] of antes) out.set(k, inicial(k.slice(k.indexOf('|') + 1)) + a)
  return out
}

const cache = new WeakMap<AppData, Map<string, SeloDoPlay>>()

/** Forca e selo de cada play finalizado com partida jogada. Guardado por `data`. */
export function selosDosPlays(data: AppData): Map<string, SeloDoPlay> {
  const c = cache.get(data)
  if (c) return c
  const out = new Map<string, SeloDoPlay>()
  cache.set(data, out)

  const jogadas = new Map<string, Match[]>()
  for (const m of playedMatches(data)) jogadas.set(m.session_id, [...(jogadas.get(m.session_id) ?? []), m])
  const emOrdem = [...data.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
  if (!emOrdem.some((s) => s.status === 'finished' && jogadas.has(s.id))) return out

  const antes = forcaAntesDosPlays(data)
  // o primeiro play de cada uma (qualquer play, avulso inclusive)
  const estreou = new Map<string, string>()
  for (const s of emOrdem)
    for (const m of jogadas.get(s.id) ?? [])
      for (const id of [...m.team_a, ...m.team_b]) if (!estreou.has(id)) estreou.set(id, s.id)
  const coroacoes = new Set(computeStreaks(data).duquesas.map((d) => d.session_id))

  // o lider de cada selo em cada disputa: `${chave}|${historia, mes ou o play}`
  const lider = new Map<string, { id: string; v: number }>()
  for (const s of emOrdem) {
    const ms = jogadas.get(s.id)
    if (s.status !== 'finished' || !ms) continue
    const ids = [...new Set(ms.flatMap((m) => [...m.team_a, ...m.team_b]))]
    const f = (id: string) => antes.get(`${s.id}|${id}`) ?? 0
    const forca = Math.round(ids.reduce((t, id) => t + f(id), 0) / ids.length)
    out.set(s.id, { forca })
    if (s.ranked === false) continue

    const dupla = (t: [string, string]) => (f(t[0]) + f(t[1])) / 2
    let zebra = 0
    for (const m of ms) {
      const [venceu, perdeu] = (m.score_a as number) > (m.score_b as number) ? [m.team_a, m.team_b] : [m.team_b, m.team_a]
      zebra = Math.max(zebra, dupla(perdeu) - dupla(venceu))
    }
    // apertada: decidida por 1 game ou no tie
    const apertadas = ms.filter((m) => Math.abs((m.score_a as number) - (m.score_b as number)) === 1 || m.tie != null).length
    const estreias = ids.filter((id) => estreou.get(id) === s.id).length
    const valor: Record<string, number> = {
      'recorde-forca': forca,
      'recorde-publico': ids.length,
      coroacao: coroacoes.has(s.id) ? 1 : 0,
      zebra: zebra >= ZEBRA_MINIMA ? zebra : 0,
      'forte-mes': forca,
      disputado: ms.length >= PARTIDAS_PARA_DISPUTADO ? apertadas / ms.length : 0,
      ties: ms.filter((m) => m.tie != null).length,
      'casa-cheia': ids.length,
      estreias: estreias >= ESTREIAS_MINIMAS ? estreias : 0,
      maratona: ms.length,
    }
    for (const selo of SELOS) {
      const v = valor[selo.chave]
      if (!(v > 0)) continue
      const k = `${selo.chave}|${selo.por === 'historia' ? '' : selo.por === 'mes' ? s.date.slice(0, 7) : s.id}`
      const atual = lider.get(k)
      // empate: fica o mais antigo (os plays vem em ordem)
      if (!atual || v > atual.v) lider.set(k, { id: s.id, v })
    }
  }
  // cada play fica com o mais raro que lidera
  for (const selo of SELOS)
    for (const [k, { id }] of lider) {
      const p = out.get(id)
      if (p && !p.selo && k.startsWith(`${selo.chave}|`)) p.selo = selo
    }
  return out
}
