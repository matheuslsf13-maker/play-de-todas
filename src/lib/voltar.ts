import { useEffect, useRef } from 'react'

/*
 * O BOTAO VOLTAR DO CELULAR DENTRO DO APP (dono, 08/11/2026). O app nao tem um endereco por aba, entao trocar de
 * aba ou abrir uma janela nao criava passo no historico e o "voltar" saia do app (para o WhatsApp, o Google...).
 *
 * - Janelas e subtelas (Modal, o play aberto) ficam numa PILHA e dividem UM passo do historico: o voltar fecha a
 *   de cima. Fechada pelo botao da propria janela, o passo sai sozinho (history.back), a nao ser que outra janela
 *   abra logo em seguida (a folha da menina que abre o "editar perfil" reaproveita o passo).
 * - Trocar de aba cria um passo (App.tsx); o voltar sem janela aberta devolve a aba anterior (`aoVoltarAba`).
 */
type Fechar = () => void

const pilha: Fechar[] = []
/** Ha um passo no historico que e das janelas. */
let passoDasJanelas = false
/** O proximo popstate foi causado por nos (o passo da janela fechada pelo botao): ignorar. */
let ignorar = false
let aoVoltarAba: ((estado: unknown) => void) | null = null

function conferirPasso() {
  // depois que o React terminou de abrir/fechar: com janela aberta precisa haver o passo, sem janela nao
  setTimeout(() => {
    if (pilha.length > 0 && !passoDasJanelas) {
      history.pushState({ ...(history.state ?? {}), janela: true }, '')
      passoDasJanelas = true
    } else if (pilha.length === 0 && passoDasJanelas) {
      passoDasJanelas = false
      ignorar = true
      history.back()
    }
  }, 0)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => {
    if (ignorar) {
      ignorar = false
      return
    }
    if (passoDasJanelas) {
      // o voltar fecha a janela de cima; se sobrar outra, conferirPasso cria o passo de novo
      passoDasJanelas = false
      pilha[pilha.length - 1]?.()
      conferirPasso()
      return
    }
    aoVoltarAba?.(e.state)
  })
}

/** Enquanto `ativo`, o voltar do celular chama `fechar` (em vez de sair da tela). */
export function useVoltar(ativo: boolean, fechar: Fechar) {
  const ref = useRef(fechar)
  ref.current = fechar
  useEffect(() => {
    if (!ativo) return
    const f: Fechar = () => ref.current()
    pilha.push(f)
    conferirPasso()
    return () => {
      const i = pilha.lastIndexOf(f)
      if (i >= 0) pilha.splice(i, 1)
      conferirPasso()
    }
  }, [ativo])
}

/** O App diz o que fazer quando o voltar chega a um passo de aba (o estado gravado no pushState). */
export function ouvirVoltarDeAba(fn: (estado: unknown) => void) {
  aoVoltarAba = fn
  return () => {
    if (aoVoltarAba === fn) aoVoltarAba = null
  }
}
