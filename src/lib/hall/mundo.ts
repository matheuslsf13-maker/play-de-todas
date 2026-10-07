/**
 * O CHAO DO HALL: onde da para andar, por onde, e quem fica na frente de quem.
 *
 * Tudo em pixels da pintura (`cena.json`, 1536x1024). A pintura e o fundo; os
 * objetos que podem ficar NA FRENTE de uma menina sao recortados dela
 * (`scripts/hall/recortar.py`). Cada objeto tem:
 *  - `obstaculo`: a pegada no chao -- ninguem anda por dentro;
 *  - `frente`: a linha do pe do objeto. Quem tem o pe ACIMA dessa linha (mais
 *    para o fundo da cena) esta ATRAS do objeto, e o recorte e desenhado por
 *    cima dela. Era isso que faltava na versao anterior, em que a menina
 *    flutuava por cima da sombrinha.
 */
import cena from './cena.json'

export type Ponto = { x: number; y: number }
type Par = [number, number]

export type ObjetoDaCena = {
  id: string
  caixa: [number, number, number, number]
  frente: Par[]
  obstaculo: Par[]
  ocluir?: boolean
}

export const LARGURA = cena.largura
export const ALTURA = cena.altura
export const OBJETOS = cena.objetos as unknown as ObjetoDaCena[]
const CHAO = cena.chao as unknown as Par[][]

/** Meio-corpo da menina no chao: o caminho passa a essa distancia dos moveis. */
const RAIO = 9
/** Lado da celula da grade da busca de caminho. */
const CELULA = 6

export function dentro(p: Ponto, poligono: Par[]): boolean {
  let d = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i]
    const [xj, yj] = poligono[j]
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}

function distanciaAoSegmento(p: Ponto, a: Par, b: Par): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy))
}

function pertoDaBorda(p: Ponto, poligono: Par[], raio: number): boolean {
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    if (distanciaAoSegmento(p, poligono[j], poligono[i]) < raio) return true
  }
  return false
}

/** Da para estar de pe aqui? (no chao, fora dos moveis, sem encostar neles) */
export function livre(p: Ponto): boolean {
  if (!CHAO.some((c) => dentro(p, c))) return false
  return !OBJETOS.some((o) => dentro(p, o.obstaculo) || pertoDaBorda(p, o.obstaculo, RAIO))
}

/* ------------------------------------------------------------- a grade */

const COLUNAS = Math.ceil(LARGURA / CELULA)
const LINHAS = Math.ceil(ALTURA / CELULA)
let grade: Uint8Array | null = null

/** 1 = da para pisar. Calculada uma vez, na primeira busca. */
function aGrade(): Uint8Array {
  if (grade) return grade
  grade = new Uint8Array(COLUNAS * LINHAS)
  for (let l = 0; l < LINHAS; l++) {
    for (let c = 0; c < COLUNAS; c++) {
      if (livre({ x: (c + 0.5) * CELULA, y: (l + 0.5) * CELULA })) grade[l * COLUNAS + c] = 1
    }
  }
  return grade
}

const celulaDe = (p: Ponto) => ({
  c: Math.max(0, Math.min(COLUNAS - 1, Math.floor(p.x / CELULA))),
  l: Math.max(0, Math.min(LINHAS - 1, Math.floor(p.y / CELULA))),
})
const centro = (c: number, l: number): Ponto => ({ x: (c + 0.5) * CELULA, y: (l + 0.5) * CELULA })

/** O ponto livre mais perto (para quando o destino cai em cima de um movel). */
export function maisPertoLivre(p: Ponto): Ponto {
  const g = aGrade()
  const { c, l } = celulaDe(p)
  if (g[l * COLUNAS + c]) return p
  for (let r = 1; r < 60; r++) {
    let melhor: Ponto | null = null
    let dist = Infinity
    for (let dl = -r; dl <= r; dl++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dl), Math.abs(dc)) !== r) continue
        const cc = c + dc
        const ll = l + dl
        if (cc < 0 || ll < 0 || cc >= COLUNAS || ll >= LINHAS || !g[ll * COLUNAS + cc]) continue
        const q = centro(cc, ll)
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        if (d < dist) {
          dist = d
          melhor = q
        }
      }
    }
    if (melhor) return melhor
  }
  return p
}

/** Linha reta entre dois pontos sem pisar fora do livre (para alisar o caminho). */
function vistaLivre(a: Ponto, b: Ponto): boolean {
  const passos = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELULA / 2))
  const g = aGrade()
  for (let i = 1; i < passos; i++) {
    const { c, l } = celulaDe({ x: a.x + ((b.x - a.x) * i) / passos, y: a.y + ((b.y - a.y) * i) / passos })
    if (!g[l * COLUNAS + c]) return false
  }
  return true
}

/**
 * O caminho de `de` ate `para` pelo chao livre: A* na grade (8 direcoes) e
 * depois alisado -- so ficam as quinas necessarias, como alguem andando de
 * verdade, e nao uma escadinha de celula em celula. Devolve os pontos a seguir
 * (sem o de partida). Sem caminho possivel, devolve [].
 */
