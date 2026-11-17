import { useRef, type CSSProperties, type ReactNode } from 'react'

/**
 * As abas do Desempenho (dono, 17/11): a escolhida tem a escrita no degrade do titulo e um traco embaixo.
 * Trocar de aba desliza o traco e, junto, uma "janela" que pinta a escrita: a mesma conta e o mesmo tempo,
 * entao a palavra nova se pinta enquanto o traco chega e a antiga desbota enquanto ele sai.
 * A camada pintada e uma copia dos rotulos por cima, recortada na coluna da aba escolhida.
 */
export function AbasComTraco<T extends string>({
  abas,
  ativa,
  onEscolher,
  interno = false,
}: {
  abas: { id: T; rotulo: string }[]
  ativa: T
  onEscolher: (id: T) => void
  interno?: boolean
}) {
  const vars = { '--i': Math.max(0, abas.findIndex((a) => a.id === ativa)), '--n': abas.length } as CSSProperties
  return (
    <div className={`st-seg${interno ? ' interno' : ''}`} role="tablist" style={vars}>
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={a.id === ativa} className={a.id === ativa ? 'on' : ''} onClick={() => onEscolher(a.id)}>
          {a.rotulo}
        </button>
      ))}
      <span className="st-pintura" aria-hidden="true">
        {abas.map((a) => (
          <span key={a.id}>{a.rotulo}</span>
        ))}
      </span>
      <span className="st-traco" aria-hidden="true" />
    </div>
  )
}

/** Para que lado a aba andou desde a ultima vez (ref: muda so quando o indice muda). */
function useLado(indice: number): '' | 'dir' | 'esq' {
  const antes = useRef(indice)
  const lado = useRef<'' | 'dir' | 'esq'>('')
  if (antes.current !== indice) {
    lado.current = indice > antes.current ? 'dir' : 'esq'
    antes.current = indice
  }
  return lado.current
}

/**
 * O conteudo da aba entra deslizando do lado para onde a aba andou (dono, 17/11): tocar numa aba a direita
 * traz a tela da direita, no mesmo tempo do traco. Na primeira vez nao anima.
 */
export function ConteudoQueDesliza({ indice, children }: { indice: number; children: ReactNode }) {
  const lado = useLado(indice)
  return (
    <div className="desliza-moldura">
      <div key={indice} className={`desliza ${lado}`}>
        {children}
      </div>
    </div>
  )
}

/**
 * A barra de botoes com a pilula pintada que vai ate a opcao tocada como gelatina (dono, 17/11): desliza e estica
 * no caminho, voltando ao tamanho ao chegar. So transform (mexer em left/right deixava rastro no iPhone).
 */
export function SegmentadoGelatina<T extends string>({
  opcoes,
  ativa,
  onEscolher,
  style,
}: {
  opcoes: { id: T; rotulo: ReactNode }[]
  ativa: T
  onEscolher: (id: T) => void
  style?: CSSProperties
}) {
  const i = Math.max(0, opcoes.findIndex((o) => o.id === ativa))
  const lado = useLado(i)
  return (
    <div className={`segmented gelatina ${lado}`} style={{ ...style, '--i': i, '--n': opcoes.length } as CSSProperties}>
      {/* a massa remonta a cada troca (key) para a esticada rodar de novo */}
      <span className="gelatina-pilula" aria-hidden="true">
        <span key={i} className="gelatina-massa" />
      </span>
      {opcoes.map((o) => (
        <button key={o.id} type="button" className={o.id === ativa ? 'on' : ''} aria-pressed={o.id === ativa} onClick={() => onEscolher(o.id)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}
