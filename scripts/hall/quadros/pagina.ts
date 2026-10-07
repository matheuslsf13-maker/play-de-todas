/**
 * Pagina que GERA os quadros da animacao (rodada pelo scripts/hall/quadros.mjs
 * num Chrome sem janela). Cada quadro e a menina na pose, em alta resolucao, com
 * o pe no mesmo ponto -- o pixel art sai depois, em scripts/hall/sprites.py.
 */
import { COLUNAS, deformar, matrizesDaPose, montarMalha, pontoNoOsso, type Malha, type VistaDaPele } from '../../../src/lib/hall/malha'
import { DesenhistaDaPele } from '../../../src/lib/hall/pele'

/** O quadro, em pixels do sprite: largura, altura e onde fica o pe. */
export const QUADRO = { largura: 136, altura: 224, peX: 68, peY: 214 }

type Pronta = { v: VistaDaPele; malha: Malha; nome: string }
const prontas = new Map<string, Pronta>()
const desenhista = DesenhistaDaPele.criar()!

function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const im = new Image()
    im.onload = () => ok(im)
    im.onerror = () => erro(new Error('nao abriu ' + src))
    im.src = src
  })
}

async function preparar(base: string, nome: string, v: VistaDaPele) {
  const im = await carregar(`${base}/pele-${nome}.png`)
  const c = document.createElement('canvas')
  c.width = im.naturalWidth
  c.height = im.naturalHeight
  const cx = c.getContext('2d', { willReadFrequently: true })!
  cx.drawImage(im, 0, 0)
  const dados = cx.getImageData(0, 0, c.width, c.height).data
  const gw = c.width / COLUNAS
  const malha = montarMalha(v, (col, x, y) => dados[(y * c.width + col * gw + x) * 4 + 3])
  desenhista.textura(nome, im)
  prontas.set(nome, { v, malha, nome })
}

type Pedido = { vista: string; tipo: 'andar' | 'parada'; fase: number; espelho: boolean; piscando: boolean }

function quadro(p: Pedido, S: number) {
  const pr = prontas.get(p.vista)!
  const { mats, pose } = matrizesDaPose(pr.v, { tipo: p.tipo, fase: p.fase }, p.espelho)
  const pos = deformar(pr.malha, mats, pose.cabelo, p.espelho)
  for (let i = 0; i < pos.length; i += 2) {
    pos[i] = (pos[i] + QUADRO.peX) * S
    pos[i + 1] = (pos[i + 1] + QUADRO.peY) * S
  }
  desenhista.desenhar(p.vista, pr.malha, pos, p.piscando ? pr.malha.uvPiscando : pr.malha.uv, QUADRO.largura * S, QUADRO.altura * S)
  const logo = pr.v.logo ? pontoNoOsso(mats, 'corpo', pr.v.logo[0], pr.v.logo[1]) : null
  const [cx, cy] = pr.v.ossos.cabeca.pivo
  const cabeca = pontoNoOsso(mats, 'cabeca', cx, cy)
  const q = (pt: [number, number] | null) => (pt ? [pt[0] + QUADRO.peX, pt[1] + QUADRO.peY] : null)
  return { png: desenhista.canvas.toDataURL('image/png'), logo: q(logo), cabeca: q(cabeca) }
}

Object.assign(window, { preparar, quadro, QUADRO })
