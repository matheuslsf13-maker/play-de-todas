import { emAvaliacao, forcaDeDuplas, rankingDeForca } from './forca'
import { posicoesDaLista, semOPlay, ultimoPlayJogado, variacoes } from './variacao'
import type { AppData } from './types'

/**
 * AS SETAS DO STATS (a mesma conta das da tela inicial, `variacao.ts`): a posicao de agora contra a de antes do
 * ultimo play que entrou na forca. `temAnterior` falso = so existe um play, ninguem tem seta. Quem nao esta no
 * mapa mesmo com anterior estreou no ultimo play ("novo").
 */
export type Movimentos = { porId: Map<string, number>; temAnterior: boolean }

const SEM: Movimentos = { porId: new Map(), temAnterior: false }

/** Setas da forca individual, com o mesmo filtro da lista mostrada (pausada fora; em avaliacao so para a admin). */
export function movimentoDaForca(data: AppData, nameOf: (id: string) => string, canEdit: boolean): Movimentos {
  const ultimo = ultimoPlayJogado(data)
  if (!ultimo) return SEM
  const antes = semOPlay(data, ultimo)
  if (antes.matches.length === 0) return SEM
  const filtro = (l: { pausada?: string; emAvaliacao?: number }) => !l.pausada && (canEdit || l.emAvaliacao === undefined)
  const agora = rankingDeForca(data, nameOf).filter(filtro).map((l) => l.player_id)
  const ant = rankingDeForca(antes, nameOf).filter(filtro).map((l) => l.player_id)
  return { porId: variacoes(posicoesDaLista(ant), posicoesDaLista(agora)), temAnterior: true }
}

/** Setas das duplas (chave da dupla), com o mesmo filtro e ordem da lista da tela. */
export function movimentoDasDuplas(data: AppData, nameOf: (id: string) => string, canEdit: boolean): Movimentos {
  const ultimo = ultimoPlayJogado(data)
  if (!ultimo) return SEM
  const antes = semOPlay(data, ultimo)
  if (antes.matches.length === 0) return SEM
  const ordenadas = (d: AppData) => {
    const avaliacao = emAvaliacao(d)
    return [...forcaDeDuplas(d).values()]
      .filter((x) => canEdit || (!avaliacao.has(x.a) && !avaliacao.has(x.b)))
      .sort((a, b) => b.nota - a.nota || nameOf(a.a).localeCompare(nameOf(b.a), 'pt-BR'))
      .map((x) => x.key)
  }
  return { porId: variacoes(posicoesDaLista(ordenadas(antes)), posicoesDaLista(ordenadas(data))), temAnterior: true }
}
