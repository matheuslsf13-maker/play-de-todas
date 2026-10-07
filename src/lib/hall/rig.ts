/**
 * O BONECO DE VERDADE: as pecas da menina (folha do ChatGPT) montadas em
 * ossos. O encaixe de cada peca no gabarito esta em `menina-<nome>.json`
 * (conferido por `scripts/hall/menina.py`); aqui so se aplica a pose.
 *
 * Cada osso gira em volta do seu pivo, e o filho herda o giro do pai (a
 * canela vai junto com a coxa). Tudo e desenhado em pixels do gabarito e
 * encolhido para `ALTURA_MENINA`, com o pe em (0, 0).
 */
import { ALTURA_MENINA, ossos, type Pose } from './boneco'

type Par = [number, number]
type Retangulo = [number, number, number, number]

export type VistaDoBoneco = {
  folha: string
  ossos: Record<string, { pai: string | null; pivo: Par }>
  pecas: Record<string, { lugar: Retangulo; osso: string }>
  ordem: string[]
}

export type Boneco = {
  altura: Par
  vistas: { frente: VistaDoBoneco; costas: VistaDoBoneco }
}

/** As imagens de todas as pecas, por `<folha>-<peca>`. */
export function carregarPecas(b: Boneco, base: string): Map<string, HTMLImageElement> {
  const m = new Map<string, HTMLImageElement>()
  for (const v of Object.values(b.vistas)) {
    for (const pid of v.ordem) {
      const im = new Image()
      im.src = `${base}hall/menina/${v.folha}-${pid}.webp`
      m.set(`${v.folha}-${pid}`, im)
    }
  }
  return m
}

/**
 * Desenha a menina com o pe em (0, 0) do `ctx`, na pose de `ossos()`.
 */
export function desenharBoneco(
  ctx: CanvasRenderingContext2D,
  b: Boneco,
  imagens: Map<string, HTMLImageElement>,
  p: Pose,
  tempo: number,
) {
  const v = p.olhando === 'costas' ? b.vistas.costas : b.vistas.frente
  const o = ossos(p, tempo)
  const [topo, sola] = b.altura
  const k = ALTURA_MENINA / (sola - topo)
  const cx = v.ossos.corpo.pivo[0]

  ctx.save()
  if (p.espelho) ctx.scale(-1, 1)
  ctx.scale(k, k)
  ctx.translate(-cx, -sola - o.sobe / k)
  const base = ctx.getTransform()

  // a transformacao de cada osso, montada do tronco para as pontas
  const pronta = new Map<string, DOMMatrix>()
  const de = (id: string): DOMMatrix => {
    const feita = pronta.get(id)
    if (feita) return feita
    const os = v.ossos[id]
    const pai = os.pai ? de(os.pai) : base
    const [px, py] = os.pivo
    const [dx, dy] = o.desloca[id] ?? [0, 0]
    const m = pai
      .translate(dx / k, dy / k)
      .translate(px, py)
      .rotate(o.angulos[id] ?? 0)
      .translate(-px, -py)
    pronta.set(id, m)
    return m
  }

  for (const pid of v.ordem) {
    const peca = v.pecas[pid]
    const im = imagens.get(`${v.folha}-${pid}`)
    if (!peca || !im?.complete || !im.naturalWidth) continue
    ctx.setTransform(de(peca.osso))
    const [x, y, w, h] = peca.lugar
    ctx.drawImage(im, x, y, w, h)
  }
  ctx.setTransform(base)
  ctx.restore()
}
