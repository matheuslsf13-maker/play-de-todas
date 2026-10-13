/**
 * As duas ligas: o Play de Todas (feminino) e a versao masculina.
 *
 * O codigo e exatamente o mesmo nas duas -- mesmas regras, mesma forca, mesmos
 * grupos e duplas. O que muda: o SCHEMA do banco (os dados nao se misturam), o
 * endereco, o nome e as cores. Escolhida no build pela variavel VITE_LIGA.
 *
 * Este arquivo e importado tanto pelo app quanto pelo vite.config.ts, por isso
 * nao usa nada do navegador.
 */

export type LigaId = 'feminino' | 'masculino'

export type Liga = {
  id: LigaId
  nome: string
  nomeCurto: string
  descricao: string
  /** Schema do Postgres com as tabelas desta liga (mesmos nomes nas duas). */
  schema: 'public' | 'masculino'
  /** Prefixo das chaves do localStorage: os dois apps moram na mesma origem. */
  prefixo: string
  /** Cor da barra do sistema e do fundo da tela de abertura. */
  tema: string
}

export const LIGAS: Record<LigaId, Liga> = {
  feminino: {
    id: 'feminino',
    nome: 'Play de Todas',
    nomeCurto: 'Play de Todas',
    descricao: 'Duplas equilibradas, placares e ranking do Play de Todas.',
    schema: 'public',
    prefixo: 'play-de-todas',
    tema: '#0e1230',
  },
  masculino: {
    id: 'masculino',
    nome: 'Play de Todos',
    nomeCurto: 'Play de Todos',
    descricao: 'Duplas equilibradas, placares e ranking do Play de Todos.',
    schema: 'masculino',
    prefixo: 'play-de-todos',
    tema: '#0e1230',
  },
}

export function ligaDe(id: string | undefined): Liga {
  return id === 'masculino' ? LIGAS.masculino : LIGAS.feminino
}
