import type { DuplaDoDia, PlayerStat } from './stats'
import { balance } from './stats'
import { streakLevel, type PodioDoDia } from './streaks'
import { dateLabel, monthLabel } from './types'

/**
 * Textos prontos para colar no grupo do WhatsApp.
 *
 * O WhatsApp so tem *negrito*, _italico_ e ~riscado~ -- nao tem tabela nem
 * fonte de largura fixa, entao alinhar em colunas com espacos NAO funciona:
 * cada celular quebra a linha num lugar diferente. Por isso quem esta no podio
 * ocupa duas linhas curtas (nome em destaque, numeros embaixo) em vez de uma
 * linha longa cheia de parenteses, que era como estava e embolava na tela.
 */

const MEDALHAS = ['🥇', '🥈', '🥉']

function posicao(i: number): string {
  return MEDALHAS[i] ?? `${i + 1}º`
}

function comSinal(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function pts(n: number): string {
  return `${n} ${n === 1 ? 'pt' : 'pts'}`
}

/**
 * Duas linhas: nome em destaque, numeros embaixo.
 *
 * Quando a jogadora esta em chamas, o degrau vai junto na segunda linha -- o
 * emoji sozinho nao diz se ela e "Em chamas" ou "Duquesa da V3".
 */
function bloco(i: number, nome: string, s: PlayerStat, streak = 0): string {
  const lvl = streak >= 2 ? streakLevel(streak) : null
  const fogo = lvl ? ` ${lvl.emoji}` : ''
  const bonus = s.bonus > 0 ? ` _(${s.points - s.bonus} + ${s.bonus} de status)_` : ''
  const status = lvl ? ` · _${lvl.title} (${streak} seguidos)_` : ''
  return (
    `${posicao(i)} *${nome}*${fogo} — *${pts(s.points)}*${bonus}\n` +
    `     ${s.wins}V ${s.losses}D · saldo ${comSinal(balance(s))}${status}`
  )
}

export function monthRankingText(
  ym: string,
  rows: PlayerStat[],
  nameOf: (id: string) => string,
  fire?: Map<string, number>,
): string {
  const partes: string[] = [
    `🏆 *RANKING DE ${monthLabel(ym).toUpperCase()}*`,
    `_Play de Todas · Beach Tennis · V3 Arena_`,
  ]

  const podio = rows.slice(0, 3)
  const resto = rows.slice(3)

  if (podio.length > 0) {
    partes.push(
      '\n' +
        podio
          .map((s, i) => bloco(i, nameOf(s.player_id), s, fire?.get(s.player_id) ?? 0))
          .join('\n'),
    )
  }

  // da quarta em diante, uma linha so: a lista do mes pode ficar longa
  if (resto.length > 0) {
    partes.push(
      '\n' +
        resto
          .map((s, i) => {
            const n = fire?.get(s.player_id) ?? 0
            const fogo = n >= 2 ? ` ${streakLevel(n)?.emoji}` : ''
            return `${i + 4}º ${nameOf(s.player_id)}${fogo} — ${pts(s.points)}`
          })
          .join('\n'),
    )
  }

  const emChamas = rows.filter((s) => (fire?.get(s.player_id) ?? 0) >= 2)
  if (emChamas.length > 0) {
    partes.push(
      '\n🔥 *Em chamas*\n' +
        emChamas
          .map((s) => {
            const n = fire?.get(s.player_id) ?? 0
            const lvl = streakLevel(n)
            return `${lvl?.emoji} *${nameOf(s.player_id)}* — ${lvl?.title}, ${n} semanas seguidas no pódio`
          })
          .join('\n'),
    )
  }

  partes.push('\n_Mais que um play, uma experiência!_ 💗')
  return partes.join('\n')
}

export type DayTextOpts = {
  date: string
  title: string
  /** A classificacao do dia -- so do grupo escolhido, quando ha um. */
  rows: PlayerStat[]
  nameOf: (id: string) => string
  /** Os podios a mostrar: todos, ou so o do grupo escolhido. */
  podios?: PodioDoDia[]
  /**
   * No grupos+duplas, o podio do mata-mata.
   *
   * Quando ha chave e ELA que decide o dia, nao a soma de pontos: com bye a
   * vice chega a somar mais que a campea. Entao o texto coroa a dupla que
   * ganhou a final, e a classificacao individual vem depois, informativa.
   */
  duplas?: DuplaDoDia[]
  /** Sequencia de cada jogadora depois deste play (so quem tem 2 ou mais). */
  streaks?: Map<string, number>
  /** O destaque do texto: a maior sequencia entre as que estao aqui. */
  award?: { player_id: string; streak: number; value: number }
}

export function dayRankingText(opts: DayTextOpts): string {
  const { date, title, rows, nameOf, podios, duplas, streaks, award } = opts
  const seq = (id: string) => streaks?.get(id) ?? 0

  // um grupo so escolhido: o titulo ja diz qual, para nao mandar no grupo do
  // WhatsApp dois textos parecidos sem saber de quem e cada um
  const soUmGrupo = podios?.length === 1 && podios[0].grupo !== null
  const partes: string[] = [
    `🎾 *${title.toUpperCase()}*`,
    soUmGrupo
      ? `_${dateLabel(date)} · Grupo ${podios?.[0].grupo}_`
      : `_${dateLabel(date)}_`,
  ]

  const varios = Boolean(podios && podios.length > 1)

  if (duplas && duplas.length > 0) {
    const titulos = ['*Campeãs do dia*', '*Vice-campeãs*', '*3º lugar*']
    partes.push(
      '\n' +
        duplas
          .slice(0, 3)
          .map(
            (d, i) =>
              `${MEDALHAS[i]} ${titulos[i]}\n` +
              `     *${nameOf(d.a)} + ${nameOf(d.b)}* — ${d.wins}V ${d.losses}D` +
              (d.bye > 0 ? ` · _passou de bye_` : ''),
          )
          .join('\n'),
    )
    partes.push(
      '\n*Pontos do dia*\n' +
        rows
          .map((s, i) => {
            const doBye = s.bye > 0 ? ` _(${s.bye} de bye)_` : ''
            return `${i + 1}º ${nameOf(s.player_id)} — ${pts(s.points)}${doBye}`
          })
          .join('\n'),
    )
  } else if (varios) {
    // cada grupo COMPLETO: o podio em destaque e o resto do grupo embaixo, na
    // posicao de dentro do grupo -- a geral nao diz nada quando cada grupo
    // jogou o seu proprio rodizio
    for (const p of podios as PodioDoDia[]) {
      const doGrupo = new Set(p.membros)
      const subiu = new Set(p.rows.map((s) => s.player_id))
      const resto = rows.filter((s) => doGrupo.has(s.player_id) && !subiu.has(s.player_id))
      partes.push(
        `\n*👥 GRUPO ${p.grupo}*\n` +
          p.rows.map((s, i) => bloco(i, nameOf(s.player_id), s, seq(s.player_id))).join('\n') +
          (resto.length > 0
            ? '\n' +
              resto
                .map((s, i) => `${i + p.rows.length + 1}º ${nameOf(s.player_id)} — ${pts(s.points)}`)
                .join('\n')
            : ''),
      )
    }
  } else {
    const podio = podios?.[0]?.rows ?? rows.slice(0, 3)
    partes.push(
      '\n' + podio.map((s, i) => bloco(i, nameOf(s.player_id), s, seq(s.player_id))).join('\n'),
    )
    const subiu = new Set(podio.map((s) => s.player_id))
    const resto = rows.filter((s) => !subiu.has(s.player_id))
    if (resto.length > 0) {
      partes.push(
        '\n' +
          resto
            .map((s, i) => `${i + podio.length + 1}º ${nameOf(s.player_id)} — ${pts(s.points)}`)
            .join('\n'),
      )
    }
  }

  const lvl = award ? streakLevel(award.streak) : null
  if (award && lvl) {
    partes.push(
      `\n${lvl.emoji} *${nameOf(award.player_id)} é ${lvl.title.toUpperCase()}!*\n` +
        `${award.streak} semanas seguidas no pódio. O status vale *${award.value} pontos*, ` +
        `que ela decide se usa no fechamento do mês.`,
    )
  }

  partes.push('\n_Os pontos já entraram no ranking do mês._ 🏐')
  return partes.join('\n')
}

/**
 * A ordem das partidas para mandar no grupo. Nao ha rodadas: a lista e a fila,
 * e cada partida entra na quadra que vagar primeiro.
 */
export function scheduleText(
  date: string,
  title: string,
  courts: number,
  partidas: { round: number; team_a: [string, string]; team_b: [string, string] }[],
  nameOf: (id: string) => string,
  grupos?: string[][] | null,
): string {
  const emGrupos = Boolean(grupos && grupos.length > 1)
  const grupoDe = new Map<string, number>()
  grupos?.forEach((g, i) => g.forEach((id) => grupoDe.set(id, i + 1)))

  const partes: string[] = [
    `🎾 *${title.toUpperCase()}*`,
    `_${dateLabel(date)} · ${partidas.length} partidas · ${courts} quadra(s)_`,
  ]

  if (emGrupos) {
    partes.push(
      '\n*👥 Os grupos*\n' +
        (grupos as string[][])
          .map((g, i) => `*Grupo ${i + 1}:* ${g.map(nameOf).join(', ')}`)
          .join('\n'),
    )
  }

  partes.push(
    '\n*Ordem das partidas*\n' +
      [...partidas]
        .sort((a, b) => a.round - b.round)
        .map((m) => {
          const g = grupoDe.get(m.team_a[0])
          const tag = emGrupos && g ? `_[G${g}]_ ` : ''
          return (
            `*${m.round}.* ${tag}${nameOf(m.team_a[0])} + ${nameOf(m.team_a[1])}\n` +
            `     ✖️ ${nameOf(m.team_b[0])} + ${nameOf(m.team_b[1])}`
          )
        })
        .join('\n'),
  )

  partes.push('\n_Entram na ordem, conforme as quadras vão vagando._\nBora jogar! 💗')
  return partes.join('\n')
}
