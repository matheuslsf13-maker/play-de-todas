import { useState, type ReactNode } from 'react'
import { Modal } from './ui'

/** Posicao com a seta (▲n / ▼n / — / novo) desde o ultimo play que contou na forca. */
export function PosicaoComSeta({ pos, v, temAnterior }: { pos: number; v?: number; temAnterior: boolean }) {
  let seta: ReactNode = null
  if (temAnterior) {
    if (v === undefined) seta = <i className="st-nova">novo</i>
    else if (v > 0) seta = <i className="st-sobe" aria-label={`subiu ${v}`}>▲{v}</i>
    else if (v < 0) seta = <i className="st-desce" aria-label={`caiu ${-v}`}>▼{-v}</i>
    else seta = <i className="st-igual" aria-label="igual">—</i>
  }
  return (
    <span className="st-pos">
      <b>{pos}</b>
      {seta}
    </span>
  )
}

/** Seta pequena ao lado de um numero (pódio): "▲1" ou "▼2"; nada sem mudanca. */
export function SetaPequena({ v }: { v?: number }) {
  if (!v) return null
  return <span className={`st-mov ${v > 0 ? 'st-sobe' : 'st-desce'}`}>{v > 0 ? '▲' : '▼'}{Math.abs(v)}</span>
}

/**
 * Lista com "Ver todas (N)": as primeiras ficam sempre e o resto abre por `grid-template-rows` 0fr → 1fr (320 ms)
 * com as linhas em cascata (CSS); a seta do botao gira. Parada com `prefers-reduced-motion`.
 */
export function ListaExpansivel({ itens, visiveis, rotulo, total }: { itens: ReactNode[]; visiveis: number; rotulo: string; /** Quantas linhas de verdade (os titulos de bloco tambem sao itens). */ total?: number }) {
  const [aberta, setAberta] = useState(false)
  const resto = itens.slice(visiveis)
  return (
    <div className={`st-expansivel${aberta ? ' aberta' : ''}`}>
      <div className="st-lista">{itens.slice(0, visiveis)}</div>
      {resto.length > 0 && (
        <>
          <div className="st-mais" aria-hidden={!aberta}>
            <div className="st-mais-dentro">
              <div className="st-lista">{resto}</div>
            </div>
          </div>
          <button type="button" className="st-ver-mais" aria-expanded={aberta} onClick={() => setAberta(!aberta)}>
            {aberta ? 'Recolher' : `Ver todas ${rotulo} (${total ?? itens.length})`} <i>▾</i>
          </button>
        </>
      )}
    </div>
  )
}

/** O periodo do Stats: um chip no topo que abre uma folha (em vez do <select>). */
export function FolhaDoPeriodo({
  periodo,
  meses,
  rotulo,
  onEscolher,
}: {
  periodo: string
  meses: { id: string; rotulo: string }[]
  rotulo: string
  onEscolher: (p: string) => void
}) {
  const [aberta, setAberta] = useState(false)
  const opcoes = [{ id: 'all', rotulo: '🏅 Histórico completo' }, ...meses]
  return (
    <>
      <button type="button" className="st-periodo" onClick={() => setAberta(true)} aria-haspopup="dialog">
        {rotulo} <i>▾</i>
      </button>
      {aberta && (
        <Modal title="Período" onClose={() => setAberta(false)}>
          <div className="folha-acoes">
            {opcoes.map((o) => (
              <button
                key={o.id}
                type="button"
                className={o.id === periodo ? 'st-opcao on' : 'st-opcao'}
                onClick={() => {
                  onEscolher(o.id)
                  setAberta(false)
                }}
              >
                <span>{o.rotulo}</span>
                {o.id === periodo && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Plays avulsos aparecem só no histórico.</p>
        </Modal>
      )}
    </>
  )
}
