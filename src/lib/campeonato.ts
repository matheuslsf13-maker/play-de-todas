/*
 * MODO CAMPEONATO -- as regras puras.
 *
 * O campeonato e UM play `grupos-duplas` dividido em categorias por nivel
 * (A, B, C...), cada uma com os seus grupos e as suas quadras fixas. Por
 * dentro, `session.groups` continua sendo uma lista so (A-G1, A-G2, B-G1...),
 * entao o rodizio, a fila e o "quem esta em quadra" nao mudam; a categoria e
 * uma camada por cima, guardada em `session.categorias`. Sem ela o play e uma
 * categoria so -- o grupos+duplas de sempre.
 *
 * Desenho em docs/superpowers/specs/2026-10-06-campeonato-design.md.
 */
import { filaPorForca } from './pairing'
import type { Categoria, Match, PlaySession } from './types'

/** 'A', 'B', 'C'... */
export function nomeDaCategoria(i: number): string {
  return String.fromCharCode(65 + i)
}

/** Corta a lista em `partes` pedacos de tamanhos o mais iguais possivel; a sobra vai para os primeiros. */
export function fatiar<T>(lista: T[], partes: number): T[][] {
  const n = Math.max(1, partes)
  const base = Math.floor(lista.length / n)
  const sobra = lista.length % n
  const out: T[][] = []
  let i = 0
  for (let k = 0; k < n; k++) {
    const tam = base + (k < sobra ? 1 : 0)
    out.push(lista.slice(i, i + tam))
    i += tam
  }
  return out
}

/**
 * A divisao automatica: categorias e grupos POR NIVEL.
 *
 * A fila por forca (empatadas sorteadas com a semente) e cortada em fatias
 * seguidas: a primeira fatia e a categoria A, e dentro dela a primeira e o
 * grupo 1. Fatias seguidas de uma fila ordenada sao exatamente "as mais
 * fortes juntas", que e o que a organizacao pediu -- com grupos equilibrados,
 * a 1a de cada grupo virava uma superdupla na fase 2.
 */
export function dividirEmCategorias(
  ids: string[],
  ratings: Map<string, number>,
  nCategorias: number,
  gruposPorCategoria: number,
  semente?: number,
): string[][][] {
  const fila = filaPorForca(ids, ratings, semente)
  return fatiar(fila, nCategorias).map((cat) => fatiar(cat, gruposPorCategoria))
}

/**
 * As quadras de cada categoria, numeradas em sequencia (A nas primeiras). Com
 * menos quadras que categorias, as que sobram dividem a ultima quadra.
 */
export function quadrasPadrao(nCategorias: number, total: number): number[][] {
  if (total >= nCategorias) {
    return fatiar(Array.from({ length: total }, (_, i) => i + 1), nCategorias)
  }
  return Array.from({ length: nCategorias }, (_, i) => [Math.min(i + 1, Math.max(1, total))])
}

/** De [categoria][grupo][ids] para o que a sessao grava: os grupos numa lista so e as categorias apontando para eles. */
export function montarCategorias(
  estrutura: string[][][],
  quadras: number[][],
): { groups: string[][]; categorias: Categoria[] } {
  const groups: string[][] = []
  const categorias: Categoria[] = estrutura.map((grupos, c) => {
    const indices = grupos.map((g) => {
      groups.push(g.slice())
      return groups.length - 1
    })
    return { nome: nomeDaCategoria(c), grupos: indices, quadras: (quadras[c] ?? []).slice() }
  })
  return { groups, categorias }
}

/** As categorias do play; sem elas, uma categoria so com todos os grupos e todas as quadras. */
export function categoriasDoPlay(
  s: Pick<PlaySession, 'categorias' | 'groups' | 'courts'>,
): Categoria[] {
  if (s.categorias?.length) return s.categorias
  const grupos = s.groups?.length ? s.groups.map((_, i) => i) : [0]
  return [
    {
      nome: nomeDaCategoria(0),
      grupos,
      quadras: Array.from({ length: Math.max(1, s.courts) }, (_, i) => i + 1),
    },
  ]
}

/** Em que categoria a jogadora esta (-1 se em nenhuma). */
export function categoriaDaJogadora(cats: Categoria[], groups: string[][] | null | undefined, id: string): number {
  const g = (groups ?? []).findIndex((x) => x.includes(id))
  if (g < 0) return cats.length === 1 ? 0 : -1
  return cats.findIndex((c) => c.grupos.includes(g))
}

/** A categoria de uma partida sai de quem joga nela, como o grupo. */
export function categoriaDaPartida(cats: Categoria[], groups: string[][] | null | undefined, m: Match): number {
  return categoriaDaJogadora(cats, groups, m.team_a[0])
}
