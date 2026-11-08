import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'

/**
 * O CAMPO DE BUSCA do app (dono, 08/11): lupa dentro do campo, borda rosa com um halo ao tocar, "✕" que limpa
 * (e continua digitando) e "Cancelar" que desliza da direita enquanto o campo esta em uso (limpa e fecha o
 * teclado). O mesmo em todas as telas: Meninas, Financeiro, montar o play, fila/ja jogadas e Stats.
 */
export default function CampoDeBusca({
  valor,
  onMudar,
  placeholder,
  rotulo,
  style,
}: {
  valor: string
  onMudar: (v: string) => void
  placeholder: string
  /** Para leitor de tela; sem ele vale o placeholder. */
  rotulo?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [foco, setFoco] = useState(false)
  // pointerdown sem foco: tocar no ✕ ou no Cancelar nao tira o foco do campo antes do clique
  const semTirarFoco = (e: PointerEvent) => e.preventDefault()
  return (
    <div className={`campo-busca${foco ? ' com-foco' : ''}`} style={style}>
      <label className="campo-busca-caixa">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </svg>
        <input
          ref={ref}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          aria-label={rotulo ?? placeholder}
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
          onFocus={() => setFoco(true)}
          onBlur={() => setFoco(false)}
        />
        {valor && (
          <button
            type="button"
            className="campo-busca-limpar"
            aria-label="Limpar a busca"
            onPointerDown={semTirarFoco}
            onClick={() => {
              onMudar('')
              ref.current?.focus()
            }}
          >
            ✕
          </button>
        )}
      </label>
      <button
        type="button"
        className="campo-busca-cancelar"
        tabIndex={foco ? 0 : -1}
        aria-hidden={!foco}
        onPointerDown={semTirarFoco}
        onClick={() => {
          onMudar('')
          ref.current?.blur()
        }}
      >
        Cancelar
      </button>
    </div>
  )
}
