import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ALTURA_DA_FOTO, ENQUADRE_PADRAO, INICIO_DO_SUMICO, LARGURA_DA_ARTE, enquadrarFoto, type Enquadre } from '../lib/enquadre'
import { Modal } from './ui'

/**
 * "📷 Tirar foto" e "🖼️ Foto da galeria": a foto escolhida passa por "Ajustar a foto" (arrastar e dar zoom
 * dentro da moldura da arte; dono, 16/11) e vai para `aoEscolher` com o enquadramento.
 * Com `lista`, saem como duas linhas para dentro de uma lista agrupada (tela inicial) em vez de dois botoes.
 */
export function BotoesDeFoto({
  gerando,
  aoEscolher,
  textoCamera = '📷 Tirar foto do pódio',
  lista = false,
}: {
  gerando: boolean
  aoEscolher: (foto: File, enquadre: Enquadre) => void
  textoCamera?: string
  lista?: boolean
}) {
  const [ajustando, setAjustando] = useState<File | null>(null)
  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setAjustando(f)
  }
  const ajuste = ajustando && (
    <AjustarFoto
      foto={ajustando}
      onCancelar={() => setAjustando(null)}
      onPronto={(enq) => {
        aoEscolher(ajustando, enq)
        setAjustando(null)
      }}
    />
  )
  if (lista) {
    const [icCamera, ...txtCamera] = textoCamera.split(' ')
    return (
      <>
        <label className={`ini-linha ini-chev${gerando ? ' off' : ''}`}>
          <span className="ini-ic rosa" aria-hidden="true">{icCamera}</span>
          <span className="g"><b>{txtCamera.join(' ')}</b></span>
          <input type="file" accept="image/*" capture="environment" hidden disabled={gerando} onChange={escolher} />
        </label>
        <label className={`ini-linha ini-chev${gerando ? ' off' : ''}`}>
          <span className="ini-ic roxo" aria-hidden="true">🖼️</span>
          <span className="g"><b>Foto da galeria</b></span>
          <input type="file" accept="image/*" hidden disabled={gerando} onChange={escolher} />
        </label>
        {ajuste}
      </>
    )
  }
  return (
    <div className="row" style={{ gap: 8, marginTop: 8 }}>
      {/* capture abre a camera direto no celular; o outro, a galeria */}
      <label className={`btn ghost grow${gerando ? ' off' : ''}`} style={{ textAlign: 'center' }}>
        {textoCamera}
        <input type="file" accept="image/*" capture="environment" hidden disabled={gerando} onChange={escolher} />
      </label>
      <label className={`btn ghost grow${gerando ? ' off' : ''}`} style={{ textAlign: 'center' }}>
        🖼️ Foto da galeria
        <input type="file" accept="image/*" hidden disabled={gerando} onChange={escolher} />
      </label>
      {ajuste}
    </div>
  )
}

// a previa desenha a faixa da foto da arte na metade da resolucao: mesma proporcao, mesma conta
const PW = LARGURA_DA_ARTE / 2
const PH = ALTURA_DA_FOTO / 2
const ZOOM_MAX = 4

function AjustarFoto({ foto, onCancelar, onPronto }: { foto: File; onCancelar: () => void; onPronto: (e: Enquadre) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [enq, setEnq] = useState<Enquadre>(ENQUADRE_PADRAO)
  const toques = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    const url = URL.createObjectURL(foto)
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = url
    return () => URL.revokeObjectURL(url)
  }, [foto])

  useEffect(() => {
    const c = canvas.current?.getContext('2d')
    if (!c || !img) return
    const r = enquadrarFoto(img.width, img.height, PW, PH, enq)
    c.fillStyle = '#0d0a12'
    c.fillRect(0, 0, PW, PH)
    c.imageSmoothingQuality = 'high'
    c.drawImage(img, r.x, r.y, r.w, r.h)
    // o que a arte faz por cima: escurece no titulo e some no escuro embaixo, onde entram os nomes
    const g = c.createLinearGradient(0, 0, 0, PH)
    g.addColorStop(0, 'rgba(13,10,18,.78)')
    g.addColorStop(0.2, 'rgba(13,10,18,0)')
    g.addColorStop(INICIO_DO_SUMICO, 'rgba(13,10,18,0)')
    g.addColorStop(1, 'rgba(13,10,18,1)')
    c.fillStyle = g
    c.fillRect(0, 0, PW, PH)
  }, [img, enq])

  // devolve o enquadre que a conta realmente usou (arrastar alem da borda nao acumula)
  const normalizar = (e: Enquadre): Enquadre => {
    if (!img) return e
    const zoom = Math.min(ZOOM_MAX, Math.max(1, e.zoom))
    const r = enquadrarFoto(img.width, img.height, PW, PH, { ...e, zoom })
    return { zoom, cx: (PW / 2 - r.x) / r.w, cy: (PH / 2 - r.y) / r.h }
  }

  const distancia = () => {
    const [a, b] = [...toques.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    const antes = toques.current.get(e.pointerId)
    if (!antes || !img || !canvas.current) return
    const d0 = distancia()
    toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const px = PW / canvas.current.clientWidth
    setEnq((atual) => {
      if (toques.current.size >= 2) {
        const d1 = distancia()
        return d0 > 0 ? normalizar({ ...atual, zoom: (atual.zoom * d1) / d0 }) : atual
      }
      const r = enquadrarFoto(img.width, img.height, PW, PH, atual)
      return normalizar({
        ...atual,
        cx: atual.cx - ((e.clientX - antes.x) * px) / r.w,
        cy: atual.cy - ((e.clientY - antes.y) * px) / r.h,
      })
    })
  }

  const soltar = (e: React.PointerEvent) => void toques.current.delete(e.pointerId)

  return (
    <Modal title="Ajustar a foto" onClose={onCancelar}>
      <canvas
        ref={canvas}
        width={PW}
        height={PH}
        className="ajustar-foto"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        }}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      />
      <label className="field" style={{ marginTop: 10 }}>
        <span>Zoom</span>
        <input
          type="range"
          style={{ width: '100%' }}
          min={1}
          max={ZOOM_MAX}
          step={0.01}
          value={enq.zoom}
          onChange={(e) => setEnq((a) => normalizar({ ...a, zoom: Number(e.target.value) }))}
        />
      </label>
      <em className="hint">
        Arraste a foto com o dedo (ou use dois dedos para o zoom). O de cima fica sob o título e o de baixo some
        no escuro, onde entram os nomes.
      </em>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button type="button" className="btn ghost grow" onClick={() => setEnq(ENQUADRE_PADRAO)}>
          Centralizar
        </button>
        <button type="button" className="btn pink grow" disabled={!img} onClick={() => onPronto(enq)}>
          ✅ Gerar a arte
        </button>
      </div>
    </Modal>
  )
}
