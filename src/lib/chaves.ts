/**
 * Nomes das chaves guardadas no navegador de quem usa o app.
 *
 * O campeonato ja se chamou `play-das-meninas` (que e o nome do concorrente,
 * herdado do repositorio), `play-de-sexta`, `play-da-sexta` -- e hoje se chama
 * Play de Todas, nas segundas. Trocar a chave sem mais nada
 * apagaria, para quem ja usava o app, o cache offline e principalmente a
 * FILA DE LANCAMENTOS feitos sem sinal -- entao as chaves antigas sao
 * renomeadas na primeira abertura.
 *
 * A renomeacao roda no import deste modulo, que e o unico lugar onde os nomes
 * existem: quem le o localStorage passa por aqui e portanto ja pega migrado.
 */

export const CHAVE = {
  /** Dados completos, no modo local (sem Supabase). */
  dados: 'play-de-todas:v1',
  /** Escritas pendentes, que sobrevivem a refresh e a celular sem sinal. */
  fila: 'play-de-todas:queue',
  /** Ultimo estado conhecido, para o app abrir offline. */
  cache: 'play-de-todas:cache',
  /** Quais partidas entraram em quadra e quando. */
  emQuadra: 'play-de-todas:em-quadra',
  /** Quando cada partida terminou (alimenta o "fora ha mais tempo"). */
  fimDasPartidas: 'play-de-todas:fim-das-partidas',
  /** Quem ainda nao chegou em cada play (session_id -> ids), so neste aparelho. */
  ausentes: 'play-de-todas:ausentes',
  /** Modo diurno ou noturno escolhido por quem usa. */
  tema: 'play-de-todas:tema',
} as const

const RENOMEADAS: [antiga: string, nova: string][] = [
  ['play-das-meninas:v1', CHAVE.dados],
  ['play-das-meninas:queue', CHAVE.fila],
  ['play-das-meninas:cache', CHAVE.cache],
  ['play-de-sexta:em-quadra', CHAVE.emQuadra],
  ['play-de-sexta:fim-das-partidas', CHAVE.fimDasPartidas],
  ['play-da-sexta:v1', CHAVE.dados],
  ['play-da-sexta:queue', CHAVE.fila],
  ['play-da-sexta:cache', CHAVE.cache],
  ['play-da-sexta:em-quadra', CHAVE.emQuadra],
  ['play-da-sexta:fim-das-partidas', CHAVE.fimDasPartidas],
]

function migrar() {
  try {
    for (const [antiga, nova] of RENOMEADAS) {
      const valor = localStorage.getItem(antiga)
      if (valor === null) continue
      // se a chave nova ja tem conteudo, ela manda: o app novo ja rodou aqui
      if (localStorage.getItem(nova) === null) localStorage.setItem(nova, valor)
      localStorage.removeItem(antiga)
    }
  } catch {
    /* navegador sem localStorage (aba anonima, armazenamento bloqueado):
       o app continua funcionando so em memoria */
  }
}

migrar()
