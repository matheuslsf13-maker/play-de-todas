import type { ChangeEvent } from 'react'

/** "📷 Tirar foto" e "🖼️ Foto da galeria": a foto escolhida vai para `aoEscolher`. */
export function BotoesDeFoto({
  gerando,
  aoEscolher,
  textoCamera = '📷 Tirar foto do pódio',
}: {
  gerando: boolean
  aoEscolher: (foto: File) => void
  textoCamera?: string
}) {
  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) aoEscolher(f)
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
    </div>
  )
}
