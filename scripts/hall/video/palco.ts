/**
 * PALCO PROVISORIO para o video de aprovacao da animacao: um deck de madeira
 * com escada descendo para a areia e o mar no canto, tudo em pixel art feito por
 * codigo (o cenario de verdade vem do conceito aprovado). A menina e a do app
 * (src/lib/hall/sprite.ts) e anda por um roteiro: parada (respira, pisca, o
 * cabelo na brisa), gira 360, anda nas 8 direcoes, desce a escada degrau a
 * degrau, anda na areia; no fim a noite cai e o lampiao acende.
 */
import { CICLO_DA_DIRECAO, CICLO_PARADA, GIRO, desenharMenina, direcaoDe, velocidadeNaTela, type Direcao, type FolhaDeSprites } from '../../../src/lib/hall/sprite'

const MUNDO = { w: 1000, h: 1400 }
const ESCALA = 2 // cada pixel da arte = 2x2 na tela

/* ------------------------------------------------------------ o cenario */

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
type RGB = [number, number, number]
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]

const AREIA = ['#efd9a7', '#e8cf98', '#f4e2b6', '#dcc089'].map(hex)
const MADEIRA = ['#c98a52', '#bd7d47', '#d39661', '#b4743f'].map(hex)
const FRESTA = hex('#6e3f1f')
const FACE_SOMBRA = ['#8f5a2e', '#83522a'].map(hex)
const FACE_SOL = ['#b97b45', '#ad713e'].map(hex)
const MAR = ['#2fb4c8', '#3bc3d4', '#57d2df', '#249fb6'].map(hex)
const ESPUMA = hex('#f4fbfb')

// o deck: um losango (visto de cima em diagonal), com as faces da frente
const DECK = { topo: [500, 130], dir: [900, 330], baixo: [500, 530], esq: [100, 330], altura: 48 }
const D = [2 / Math.sqrt(5), 1 / Math.sqrt(5)] // direcao "sudeste" no chao (2:1)
const E = [2 / Math.sqrt(5), -1 / Math.sqrt(5)] // ao longo da borda da direita
// a escada sai do meio da borda da direita, descendo para sudeste
const ESCADA = { meio: [700, 430], largura: 112, piso: 26, degrau: 16, n: 3 }

function noDeck(x: number, y: number): boolean {
  // |x - 500| / 400 + |y - 330| / 200 <= 1
  return Math.abs(x - 500) / 400 + Math.abs(y - 330) / 200 <= 1
}

function linhaDoMar(x: number) {
  return 1180 - x * 0.38
}

function pintarFundo(dados: Uint8ClampedArray, onda: number) {
  const pinta = (x: number, y: number, c: RGB) => {
    const i = (y * MUNDO.w + x) * 4
    dados[i] = c[0]
    dados[i + 1] = c[1]
    dados[i + 2] = c[2]
    dados[i + 3] = 255
  }
  for (let y = 0; y < MUNDO.h; y++) {
    for (let x = 0; x < MUNDO.w; x++) {
      const r = hash(x, y)
      // mar no canto de baixo, com faixas de onda que andam
      const mar = linhaDoMar(x) + Math.sin(x * 0.045 + onda) * 6
      if (y > mar) {
        const prof = y - mar
        if (prof < 5 + Math.sin(x * 0.11 + onda * 1.7) * 2) {
          pinta(x, y, ESPUMA)
          continue
        }
        const faixa = Math.sin((y - x * 0.38) * 0.09 - onda * 2) > 0.82
        const c = faixa ? MAR[2] : prof > 120 ? MAR[3] : r < 0.5 ? MAR[0] : MAR[1]
        pinta(x, y, c)
        continue
      }
      // areia molhada perto do mar
      if (y > mar - 22) {
        pinta(x, y, r < 0.5 ? hex('#d2b57d') : hex('#c9ab72'))
        continue
      }
      let c = AREIA[r < 0.55 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3]
      if (r > 0.995) c = hex('#b9965e') // graozinho
      pinta(x, y, c)
    }
  }
}

