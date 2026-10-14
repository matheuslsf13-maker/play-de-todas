import { useState } from 'react'
import { LIGAS, type Liga } from '../../liga.config'
import { LIGA } from '../liga'
import { Modal } from './ui'

/*
 * TROCAR DE PLAY: os tres apps (Play de Todas na raiz, Play de Terca em
 * /masculino/, Play Mista em /mista/) sao builds separados no mesmo dominio.
 * Este componente leva de um para o outro e guarda a escolha.
 *
 * A escolha mora em `play:app`, sem o prefixo da liga: o localStorage e do
 * dominio, entao os tres apps leem a mesma chave. E a raiz (o feminino) que a
 * usa para abrir direto no play de quem ja escolheu.
 */
const CHAVE = 'play:app'
const ORDEM: Liga[] = [LIGAS.feminino, LIGAS.masculino, LIGAS.misto]

/** O endereco da raiz do site, tirando a pasta deste app do caminho. */
export function raizDoSite(): string {
  const aqui = new URL('./', window.location.href).pathname
  return LIGA.pasta && aqui.endsWith(LIGA.pasta) ? aqui.slice(0, aqui.length - LIGA.pasta.length) : aqui
}

/** O play escolhido neste aparelho, ou null se ainda nao escolheu. */
export function playEscolhido(): Liga | null {
  try {
    const id = localStorage.getItem(CHAVE)
    return ORDEM.find((l) => l.id === id) ?? null
  } catch {
    return null
  }
}

export function guardarEscolha(liga: Liga) {
  try {
    localStorage.setItem(CHAVE, liga.id)
  } catch {
    /* sem localStorage: a escolha vale so agora */
  }
}

/** Guarda a escolha e abre o app dela (se nao for este). */
export function irPara(liga: Liga) {
  guardarEscolha(liga)
  if (liga.id !== LIGA.id) window.location.assign(raizDoSite() + liga.pasta)
}

function ListaDePlays({ marcarAtual, onEscolher = irPara }: { marcarAtual: boolean; onEscolher?: (l: Liga) => void }) {
  const raiz = raizDoSite()
  return (
    <div className="stack" style={{ gap: 8 }}>
      {ORDEM.map((l) => {
        const aqui = marcarAtual && l.id === LIGA.id
        return (
          <button key={l.id} className={`play-opcao${aqui ? ' on' : ''}`} onClick={() => onEscolher(l)}>
            <img src={`${raiz}${l.pasta}logo.png?v=${__VERSAO__}`} alt="" width={48} height={48} />
            <span className="grow">{l.rotulo}</span>
            <span className="tiny muted nowrap">{aqui ? '✓ aqui' : 'abrir →'}</span>
          </button>
        )
      })}
    </div>
  )
}

/** O chip do cabecalho e a janela com os tres plays. */
export function BotaoTrocarDePlay() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button className="chip-topo" onClick={() => setAberto(true)} title="Ir para outro play">
        🔁 Trocar de play
      </button>
      {aberto && (
        <Modal title="Ir para outro play" onClose={() => setAberto(false)}>
          <ListaDePlays marcarAtual />
        </Modal>
      )}
    </>
  )
}

/** A tela da primeira visita: qual play abrir. Depois, o site lembra. */
export function EscolhaDeEntrada({ onFicar }: { onFicar: () => void }) {
  return (
    <div className="entrada">
      <div className="entrada-caixa">
        <h1 className="entrada-titulo">Qual play você quer abrir?</h1>
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Beach Tennis · V3 Arena. Dá para trocar depois no <strong>🔁 Trocar de play</strong>, no alto da tela.
        </p>
        <ListaDePlays
          marcarAtual={false}
          onEscolher={(l) => {
            // escolher o deste app nao recarrega nada: so guarda e mostra o app
            if (l.id !== LIGA.id) return irPara(l)
            guardarEscolha(l)
            onFicar()
          }}
        />
      </div>
    </div>
  )
}
