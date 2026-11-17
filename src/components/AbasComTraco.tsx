import type { CSSProperties } from 'react'

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