function pintarDeck(dados: Uint8ClampedArray) {
  const pinta = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= MUNDO.w || y >= MUNDO.h) return
    const i = (y * MUNDO.w + x) * 4
    dados[i] = c[0]
    dados[i + 1] = c[1]
    dados[i + 2] = c[2]
    dados[i + 3] = 255
  }
  const H = DECK.altura
  // faces da frente (de pe): esquerda na sombra, direita no sol
  for (let x = 100; x <= 900; x++) {
    const yBorda = x <= 500 ? 330 + (x - 100) / 2 : 530 - (x - 500) / 2
    for (let h = 0; h < H; h++) {
      const y = Math.round(yBorda + h)
      const tabua = Math.floor((x + (x <= 500 ? 0 : 3)) / 9)
      const lado = x <= 500 ? FACE_SOMBRA : FACE_SOL
      let c = lado[tabua % 2]
      if (x % 9 === 0) c = FRESTA
      if (h === 0) c = hex('#e0a56c') // quina iluminada
      if (h >= H - 2) c = hex('#5b3519')
      pinta(x, y, c)
    }
  }
  // o tampo: tabuas na diagonal (paralelas a borda da esquerda), com frestas
  for (let y = 130; y <= 530; y++) {
    for (let x = 100; x <= 900; x++) {
      if (!noDeck(x, y)) continue
      const v = y - x / 2 // constante ao longo da tabua
      const tabua = Math.floor(v / 13)
      const dentro = v - tabua * 13
      const ao_longo = x + 2 * y // ao longo da tabua
      const emenda = Math.floor((ao_longo + hash(tabua, 0) * 300) / 260)
      const r = hash(tabua, emenda)
      let c = MADEIRA[Math.floor(r * 4)]
      if (dentro < 1) c = FRESTA
      else if (dentro > 11.5) c = hex('#a96c39')
      const posNaEmenda = (ao_longo + hash(tabua, 0) * 300) % 260
      if (posNaEmenda < 2) c = FRESTA
      if ((posNaEmenda > 6 && posNaEmenda < 8) && (dentro > 3 && dentro < 5 || dentro > 8 && dentro < 10)) c = hex('#5b3519') // prego
      if (hash(x, y) > 0.97) c = [c[0] - 12, c[1] - 10, c[2] - 6] // veio
      pinta(x, y, c)
    }
  }
}

function pintarEscada(ctx: CanvasRenderingContext2D) {
  const { meio, largura, piso, degrau, n } = ESCADA
  const pt = (k: number, lado: number, dentro: number): [number, number] => [
    meio[0] + E[0] * lado + D[0] * (k * piso + dentro),
    meio[1] + E[1] * lado + D[1] * (k * piso + dentro) + degrau * (k + 1),
  ]
  for (let k = 0; k < n; k++) {
    const a = pt(k, -largura / 2, 0)
    const b = pt(k, largura / 2, 0)
    const c = pt(k, largura / 2, piso)
    const d = pt(k, -largura / 2, piso)
    const poli = (pts: [number, number][], cor: string) => {
      ctx.fillStyle = cor
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(Math.round(x), Math.round(y)) : ctx.moveTo(Math.round(x), Math.round(y))))
      ctx.closePath()
      ctx.fill()
    }
    // espelho (a frente de cada degrau) e a lateral esquerda
    poli([d, c, [c[0], c[1] + degrau], [d[0], d[1] + degrau]], '#b97b45')
    poli([a, d, [d[0], d[1] + degrau * (n - k)], [a[0], a[1] + degrau * (n - k)]], '#83522a')
    // o piso do degrau, com a quina clara
    poli([a, b, c, d], '#cf9360')
    ctx.fillStyle = '#e8b27c'
    ctx.fillRect(Math.round(d[0]), Math.round(d[1]) - 1, Math.round(c[0] - d[0]), 1)
    ctx.strokeStyle = '#6e3f1f'
    ctx.lineWidth = 1
  }
}

