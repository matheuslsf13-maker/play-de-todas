/**
 * A MENINA NO APP: a folha de sprites de pixel art (scripts/hall/sprites.py) e
 * qual quadro mostrar para cada direcao, andando ou parada.
 *
 * As 8 direcoes saem de 6 desenhos: perfil e costas-tres-quartos para a
 * esquerda sao o espelho dos da direita (o da frente-tres-quartos nao, porque o
 * logo da camisa sairia ao contrario).
 */

export type FolhaDeSprites = {
  largura: number
  altura: number
  /** Onde fica o pe dentro de cada quadro. */
  peX: number
  peY: number
  /** Canto de cada quadro na imagem. */
  quadros: [number, number][]
  /** desenho -> animacao -> quadros (ex.: frente34E -> andar -> [..]). */
  animacoes: Record<string, Record<string, number[]>>
}

/** As 8 direcoes na tela (S = descendo a tela, na direcao de quem olha). */
export type Direcao = 'S' | 'SE' | 'E' | 'NE' | 'N' | 'NO' | 'O' | 'SO'

/** Em sentido horario, olhando de cima: o giro de 360 passa por elas nessa ordem. */
export const GIRO: Direcao[] = ['S', 'SO', 'O', 'NO', 'N', 'NE', 'E', 'SE']

const DESENHO: Record<Direcao, [string, boolean]> = {
  S: ['frente', false],
  SE: ['frente34', false],
  E: ['perfil', false],
  NE: ['costas34', false],
  N: ['costas', false],
  NO: ['costas34', true],
  O: ['perfil', true],
  SO: ['frente34E', false],
}

/** A direcao de um movimento (dx, dy) na tela. */
export function direcaoDe(dx: number, dy: number): Direcao {
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI // 0 = direita, 90 = baixo
  const setor = Math.round((((ang % 360) + 360) % 360) / 45) % 8
  return (['E', 'SE', 'S', 'SO', 'O', 'NO', 'N', 'NE'] as Direcao[])[setor]
}

/** Comprimento (px do sprite) de um ciclo de caminhada: dois passos, sem o pe patinar. */
export const PASSO_DO_CICLO = 146
/** Quanto dura o ciclo de "parada" (respirar e o cabelo na brisa), em segundos. */
export const CICLO_PARADA = 2.4

/**
 * Desenha a menina com o pe em (x, y) do `ctx` (que ja deve estar na escala do
 * pixel art, com imageSmoothingEnabled = false).
 */
export function desenharMenina(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  folha: FolhaDeSprites,
  x: number,
  y: number,
  direcao: Direcao,
  tipo: 'andar' | 'parada',
  fase: number,
  piscando = false,
) {
  const [desenho, espelho] = DESENHO[direcao]
  const anims = folha.animacoes[desenho]
  const lista = (piscando && anims[`${tipo}-piscando`]) || anims[tipo]
  const n = lista.length
  const k = lista[((Math.floor(fase * n) % n) + n) % n]
  const [sx, sy] = folha.quadros[k]
  const px = Math.round(x)
  const py = Math.round(y)
  ctx.save()
  if (espelho) {
    ctx.translate(px, py)
    ctx.scale(-1, 1)
    ctx.drawImage(img, sx, sy, folha.largura, folha.altura, -folha.peX, -folha.peY, folha.largura, folha.altura)
  } else {
    ctx.drawImage(img, sx, sy, folha.largura, folha.altura, px - folha.peX, py - folha.peY, folha.largura, folha.altura)
  }
  ctx.restore()
}
