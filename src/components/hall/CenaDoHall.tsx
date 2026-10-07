import { useEffect, useRef } from 'react'
import { ALTURA_MENINA, desenharSombra, type Pose } from '../../lib/hall/boneco'
import { carregarPecas, desenharBoneco, type Boneco } from '../../lib/hall/rig'
import exemplo from '../../lib/hall/menina-exemplo.json'
import {
  ALTURA,
  LARGURA,
  OBJETOS,
  caminho,
  maisPertoLivre,
  objetosNaFrente,
  pontoLivreAoAcaso,
  type Ponto,
} from '../../lib/hall/mundo'
import { horaDoHall, noite, type ModoDoCeu } from '../../lib/hall/relogio'
import cena from '../../lib/hall/cena.json'

/**
 * A CENA DO HALL, num <canvas>.
 *
 * Um laco de requestAnimationFrame (o navegador para sozinho quando a aba
 * some). A simulacao (quem anda para onde) roda fora do React: so o desenho
 * muda a cada quadro, e o React so fica sabendo do que aparece em botoes.
 *
 * Ordem do desenho: a pintura inteira; depois cada menina (da mais do fundo
 * para a mais da frente), cada uma num canvas separado do qual se APAGAM os
 * recortes dos objetos que estao na frente dela -- assim ela passa atras da
 * sombrinha e da planta; por fim o ceu (noite) e as luzes.
 */

type Menina = {
  id: string
  nome: string
  pos: Ponto
  rota: Ponto[]
  pose: Pose
  /** Segundos parada antes de escolher o proximo lugar. */
  espera: number
}

const VELOCIDADE = 52 // px da pintura por segundo (passo tranquilo)
const PASSOS_POR_PX = 1 / 62 // um ciclo (dois passos) a cada ~62 px andados: o pe nao patina

/** As luzes que acendem a noite (luminarias da casa), em pixels da pintura. */
const LUZES: [number, number, number][] = [
  [727, 112, 70],
  [928, 140, 70],
  [522, 60, 60],
  [1085, 150, 55],
]

function carregar(src: string): HTMLImageElement {
  const im = new Image()
  im.src = src
  return im
}

