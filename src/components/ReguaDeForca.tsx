import { useId, useRef, type PointerEvent } from 'react'

/** Largura extra do desenho para a regua, ao lado do grafico (em unidades do viewBox). */
export const LARGURA_DA_REGUA = 34

/**
 * A REGUA do vale ao pico (modelo B, dono 08/11): uma capsula na mesma escala vertical do grafico, com o trecho
 * entre o vale e o pico pintado e uma bolinha na nota do ponto tocado (ou a de agora). A bolinha desliza por
 * transform (transicao CSS, interrompivel); parada com movimento reduzido.
 */
export function ReguaDeForca({
  cx,
  y,
  max,
  min,
  atual,
}: {
  cx: number
  y: (v: number) => number
  max: number
  min: number
  atual: number
}) {
  const grad = useId()
  // a capsula e SO o trecho do vale ao pico (sem sobra cinza): as pontas sao a nota mais alta e a mais baixa
  if (max === min) return null
  const alto = y(max)
  const baixo = y(min)
  // a bolinha nunca sai da capsula (o ponto de partida pode ser mais baixo que o vale)
  const nota = Math.max(min, Math.min(max, atual))
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--verde)" />
          <stop offset="1" stopColor="var(--bronze)" />
        </linearGradient>
      </defs>
      <rect x={cx - 5} y={alto} width={10} height={baixo - alto} rx={5} fill={`url(#${grad})`} fillOpacity={0.55} />
      <text x={cx} y={alto - 13} textAnchor="middle" fontSize="9" fontWeight={800} letterSpacing=".3" fill="var(--verde)">pico</text>
      <text x={cx} y={baixo + 20} textAnchor="middle" fontSize="9" fontWeight={800} letterSpacing=".3" fill="var(--bronze)">vale</text>
      <g className="regua-bolinha" style={{ transform: `translateY(${y(nota)}px)` }}>
        <circle cx={cx} cy={0} r={7} fill="var(--text)" stroke="var(--card)" strokeWidth={2.5} />
      </g>
    </g>
  )
}

/**
 * Arrastar o dedo no grafico escolhe o ponto mais perto, 1:1 (Pointer Events com captura). Tocar sem arrastar
 * num ponto ja escolhido limpa a escolha, como o toque de antes.
 */
export function useArrastarNoGrafico(opts: {
  n: number
  larguraDoDesenho: number
  esq: number
  dir: number
  larguraTotal: number
  tocado: number | null
  setTocado: (i: number | null) => void
}) {
  const { n, larguraDoDesenho, esq, dir, larguraTotal, tocado, setTocado } = opts
  const estado = useRef<{ i: number; moveu: boolean; eraIgual: boolean } | null>(null)
  const indice = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * larguraTotal
    const f = ((px - esq) / (larguraDoDesenho - esq - dir)) * (n - 1)
    return Math.max(0, Math.min(n - 1, Math.round(f)))
  }
  return {
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      const i = indice(e)
      estado.current = { i, moveu: false, eraIgual: tocado === i }
      setTocado(i)
    },
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      if (!estado.current) return
      const i = indice(e)
      if (i !== estado.current.i) {
        estado.current.i = i
        estado.current.moveu = true
        setTocado(i)
      }
    },
    onPointerUp: () => {
      if (estado.current && !estado.current.moveu && estado.current.eraIgual) setTocado(null)
      estado.current = null
    },
    onPointerCancel: () => {
      estado.current = null
    },
  }
}
