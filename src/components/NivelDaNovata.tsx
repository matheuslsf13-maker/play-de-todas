import { useState } from 'react'
import ForcaInicial from './ForcaInicial'
import { Modal } from './ui'
import { mediaDaForca } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Player } from '../lib/types'

/**
 * O NIVEL DE QUEM CHEGOU, NA HORA DE MONTAR O PLAY.
 *
 * Quem entra pela lista colada (ou ja estava cadastrada e nunca jogou) chegava
 * sem nivel: entrava na media e caia em qualquer grupo. Agora, ao montar o
 * play, cada atleta nova sem nivel aparece aqui, uma de cada vez -- o mesmo
 * nivel em tres toques do cadastro (`ForcaInicial`). Pular deixa na media.
 */
export default function NivelDaNovata({
  jogadora,
  posicao,
  total,
  onPronto,
  onPularTodas,
}: {
  jogadora: Player
  posicao: number
  total: number
  /** Escolheu (gravado) ou pulou: passa para a proxima. */
  onPronto: () => void
  onPularTodas: () => void
}) {
  const { data, nameOf, savePlayer } = useStore()
  const media = mediaDaForca(data)
  const [forca, setForca] = useState(jogadora.forca_inicial ?? media)
  const ultima = posicao >= total

  async function salvar() {
    // na media: grava nulo, e ela entra na media do dia em que estrear (como no cadastro)
    const valor = forca === media ? null : forca
    if (valor !== (jogadora.forca_inicial ?? null)) await savePlayer({ ...jogadora, forca_inicial: valor })
    onPronto()
  }

  return (
    <Modal title={`🆕 Atleta nova${total > 1 ? ` (${posicao} de ${total})` : ''}`} onClose={onPronto}>
      <div className="stack">
        <div style={{ fontSize: 20, fontWeight: 800 }}>{nameOf(jogadora.id)}</div>
        <p className="tiny muted" style={{ margin: 0 }}>
          {'Ainda não jogou aqui. Qual o nível dela? Ajuda a montar grupos e duplas equilibrados desde o primeiro play — depois as partidas mandam.'}
        </p>
        <ForcaInicial valor={forca} onChange={setForca} media={media} />
        <button className="btn pink block" onClick={() => void salvar()}>
          {ultima ? '✅ Salvar' : '✅ Salvar e ir para a próxima'}
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm grow" onClick={onPronto}>
            Pular (fica na média)
          </button>
          {!ultima && (
            <button className="btn ghost sm grow" onClick={onPularTodas}>
              Pular todas
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
