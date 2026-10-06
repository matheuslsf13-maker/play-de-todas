import { quedaPorFalta, ratings, type QuedaPorFalta } from './stats'
import type { AppData } from './types'

/**
 * A FORCA: o nivel de verdade de cada atleta, agora visivel.
 *
 * O app sempre teve essa conta -- e ela que monta os grupos equilibrados e
 * escolhe as duplas --, so que rodava por baixo do pano. Aqui ela ganha um
 * numero e um nivel para aparecer na tela.
 *
 * NAO e o ranking do mes. O ranking soma pontos e zera todo mes; a forca e um
 * Elo que atravessa o ano inteiro e mede COM QUEM voce ganhou, nao quanto
 * jogou. Ganhar de quem esta melhor rende muito mais do que ganhar de quem
 * esta pior, e ganhar apertado rende pouco dos dois lados.
 *
 * A escala mostrada e a classica do Elo, com 1500 no meio. Isso nao e enfeite:
 * o Elo e SOMA ZERO -- o que um ganha o outro perde --, entao a media do grupo
 * fica sempre em 1500 e as faixas abaixo continuam querendo dizer a mesma coisa
 * no ano que vem. Medido numa temporada simulada de 12 sextas com 16 jogadoras,
 * o grupo se espalhou de -107 a +91, e e dai que saem os limites.
 */

/** Como `ratings()` devolve (0 a 4, com 2 no meio) vira a escala do Elo. */
export const FORCA_MEDIA = 1500
const ESCALA = 110

export function notaDeForca(forca: number): number {
  return Math.round(FORCA_MEDIA + (forca - 2) * ESCALA)
}

export type NivelDeForca = {
  /** Diferenca minima para o meio do grupo. */
  de: number
  emoji: string
  titulo: string
  /** Nome do token de cor, para a etiqueta. */
  cor: string
}

export const NIVEIS_DE_FORCA: NivelDeForca[] = [
  { de: 75, emoji: '🚀', titulo: 'Topo do grupo', cor: 'var(--marca)' },
  { de: 25, emoji: '📈', titulo: 'Acima da média', cor: 'var(--verde)' },
  { de: -25, emoji: '⚖️', titulo: 'No pelotão', cor: 'var(--muted)' },
  { de: -75, emoji: '🎯', titulo: 'Em evolução', cor: 'var(--apoio)' },
  { de: -Infinity, emoji: '🌱', titulo: 'Começando', cor: 'var(--bronze)' },
]

export function nivelDeForca(nota: number): NivelDeForca {
  const dif = nota - FORCA_MEDIA
  return NIVEIS_DE_FORCA.find((n) => dif >= n.de) as NivelDeForca
}

/**
 * Abaixo disto o numero ainda e chute: poucas partidas, e uma noite ruim
 * mexe demais. A tela marca como provisoria em vez de esconder, porque
 * esconder faria parecer que a atleta nao conta para o equilibrio -- e conta.
 */
export const JOGOS_PARA_FIRMAR = 12

export type LinhaDeForca = {
  player_id: string
  nota: number
  jogos: number
  nivel: NivelDeForca
  provisoria: boolean
  /** Esta faltando: faltas seguidas e quanto a nota ja caiu por elas (so com queda). */
  queda?: QuedaPorFalta
}

/** "−9 por 3 faltas seguidas", para a ficha e as listas. */
export function textoDaQueda(q?: QuedaPorFalta): string {
  if (!q || q.perda < 0.5) return ''
  return `−${Math.round(q.perda)} por ${q.faltas} faltas seguidas`
}

/**
 * Todo mundo por forca, do mais forte para o mais fraco.
 *
 * Quem nunca jogou fica de fora: a nota dele e exatamente a media, mas por
 * falta de informacao e nao por equilibrio -- lista-la no meio do grupo seria
 * inventar um dado.
 */
export function rankingDeForca(
  data: AppData,
  nameOf: (id: string) => string,
  ate?: string,
): LinhaDeForca[] {
  const forcas = ratings(data, ate)
  const quedas = quedaPorFalta(data, ate)
  const jogos = new Map<string, number>()
  for (const m of data.matches) {
    if (m.score_a === null || m.score_b === null) continue
    for (const id of [...m.team_a, ...m.team_b]) jogos.set(id, (jogos.get(id) ?? 0) + 1)
  }
  return data.players
    .filter((p) => (jogos.get(p.id) ?? 0) > 0)
    .map((p) => {
      const nota = notaDeForca(forcas.get(p.id) ?? 2)
      const n = jogos.get(p.id) ?? 0
      return {
        player_id: p.id,
        nota,
        jogos: n,
        nivel: nivelDeForca(nota),
        provisoria: n < JOGOS_PARA_FIRMAR,
        queda: (quedas.get(p.id)?.perda ?? 0) > 0 ? quedas.get(p.id) : undefined,
      }
    })
    .sort((a, b) => b.nota - a.nota || nameOf(a.player_id).localeCompare(nameOf(b.player_id), 'pt-BR'))
}

