import type { ReactNode } from 'react'

/**
 * Icones de traco da barra de abas (estilo iOS, dono 09/11): herdam a cor do botao (`currentColor`), entao
 * ficam cinza parado e rosa na aba aberta, nos dois temas e nas tres ligas.
 */
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

const ICONES: Record<string, ReactNode> = {
  // taca
  ranking: (
    <svg {...base}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.5A1.5 1.5 0 0 0 4 7.5C4 9.5 5.5 11 8 11M16 6h2.5A1.5 1.5 0 0 1 20 7.5C20 9.5 18.5 11 16 11" />
      <path d="M12 13v4M8.5 20h7M10 17h4" />
    </svg>
  ),
  // bolinha de tenis
  play: (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M5.2 6.8C8 8.5 9.5 10.2 9.5 12s-1.5 3.5-4.3 5.2M18.8 6.8C16 8.5 14.5 10.2 14.5 12s1.5 3.5 4.3 5.2" />
    </svg>
  ),
  // barras
  stats: (
    <svg {...base}>
      <path d="M5 20V11M12 20V5M19 20v-7" />
    </svg>
  ),
  // duas pessoas
  players: (
    <svg {...base}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5" />
      <path d="M16 5.8a3 3 0 0 1 0 5.4M17.5 14.3c1.7.6 2.7 2.2 3 4.7" />
    </svg>
  ),
  // moeda
  checkins: (
    <svg {...base}>
      <circle cx="12" cy="12" r="8" />
      <path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.8 0 2.5 5 1.2 5 3.7 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2.1-.5-2.6-1.4M12 6.5V8m0 8v1.5" />
    </svg>
  ),
}

export function IconeDaAba({ id }: { id: string }) {
  return <>{ICONES[id] ?? null}</>
}
