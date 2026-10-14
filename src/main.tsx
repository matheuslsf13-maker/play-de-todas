import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { EscolhaDeEntrada, guardarEscolha, playEscolhido, raizDoSite } from './components/TrocarDePlay'
import { LIGA } from './liga'
import { StoreProvider } from './lib/store'
import { aplicarTemaSalvo } from './lib/tema'
import './styles.css'

// antes de montar a tela, para nao piscar claro e depois escurecer
aplicarTemaSalvo()

// service worker: deixa o app instalavel no celular e abrir mesmo sem sinal
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // a versao vai na URL: quando muda, o navegador troca o service worker e
    // o cache antigo e descartado, em vez de servir uma versao velha para sempre
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js?v=${__VERSAO__}`,
      { scope: import.meta.env.BASE_URL },
    )
  })
}

/*
 * QUAL PLAY ABRIR. A raiz do site e o Play de Todas; quem ja escolheu outro
 * play neste aparelho (no "Trocar de play" ou na tela da primeira visita) vai
 * direto para ele. Abrir o masculino ou o misto pelo link tambem conta como
 * escolha -- senao a raiz puxaria a pessoa de volta para um play antigo.
 */
const escolhido = playEscolhido()
const redirecionar = LIGA.id === 'feminino' && escolhido !== null && escolhido.id !== LIGA.id
if (redirecionar) window.location.replace(raizDoSite() + escolhido.pasta)
else if (LIGA.id !== 'feminino') guardarEscolha(LIGA)

/** Na primeira visita a raiz, a escolha vem antes do app. */
function Entrada() {
  const [escolheu, setEscolheu] = useState(LIGA.id !== 'feminino' || escolhido !== null)
  if (!escolheu) return <EscolhaDeEntrada onFicar={() => setEscolheu(true)} />
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  )
}

if (!redirecionar) {
  // o app assumiu: a tela de resgate do index.html sai de cena
  clearTimeout((window as unknown as { __bootTimer?: number }).__bootTimer)
  document.getElementById('boot')?.remove()

  createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Entrada />
    </React.StrictMode>,
  )
}