function pintarVaso(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // vaso branco com sombra e folhas em leque
  ctx.fillStyle = 'rgba(70,40,15,.28)'
  ctx.fillRect(x - 15, y - 2, 30, 5)
  for (let h = 0; h < 26; h++) {
    const w = 12 - Math.floor(h / 6)
    ctx.fillStyle = h < 3 ? '#cfd3cf' : h % 7 === 0 ? '#dfe3df' : '#f2f4f1'
    ctx.fillRect(x - w, y - h, w * 2, 1)
    ctx.fillStyle = '#b9bdb8'
    ctx.fillRect(x + w - 3, y - h, 3, 1)
  }
  const verdes = ['#2f7a3a', '#3f9446', '#58ad4f', '#7cc25c']
  for (let f = 0; f < 11; f++) {
    const ang = -Math.PI / 2 + (f - 5) * 0.27
    const comp = 34 + hash(f, 7) * 14
    for (let t = 0; t < comp; t++) {
      const px = x + Math.cos(ang) * t * 0.9
      const py = y - 26 + Math.sin(ang) * t + (t * t) / comp * 0.35
      const larg = Math.max(1, Math.round(4 * Math.sin((t / comp) * Math.PI)))
      ctx.fillStyle = verdes[Math.min(3, Math.floor((t / comp) * 3 + hash(f, t) * 1.2))]
      ctx.fillRect(Math.round(px - larg / 2), Math.round(py), larg, 2)
    }
  }
}

function pintarLampiao(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(70,40,15,.28)'
  ctx.fillRect(x - 6, y - 1, 14, 3)
  ctx.fillStyle = '#3b2a22'
  ctx.fillRect(x - 2, y - 120, 4, 120)
  ctx.fillStyle = '#5b4436'
  ctx.fillRect(x - 1, y - 120, 1, 120)
  ctx.fillStyle = '#2a1e18'
  ctx.fillRect(x - 9, y - 140, 18, 4)
  ctx.fillRect(x - 7, y - 122, 14, 3)
  ctx.fillStyle = '#ffe2a0'
  ctx.fillRect(x - 6, y - 136, 12, 14)
  ctx.fillStyle = '#fff6d8'
  ctx.fillRect(x - 3, y - 133, 6, 8)
}
export const LAMPIAO = { x: 160, y: 352 }

/* ------------------------------------------------------------ o roteiro */

type Passo =
  | { parada: number; dir: Direcao }
  | { girar: number }
  | { andar: [number, number] }
  | { escada: true }
  | { noite: number }

const BASE = [430, 300]
const ROTEIRO: Passo[] = [
  { parada: 3.2, dir: 'S' },
  { girar: 1.6 },
  { parada: 0.6, dir: 'S' },
  { andar: [430, 470] }, // sul (vindo para a camera)
  { parada: 0.5, dir: 'S' },
  { andar: [430, 230] }, // norte (indo embora)
  { andar: [610, 230] }, // leste
  { andar: [610, 300] }, // sul
  { andar: [330, 300] }, // oeste
  { andar: [330, 330] }, // sul
  { andar: [420, 375] }, // sudeste
  { andar: [500, 335] }, // nordeste
  { andar: [420, 295] }, // noroeste
  { andar: [340, 335] }, // sudoeste
  { andar: [545, 395] }, // sudeste ate a escada...
  { andar: [ESCADA.meio[0] - 6, ESCADA.meio[1] - 6] },
  { escada: true },
  { andar: [700, 640] },
  { andar: [560, 700] },
  { parada: 1.2, dir: 'SO' },
  { parada: 3.4, dir: 'S' },
  { noite: 5.5 },
]

type Estado = {
  x: number
  y: number
  dir: Direcao
  tipo: 'andar' | 'parada'
  fase: number
  piscando: boolean
  noite: number
}

