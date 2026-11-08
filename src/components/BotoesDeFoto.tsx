import type { ChangeEvent } from 'react'

/**
 * "📷 Tirar foto" e "🖼️ Foto da galeria": a foto escolhida vai para `aoEscolher`.
 * Com `lista`, saem como duas linhas para dentro de uma lista agrupada (tela inicial) em vez de dois botoes.
 */
export function BotoesDeFoto({
  gerando,
  aoEscolher,
  textoCamera = '📷 Tirar foto do pódio',
  lista = false,
}: {
  gerando: boolean
  aoEscolher: (foto: File) => void
  textoCamera?: string
  lista?: boolean
}) {
  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) aoEscolher(f)
  }
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
    </div>
  )
}
