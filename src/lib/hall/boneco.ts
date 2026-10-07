/**
 * COMO A MENINA E DESENHADA NO HALL.
 *
 * Ela e um boneco articulado: cada parte do corpo e uma peca, e o codigo mexe
 * os ossos (quadril, joelho, ombro, cotovelo) para andar, sentar, treinar...
 * As pecas de verdade saem do kit do ChatGPT (cartoon aprovado, frente e
 * costas) e sao montadas em `rig.ts`; aqui ficam a pose e a sombra.
 *
 * Convencao: o pe fica em (0, 0) e o corpo sobe para y negativo, em pixels da
 * pintura do cenario (a porta da casa tem ~140 de altura).
 */

/** Altura da menina em pe, em pixels da pintura. */
export const ALTURA_MENINA = 106

export type Pose = {
  /** 'andar' usa `fase`; 'parada' respira devagar. */
  tipo: 'andar' | 'parada'
  /** Ciclo da caminhada, em voltas (0..1 = um passo de cada perna). */
  fase: number
  /** Vista de frente (descendo na tela) ou de costas (subindo). */
  olhando: 'frente' | 'costas'
  /** Andando para a esquerda: a mesma pose espelhada. */
  espelho: boolean
}

/**
 * A pose em angulos (graus, positivo = horario na tela) e deslocamentos (em
 * pixels da pintura) de cada osso. Nomes = os ossos do boneco (`rig.ts`).
 *
 * A vista e de tres-quartos: andar "para a frente" e ir para baixo e para o
 * lado ao mesmo tempo. So girar a perna no plano da tela fazia uma tesoura
 * (as pernas cruzando); por isso o passo e curto e o pe que vai a frente
 * DESCE um pouco (chega mais perto da camera) enquanto o de tras sobe.
 */
export function ossos(p: Pose, tempo: number): {
  angulos: Record<string, number>
  desloca: Record<string, [number, number]>
  sobe: number
} {
  if (p.tipo === 'andar') {
    const s = Math.sin(p.fase * Math.PI * 2)
    const c = Math.cos(p.fase * Math.PI * 2)
    return {
      angulos: {
        corpo: 1.2 * s,
        cabeca: -1.2 * s,
        coxaPerto: -8 * s,
        coxaLonge: 8 * s,
        // o joelho dobra na perna que esta voltando (no ar)
        canelaPerto: 3 + 22 * Math.max(0, -c),
        canelaLonge: 3 + 22 * Math.max(0, c),
        bracoPerto: 9 * s,
        bracoLonge: -9 * s,
        antebracoPerto: -6 - 6 * Math.max(0, s),
        antebracoLonge: -6 - 6 * Math.max(0, -s),
      },
      desloca: {
        coxaPerto: [1.2 * s, 3.4 * s],
        coxaLonge: [-1.2 * s, -3.4 * s],
      },
      sobe: Math.abs(c) * 1.6,
    }
  }
  const r = Math.sin(tempo * 1.6)
  return {
    angulos: { cabeca: r * 1.2, bracoPerto: -2 - r * 0.8, bracoLonge: 2 + r * 0.8, antebracoPerto: -5, antebracoLonge: -5 },
    desloca: {},
    sobe: r * 0.4,
  }
}

/** Sombra no chao, embaixo do pe (desenhada antes do corpo). */
export function desenharSombra(ctx: CanvasRenderingContext2D, noite: number) {
  ctx.save()
  ctx.fillStyle = `rgba(40, 25, 10, ${0.28 - 0.12 * noite})`
  ctx.beginPath()
  ctx.ellipse(0, 0, 17, 6.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
