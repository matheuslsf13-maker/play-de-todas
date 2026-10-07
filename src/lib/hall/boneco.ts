/**
 * AS POSES DA MENINA: quanto cada osso gira, desliza ou estica em cada quadro,
 * e para onde o cabelo balanca.
 *
 * O PE NAO PODE PATINAR. Cada perna alterna duas fases:
 *  - APOIO (metade do ciclo): o pe esta no chao e, em relacao ao corpo, vai de
 *    "na frente" para "atras" em linha reta, na mesma velocidade em que o corpo
 *    anda -- entao, no chao, ele fica parado;
 *  - BALANCO (a outra metade): o pe sai do chao, o joelho dobra e ele volta para
 *    a frente.
 * O app avanca a animacao pela DISTANCIA andada (CICLO_EM_PX), nao pelo tempo.
 *
 * Como cada vista e um desenho 2D, "a frente" muda de jeito:
 *  - de LADO: a perna gira no plano da tela;
 *  - de FRENTE (vindo para a camera): a camera e um pouco alta, entao o pe que vai
 *    a frente desce na tela (e a perna parece mais comprida) e o de tras sobe (e
 *    parece mais curta) -- escala da perna = cos(t) + sen(t) * tg(camera);
 *  - de COSTAS: o contrario;
 *  - em DIAGONAL: um pouco das duas coisas.
 *
 * Angulos em graus (positivo = horario na tela), deslocamentos e `sobe` em
 * pixels do sprite (192 de altura), escala por osso [x, y] em volta do pivo.
 */

/** Altura da menina em pe, em pixels do sprite. */
export const ALTURA_MENINA = 192

export type TipoDeVista = 'lado' | 'frente' | 'costas' | 'diagonalFrente' | 'diagonalCostas'

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
/** A camera olha de cima com uns 30 graus: tg(30). */
const TG_CAMERA = Math.tan((30 * Math.PI) / 180)
const rad = (g: number) => (g * Math.PI) / 180

/**
 * Quanto a tela anda (px do sprite) em um ciclo inteiro (dois passos), em cada
 * vista -- e o que faz o pe ficar parado no chao. Sai das contas das poses
 * (perna ~92 px): de lado 2 x 2 x 92 x sen(24); de frente 2 x 2 x 92 x sen(23)
 * x tg(30); na diagonal 2 x 2 x hipot(92 x sen(14), 92 x 0,12).
 */
export const CICLO_EM_PX: Record<TipoDeVista, number> = {
  lado: 150,
  frente: 83,
  costas: 83,
  diagonalFrente: 100,
  diagonalCostas: 100,
}

/** Onde esta o pe de uma perna no ciclo: u = +1 na frente, -1 atras; e quanto ele esta no ar. */
function perna(fase: number): { u: number; ar: number } {
  const p = ((fase % 1) + 1) % 1
  if (p < 0.5) return { u: 1 - 4 * p, ar: 0 } // apoio: linear, como o chao
  const t = (p - 0.5) * 2
  const s = t * t * (3 - 2 * t)
  return { u: -1 + 2 * s, ar: Math.sin(Math.PI * t) }
}

