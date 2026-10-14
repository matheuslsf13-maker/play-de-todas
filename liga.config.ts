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
  /** Cor da barra do sistema e do fundo da tela de abertura (tema escuro). */
  tema: string
  /** Barra do sistema no tema claro. */
  temaClaro: string
  /** A cor de destaque da marca (no fundo escuro). */
  marca: string
  /** Segunda cor da marca, a do comeco do degrade. */
  marca2: string
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
    temaClaro: '#efe5d6',
    marca: '#ff5c8a',
    marca2: '#8b5cf0',
  },
  masculino: {
    id: 'masculino',
    nome: 'Play de Terça',
    nomeCurto: 'Play de Terça',
    descricao: 'Duplas equilibradas, placares e ranking do Play de Terça.',
    schema: 'masculino',
    prefixo: 'play-de-todos',
    // azul-noite e azul-eletrico no lugar do roxo e do rosa; o por do sol
    // (amarelo e laranja) continua, porque e a praia e nao o genero
    tema: '#0a1626',
    temaClaro: '#e1e8f1',
    marca: '#3fa2ff',
    marca2: '#2f5fd0',
  },
}

export function ligaDe(id: string | undefined): Liga {
  return id === 'masculino' ? LIGAS.masculino : LIGAS.feminino
}
