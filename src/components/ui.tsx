import React from 'react'
import type { Player } from '../lib/types'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ player, size = 34 }: { player?: Player; size?: number }) {
  const style: React.CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.38) }
  // as iniciais seguem o APELIDO, para casarem com o nome que aparece do lado:
  // "Aninha" com um circulo escrito "AS" (de Ana Cristina Souza) confunde
  const exibido = player ? player.nickname?.trim() || player.name : ''
  if (player?.photo_url) {
    return <img className="avatar" style={style} src={player.photo_url} alt={exibido} />
  }
  return <span className="avatar" style={style}>{player ? initials(exibido) : '?'}</span>
}

/**
 * Campo numerico com botoes - e +. No celular, digitar direto num
 * <input type=number> controlado e uma armadilha: apagar para trocar o valor
 * faz o campo saltar para o minimo e o proximo digito vira outro numero.
 * Aqui o texto digitado so e aplicado quando o campo perde o foco.
 */
export function Stepper({
  value,
  min,
  max,
  onChange,
  disabled,
  vazio,
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  disabled?: boolean
  /** Texto no lugar do numero quando ainda nao ha o que mostrar. */
  vazio?: string
}) {
  const [rascunho, setRascunho] = React.useState<string | null>(null)
  const limitar = (n: number) => Math.min(max, Math.max(min, n))
  const aplicar = () => {
    const n = Number(rascunho)
    onChange(rascunho !== null && rascunho !== '' && Number.isFinite(n) ? limitar(n) : value)
    setRascunho(null)
  }
  return (
    <div className={`stepper${disabled ? ' off' : ''}`}>
      <button type="button" aria-label="diminuir" disabled={disabled || value <= min} onClick={() => onChange(limitar(value - 1))}>
        −
      </button>
      <input
        inputMode="numeric"
        value={rascunho ?? (vazio && value <= 0 ? vazio : String(value))}
        disabled={disabled}
        onFocus={(e) => { setRascunho(String(value)); e.currentTarget.select() }}
        onChange={(e) => setRascunho(e.target.value.replace(/\D/g, ''))}
        onBlur={aplicar}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      <button type="button" aria-label="aumentar" disabled={disabled || value >= max} onClick={() => onChange(limitar(value + 1))}>
        +
      </button>
    </div>
  )
}

/** Quantas vezes a logo tenta carregar antes de ficar no desenho. */
const TENTATIVAS_DA_LOGO = 4

/**
 * Logo do campeonato: `public/logo.png`, com o selo desenhado de reserva
 * para quando a imagem nao carrega.
 */
export function Logo({ size = 64 }: { size?: number }) {
  /*
   * Falhou? Mostra o desenho e tenta de novo dali a pouco, com espera
   * crescente. Antes o componente desistia na primeira falha e ficava no
   * desenho generico ate fechar o app -- e na beira da quadra a primeira
   * falha e comum: sinal fraco no momento de abrir. O `key` na tentativa
   * remonta o <img>, que pede a imagem de novo.
   */
  const [tentativa, setTentativa] = React.useState(0)
  const [falhou, setFalhou] = React.useState(false)
  const timer = React.useRef<number | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  const aoFalhar = () => {
    setFalhou(true)
    if (tentativa >= TENTATIVAS_DA_LOGO) return
    timer.current = window.setTimeout(() => {
      setTentativa(tentativa + 1)
      setFalhou(false)
    }, 1500 * (tentativa + 1))
  }
  if (!falhou) {
    return (
      <img
        key={tentativa}
        src={`${import.meta.env.BASE_URL}logo.png`}
        alt="Play de Todas"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }}
        onError={aoFalhar}
      />
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flex: 'none' }} aria-label="Play de Todas">
      <defs>
        <linearGradient id="pdt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf0" />
          <stop offset=".55" stopColor="#ff5c8a" />
          <stop offset="1" stopColor="#ff8a3d" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#pdt)" />
      {/* bola de beach tennis, com a costura em arco */}
      <circle cx="50" cy="36" r="16" fill="#0e1230" opacity=".22" />
      <circle cx="50" cy="34" r="16" fill="#fff6ee" />
      <path d="M38 26c7 5 7 11 0 16M62 26c-7 5-7 11 0 16" stroke="#ff5c8a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <text x="50" y="66" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff6ee" fontFamily="system-ui, sans-serif" letterSpacing="2.5">PLAY</text>
      <text x="50" y="84" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff6ee" fontFamily="system-ui, sans-serif">de Todas</text>
    </svg>
  )
}

export function Empty({ icon = '🎾', children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="big">{icon}</span>
      {children}
    </div>
  )
}

export function StatBox({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="stat-box">
      <div className="v">{v}</div>
      <div className="k">{k}</div>
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <strong>{title}</strong>
          <button className="btn ghost sm" onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return <div className="toast">{message}</div>
}

export function useToast() {
  const [msg, setMsg] = React.useState<string | null>(null)
  const show = React.useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg(null), 2600)
  }, [])
  return { msg, show }
}

/** Copia texto e cai para um prompt quando a area de transferencia nao esta disponivel. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function shareOrCopy(text: string): Promise<boolean> {
  const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }
  if (nav.share) {
    return nav.share({ text }).then(() => true).catch(() => copyText(text))
  }
  return copyText(text)
}