export function caminho(de: Ponto, para: Ponto): Ponto[] {
  const g = aGrade()
  const a = celulaDe(maisPertoLivre(de))
  const b = celulaDe(maisPertoLivre(para))
  const ia = a.l * COLUNAS + a.c
  const ib = b.l * COLUNAS + b.c
  const custo = new Float32Array(COLUNAS * LINHAS).fill(Infinity)
  const veio = new Int32Array(COLUNAS * LINHAS).fill(-1)
  const fechado = new Uint8Array(COLUNAS * LINHAS)
  const h = (i: number) => Math.hypot((i % COLUNAS) - b.c, Math.floor(i / COLUNAS) - b.l)
  // fila de prioridade simples (heap binario) por custo + heuristica
  const heap: [number, number][] = []
  const empurra = (i: number, f: number) => {
    heap.push([f, i])
    let k = heap.length - 1
    while (k > 0) {
      const pai = (k - 1) >> 1
      if (heap[pai][0] <= heap[k][0]) break
      ;[heap[pai], heap[k]] = [heap[k], heap[pai]]
      k = pai
    }
  }
  const tira = (): number => {
    const topo = heap[0][1]
    const ultimo = heap.pop() as [number, number]
    if (heap.length) {
      heap[0] = ultimo
      let k = 0
      for (;;) {
        const e = 2 * k + 1
        const d = e + 1
        let m = k
        if (e < heap.length && heap[e][0] < heap[m][0]) m = e
        if (d < heap.length && heap[d][0] < heap[m][0]) m = d
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k], heap[m]]
        k = m
      }
    }
    return topo
  }
  custo[ia] = 0
  empurra(ia, h(ia))
  while (heap.length) {
    const i = tira()
    if (i === ib) break
    if (fechado[i]) continue
    fechado[i] = 1
    const c = i % COLUNAS
    const l = Math.floor(i / COLUNAS)
    for (let dl = -1; dl <= 1; dl++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dl && !dc) continue
        const cc = c + dc
        const ll = l + dl
        if (cc < 0 || ll < 0 || cc >= COLUNAS || ll >= LINHAS) continue
        const j = ll * COLUNAS + cc
        if (!g[j] || fechado[j]) continue
        // na diagonal, nao corta quina de movel
        if (dl && dc && (!g[l * COLUNAS + cc] || !g[ll * COLUNAS + c])) continue
        const novo = custo[i] + (dl && dc ? Math.SQRT2 : 1)
        if (novo < custo[j]) {
          custo[j] = novo
          veio[j] = i
          empurra(j, novo + h(j))
        }
      }
    }
  }
  if (ia !== ib && veio[ib] < 0) return []
  const celulas: Ponto[] = []
  for (let i = ib; i !== -1; i = veio[i]) celulas.unshift(centro(i % COLUNAS, Math.floor(i / COLUNAS)))
  celulas[celulas.length - 1] = maisPertoLivre(para)
  // alisa: de cada ponto, pula para o mais distante que se ve em linha reta
  const rota: Ponto[] = []
  let atual: Ponto = de
  let k = 0
  while (k < celulas.length) {
    let longe = k
    for (let m = celulas.length - 1; m > k; m--) {
      if (vistaLivre(atual, celulas[m])) {
        longe = m
        break
      }
    }
    rota.push(celulas[longe])
    atual = celulas[longe]
    k = longe + 1
  }
  return rota
}

/* ------------------------------------------------------- profundidade */

/** A altura (y) da linha do pe do objeto na coluna x (fora dela, a ponta mais perto). */
export function yDaFrente(o: ObjetoDaCena, x: number): number {
  const f = o.frente
  if (x <= f[0][0]) return f[0][1]
  for (let i = 1; i < f.length; i++) {
    const [x0, y0] = f[i - 1]
    const [x1, y1] = f[i]
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1)
  }
  return f[f.length - 1][1]
}

/**
 * Os recortes que ficam NA FRENTE de quem esta com o pe em `pe` e ocupa a
 * caixa `corpo` na tela (so os que encostam no corpo importam).
 */
export function objetosNaFrente(pe: Ponto, corpo: { x0: number; y0: number; x1: number; y1: number }): ObjetoDaCena[] {
  return OBJETOS.filter((o) => {
    if (!o.ocluir) return false
    const [x0, y0, x1, y1] = o.caixa
    if (x1 < corpo.x0 || x0 > corpo.x1 || y1 < corpo.y0 || y0 > corpo.y1) return false
    return pe.y < yDaFrente(o, pe.x)
  })
}

/** Um ponto livre sorteado (para passear). */
export function pontoLivreAoAcaso(aleatorio = Math.random): Ponto {
  for (let t = 0; t < 400; t++) {
    const p = { x: aleatorio() * LARGURA, y: aleatorio() * ALTURA }
    if (livre(p)) return p
  }
  return maisPertoLivre({ x: 460, y: 330 })
}