/** Simula o roteiro quadro a quadro e devolve o estado em cada quadro. */
export function simular(fps: number): Estado[] {
  const dt = 1 / fps
  const VEL = 104 // px da arte por segundo
  const quadros: Estado[] = []
  let x = BASE[0]
  let y = BASE[1]
  let dir: Direcao = 'S'
  let faseAndar = 0
  let tParada = 0
  let noite = 0
  let proxPiscada = 1.4
  let piscaAte = -1
  let t = 0
  const registra = (tipo: 'andar' | 'parada', fase: number) => {
    const piscando = t < piscaAte
    if (tipo === 'parada' && t > proxPiscada) {
      piscaAte = t + 0.14
      proxPiscada = t + 2.2 + hash(Math.floor(t * 10), 3) * 2.5
    }
    quadros.push({ x, y, dir, tipo, fase, piscando, noite })
    t += dt
  }
  for (const p of ROTEIRO) {
    if ('parada' in p) {
      dir = p.dir
      for (let s = 0; s < p.parada; s += dt) {
        tParada += dt
        registra('parada', (tParada / CICLO_PARADA) % 1)
      }
    } else if ('girar' in p) {
      const passo = p.girar / 8
      for (let s = 0; s < p.girar; s += dt) {
        dir = GIRO[(GIRO.indexOf('S') + Math.floor(s / passo) + 1) % 8]
        tParada += dt
        registra('parada', (tParada / CICLO_PARADA) % 1)
      }
      dir = 'S'
    } else if ('andar' in p) {
      const [tx, ty] = p.andar
      dir = direcaoDe(tx - x, ty - y)
      const vel = velocidadeNaTela(VEL, tx - x, ty - y)
      for (;;) {
        const dx = tx - x
        const dy = ty - y
        const dist = Math.hypot(dx, dy)
        const anda = vel * dt
        if (dist <= anda) {
          x = tx
          y = ty
          break
        }
        x += (dx / dist) * anda
        y += (dy / dist) * anda
        faseAndar += anda / CICLO_DA_DIRECAO[dir]
        registra('andar', faseAndar % 1)
      }
    } else if ('escada' in p) {
      // desce degrau a degrau para sudeste: anda o piso e, ao passar da quina,
      // o corpo desce a altura do degrau (devagar: na escada se anda mais lento)
      dir = 'SE'
      for (let k = 0; k < ESCADA.n + 1; k++) {
        const x0 = x
        const y0 = y
        const velE = velocidadeNaTela(VEL, D[0], D[1]) * 0.62
        const durar = ESCADA.piso / velE
        for (let s = 0; s < durar; s += dt) {
          const u = s / durar
          const desce = k < ESCADA.n ? smooth(0.35, 0.7, u) * ESCADA.degrau : 0
          x = x0 + D[0] * ESCADA.piso * u
          y = y0 + D[1] * ESCADA.piso * u + desce
          faseAndar += (velE * dt) / CICLO_DA_DIRECAO.SE
          registra('andar', faseAndar % 1)
        }
        x = x0 + D[0] * ESCADA.piso
        y = y0 + D[1] * ESCADA.piso + (k < ESCADA.n ? ESCADA.degrau : 0)
      }
    } else if ('noite' in p) {
      dir = 'S'
      for (let s = 0; s < p.noite; s += dt) {
        noite = smooth(0, 2.2, s)
        tParada += dt
        registra('parada', (tParada / CICLO_PARADA) % 1)
      }
    }
  }
  return quadros
}

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/* ------------------------------------------------------------ desenhar */

let fundos: HTMLCanvasElement[] = []
let img: HTMLImageElement
let folha: FolhaDeSprites
let tela: HTMLCanvasElement
let ctx: CanvasRenderingContext2D
let sombra: HTMLCanvasElement
let quadros: Estado[] = []
let cam = { x: BASE[0], y: BASE[1] - 80 }

