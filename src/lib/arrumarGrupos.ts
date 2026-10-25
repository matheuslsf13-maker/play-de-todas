import {
  duplaMista,
  gerarFila,
  grupoMisto,
  jogadorasDaPartida,
  jogosDoRodizio,
  partidasDoRodizio,
  type Generos,
  type PlannedMatch,
  type ScheduleOptions,
} from './pairing'
import { pairKey } from './stats'

/*
 * ARRUMAR OS GRUPOS COM O PLAY JA CRIADO (antes da 1ª partida)
 *
 * Mover alguem de grupo refaz a fila inteira. Antes de gravar, a fila nova e
 * CONFERIDA -- se alguma coisa nao fecha, nada e gravado e o play fica como
 * estava:
 *  - os grupos: cada jogadora do play em exatamente um grupo, ninguem de fora,
 *    todo grupo com pelo menos 4;
 *  - a fila: cada partida com quatro pessoas diferentes, todas do grupo da
 *    partida; cada uma joga `jogosDoRodizio` vezes (todas o mesmo numero);
 *    toda dupla do rodizio se forma (no misto de duplas mistas, toda dupla
 *    H+M, e so elas); o total e o `partidasDoRodizio` de cada grupo.
 */

/** Move uma jogadora para outro grupo do rascunho (tira de onde estiver). */
export function moverNoRascunho(grupos: string[][], id: string, para: number): string[][] {
  return grupos.map((g, i) => (i === para ? [...g.filter((x) => x !== id), id] : g.filter((x) => x !== id)))
}

/** O que impede estes grupos de virarem um play (vazio = pode). */
export function problemasDosGrupos(jogadoras: string[], grupos: string[][], nomeDoGrupo: (i: number) => string): string[] {
  const out: string[] = []
  const vezes = new Map<string, number>()
  for (const g of grupos) for (const id of g) vezes.set(id, (vezes.get(id) ?? 0) + 1)
  const noPlay = new Set(jogadoras)
  if (jogadoras.some((id) => (vezes.get(id) ?? 0) !== 1) || [...vezes.keys()].some((id) => !noPlay.has(id))) {
    out.push('cada pessoa do play precisa estar em um grupo só')
  }
  grupos.forEach((g, i) => {
    if (g.length < 4) out.push(`${nomeDoGrupo(i)} ficaria com menos de 4`)
  })
  return out
}

/** O que esta errado nesta fila para estes grupos (vazio = a fila esta certa). */
export function problemasDaFila(grupos: string[][], fila: PlannedMatch[], nomeDoGrupo: (i: number) => string, genero?: Generos): string[] {
  const out: string[] = []
  for (const m of fila) {
    const quatro = jogadorasDaPartida(m)
    const g = grupos[m.grupo]
    if (!g) {
      out.push('partida sem grupo')
      continue
    }
    if (new Set(quatro).size !== 4) out.push(`${nomeDoGrupo(m.grupo)}: partida com a mesma pessoa duas vezes`)
    if (quatro.some((id) => !g.includes(id))) out.push(`${nomeDoGrupo(m.grupo)}: partida com gente de outro grupo`)
    if ((m.fase ?? 1) !== 1) out.push(`${nomeDoGrupo(m.grupo)}: partida fora da fase de grupos`)
  }
  grupos.forEach((g, gi) => {
    const nome = nomeDoGrupo(gi)
    const doGrupo = fila.filter((m) => m.grupo === gi)
    const misto = grupoMisto(g, genero)
    const alvo = jogosDoRodizio(g.length, misto)
    if (doGrupo.length !== partidasDoRodizio(g.length, misto)) {
      out.push(`${nome}: ${doGrupo.length} partidas, o rodízio pede ${partidasDoRodizio(g.length, misto)}`)
    }
    const jogos = new Map(g.map((id) => [id, 0]))
    const duplas = new Set<string>()
    for (const m of doGrupo) {
      for (const id of jogadorasDaPartida(m)) jogos.set(id, (jogos.get(id) ?? 0) + 1)
      for (const d of [m.team_a, m.team_b]) {
        duplas.add(pairKey(d[0], d[1]))
        if (misto && !duplaMista(d, genero)) out.push(`${nome}: dupla que não é mista`)
      }
    }
    if ([...jogos.values()].some((n) => n !== alvo)) out.push(`${nome}: nem todos com ${alvo} jogos`)
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (misto && !duplaMista([g[i], g[j]], genero)) continue
        if (!duplas.has(pairKey(g[i], g[j]))) {
          out.push(`${nome}: dupla do rodízio que nunca se forma`)
          i = g.length
          break
        }
      }
    }
  })
  return [...new Set(out)]
}

/**
 * A fila nova dos grupos arrumados, ja conferida. O gerador tem sorteios
 * internos: se uma tentativa nao fecha, tenta de novo (ate `tentativas`);
 * `problemas` vazio quer dizer que a fila devolvida esta certa.
 */
export function filaDosGruposArrumados(
  opts: Omit<ScheduleOptions, 'groups'> & { groups: string[][]; nomeDoGrupo: (i: number) => string; tentativas?: number },
): { fila: PlannedMatch[]; problemas: string[] } {
  const grupos = problemasDosGrupos(opts.playerIds, opts.groups, opts.nomeDoGrupo)
  if (grupos.length) return { fila: [], problemas: grupos }
  let fila: PlannedMatch[] = []
  let problemas: string[] = []
  for (let t = 0; t < (opts.tentativas ?? 5); t++) {
    fila = gerarFila(opts)
    problemas = problemasDaFila(opts.groups, fila, opts.nomeDoGrupo, opts.genero)
    if (problemas.length === 0) break
  }
  return { fila, problemas }
}
