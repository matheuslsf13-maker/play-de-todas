import { useEffect, useRef } from 'react'

/*
 * O BOTAO VOLTAR DO CELULAR DENTRO DO APP (dono, 08/11/2026). O app nao tem um endereco por aba, entao sem isso o
 * "voltar" saia do app (para o WhatsApp, o Google...).
 *
 * UM passo no historico, gravado quando o site abre (dono, 17/11): cada pushState durante o uso fazia o Safari do
 * iPhone abrir a barra dele e a tela pular (antes era um passo por aba e outro por janela). O voltar consome o passo:
 * - com janela aberta (Modal, o play aberto), fecha a de cima;
 * - senao, o App volta para a aba anterior (`aoVoltarAba` devolve true);
 * - e o passo e gravado de novo (no voltar a barra ja aparece mesmo). Sem nada para voltar, sai do app.
 */
type Fechar = () => void

const pilha: Fechar[] = []
let aoVoltarAba: (() => boolean) | null = null
let temPasso = false

function gravarPasso() {
  if (temPasso) return
  temPasso = true
  history.pushState({ ...(history.state ?? {}), passo: true }, '')
}

if (typeof window !== 'undefined') {
  gravarPasso()
  window.addEventListener('popstate', () => {
    temPasso = false
    const fechar = pilha[pilha.length - 1]
    if (fechar) fechar()
    else if (!aoVoltarAba?.()) {
      // primeira tela, nada para voltar: o voltar sai do app
      history.back()
      return
    }
    gravarPasso()
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
    return () => {
      const i = pilha.lastIndexOf(f)
      if (i >= 0) pilha.splice(i, 1)
    }
  }, [ativo])
}

/** O App diz o que fazer quando o voltar chega sem janela aberta: true = voltou uma aba. */
export function ouvirVoltarDeAba(fn: () => boolean) {
  aoVoltarAba = fn
  return () => {
    if (aoVoltarAba === fn) aoVoltarAba = null
  }
}