export default function CenaDoHall({
  meninas,
  modoDoCeu,
  zoom,
  depurar,
  onHora,
}: {
  meninas: { id: string; nome: string }[]
  modoDoCeu: ModoDoCeu
  zoom: number
  /** Mostra o chao livre e as linhas de frente (para ajustar o cenario). */
  depurar?: boolean
  onHora?: (h: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const props = useRef({ modoDoCeu, zoom, depurar, onHora })
  props.current = { modoDoCeu, zoom, depurar, onHora }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const base = import.meta.env.BASE_URL
    const fundo = carregar(`${base}hall/cena.webp`)
    const recortes = new Map(OBJETOS.filter((o) => o.ocluir).map((o) => [o.id, carregar(`${base}hall/o-${o.id}.webp`)]))
    // por enquanto todas usam as pecas da menina de exemplo
    const boneco = exemplo as unknown as Boneco
    const pecas = carregarPecas(boneco, base)
    const camada = document.createElement('canvas')
    const cctx = camada.getContext('2d') as CanvasRenderingContext2D

    const gente: Menina[] = meninas.map((m, i) => ({
      ...m,
      pos: maisPertoLivre({ x: 440 + i * 40, y: 300 }),
      rota: [],
      pose: { tipo: 'parada', fase: 0, olhando: 'frente', espelho: false },
      espera: 1 + i,
    }))
    let camera = { x: gente[0]?.pos.x ?? 600, y: (gente[0]?.pos.y ?? 400) - 40 }
    let arrasto: { x: number; y: number; cx: number; cy: number } | null = null
    let soltoAte = 0
    let ultimo = performance.now()
    let horaAvisada = -1
    let quadro = 0

    function passo(dt: number) {
      for (const m of gente) {
        if (m.rota.length === 0) {
          m.pose.tipo = 'parada'
          m.espera -= dt
          if (m.espera <= 0) {
            m.rota = caminho(m.pos, pontoLivreAoAcaso())
            m.espera = 2 + Math.random() * 5
          }
          continue
        }
        const alvo = m.rota[0]
        const dx = alvo.x - m.pos.x
        const dy = alvo.y - m.pos.y
        const d = Math.hypot(dx, dy)
        const anda = VELOCIDADE * dt
        m.pose.tipo = 'andar'
        // olha para onde vai: subindo na tela, de costas; para a esquerda, espelha
        if (Math.abs(dx) > 0.5) m.pose.espelho = dx < 0
        m.pose.olhando = dy < -Math.abs(dx) * 0.25 ? 'costas' : 'frente'
        if (d <= anda) {
          m.pos = alvo
          m.rota.shift()
        } else {
          m.pos = { x: m.pos.x + (dx / d) * anda, y: m.pos.y + (dy / d) * anda }
        }
        m.pose.fase = (m.pose.fase + Math.min(d, anda) * PASSOS_POR_PX) % 1
      }
    }

    function desenhar(agora: number) {
      const { modoDoCeu: modo, zoom: z, depurar: dep, onHora: avisa } = props.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const larg = canvas!.clientWidth
      const alt = canvas!.clientHeight
      if (canvas!.width !== Math.round(larg * dpr) || canvas!.height !== Math.round(alt * dpr)) {
        canvas!.width = Math.round(larg * dpr)
        canvas!.height = Math.round(alt * dpr)
      }
      // escala: por padrao cabem ~620 px da pintura na largura
      const esc = (larg / 620) * z
      const alvo = gente[0] ? { x: gente[0].pos.x, y: gente[0].pos.y - ALTURA_MENINA / 2 } : camera
      if (!arrasto && agora > soltoAte) {
        camera = { x: camera.x + (alvo.x - camera.x) * 0.06, y: camera.y + (alvo.y - camera.y) * 0.06 }
      }
      const meiaL = larg / esc / 2
      const meiaA = alt / esc / 2
      camera.x = Math.max(meiaL, Math.min(LARGURA - meiaL, camera.x))
      camera.y = Math.max(meiaA, Math.min(ALTURA - meiaA, camera.y))

      const hora = horaDoHall(Date.now())
      const n = noite(hora, modo)
      const h = Math.floor(hora)
      if (avisa && h !== horaAvisada) {
        horaAvisada = h
        avisa(hora)
      }

      ctx!.setTransform(dpr * esc, 0, 0, dpr * esc, dpr * (larg / 2 - camera.x * esc), dpr * (alt / 2 - camera.y * esc))
      ctx!.imageSmoothingQuality = 'high'
      if (fundo.complete) ctx!.drawImage(fundo, 0, 0)
      else {
        ctx!.fillStyle = '#f3e3c3'
        ctx!.fillRect(0, 0, LARGURA, ALTURA)
      }

      // noite: o cenario escurece puxando para o azul (multiplicar mantem as
      // cores; so sobrepor um veu deixava tudo cor de sepia) e as luminarias
      // da casa acendem
      if (n > 0) {
        const mistura = (alvo: number) => Math.round(255 + (alvo - 255) * n)
        ctx!.globalCompositeOperation = 'multiply'
        ctx!.fillStyle = `rgb(${mistura(62)}, ${mistura(74)}, ${mistura(140)})`
        ctx!.fillRect(0, 0, LARGURA, ALTURA)
        ctx!.globalCompositeOperation = 'screen'
        for (const [x, y, r] of LUZES) {
          const g = ctx!.createRadialGradient(x, y, 0, x, y, r * 2.4)
          g.addColorStop(0, `rgba(255, 186, 96, ${0.75 * n})`)
          g.addColorStop(0.35, `rgba(255, 170, 80, ${0.32 * n})`)
          g.addColorStop(1, 'rgba(255, 170, 80, 0)')
          ctx!.fillStyle = g
          ctx!.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8)
        }
        ctx!.globalCompositeOperation = 'source-over'
      }

      const t = agora / 1000
      for (const m of [...gente].sort((a, b) => a.pos.y - b.pos.y)) {
        // cada menina num canvas proprio, do tamanho do corpo dela
        const caixa = { x0: m.pos.x - 45, y0: m.pos.y - ALTURA_MENINA - 30, x1: m.pos.x + 45, y1: m.pos.y + 12 }
        const k = dpr * esc
        const w = Math.ceil((caixa.x1 - caixa.x0) * k)
        const hh = Math.ceil((caixa.y1 - caixa.y0) * k)
        if (camada.width !== w || camada.height !== hh) {
          camada.width = w
          camada.height = hh
        }
        cctx.setTransform(1, 0, 0, 1, 0, 0)
        cctx.clearRect(0, 0, w, hh)
        cctx.setTransform(k, 0, 0, k, (m.pos.x - caixa.x0) * k, (m.pos.y - caixa.y0) * k)
        desenharSombra(cctx, n)
        desenharBoneco(cctx, boneco, pecas, m.pose, t + m.id.length)
        // apaga dela o que esta na frente (o recorte do objeto tem a forma exata)
        cctx.globalCompositeOperation = 'destination-out'
        for (const o of objetosNaFrente(m.pos, caixa)) {
          const im = recortes.get(o.id)
          if (im?.complete) cctx.drawImage(im, o.caixa[0] - m.pos.x, o.caixa[1] - m.pos.y)
        }
        if (n > 0) {
          cctx.globalCompositeOperation = 'source-atop'
          cctx.setTransform(1, 0, 0, 1, 0, 0)
          cctx.fillStyle = `rgba(30, 40, 110, ${0.4 * n})`
          cctx.fillRect(0, 0, w, hh)
        }
        cctx.globalCompositeOperation = 'source-over'
        ctx!.drawImage(camada, caixa.x0, caixa.y0, caixa.x1 - caixa.x0, caixa.y1 - caixa.y0)

        // nome em cima
        ctx!.font = '700 11px Figtree, system-ui, sans-serif'
        ctx!.textAlign = 'center'
        const ty = m.pos.y - ALTURA_MENINA - 14
        const tw = ctx!.measureText(m.nome).width + 14
        ctx!.fillStyle = 'rgba(255,255,255,.88)'
        ctx!.beginPath()
        ctx!.roundRect(m.pos.x - tw / 2, ty - 11, tw, 16, 8)
        ctx!.fill()
        ctx!.fillStyle = '#5b3b00'
        ctx!.fillText(m.nome, m.pos.x, ty + 1)
      }

      if (dep) desenharDepuracao(ctx!)
    }

    let pedido = 0
    // modo manual (gravador de video): o tempo so anda quando pedem
    let manual = false
    let relogioManual = 0
    function laco(agora: number) {
      const dt = Math.min(0.1, (agora - ultimo) / 1000)
      ultimo = agora
      if (!manual) {
        passo(dt)
        desenhar(agora)
      }
      quadro++
      pedido = requestAnimationFrame(laco)
    }
    pedido = requestAnimationFrame(laco)

    // arrastar o cenario com o dedo (a camera volta a seguir depois de 6 s)
    const escala = () => (canvas.clientWidth / 620) * props.current.zoom
    const desce = (e: PointerEvent) => {
      arrasto = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!arrasto) return
      camera = { x: arrasto.cx - (e.clientX - arrasto.x) / escala(), y: arrasto.cy - (e.clientY - arrasto.y) / escala() }
    }
    const sobe = () => {
      arrasto = null
      soltoAte = performance.now() + 6000
    }
    canvas.addEventListener('pointerdown', desce)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', sobe)
    canvas.addEventListener('pointercancel', sobe)
    // para o gravador de video e os testes: avancar a cena sem esperar
    ;(window as unknown as { hall?: unknown }).hall = {
      avancar: (s: number) => {
        for (let i = 0; i < s * 30; i++) passo(1 / 30)
      },
      quadroManual: (dt: number) => {
        manual = true
        relogioManual += dt * 1000
        passo(dt)
        desenhar(relogioManual)
      },
      gente,
      quadros: () => quadro,
    }
    return () => {
      cancelAnimationFrame(pedido)
      canvas.removeEventListener('pointerdown', desce)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', sobe)
      canvas.removeEventListener('pointercancel', sobe)
    }
  }, [meninas])

  return <canvas ref={canvasRef} className="hall-cena" />
}

function desenharDepuracao(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(0, 200, 0, .9)'
  for (const p of cena.chao as unknown as [number, number][][]) {
    ctx.beginPath()
    p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.stroke()
  }
  for (const o of OBJETOS) {
    ctx.strokeStyle = 'rgba(230, 0, 0, .9)'
    ctx.beginPath()
    o.obstaculo.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(220, 0, 220, .9)'
    ctx.beginPath()
    o.frente.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
  }
}
