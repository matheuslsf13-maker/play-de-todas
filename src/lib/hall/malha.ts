/**
 * A PELE DA MENINA: o desenho inteiro dela vira uma malha de triangulos presa
 * a ossos (como no Spine/Live2D). Andar dobra o desenho no joelho e no
 * cotovelo sem emenda -- a versao de pecas encaixadas mostrava as divisoes.
 *
 * A textura e o atlas de `scripts/hall/menina.py`: uma coluna por parte
 * (corpo, bracoPerto, bracoLonge, pernaPerto, pernaLonge, cabelo, e o corpo de
 * olhos fechados), cada uma com a continuacao escondida por baixo das partes da
 * frente. Cada parte e uma "ilha" da malha, desenhada na ordem da vista -- por
 * isso a perna da frente passa por cima da de tras e o braco se afasta do corpo
 * sem levar a camisa junto.
 *
 * Isto roda so na hora de GERAR os quadros (scripts/hall/quadros.mjs); no app
 * a menina e um sprite de pixel art pronto.
 */
import { ALTURA_MENINA, poseDosOssos, type Pose, type TipoDeVista } from './boneco'

type Par = [number, number]

export type VistaDaPele = {
  folha: string
  gabarito: [number, number, number, number]
  tipo: TipoDeVista
  ossos: Record<string, { pai: string | null; pivo: Par }>
  ordem: string[]
  logo: Par | null
}

export const PARTES = ['corpo', 'bracoPerto', 'bracoLonge', 'pernaPerto', 'pernaLonge', 'cabelo'] as const
type Parte = (typeof PARTES)[number]
/** Colunas do atlas: as 6 partes e o corpo piscando. */
export const COLUNAS = 7

export const OSSOS = [
  'corpo',
  'cabeca',
  'bracoPerto',
  'antebracoPerto',
  'bracoLonge',
  'antebracoLonge',
  'coxaPerto',
  'canelaPerto',
  'coxaLonge',
  'canelaLonge',
] as const
type Osso = (typeof OSSOS)[number]
const IDX = Object.fromEntries(OSSOS.map((o, i) => [o, i])) as Record<Osso, number>

export type Malha = {
  pos: Float32Array
  uv: Float32Array
  /** O mesmo uv, mas o corpo vem da coluna de olhos fechados. */
  uvPiscando: Float32Array
  ossos: Uint8Array
  pesos: Float32Array
  /** 0 = nao balanca; 1 = ponta do cabelo. */
  cabelo: Float32Array
  indices: Uint16Array
}

const suave = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function pesosDe(v: VistaDaPele, parte: Parte, y: number, topo: number): [Osso, number][] {
  const o = v.ossos
  const pescoco = o.cabeca.pivo[1]
  if (parte === 'corpo') {
    const cab = 1 - suave(pescoco - 30, pescoco + 10, y)
    return [
      ['cabeca', cab],
      ['corpo', 1 - cab],
    ]
  }
  if (parte === 'cabelo') {
    // preso na cabeca la em cima; embaixo, assentado nas costas
    const t = suave(pescoco - 10, pescoco + 140, y)
    return [
      ['cabeca', 1 - t],
      ['corpo', t],
    ]
  }
  const lado = parte.endsWith('Perto') ? 'Perto' : 'Longe'
  const braco = parte.startsWith('braco')
  const [cima, baixo] = braco ? (['braco', 'antebraco'] as const) : (['coxa', 'canela'] as const)
  const sai = suave(topo, topo + 60, y)
  const junta = o[`${baixo}${lado}`].pivo[1]
  const dobra = suave(junta - 32, junta + 32, y)
  return [
    ['corpo', 1 - sai],
    [`${cima}${lado}` as Osso, sai * (1 - dobra)],
    [`${baixo}${lado}` as Osso, sai * dobra],
  ]
}

/**
 * Monta a malha da vista. `alfa(coluna, x, y)` = opacidade (0..255) do pixel
 * (x, y) do desenho na coluna da parte.
 */