async function preparar(base: string, largura: number, altura: number, fps: number) {
  folha = await (await fetch(`${base}/exemplo.json`)).json()
  img = await new Promise<HTMLImageElement>((ok) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.src = `${base}/exemplo.png`
  })
  // 6 quadros do mar (as ondas andam em ciclo)
  fundos = []
  for (let k = 0; k < 6; k++) {
    const c = document.createElement('canvas')
    c.width = MUNDO.w
    c.height = MUNDO.h
    const cc = c.getContext('2d')!
    const im = cc.createImageData(MUNDO.w, MUNDO.h)
    pintarFundo(im.data, (k / 6) * Math.PI * 2)
    pintarDeck(im.data)
    cc.putImageData(im, 0, 0)
    pintarEscada(cc)
    pintarVaso(cc, 250, 300)
    pintarVaso(cc, 760, 300)
    pintarLampiao(cc, LAMPIAO.x, LAMPIAO.y)
    fundos.push(c)
  }
  // sombra no chao: elipse de pixels cheios (sem borda borrada)
  sombra = document.createElement('canvas')
  sombra.width = 40
  sombra.height = 12
  const sc = sombra.getContext('2d')!
  const si = sc.createImageData(40, 12)
  for (let yy = 0; yy < 12; yy++)
    for (let xx = 0; xx < 40; xx++) {
      const d = ((xx - 19.5) / 19.5) ** 2 + ((yy - 5.5) / 5.5) ** 2
      if (d <= 1) si.data.set([60, 36, 16, d < 0.45 ? 90 : 62], (yy * 40 + xx) * 4)
    }
  sc.putImageData(si, 0, 0)
  tela = document.createElement('canvas')
  tela.width = largura
  tela.height = altura
  document.body.appendChild(tela)
  ctx = tela.getContext('2d')!
  quadros = simular(fps)
  return quadros.length
}

function quadro(i: number) {
  const e = quadros[Math.min(i, quadros.length - 1)]
  const vw = tela.width / ESCALA
  const vh = tela.height / ESCALA
  const alvo = { x: e.x, y: e.y - 70 }
  cam = i === 0 ? alvo : { x: cam.x + (alvo.x - cam.x) * 0.08, y: cam.y + (alvo.y - cam.y) * 0.08 }
  const cx = Math.round(Math.max(vw / 2, Math.min(MUNDO.w - vw / 2, cam.x)) - vw / 2)
  const cy = Math.round(Math.max(vh / 2, Math.min(MUNDO.h - vh / 2, cam.y)) - vh / 2)
  ctx.setTransform(ESCALA, 0, 0, ESCALA, -cx * ESCALA, -cy * ESCALA)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(fundos[Math.floor(i / 6) % fundos.length], 0, 0)
  // o sol vem do alto a direita: a sombra cai um pouco para a esquerda
  ctx.drawImage(sombra, Math.round(e.x - 26), Math.round(e.y - 5))
  desenharMenina(ctx, img, folha, e.x, e.y, e.dir, e.tipo, e.fase, e.piscando)

  if (e.noite > 0) {
    const n = e.noite
    ctx.globalCompositeOperation = 'multiply'
    const m = (alvo: number) => Math.round(255 + (alvo - 255) * n)
    ctx.fillStyle = `rgb(${m(70)}, ${m(80)}, ${m(150)})`
    ctx.fillRect(cx, cy, vw, vh)
    ctx.globalCompositeOperation = 'screen'
    // a luz do lampiao, em aneis de pixel (sem degrade liso)
    for (let r = 6; r >= 1; r--) {
      ctx.fillStyle = `rgba(255, 190, 110, ${0.07 * n})`
      const raio = r * 26
      ctx.beginPath()
      ctx.ellipse(LAMPIAO.x, LAMPIAO.y - 130 + r * 8, raio, raio * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = `rgba(255, 220, 150, ${0.9 * n})`
    ctx.fillRect(LAMPIAO.x - 6, LAMPIAO.y - 136, 12, 14)
    ctx.globalCompositeOperation = 'source-over'
  }
  return tela.toDataURL('image/jpeg', 0.92)
}

Object.assign(window, { preparar, quadro })
