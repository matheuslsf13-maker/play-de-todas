/*
 * A FILA DA NOITE -- o estado que a tela deriva das partidas, e a escolha da
 * proxima partida de cada quadra.
 *
 * Tudo aqui sai so do que esta gravado (partidas com inicio, fim e placar, quem
 * nao chegou), entao dois celulares com os mesmos dados mostram a mesma coisa.
 * A simulacao de noites em tests/fila.test.ts usa estas mesmas funcoes.
 */
import { isPlayed } from './scoring'
import { pairKey } from './stats'
import {
  jogadorasDaPartida,
  jogosDoRodizio,
  ordemDeEspera,
  ordemPrevista,
  proximasDasQuadras,
  quadrasSimultaneas,
  type EscolhaOpts,
} from './pairing'
import type { Match } from './types'

export type Noite = {
  jogadoras: string[]
  grupos: string[][] | null
  matches: Match[]
  /** Quem esta na lista mas ainda nao chegou. */
  ausentes?: Set<string>
  /** Quadras do play: com varias, a ordem considera as partidas em paralelo. */
  quadras?: number
}

/** O que a tela sabe agora: quem joga, quem espera, quem emendou partidas. */
export function estadoDaNoite(n: Noite) {
  const emJogo = n.matches.filter((m) => !isPlayed(m) && !!m.started_at)
  const jogadas = n.matches.filter(isPlayed)
  const pendentes = n.matches.filter((m) => !isPlayed(m) && !m.started_at)
  const ocupadas = new Set<string>()
  for (const m of emJogo) for (const id of jogadorasDaPartida(m)) ocupadas.add(id)
  const indisponiveis = new Set(ocupadas)
  for (const id of n.ausentes ?? []) if (n.jogadoras.includes(id)) indisponiveis.add(id)

  const jogos = new Map<string, number>()
  for (const m of jogadas) for (const id of jogadorasDaPartida(m)) jogos.set(id, (jogos.get(id) ?? 0) + 1)

  const fim = (m: Match) => Date.parse(m.ended_at ?? '') || 0
  const ultimo = new Map<string, number>()
  for (const m of jogadas) for (const id of jogadorasDaPartida(m)) ultimo.set(id, Math.max(ultimo.get(id) ?? 0, fim(m)))
  const espera = ordemDeEspera(n.jogadoras, (id) => ultimo.get(id) ?? null)

  // seguidas DENTRO do grupo: a quadra do outro grupo terminar nao e descanso
  const ordem = [...jogadas].sort((a, b) => fim(a) - fim(b) || a.round - b.round).concat(emJogo)
  const seguidas = new Map<string, number>()
  for (const id of n.jogadoras) {
    const grupo = n.grupos?.find((g) => g.includes(id)) ?? n.jogadoras
    const doGrupo = ordem.filter((m) => grupo.includes(m.team_a[0]))
    let seq = 0
    for (let i = doGrupo.length - 1; i >= 0; i--) {
      if (!jogadorasDaPartida(doGrupo[i]).includes(id)) break
      seq++
    }
    seguidas.set(id, seq)
  }

  const jaFormadas = new Set<string>()
  for (const m of [...jogadas, ...emJogo]) {
    jaFormadas.add(pairKey(m.team_a[0], m.team_a[1]))
    jaFormadas.add(pairKey(m.team_b[0], m.team_b[1]))
  }
  return { emJogo, jogadas, pendentes, ocupadas, indisponiveis, jogos, espera, seguidas, jaFormadas }
}

/** O jeito de antes: a quadra livre escolhe sozinha, sem olhar a lista mostrada. */
export function proximasSemFila(n: Noite, quadrasLivres: number[]): Map<number, Match> {
  const e = estadoDaNoite(n)
  const opts: EscolhaOpts = {
    pendentes: e.pendentes,
    ocupadas: e.indisponiveis,
    espera: e.espera,
    jogos: e.jogos,
    quadrasLivres,
    seguidas: e.seguidas,
    jaFormadas: e.jaFormadas,
    jogadoras: n.jogadoras,
    grupos: n.grupos,
  }
  return proximasDasQuadras(opts)
}

/**
 * A FILA DE CADA GRUPO, na ordem em que as partidas vao acontecer.
 *
 * E a lista que a tela mostra -- e a mesma que as quadras consomem
 * (`proximasPelaFila`): a quadra que vaga pega a PRIMEIRA partida da fila do
 * grupo dela cujas quatro meninas estao livres. Antes a lista era uma previsao
 * feita de um jeito e a quadra escolhia de outro, e em 05/10 a partida que
 * entrava nao era a que estava escrita.
 */
export function filaPorGrupo(n: Noite): Match[][] {
  const e = estadoDaNoite(n)
  const grupos = n.grupos?.length ? n.grupos : [n.jogadoras]
  // a ordem de cada grupo e calculada SO com o grupo: as seguidas contam por
  // grupo, e misturar os grupos numa sequencia so fazia a lista nao bater
  return grupos.map((g) => {
    const doGrupo = new Set(g)
    return ordemPrevista({
      pendentes: e.pendentes.filter((m) => doGrupo.has(m.team_a[0])),
      espera: e.espera,
      ocupadas: e.indisponiveis,
      jogadoras: g,
      seguidas: e.seguidas,
      jaFormadas: e.jaFormadas,
      grupos: [g],
      ausentes: n.ausentes,
      quadras: Math.min(Math.max(1, quadrasSimultaneas([g.length])), n.quadras ?? 1),
    })
  })
}