export function poseDosOssos(tipo: TipoDeVista, p: Pose): PoseDosOssos {
  if (p.tipo === 'parada') {
    const s = Math.sin(p.fase * PI2)
    // respira (o peito sobe e desce), a cabeca acompanha, o cabelo vai com a brisa
    return {
      angulos: { cabeca: 1.2 * s, bracoPerto: -1.2 * s, bracoLonge: 1.2 * s, antebracoPerto: -2, antebracoLonge: 2 },
      desloca: {},
      escala: { corpo: [1, 1 + 0.006 * s] },
      sobe: 0,
      cabelo: { balanco: 2.2, inclina: 0, y: 0.6, fase: p.fase * PI2 },
    }
  }

  const fase = ((p.fase % 1) + 1) % 1
  const P = perna(fase) // perna perto
  const L = perna(fase + 0.5) // perna longe
  // o corpo fica mais alto quando a perna de apoio passa embaixo dele (u ~ 0)
  const apoio = fase < 0.5 ? P : L
  const sobe = 2.2 * (1 - Math.abs(apoio.u)) - 0.6
  // e pende para o lado da perna de apoio
  const lado = fase < 0.5 ? -1 : 1
  const cabelo = { balanco: 1.8, inclina: 0, y: 1, fase: p.fase * PI2 * 2 }

  if (tipo === 'lado') {
    const t = 24
    return {
      angulos: {
        corpo: -1.5,
        cabeca: 1.5,
        // de perfil, para a frente e girar no sentido anti-horario
        coxaPerto: -t * P.u,
        coxaLonge: -t * L.u,
        canelaPerto: 3 + 46 * P.ar,
        canelaLonge: 3 + 46 * L.ar,
        // braco ao contrario da perna do mesmo lado
        bracoPerto: 18 * P.u,
        bracoLonge: 18 * L.u,
        antebracoPerto: -8 - 12 * Math.max(0, -P.u),
        antebracoLonge: -8 - 12 * Math.max(0, -L.u),
      },
      desloca: {},
      escala: {},
      sobe,
      cabelo: { ...cabelo, balanco: 1.6, inclina: -2.2 },
    }
  }

  if (tipo === 'frente' || tipo === 'costas') {
    const t = 23
    const sinal = tipo === 'frente' ? 1 : -1 // de costas, o pe da frente sobe na tela
    const esticar = (u: number) => Math.cos(rad(t * u)) + sinal * Math.sin(rad(t * u)) * TG_CAMERA
    return {
      angulos: {
        corpo: 1.2 * lado,
        cabeca: -1 * lado,
        // o pe no ar abre um tiquinho para fora (nao bate no outro)
        coxaPerto: 2.5 * P.ar,
        coxaLonge: -2.5 * L.ar,
        antebracoPerto: -2,
        antebracoLonge: 2,
      },
      desloca: { corpo: [1.4 * lado, 0] },
      escala: {
        coxaPerto: [1, esticar(P.u) - 0.1 * P.ar],
        coxaLonge: [1, esticar(L.u) - 0.1 * L.ar],
        // o joelho dobrando, visto de frente, encurta a canela
        canelaPerto: [1, 1 - 0.1 * P.ar],
        canelaLonge: [1, 1 - 0.1 * L.ar],
        // o braco vai para a frente (desce um pouco na tela) quando a perna do mesmo lado vai para tras
        bracoPerto: [1, 1 - sinal * 0.05 * P.u],
        bracoLonge: [1, 1 - sinal * 0.05 * L.u],
      },
      sobe,
      cabelo: { ...cabelo, balanco: 2 * lado },
    }
  }

  // diagonal (tres-quartos): passo para o lado (gira) e para a camera (estica)
  const t = 14
  const sinal = tipo === 'diagonalFrente' ? 1 : -1
  return {
    angulos: {
      corpo: 1 * lado,
      cabeca: -1 * lado,
      coxaPerto: -t * P.u,
      coxaLonge: -t * L.u,
      canelaPerto: 3 + 28 * P.ar,
      canelaLonge: 3 + 28 * L.ar,
      bracoPerto: 7 * P.u,
      bracoLonge: 7 * L.u,
      antebracoPerto: -5 - 6 * Math.max(0, -P.u),
      antebracoLonge: -5 - 6 * Math.max(0, -L.u),
    },
    desloca: {},
    escala: {
      coxaPerto: [1, 1 + sinal * 0.12 * P.u - 0.06 * P.ar],
      coxaLonge: [1, 1 + sinal * 0.12 * L.u - 0.06 * L.ar],
    },
    sobe,
    cabelo: { ...cabelo, inclina: -1.2 },
  }
}
