import { confrontoDireto } from './campeonato'
import { balance, type PlayerStat } from './stats'
import type { DesempateDeGrupo, Match, PlaySession } from './types'

/*
 * EMPATE NO DIA (formatos todas e grupos)
 *
 * Duas que empatam em TUDO -- vitorias, pontos e saldo -- dividem a posicao.
 * Antes o ranking do dia desfazia esse empate pela ordem alfabetica; agora,
 * quando o empate mexe no podio, quem decide e a quadra (simples 1x1 ou par ou
 * impar, `DesempateEmQuadra`), como ja era no campeonato. O desempate fica em
 * `sessions.desempates_grupo` com o indice do grupo (0 no todas) e so vale
 * para o MESMO conjunto de empatadas: se um placar foi corrigido depois e o
 * empate mudou, ele nao serve mais.
 *
 * Antes da quadra vem o CONFRONTO DIRETO, como no campeonato: so entre duas
 * empatadas, quem venceu mais vezes a outra NESTE PLAY (`confrontoDireto`; o
 * historico da atleta nao entra). Vale nos plays desde
 * `CONFRONTO_NO_DIA_DESDE`; nos de antes, sem desempate gravado tudo sai como
 * sempre saiu -- o pódio e o 🔥 ja anunciados nao mudam.
 */

/** A partir deste play o confronto direto desempata o dia (todas e grupos). */
export const CONFRONTO_NO_DIA_DESDE = '2026-10-19'

/** As partidas que podem decidir pelo confronto direto, ou nada se o play e de antes. */
export function partidasDoConfronto(s: Pick<PlaySession, 'date'>, partidas: Match[]): Match[] | undefined {
  return s.date >= CONFRONTO_NO_DIA_DESDE ? partidas : undefined
}

/** Empate exato: o mesmo em vitorias, pontos e saldo (vale para os dois criterios do dia). */
export function empateExato(x: PlayerStat, y: PlayerStat): boolean {
  return x.wins === y.wins && x.points === y.points && balance(x) === balance(y)
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
}

export type DiaOrdenado = {
  /** A lista na ordem final: a de antes, com os empates decididos na quadra. */
  lista: PlayerStat[]
  /** Posicao de cada uma (empatadas sem desempate dividem a do comeco do bloco). */
  posicao: Map<string, number>
  /** Os empates ainda sem desempate: a posicao em que comecam e quem esta nele. */
  abertos: { posicao: number; ids: string[] }[]
}

/**
 * Aplica os desempates a uma lista ja ordenada (`rankPlayers`): primeiro o
 * decidido na quadra (gravado), depois o confronto direto entre duas.
 */
export function ordenarComDesempates(
  lista: PlayerStat[],
  gravados: DesempateDeGrupo[] = [],
  /** As partidas DO PLAY, para o confronto direto (sem elas, so a quadra decide). */
  partidas?: Match[],
): DiaOrdenado {
  const out: PlayerStat[] = []
  const posicao = new Map<string, number>()
  const abertos: DiaOrdenado['abertos'] = []
  let i = 0
  while (i < lista.length) {
    let j = i + 1
    while (j < lista.length && empateExato(lista[i], lista[j])) j++
    let bloco = lista.slice(i, j)
    const ids = bloco.map((x) => x.player_id)
    const gravado = bloco.length > 1 ? gravados.find((d) => mesmoConjunto(d.ordem, ids)) : undefined
    let decidido = Boolean(gravado)
    if (gravado) bloco = gravado.ordem.map((id) => bloco.find((x) => x.player_id === id) as PlayerStat)
    else if (bloco.length === 2 && partidas) {
      const c = confrontoDireto(bloco[0].player_id, bloco[1].player_id, partidas)
      if (c !== 0) {
        if (c < 0) bloco = [bloco[1], bloco[0]]
        decidido = true
      }
    }
    bloco.forEach((x, k) => {
      out.push(x)
      posicao.set(x.player_id, bloco.length === 1 || decidido ? i + k + 1 : i + 1)
    })
    if (bloco.length > 1 && !decidido) abertos.push({ posicao: i + 1, ids })
    i = j
  }
  return { lista: out, posicao, abertos }
}

/** Os desempates gravados de um grupo (indice em `session.groups`; 0 no todas). */
export function desempatesDoGrupo(gravados: DesempateDeGrupo[] | null | undefined, grupo: number): DesempateDeGrupo[] {
  return (gravados ?? []).filter((d) => d.grupo === grupo)
}