export function montarMalha(v: VistaDaPele, alfa: (col: number, x: number, y: number) => number, passo = 8): Malha {
  const [gx, gy, gw, gh] = v.gabarito
  const colunas = Math.ceil(gw / passo)
  const linhas = Math.ceil(gh / passo)
  const pos: number[] = []
  const uv: number[] = []
  const uvP: number[] = []
  const ossosV: number[] = []
  const pesos: number[] = []
  const cabelo: number[] = []
  const indices: number[] = []

  for (const nome of v.ordem as Parte[]) {
    const col = PARTES.indexOf(nome)
    const celulas: [number, number][] = []
    // onde a parte comeca em CADA coluna: a borda do short e inclinada, e um
    // "comeco" so para a perna inteira abria fresta no lado de fora da coxa
    const topoDaColuna = new Map<number, number>()
    let topo = Infinity
    let fundo = -Infinity
    for (let l = 0; l < linhas; l++) {
      for (let c = 0; c < colunas; c++) {
        let tem = false
        for (let yy = l * passo; yy < Math.min(gh, (l + 1) * passo) && !tem; yy += 2) {
          for (let xx = c * passo; xx < Math.min(gw, (c + 1) * passo); xx += 2) {
            if (alfa(col, xx, yy) > 6) {
              tem = true
              break
            }
          }
        }
        if (!tem) continue
        celulas.push([c, l])
        topo = Math.min(topo, l * passo + gy)
        if (!topoDaColuna.has(c)) topoDaColuna.set(c, l * passo + gy)
        fundo = Math.max(fundo, (l + 1) * passo + gy)
      }
    }
    const vertices = new Map<string, number>()
    const vertice = (c: number, l: number): number => {
      const chave = `${c}:${l}`
      const ja = vertices.get(chave)
      if (ja !== undefined) return ja
      const x = Math.min(c * passo, gw)
      const y = Math.min(l * passo, gh)
      const i = pos.length / 2
      pos.push(x + gx, y + gy)
      uv.push((col * gw + x) / (COLUNAS * gw), y / gh)
      uvP.push(((nome === 'corpo' ? 6 : col) * gw + x) / (COLUNAS * gw), y / gh)
      // o comeco por coluna so vale perto do quadril/ombro; mais embaixo (a ponta
      // do pe, que sai de lado) a parte "comeca" la em cima, como o resto dela
      const tcBruto = Math.min(topoDaColuna.get(c) ?? topo, topoDaColuna.get(c - 1) ?? Infinity)
      const tc = Number.isFinite(tcBruto) && tcBruto < topo + 90 ? tcBruto : topo
      const ps = pesosDe(v, nome, y + gy, tc)
      for (let k = 0; k < 3; k++) {
        ossosV.push(IDX[ps[k]?.[0] ?? 'corpo'])
        pesos.push(ps[k]?.[1] ?? 0)
      }
      const raiz = v.ossos.cabeca.pivo[1] - 70
      cabelo.push(nome === 'cabelo' ? Math.max(0, Math.min(1, (y + gy - raiz) / Math.max(1, fundo - raiz))) : 0)
      vertices.set(chave, i)
      return i
    }
    for (const [c, l] of celulas) {
      const a = vertice(c, l)
      const b = vertice(c + 1, l)
      const d = vertice(c, l + 1)
      const e = vertice(c + 1, l + 1)
      indices.push(a, b, d, b, e, d)
    }
  }
  return {
    pos: new Float32Array(pos),
    uv: new Float32Array(uv),
    uvPiscando: new Float32Array(uvP),
    ossos: new Uint8Array(ossosV),
    pesos: new Float32Array(pesos),
    cabelo: new Float32Array(cabelo),
    indices: new Uint16Array(indices),
  }
}

/** Matriz 2D [a, b, c, d, e, f]: x' = a x + c y + e ; y' = b x + d y + f. */
export type M = [number, number, number, number, number, number]
const vezes = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
]
const mover = (x: number, y: number): M => [1, 0, 0, 1, x, y]
const girar = (graus: number): M => {
  const r = (graus * Math.PI) / 180
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
}
const esticar = (sx: number, sy: number): M => [sx, 0, 0, sy, 0, 0]

/** Pixels do sprite por pixel do desenho, nesta vista. */
export const escalaDa = (v: VistaDaPele) => ALTURA_MENINA / v.gabarito[3]

/**
 * As matrizes dos ossos numa pose: do desenho (pixels da folha) para o sprite
 * (pe no meio, em (0, 0); y para cima e negativo).
 */
export function matrizesDaPose(v: VistaDaPele, p: Pose, espelho = false): { mats: M[]; pose: ReturnType<typeof poseDosOssos> } {
  const pose = poseDosOssos(v.tipo, p)
  const k = escalaDa(v)
  const cx = v.ossos.corpo.pivo[0]
  const sola = v.gabarito[1] + v.gabarito[3]
  const raiz: M = vezes([espelho ? -k : k, 0, 0, k, 0, -pose.sobe], mover(-cx, -sola))
  const feitas = new Map<string, M>()
  const de = (id: string): M => {
    const ja = feitas.get(id)
    if (ja) return ja
    const os = v.ossos[id]
    const pai = os.pai ? de(os.pai) : raiz
    const [px, py] = os.pivo
    const [dx, dy] = pose.desloca[id] ?? [0, 0]
    const [sx, sy] = pose.escala[id] ?? [1, 1]
    const m = vezes(
      vezes(vezes(vezes(vezes(pai, mover(dx / k, dy / k)), mover(px, py)), girar(pose.angulos[id] ?? 0)), esticar(sx, sy)),
      mover(-px, -py),
    )
    feitas.set(id, m)
    return m
  }
  return { mats: OSSOS.map((o) => de(o)), pose }
}

/** Leva um ponto do desenho para o sprite pelo osso `osso` (para o logo). */
export function pontoNoOsso(mats: M[], osso: Osso, x: number, y: number): Par {
  const t = mats[IDX[osso]]
  return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]]
}

/**
 * Aplica os ossos na malha e o balanco do cabelo: a onda desce do alto da
 * cabeca ate a ponta, atrasada (a ponta acompanha depois do corpo).
 */
export function deformar(
  m: Malha,
  mats: M[],
  cabelo: { balanco: number; inclina: number; y: number; fase: number },
  espelho = false,
): Float32Array {
  const n = m.pos.length / 2
  const out = new Float32Array(m.pos.length)
  const lado = espelho ? -1 : 1
  for (let i = 0; i < n; i++) {
    const x = m.pos[2 * i]
    const y = m.pos[2 * i + 1]
    let ox = 0
    let oy = 0
    for (let k = 0; k < 3; k++) {
      const w = m.pesos[3 * i + k]
      if (!w) continue
      const t = mats[m.ossos[3 * i + k]]
      ox += w * (t[0] * x + t[2] * y + t[4])
      oy += w * (t[1] * x + t[3] * y + t[5])
    }
    const f = m.cabelo[i]
    if (f > 0) {
      const forca = f ** 1.6
      const onda = Math.sin(cabelo.fase - f * 2.4)
      ox += lado * forca * (cabelo.inclina + cabelo.balanco * onda)
      oy += cabelo.y * forca * onda
    }
    out[2 * i] = ox
    out[2 * i + 1] = oy
  }
  return out
}
