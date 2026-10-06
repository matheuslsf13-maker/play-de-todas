import { useState } from 'react'
import type { DesempateDeGrupo } from '../lib/types'

/**
 * DESEMPATE EM QUADRA, no fim da fase de grupos.
 *
 * Quando duas ou mais empatam em tudo (vitorias, pontos, saldo e o confronto
 * direto, que so conta quando e justo), quem decide e a quadra: uma simples
 * 1x1 ou um par ou impar. A organizadora marca como foi e toca em quem ficou
 * na frente, na ordem. Nunca ordem alfabetica.
 */
export default function DesempateEmQuadra({
  titulo,
  ids,
  nameOf,
  onSalvar,
}: {
  /** "Grupo 2" ou "Categoria B · grupo 1". */
  titulo: string
  ids: string[]
  nameOf: (id: string) => string
  onSalvar: (ordem: string[], como: DesempateDeGrupo['como']) => void
}) {
  const [como, setComo] = useState<DesempateDeGrupo['como']>('simples')
  const [ordem, setOrdem] = useState<string[]>([])
  const faltam = ids.filter((id) => !ordem.includes(id))

  function tocar(id: string) {
    const nova = [...ordem, id]
    // a ultima nao precisa de toque: sobra uma, ela fica atras
    const resto = ids.filter((x) => !nova.includes(x))
    if (resto.length === 1) {
      onSalvar([...nova, resto[0]], como)
      setOrdem([])
      return
    }
    setOrdem(nova)
  }

  return (
    <div className="banner warn" style={{ marginBottom: 10 }}>
      <strong>
        🎾 Desempate no {titulo}: {ids.map(nameOf).join(' × ')}
      </strong>
      <div className="tiny" style={{ marginTop: 4 }}>
        Empataram em vitórias, pontos e saldo, e o confronto direto não decide. Resolvam na quadra:
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <button className={`chip ${como === 'simples' ? 'on' : 'off'}`} onClick={() => setComo('simples')}>
          🎾 Simples 1x1
        </button>
        <button className={`chip ${como === 'par-impar' ? 'on' : 'off'}`} onClick={() => setComo('par-impar')}>
          🎲 Par ou ímpar
        </button>
      </div>
      <div className="tiny" style={{ marginTop: 8 }}>
        {ordem.length === 0
          ? 'Toque em quem venceu:'
          : `${ordem.map((id, i) => `${i + 1}ª ${nameOf(id)}`).join(', ')} — agora, quem ficou em ${ordem.length + 1}º:`}
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
        {faltam.map((id) => (
          <button key={id} className="btn ghost sm" onClick={() => tocar(id)}>
            {nameOf(id)}
          </button>
        ))}
        {ordem.length > 0 && (
          <button className="btn ghost sm" onClick={() => setOrdem([])}>
            ↩️ Recomeçar
          </button>
        )}
      </div>
    </div>
  )
}