/**
 * A FORCA DE UMA DUPLA: a media das duas.
 *
 * Nao e uma conta nova inventada para a tela -- e exatamente o numero que o
 * app ja usa para montar as partidas: em `ratings()`, a chance de uma dupla
 * vencer sai da media das notas dos dois. Por isso mostrar a media, e nao a
 * soma, mantem a escala: 1500 continua sendo "dupla mediana do grupo", e da
 * para comparar dupla com atleta na mesma regua.
 */
export function forcaDaDupla(a: number, b: number): number {
  return Math.round((a + b) / 2)
}

/**
 * A FORCA DE UMA DUPLA, pelo que os dois renderam JUNTOS.
 *
 * Nao e a media das duas notas individuais -- essa e so o ponto de partida.
 * A media diz o que a dupla DEVERIA valer; o que interessa e se, jogando
 * junto, ela rende mais ou menos do que isso. Tem dupla que se acha em
 * quadra e tem dupla que atrapalha um ao outro, e isso nao aparece na nota
 * individual de ninguem.
 *
 * A conta:
 *
 *   1. o ponto de partida e a media dos dois (`forcaDaDupla`), que ja carrega
 *      tudo o que o app sabe sobre cada um. Comecar do zero seria jogar fora
 *      essa informacao e deixar toda dupla nova sem nota nenhuma;
 *   2. cada partida DELES move a nota pela mesma formula do Elo, comparando
 *      o resultado com o esperado contra a media da dupla adversaria.
 *
 * Entao `nota - base` e o entrosamento: quanto a dupla rendeu alem (ou
 * aquem) do que a forca dos dois previa.
 */
export type ForcaDeDupla = {
  key: string
  a: string
  b: string
  /** A media dos dois: o que a dupla deveria valer. */
  base: number
  /** O que ela vale pelo que renderam juntos. */
  nota: number
  /** `nota - base`: positivo quer dizer que rendem mais juntos. */
  entrosamento: number
  jogos: number
  provisoria: boolean
}

/** Abaixo disto o entrosamento e ruido: poucas partidas juntos. */
export const JOGOS_PARA_ENTROSAMENTO = 6

const K_DUPLA = 20

export function forcaDeDuplas(data: AppData): Map<string, ForcaDeDupla> {
  const individuais = ratings(data)
  const nota = (id: string) => notaDeForca(individuais.get(id) ?? 2)
  const base = (x: string, y: string) => forcaDaDupla(nota(x), nota(y))

  const out = new Map<string, ForcaDeDupla>()
  const chave = (d: readonly string[]) => [...d].sort().join('|')

  // as partidas em ordem cronologica: cada uma e avaliada com o que se sabia
  // ate ali, como no Elo individual
  const dia = new Map(data.sessions.map((s) => [s.id, s.date]))
  const jogos = data.matches
    .filter((m) => m.score_a !== null && m.score_b !== null && dia.has(m.session_id))
    .sort(
      (x, y) =>
        (dia.get(x.session_id) as string).localeCompare(dia.get(y.session_id) as string) ||
        x.round - y.round,
    )

  for (const m of jogos) {
    const ga = m.score_a as number
    const gb = m.score_b as number
    if (ga + gb === 0) continue
    const times: [readonly string[], number, number][] = [
      [m.team_a, ga, gb],
      [m.team_b, gb, ga],
    ]
    for (const [time, favor, contra] of times) {
      const k = chave(time)
      const [x, y] = time as [string, string]
      const rival = time === m.team_a ? m.team_b : m.team_a
      let d = out.get(k)
      if (!d) {
        const b = base(x, y)
        d = { key: k, a: x, b: y, base: b, nota: b, entrosamento: 0, jogos: 0, provisoria: true }
        out.set(k, d)
      }
      const esperado = 1 / (1 + Math.pow(10, (base(rival[0], rival[1]) - d.nota) / 400))
      d.nota += K_DUPLA * (favor / (favor + contra) - esperado)
      d.jogos++
    }
  }

  for (const d of out.values()) {
    d.nota = Math.round(d.nota)
    d.entrosamento = d.nota - d.base
    d.provisoria = d.jogos < JOGOS_PARA_ENTROSAMENTO
  }
  return out
}

/**
 * O entrosamento na escala do `ratings()` (0 a 4), para o balanceamento.
 *
 * So entram as duplas com jogos suficientes: com duas ou tres partidas juntos
 * o numero e ruido, e usar ruido para escolher confronto piora o equilibrio
 * em vez de melhorar.
 */
export function ajusteDeEntrosamento(data: AppData): Map<string, number> {
  const out = new Map<string, number>()
  for (const d of forcaDeDuplas(data).values()) {
    if (d.provisoria || d.entrosamento === 0) continue
    out.set(d.key, d.entrosamento / ESCALA)
  }
  return out
}