/**
 * A proxima partida de cada quadra livre: a primeira de uma fila de grupo com
 * as quatro livres. Cada grupo mora numa quadra (`quadrasDaCasa`, padrao
 * grupo i -> quadra i + 1); a quadra sem grupo da casa disponivel pega de
 * quem esta esperando ha mais tempo.
 */
export function proximasPelaFila(
  n: Noite,
  quadrasLivres: number[],
  quadrasDaCasa?: number[],
  filas: Match[][] = filaPorGrupo(n),
  /** Partidas ja escolhidas na mao para outras quadras: elas e as meninas delas ficam de fora. */
  reservadas: Match[] = [],
): Map<number, Match> {
  const e = estadoDaNoite(n)
  const tomadas = new Set(e.indisponiveis)
  const usadas = new Set<string>(reservadas.map((m) => m.id))
  for (const m of reservadas) for (const id of jogadorasDaPartida(m)) tomadas.add(id)
  const out = new Map<number, Match>()
  const primeiraLivre = (fila: Match[]) =>
    fila.find((m) => !usadas.has(m.id) && jogadorasDaPartida(m).every((id) => !tomadas.has(id)))
  const tomar = (q: number, m: Match) => {
    out.set(q, m)
    usadas.add(m.id)
    for (const id of jogadorasDaPartida(m)) tomadas.add(id)
  }
  const casaDe = (gi: number) => quadrasDaCasa?.[gi] ?? gi + 1
  // primeiro cada quadra recebe o grupo da casa; depois as que sobraram
  const sobrando: number[] = []
  for (const q of quadrasLivres) {
    const gi = filas.findIndex((_, i) => casaDe(i) === q)
    const m = gi >= 0 ? primeiraLivre(filas[gi]) : undefined
    if (m) tomar(q, m)
    else sobrando.push(q)
  }
  for (const q of sobrando) {
    // entre as filas com partida possivel, a de quem espera ha mais tempo
    let melhor: Match | undefined
    let melhorEspera = Infinity
    for (const fila of filas) {
      const m = primeiraLivre(fila)
      if (!m) continue
      const espera = jogadorasDaPartida(m).reduce((t, id) => t + (e.espera.get(id) ?? 0), 0)
      if (espera < melhorEspera) {
        melhorEspera = espera
        melhor = m
      }
    }
    if (melhor) tomar(q, melhor)
  }
  return out
}

/**
 * O grupo precisa refazer a fila? So quando a conta nao fecha: alguem acima ou
 * abaixo do plano (`jogosDoRodizio`), ou uma dupla que nunca vai se formar.
 * Grupo certinho fica como esta -- em 05/10 o Refazer foi apertado 9 vezes num
 * play que nao precisava, e cada toque desmontava o rodizio de 6 que evita
 * alguem emendar 3.
 */
export function precisaRefazer(grupo: string[], partidasDoGrupo: Match[]): boolean {
  if (grupo.length < 4) return false
  const alvo = jogosDoRodizio(grupo.length)
  const jogos = new Map(grupo.map((id) => [id, 0]))
  const duplas = new Set<string>()
  for (const m of partidasDoGrupo) {
    if ((m.fase ?? 1) !== 1) continue
    for (const id of jogadorasDaPartida(m)) if (jogos.has(id)) jogos.set(id, (jogos.get(id) ?? 0) + 1)
    duplas.add(pairKey(m.team_a[0], m.team_a[1]))
    duplas.add(pairKey(m.team_b[0], m.team_b[1]))
  }
  if ([...jogos.values()].some((n) => n !== alvo)) return true
  for (let i = 0; i < grupo.length; i++) {
    for (let j = i + 1; j < grupo.length; j++) if (!duplas.has(pairKey(grupo[i], grupo[j]))) return true
  }
  return false
}

/**
 * O QUE O REFAZER MEXE: quais grupos refazem, o que sai da fila e o que fica.
 *
 * A partida pertence ao grupo de QUALQUER uma das quatro, nao so da primeira:
 * em 09/10 duas meninas sairam do grupo 2 e a partida em que uma delas era a
 * primeira da dupla A nao era "de grupo nenhum" -- ficou na fila para sempre,
 * sem quadra, e o play fechou em 38/39 com "falta uma partida".
 *
 * `orfas`: partidas que ainda nao comecaram com alguem que ja nao esta no play.
 * Elas nao vao acontecer, entao saem sempre, mesmo que nenhum grupo refaca.
 */
export function planoDoRefazer(opts: {
  grupos: string[][]
  jogadoras: string[]
  matches: Match[]
  /** A partida fica onde esta (em quadra, ou a que acabou de ser trocada). */
  fixa: (m: Match) => boolean
}): { precisam: string[][]; orfas: Match[]; naFila: Match[]; preservadas: Match[] } {
  const noPlay = new Set(opts.jogadoras)
  const pendente = (m: Match) => (m.fase ?? 1) === 1 && !isPlayed(m) && !opts.fixa(m)
  const orfas = opts.matches.filter((m) => pendente(m) && jogadorasDaPartida(m).some((id) => !noPlay.has(id)))
  const semOrfas = opts.matches.filter((m) => !orfas.includes(m))
  const doGrupo = (g: Set<string>) => (m: Match) => jogadorasDaPartida(m).some((id) => g.has(id))
  const precisam = opts.grupos.filter((g) => precisaRefazer(g, semOrfas.filter(doGrupo(new Set(g)))))
  const daFilaNova = doGrupo(new Set(precisam.flat()))
  const naFila = semOrfas.filter((m) => pendente(m) && daFilaNova(m))
  return { precisam, orfas, naFila, preservadas: semOrfas.filter((m) => !naFila.includes(m)) }
}
