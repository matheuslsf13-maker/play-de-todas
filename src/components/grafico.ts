/*
 * O que os dois graficos de linha (forca da menina e da dupla) dividem: quais
 * pontos levam o numero em cima sem um encostar no outro, e de que lado.
 */

/** Largura minima (no viewBox) para o numero de um ponto nao encostar no do vizinho. */
const ESPACO_DO_ROTULO = 24

/**
 * Os pontos que levam o numero. Com espaco, todos. Apertado: o primeiro, o
 * ultimo, o maior, o menor e um a cada tantos -- o resto fica no toque.
 */
export function pontosComRotulo(notas: number[], larguraUtil: number): Set<number> {
  const n = notas.length
  if (n === 0) return new Set()
  const passo = n > 1 ? larguraUtil / (n - 1) : larguraUtil
  if (passo >= ESPACO_DO_ROTULO) return new Set(notas.map((_, i) => i))
  const salto = Math.ceil(ESPACO_DO_ROTULO / passo)
  const out = new Set<number>([0, n - 1, notas.indexOf(Math.max(...notas)), notas.indexOf(Math.min(...notas))])
  for (let i = 0; i < n; i += salto) out.add(i)
  // tira quem ficou colado num rotulo obrigatorio
  const obrigatorios = [0, n - 1, notas.indexOf(Math.max(...notas)), notas.indexOf(Math.min(...notas))]
  for (const i of [...out]) {
    if (obrigatorios.includes(i)) continue
    if (obrigatorios.some((o) => Math.abs(o - i) * passo < ESPACO_DO_ROTULO)) out.delete(i)
  }
  return out
}

/**
 * O numero vai EMBAIXO quando o ponto e um vale (mais baixo que os dois
 * vizinhos): em cima ele cairia na linha. As pontas ficam sempre em cima --
 * embaixo elas encostavam no eixo e na linha da media.
 */
export function rotuloEmbaixo(notas: number[], i: number): boolean {
  if (i === 0 || i === notas.length - 1) return false
  return notas[i] < notas[i - 1] && notas[i] < notas[i + 1]
}

/** "12/10/2026" -> "12/10": no eixo o ano so ocupa espaco. */
export const diaMes = (rotulo: string) => rotulo.slice(0, 5)
