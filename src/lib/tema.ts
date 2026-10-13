import { CHAVE } from './chaves'
import { LIGA } from '../liga'

/**
 * Modo diurno / noturno.
 *
 * O padrao e o NOTURNO: o play acontece a noite, na areia, e a tela escura
 * cansa menos a vista na quadra. Mas o logo foi desenhado para fundo claro,
 * entao quem preferir ve tudo no claro -- a escolha fica guardada no proprio
 * celular e vale para o app inteiro.
 *
 * O tema mora num atributo do <html>, e nao numa classe do React: assim ele e
 * aplicado antes da primeira pintura (ver `aplicarTemaSalvo`, chamada no
 * main.tsx) e a tela nao "pisca" claro antes de ficar escura.
 */

export type Tema = 'claro' | 'escuro'

const PADRAO: Tema = 'escuro'

/** Cor da barra de status do celular, para combinar com o tema. */
const BARRA: Record<Tema, string> = { claro: LIGA.temaClaro, escuro: LIGA.tema }

export function temaSalvo(): Tema {
  try {
    const v = localStorage.getItem(CHAVE.tema)
    return v === 'claro' || v === 'escuro' ? v : PADRAO
  } catch {
    return PADRAO
  }
}

export function aplicarTema(tema: Tema) {
  document.documentElement.setAttribute('data-tema', tema)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', BARRA[tema])
  try {
    localStorage.setItem(CHAVE.tema, tema)
  } catch {
    /* sem espaco: vale so nesta sessao */
  }
}

/** Chamada uma vez, antes de o React montar. */
export function aplicarTemaSalvo(): Tema {
  const t = temaSalvo()
  document.documentElement.setAttribute('data-tema', t)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', BARRA[t])
  return t
}
