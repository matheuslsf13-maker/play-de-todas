/**
 * AS POSES DA MENINA: quanto cada osso gira, desliza ou encolhe em cada
 * quadro, e para onde o cabelo balanca.
 *
 * Cada vista anda de um jeito, porque o desenho e 2D:
 *  - de LADO (perfil): o passo classico -- a perna vai a frente no plano da tela
 *    e o joelho dobra na volta;
 *  - RETA (de frente ou de costas): a perna vem na direcao da camera, entao no
 *    desenho ela so SOBE e encurta (joelho dobrando), o quadril balanca de lado;
 *  - em DIAGONAL (tres-quartos): o passo e curto e o pe da frente desce um
 *    pouco (chega mais perto da camera) -- girar a perna inteira no plano da
 *    tela fazia as pernas cruzarem em tesoura.
 *
 * Angulos em graus (positivo = horario na tela), deslocamentos e `sobe` em
 * pixels do sprite final (192 de altura), escala por osso [x, y] em volta do pivo.
 */

/** Altura da menina em pe, em pixels do sprite. */
export const ALTURA_MENINA = 192

export type TipoDeVista = 'lado' | 'reta' | 'diagonal'

export type Pose = {
  tipo: 'andar' | 'parada'
  /** 0..1: o ciclo da caminhada (dois passos) ou do balanco parado. */
  fase: number
}

export type PoseDosOssos = {
  angulos: Record<string, number>
  desloca: Record<string, [number, number]>
  escala: Record<string, [number, number]>
  sobe: number
  /**
   * O cabelo (em pixels do sprite, na ponta): `balanco` = quanto vai e volta,
   * `inclina` = quanto fica para tras andando de lado, `y` = quanto sobe e desce,
   * `fase` = a onda (desce da cabeca ate a ponta, atrasada).
   */
  cabelo: { balanco: number; inclina: number; y: number; fase: number }
}

const PI2 = Math.PI * 2

export function poseDosOssos(tipo: TipoDeVista, p: Pose): PoseDosOssos {
  const s = Math.sin(p.fase * PI2)
  const c = Math.cos(p.fase * PI2)
  if (p.tipo === 'parada') {
    // respira (o peito sobe e desce), a cabeca acompanha, o cabelo vai com a brisa
    return {
      angulos: { cabeca: 1.2 * s, bracoPerto: -1.2 * s, bracoLonge: 1.2 * s, antebracoPerto: -2, antebracoLonge: 2 },
      desloca: {},
      escala: { corpo: [1, 1 + 0.006 * s] },
      sobe: 0,
      cabelo: { balanco: 2.2, inclina: 0, y: 0.6, fase: p.fase * PI2 },
    }
  }
  if (tipo === 'lado') {
    return {
      angulos: {
        corpo: -1.5 + 1 * c,
        cabeca: 1.5 - 1 * c,
        coxaPerto: -24 * s,
        coxaLonge: 24 * s,
        // o joelho dobra na perna que esta passando para a frente
        canelaPerto: 6 + 42 * Math.max(0, c),
        canelaLonge: 6 + 42 * Math.max(0, -c),
        bracoPerto: 20 * s,
        bracoLonge: -20 * s,
        antebracoPerto: -10 - 14 * Math.max(0, -s),
        antebracoLonge: -10 - 14 * Math.max(0, s),
      },
      desloca: {},
      escala: {},
      sobe: -3 * Math.abs(s) + 1.5,
      cabelo: { balanco: 1.6, inclina: -2.2, y: 1.2, fase: p.fase * PI2 * 2 },
    }
  }
  if (tipo === 'reta') {
    const ergueP = Math.max(0, s)
    const ergueL = Math.max(0, -s)
    return {
      angulos: {
        corpo: 1.6 * s,
        cabeca: -1.2 * s,
        coxaPerto: 3 * ergueP,
        coxaLonge: -3 * ergueL,
        // de frente o braco vai e volta na direcao da camera: no desenho mexe pouco
        bracoPerto: 2.5 * s,
        bracoLonge: 2.5 * s,
        antebracoPerto: -2 - 3 * ergueL,
        antebracoLonge: 2 + 3 * ergueP,
      },
      desloca: { corpo: [1.6 * s, 0] },
      // a perna que vem na direcao da camera encurta (o joelho dobrando)
      escala: {
        coxaPerto: [1, 1 - 0.07 * ergueP],
        canelaPerto: [1, 1 - 0.13 * ergueP],
        coxaLonge: [1, 1 - 0.07 * ergueL],
        canelaLonge: [1, 1 - 0.13 * ergueL],
      },
      sobe: 2 * Math.abs(c),
      cabelo: { balanco: 2.2, inclina: 0, y: 1, fase: p.fase * PI2 * 2 },
    }
  }
  // diagonal (tres-quartos)
  return {
    angulos: {
      corpo: 1.2 * s,
      cabeca: -1.2 * s,
      coxaPerto: -8 * s,
      coxaLonge: 8 * s,
      canelaPerto: 3 + 22 * Math.max(0, -c),
      canelaLonge: 3 + 22 * Math.max(0, c),
      bracoPerto: 6 * s,
      bracoLonge: -6 * s,
      antebracoPerto: -4 - 5 * Math.max(0, s),
      antebracoLonge: -4 - 5 * Math.max(0, -s),
    },
    desloca: {
      coxaPerto: [1.5 * s, 3.5 * s],
      coxaLonge: [-1.5 * s, -3.5 * s],
    },
    escala: {},
    sobe: 3 * Math.abs(c),
    cabelo: { balanco: 1.6, inclina: -1.2, y: 1, fase: p.fase * PI2 * 2 },
  }
}
