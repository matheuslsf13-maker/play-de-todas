import { createContext, useContext, type ReactNode } from 'react'
import { useStore } from '../lib/store'

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
  // quem ja foi Duquesa tem o nome dourado com a coroa, em qualquer tela
  const duquesa = useStore().duquesas.has(id)
  const classes = [className, duquesa && 'nome-duquesa'].filter(Boolean).join(' ')
  const conteudo = duquesa ? <><span className="coroa">👑</span> {children}</> : children
  if (!abrir) return <span className={classes || undefined}>{conteudo}</span>
  return (
    <button
      type="button"
      className={`nome-link${classes ? ` ${classes}` : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        abrir(id)
      }}
    >
      {conteudo}
    </button>
  )
}

/**
 * "Ana + Bia" sem perder ninguem: cada nome fica inteiro na sua linha e so o
 * nome que SOZINHO nao cabe e cortado com "...". Cortar a dupla inteira numa
 * linha so escondia a parceira quando o primeiro nome era comprido.
 * Com fornecedor de perfil (Ranking, Stats), cada nome abre a ficha dela.
 */
export function NomesDaDupla({ a, b, nomeDe }: { a: string; b: string; nomeDe: (id: string) => string }) {
  return (
    <span className="dupla-nomes">
      <NomeClicavel id={a} className="dupla-nome">{nomeDe(a)}</NomeClicavel>
      <span className="muted"> + </span>
      <NomeClicavel id={b} className="dupla-nome">{nomeDe(b)}</NomeClicavel>
    </span>
  )
}
