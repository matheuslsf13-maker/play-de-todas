import { createContext, useContext, type ReactNode } from 'react'

/**
 * NOMES QUE ABREM A FICHA DA MENINA.
 *
 * Quem fornece a acao e a tela: o Ranking manda para o Stats, e o proprio
 * Stats troca a ficha aberta (com "voltar"). Sem fornecedor -- dentro do Play,
 * por exemplo -- o nome e so texto: tocar num nome no meio do play nao pode
 * tirar a organizadora da quadra.
 */
const AbrirPerfil = createContext<((id: string) => void) | null>(null)

export const ProvedorDePerfil = AbrirPerfil.Provider

export function useAbrirPerfil() {
  return useContext(AbrirPerfil)
}

export function NomeClicavel({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const abrir = useContext(AbrirPerfil)
  if (!abrir) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      className={`nome-link${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        abrir(id)
      }}
    >
      {children}
    </button>
  )
}
