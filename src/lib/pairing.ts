import { buildHistory, pairKey, type History } from './stats'
import type { Match } from './types'
import { uid } from './types'

/**
 * COMO O DIA E MONTADO
 *
 * O play nao tem mais rodadas. As quadras nunca terminam juntas -- uma partida
 * acaba enquanto a outra ainda esta rolando -- entao esperar a rodada inteira
 * so deixava quadra parada. Em vez disso o app gera uma FILA de partidas e, a
 * cada quadra que vaga, escolhe da fila a partida cujas jogadoras estao livres
 * e estao fora ha mais tempo (ver `proximasDasQuadras`).
 *
 * A fila cobre o rodizio completo: cada jogadora faz dupla com cada uma das
 * outras exatamente uma vez. No modo em grupos, esse mesmo rodizio acontece
 * dentro de cada grupo -- os pontos continuam individuais e o ranking do dia
 * e unico.
 *
 * QUEM ENFRENTA QUEM tambem e escolhido, nao e sobra do sorteio. Nao da para
 * "nunca se enfrentar": num grupo de 8 sao 28 duplas, 14 partidas e 56
 * confrontos individuais para so 28 pares possiveis -- na media cada par se
 * cruza duas vezes. Entao o alvo e espalhar por igual, e a adversaria
 * escolhida e sempre a dupla que MENOS se enfrentou com essa ate agora
 * (`custoDoConfronto`).
 */

export type PlannedMatch = {
  team_a: [string, string]
  team_b: [string, string]
  /** Indice do grupo (0 = grupo 1). Fora do modo em grupos e sempre 0. */
  grupo: number
  /** 1 = fase de grupos, 2 = fase das duplas fixas. Ausente conta como 1. */
  fase?: number
  /** A disputa de 3o lugar, que roda junto com a final. */
  disputa3o?: boolean
  /**
   * Dupla que joga uma segunda vez porque sobrou uma dupla sem adversaria.
   * Acontece so quando o total de combinacoes do grupo e impar.
   */
  repetida?: boolean
}

type Duo = [string, string]

const W_BALANCE = 30 // por ponto de diferenca de forca entre as duas duplas
const W_OPP_DIA = 50 // por vez que essas duas ja se enfrentaram HOJE
const W_OPP_HIST = 12 // por vez que ja se enfrentaram em plays anteriores
const W_REPETIDA = 400 // dupla que precisou jogar duas vezes

/*
 * O sorteio interno do rodizio tem SEMENTE quando `rodizioDoGrupo` compara as
 * possibilidades: cada tentativa embaralha do mesmo jeito toda vez, entao
 * mesmas pessoas e mesmas forcas dao sempre o mesmo resultado -- "com quem eu
 * repito" vira uma resposta, nao um sorteio. Fora dessa comparacao (ordem da
 * fila, refazer a fila) o sorteio continua livre.
 */
let sorteio: () => number = Math.random

function comSemente(semente: number): () => number {
  let x = semente >>> 0
  return () => {
    x = (x + 0x6d2b79f5) >>> 0
    let t = x
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function jogadorasDaPartida(m: { team_a: Duo; team_b: Duo }): string[] {
  return [m.team_a[0], m.team_a[1], m.team_b[0], m.team_b[1]]
}

function disjuntas(a: Duo, b: Duo): boolean {
  return a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]
}

/* ------------------------------------------------------------------
   Grupos por nivel

   O grupo 1 leva as mais bem pontuadas do historico, o 2 as seguintes, e
   assim por diante -- os jogos ficam mais parelhos dentro de cada grupo.
   ------------------------------------------------------------------ */

/** Quantos grupos cabem, dado o tamanho pedido. Cada grupo precisa de 4+. */
export function numeroDeGrupos(jogadoras: number, tamanho: number): number {
  if (jogadoras < 8 || tamanho < 4) return 1
  const alvo = Math.max(1, Math.round(jogadoras / tamanho))
  return Math.max(1, Math.min(alvo, Math.floor(jogadoras / 4)))
}

/** Tamanho de cada grupo, o mais parecido possivel entre eles. */
export function tamanhosDosGrupos(jogadoras: number, grupos: number): number[] {
  const base = Math.floor(jogadoras / grupos)
  const resto = jogadoras % grupos
  // a sobra vai para os primeiros grupos, que sao os de nivel mais alto
  return Array.from({ length: grupos }, (_, i) => base + (i < resto ? 1 : 0))
}

/**
 * A fila por forca, com SORTEIO ENTRE EMPATADAS.
 *
 * Quem nunca jogou entra com a nota padrao -- todas iguais. Sem isto o
 * desempate era a ordem em que entraram na lista de presenca, entao refazer o
 * play dava sempre os mesmos grupos, e tres estreantes caiam no grupo forte e
 * tres no fraco por ordem alfabetica, fingindo um nivel que o app nao conhece.
 *
 * Embaralhar ANTES de ordenar e o truque: o sort e estavel, entao quem tem nota
 * diferente vai para o lugar certo e so as empatadas ficam na ordem sorteada.
 */
function filaPorForca(
  playerIds: string[],
  ratings: Map<string, number>,
  semente?: number,
): string[] {
  // com semente o sorteio e reproduzivel: a tela recalcula os grupos a cada
  // mudanca de dado (um pagamento confirmado noutro celular ja basta) e sem
  // isso as empatadas trocariam de grupo sozinhas na frente da organizadora
  const base = semente === undefined ? shuffle(playerIds) : embaralharComSemente(playerIds, semente)
  return base.sort((a, b) => (ratings.get(b) ?? 2) - (ratings.get(a) ?? 2))
}

/**
 * Fisher-Yates com semente (mulberry32). Ordena os ids antes, para o
 * resultado nao depender da ordem em que a presenca foi marcada.
 */
function embaralharComSemente<T extends string>(ids: T[], semente: number): T[] {
  let s = semente >>> 0
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const a = [...ids].sort()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Grupos EQUILIBRADOS entre si, para o formato `grupos-duplas`.
 *
 * Diferente do `formarGrupos`, onde o grupo 1 leva as melhores de proposito.
 * Aqui os grupos precisam ter a mesma forca media, senao a fase 2 nao e justa:
 * "1a com 1a" so faz sentido se ser 1o custar o mesmo em qualquer grupo.
 *
 * A distribuicao e em serpentina -- com a lista ordenada por forca, entrega
 * 1-2-3-4, depois 4-3-2-1, depois 1-2-3-4. Assim cada grupo recebe uma de cada
 * faixa e as medias saem praticamente iguais.
 */
export function gruposEquilibrados(
  playerIds: string[],
  ratings: Map<string, number>,
  tamanho: number,
  /** Semente do sorteio entre empatadas; sem ela, sorteia de verdade. */
  semente?: number,
): string[][] {
  const grupos = numeroDeGrupos(playerIds.length, tamanho)
  if (grupos <= 1) return [playerIds.slice()]
  const ordenados = filaPorForca(playerIds, ratings, semente)
  const out: string[][] = Array.from({ length: grupos }, () => [])
  ordenados.forEach((id, i) => {
    const volta = Math.floor(i / grupos)
    const pos = i % grupos
    out[volta % 2 === 0 ? pos : grupos - 1 - pos].push(id)
  })
  return out
}

/** Como uma jogadora terminou a fase de grupos. */
export type Colocacao = {
  id: string
  /** Indice do grupo (0 = grupo 1). */
  grupo: number
  /** 1 = primeiro do grupo. */
  posicao: number
  pontos: number
  saldo: number
}

/**
 * FASE 2 -- as duplas fixas.
 *
 * Ordena todos por colocacao no grupo (as 1as primeiro, depois as 2as...) e,
 * dentro da mesma colocacao, por desempenho. Depois junta os VIZINHOS dessa
 * fila: melhor com melhor, media com media, ultima com ultima.
 *
 * Emparelhar vizinhos, e nao "1a com 1a" ao pe da letra, e o que faz a conta
 * fechar quando o numero de grupos e impar: a 1a que sobra vira dupla com a
 * melhor das 2as -- que e a vizinha dela na fila, e nao alguem de outro nivel.
 *
 * A restricao e nao repetir grupo: quem ja jogou junta a fase 1 inteira nao
 * deve virar dupla agora. Quando as vizinhas sao do mesmo grupo, a proxima da
 * fila entra no lugar.
 */
export function duplasDaFase2(colocacoes: Colocacao[], maxDuplas?: number): Duo[] {
  const ordenados = [...colocacoes].sort(
    (a, b) => a.posicao - b.posicao || b.pontos - a.pontos || b.saldo - a.saldo,
  )
  // sobrando gente para o tamanho do mata-mata, os ultimos da fila ficam de
  // fora: com 20 jogadoras e alvo de 8 duplas, saem 4 e ficam 16 para as quartas
  const fila = maxDuplas ? ordenados.slice(0, maxDuplas * 2) : ordenados
  const duos: Duo[] = []
  const usados = new Set<string>()
  for (let i = 0; i < fila.length; i++) {
    const a = fila[i]
    if (usados.has(a.id)) continue
    let escolhido = -1
    let reserva = -1
    for (let k = i + 1; k < fila.length; k++) {
      if (usados.has(fila[k].id)) continue
      if (fila[k].grupo !== a.grupo) { escolhido = k; break }
      if (reserva === -1) reserva = k
    }
    const j = escolhido >= 0 ? escolhido : reserva
    if (j === -1) break // numero impar de jogadoras: a ultima fica de fora
    usados.add(a.id)
    usados.add(fila[j].id)
    duos.push([a.id, fila[j].id])
  }
  return duos
}

/** A menor potencia de 2 que comporta `n`. */
function tamanhoDaChave(n: number): number {
  let t = 1
  while (t < n) t *= 2
  return t
}

/**
 * Uma rodada do mata-mata das duplas.
 *
 * `duos` chega na ordem de forca -- o indice 0 e a dupla mais bem classificada
 * na fase de grupos. Quem passa de BYE sao as primeiras: ir bem no grupo vale
 * um atalho. As demais se cruzam pelas pontas (a melhor pega a pior, a segunda
 * pega a penultima), para as favoritas so se encontrarem no fim.
 *
 * O bye so aparece na primeira rodada: dali em diante o numero de duplas ja e
 * potencia de dois e a conta fecha sozinha.
 */
export function rodadaDoMataMata(duos: Duo[]): { byes: Duo[]; jogos: [Duo, Duo][] } {
  if (duos.length <= 1) return { byes: duos, jogos: [] }
  const byes = tamanhoDaChave(duos.length) - duos.length
  const passam = duos.slice(0, byes)
  const jogam = duos.slice(byes)
  const jogos: [Duo, Duo][] = []
  for (let i = 0; i < jogam.length / 2; i++) {
    jogos.push([jogam[i], jogam[jogam.length - 1 - i]])
  }
  return { byes: passam, jogos }
}

/**
 * O nome da rodada, pelo tanto de duplas que SOBRAM depois dela.
 *
 * Nomear pelas que entram erraria: com 10 duplas, a primeira rodada tem 6 byes
 * e so 2 jogos -- ela nao e uma "oitavas", e uma preliminar que corta de 10
 * para 8.
 */
export function nomeDaRodada(entram: number): string {
  const sobram = tamanhoDaChave(entram) / 2
  if (entram <= 2) return 'Final'
  if (sobram === 1) return 'Final'
  if (sobram === 2) return 'Semifinal'
  if (sobram === 4) return 'Quartas de final'
  if (sobram === 8) return 'Oitavas de final'
  return `Rodada de ${entram} duplas`
}

/**
 * Quantas duplas ENTRARAM na rodada `fase`: as que nao tinham perdido antes.
 *
 * E isto que diz que rodada e -- nao o numero de jogos dela. Com 5 duplas a
 * primeira rodada tem 3 byes e UM jogo, e contar jogos a chamaria de final,
 * com o alvo e o desempate da final. Partidas sem placar e a disputa de 3o
 * nao eliminam ninguem.
 */
export function duplasQueEntraram(
  duos: readonly (readonly string[])[],
  matches: Match[],
  fase: number,
): number {
  if (!duos.length) return 0
  const chave = (d: readonly string[]) => [...d].sort().join('|')
  const perderam = new Set<string>()
  for (const m of matches) {
    const f = m.fase ?? 1
    if (f < 2 || f >= fase || m.disputa_3o || m.score_a === null || m.score_b === null) continue
    if (m.score_a === m.score_b) continue
    perderam.add(chave(m.score_a > m.score_b ? m.team_b : m.team_a))
  }
  return duos.filter((d) => !perderam.has(chave(d))).length
}

/**
 * Os ajustes na mao por cima dos grupos sorteados.
 *
 * Um ajuste de cada vez, na ordem em que foram feitos. O que nao vale mais e
 * pulado: quem saiu da presenca, grupo que nao existe (o tamanho mudou) e o
 * ajuste que deixaria um grupo com menos de 4 -- um rodizio precisa de quatro,
 * e a presenca pode ter mudado desde que o ajuste foi feito.
 */
export function aplicarAjustesDeGrupo(
  base: string[][],
  movidas: Record<string, number>,
): string[][] {
  if (base.length <= 1) return base
  const out = base.map((g) => g.slice())
  for (const [id, para] of Object.entries(movidas)) {
    if (para >= out.length) continue
    const de = out.findIndex((g) => g.includes(id))
    if (de < 0 || de === para) continue
    if (out[de].length <= 4) continue
    out[de] = out[de].filter((x) => x !== id)
    out[para] = [...out[para], id]
  }
  return out
}

/** As duplas que ainda estao vivas: as que nunca perderam, na ordem de forca. */
export function duplasVivas(duos: Duo[], jogos: Match[]): Duo[] {
  const chave = (d: readonly string[]) => [...d].sort().join('|')
  const eliminadas = new Set<string>()
  for (const m of jogos) {
    if (m.score_a === null || m.score_b === null) continue
    eliminadas.add(chave(m.score_a > m.score_b ? m.team_b : m.team_a))
  }
  return duos.filter((d) => !eliminadas.has(chave(d)))
}

export function formarGrupos(
  playerIds: string[],
  ratings: Map<string, number>,
  tamanho: number,
  /** Semente do sorteio entre empatadas; sem ela, sorteia de verdade. */
  semente?: number,
): string[][] {
  const grupos = numeroDeGrupos(playerIds.length, tamanho)
  if (grupos <= 1) return [playerIds.slice()]
  const ordenadas = filaPorForca(playerIds, ratings, semente)
  const out: string[][] = []
  let i = 0
  for (const t of tamanhosDosGrupos(playerIds.length, grupos)) {
    out.push(ordenadas.slice(i, i + t))
    i += t
  }
  return out
}

/**
 * Quantas quadras dao para encher ao mesmo tempo, dados os tamanhos dos grupos.
 *
 * Cada partida precisa de quatro meninas do MESMO grupo, entao um grupo de 6 so
 * alimenta uma quadra por vez: 12 meninas em dois grupos de 6 enchem duas
 * quadras, nao tres. Sem grupos, passe `[total]` e a conta vira o total / 4.
 */
export function quadrasSimultaneas(tamanhos: number[]): number {
  return Math.max(1, tamanhos.reduce((t, n) => t + Math.floor(n / 4), 0))
}

/**
 * Quantas duplas cada jogadora precisa REPETIR para todas jogarem o mesmo
 * tanto.
 *
 * Todas com todas uma vez da n(n-1)/2 duplas, e cada partida gasta duas delas.
 * Quando n e 6, 7, 10, 11... essa conta nao fecha em partidas inteiras com
 * todo mundo jogando igual: num grupo de 6 sao 15 duplas, sobra uma, e a saida
 * antiga (uma dupla ja formada joga de novo) dava um jogo a mais para exatamente
 * DUAS meninas do grupo.
 *
 * A saida certa e repetir a mesma quantidade de duplas para cada uma:
 * - n % 4 == 0 ou 1 -> fecha sozinho, ninguem repete
 * - n % 4 == 2      -> cada uma repete 1 parceira (as repetidas formam pares)
 * - n % 4 == 3      -> cada uma repete 2 (as repetidas formam um ciclo)
 */
export function repeticoesPorJogadora(jogadoras: number): number {
  const r = jogadoras % 4
  return r === 2 ? 1 : r === 3 ? 2 : 0
}

/** Quantas partidas o rodizio de um grupo desse tamanho gera. */
export function partidasDoRodizio(jogadoras: number): number {
  if (jogadoras < 4) return 0
  return (jogadoras * (jogadoras - 1 + repeticoesPorJogadora(jogadoras))) / 4
}

/** Quantos jogos cada uma faz -- igual para todas do grupo. */
export function jogosDoRodizio(jogadoras: number): number {
  if (jogadoras < 4) return 0
  return jogadoras - 1 + repeticoesPorJogadora(jogadoras)
}

/** Com quantas parceiras diferentes cada uma joga. */
export function parceirasDoRodizio(jogadoras: number): number {
  return Math.max(0, jogadoras - 1)
}

/* ------------------------------------------------------------------
   Escolha da adversaria

   Entre duas duplas validas (que nao dividem jogadora), a melhor partida e a
   das quatro que menos se enfrentaram -- primeiro olhando o proprio dia,
   depois os plays anteriores. Somar quantas vezes cada par ja se cruzou faz
   o custo crescer a cada repeticao, entao o resultado se espalha sozinho em
   vez de castigar sempre as mesmas.
   ------------------------------------------------------------------ */

type Confrontos = Map<string, number>

type Contexto = {
  ratings: Map<string, number>
  /**
   * Quanto cada dupla rende ALEM da media das duas, pelo historico dela
   * (`pairKey` -> ajuste na mesma escala do `ratings`). Vazio quando a dupla
   * ainda nao jogou junta o bastante.
   */
  entrosamento?: Map<string, number>
  /** Quantas vezes cada par ja se enfrentou hoje. */
  dia: Confrontos
  /** O mesmo, em plays anteriores, ja com o peso do historico. */
  antes: Confrontos
}

/**
 * A forca de uma dupla, para comparar com a do outro lado.
 *
 * E a SOMA das duas notas mais o entrosamento -- duas jogadoras medianas que
 * se acham em quadra valem mais do que a soma diz, e e isso que faz o
 * confronto sair parelho de verdade. O ajuste entra dobrado porque esta
 * medido por jogadora e aqui a conta e de dupla.
 */
function forcaDuo(d: Duo, ctx: Contexto): number {
  const base = (ctx.ratings.get(d[0]) ?? 2) + (ctx.ratings.get(d[1]) ?? 2)
  return base + 2 * (ctx.entrosamento?.get(pairKey(d[0], d[1])) ?? 0)
}

function custoDoConfronto(a: Duo, b: Duo, ctx: Contexto): number {
  let c = W_BALANCE * Math.abs(forcaDuo(a, ctx) - forcaDuo(b, ctx))
  for (const x of a) {
    for (const y of b) {
      const k = pairKey(x, y)
      c += W_OPP_DIA * (ctx.dia.get(k) ?? 0)
      c += W_OPP_HIST * (ctx.antes.get(k) ?? 0)
    }
  }
  return c
}

function marcarConfronto(a: Duo, b: Duo, dia: Confrontos) {
  for (const x of a) {
    for (const y of b) {
      const k = pairKey(x, y)
      dia.set(k, (dia.get(k) ?? 0) + 1)
    }
  }
}

function desmarcarConfronto(a: Duo, b: Duo, dia: Confrontos) {
  for (const x of a) {
    for (const y of b) {
      const k = pairKey(x, y)
      dia.set(k, Math.max(0, (dia.get(k) ?? 0) - 1))
    }
  }
}

type Partida = {
  team_a: Duo
  team_b: Duo
  repetida?: boolean
  /**
   * De qual ronda do metodo do circulo a partida saiu (-1 para as montadas
   * com as duplas que sobraram). As partidas de uma mesma ronda cobrem o
   * grupo inteiro, e e isso que permite as quadras rodarem todas ao mesmo
   * tempo -- por isso duplas so trocam de partida DENTRO da ronda.
   */
  ronda?: number
}

type Emparelhamento = { partidas: Partida[]; orfas: Duo[]; custo: number }

/**
 * Junta duplas em partidas. Comeca sempre pela dupla com MENOS adversarias
 * possiveis -- deixar a mais presa para o fim e o que faz sobrar dupla sem
 * ninguem para enfrentar. Entre as adversarias que cabem, pega a que menos
 * ja se enfrentou com ela.
 */
function emparelharUmaVez(duos: Duo[], ctx: Contexto, ronda: number): Emparelhamento {
  const livres = duos.slice()
  const partidas: Partida[] = []
  const orfas: Duo[] = []
  let custo = 0
  while (livres.length > 0) {
    const graus = livres.map((d, i) =>
      livres.reduce((n, o, j) => (j !== i && disjuntas(d, o) ? n + 1 : n), 0),
    )
    const menor = Math.min(...graus)
    const i = graus.indexOf(menor)
    if (menor === 0) {
      orfas.push(livres.splice(i, 1)[0]) // nao combina com nenhuma das que restam
      continue
    }
    const a = livres[i]
    let mj = -1
    let melhorC = Infinity
    for (let j = 0; j < livres.length; j++) {
      if (j === i || !disjuntas(a, livres[j])) continue
      const c = custoDoConfronto(a, livres[j], ctx)
      if (c < melhorC) {
        melhorC = c
        mj = j
      }
    }
    const b = livres[mj]
    livres.splice(Math.max(i, mj), 1)
    livres.splice(Math.min(i, mj), 1)
    partidas.push({ team_a: a, team_b: b, ronda })
    marcarConfronto(a, b, ctx.dia)
    custo += melhorC
  }
  return { partidas, orfas, custo }
}

/** Melhor de varias tentativas: primeiro menos duplas sobrando, depois custo. */
function emparelhar(duos: Duo[], ctx: Contexto, ronda = -1): Emparelhamento {
  const base = new Map(ctx.dia)
  let melhor: Emparelhamento | null = null
  const tentativas = duos.length > 40 ? 3 : 8 // a busca e cubica no tamanho
  for (let t = 0; t < tentativas; t++) {
    const tentativa = emparelharUmaVez(
      t === 0 ? duos : shuffle(duos),
      { ...ctx, dia: new Map(base) },
      ronda,
    )
    const ganhou =
      !melhor ||
      tentativa.orfas.length < melhor.orfas.length ||
      (tentativa.orfas.length === melhor.orfas.length && tentativa.custo < melhor.custo)
    if (ganhou) melhor = tentativa
    if ((melhor as Emparelhamento).orfas.length <= 1 && t >= 2) break
  }
  const escolhido = melhor as Emparelhamento
  for (const p of escolhido.partidas) marcarConfronto(p.team_a, p.team_b, ctx.dia)
  return escolhido
}

/**
 * Passada final: troca as adversarias entre duas partidas quando isso espalha
 * melhor os confrontos (ou deixa os jogos mais parelhos). So troca duplas
 * inteiras de lugar, entao o rodizio de parceiras continua intacto.
 */
function melhorarConfrontos(partidas: Partida[], ctx: Contexto) {
  const troca = partidas.filter((m) => !m.repetida)
  let mudou = true
  let voltas = 0
  while (mudou && voltas++ < 6) {
    mudou = false
    for (let i = 0; i < troca.length; i++) {
      for (let j = i + 1; j < troca.length; j++) {
        const m1 = troca[i]
        const m2 = troca[j]
        // trocar entre rondas diferentes quebraria a cobertura do grupo
        if (m1.ronda !== m2.ronda) continue
        desmarcarConfronto(m1.team_a, m1.team_b, ctx.dia)
        desmarcarConfronto(m2.team_a, m2.team_b, ctx.dia)
        const opcoes: [Duo, Duo, Duo, Duo][] = [
          [m1.team_a, m1.team_b, m2.team_a, m2.team_b], // como esta hoje
          [m1.team_a, m2.team_a, m1.team_b, m2.team_b],
          [m1.team_a, m2.team_b, m1.team_b, m2.team_a],
        ]
        let escolha = 0
        let melhorC = Infinity
        opcoes.forEach((o, k) => {
          if (!disjuntas(o[0], o[1]) || !disjuntas(o[2], o[3])) return
          const c1 = custoDoConfronto(o[0], o[1], ctx)
          marcarConfronto(o[0], o[1], ctx.dia) // a segunda partida ja sente a primeira
          const c2 = custoDoConfronto(o[2], o[3], ctx)
          desmarcarConfronto(o[0], o[1], ctx.dia)
          if (c1 + c2 < melhorC - 1e-9) {
            melhorC = c1 + c2
            escolha = k
          }
        })
        const o = opcoes[escolha]
        m1.team_a = o[0]
        m1.team_b = o[1]
        m2.team_a = o[2]
        m2.team_b = o[3]
        marcarConfronto(m1.team_a, m1.team_b, ctx.dia)
        marcarConfronto(m2.team_a, m2.team_b, ctx.dia)
        if (escolha !== 0) mudou = true
      }
    }
  }
}

/* ------------------------------------------------------------------
   Rodizio de um grupo

   Metodo do circulo (1-fatoracao do grafo completo): fixa uma jogadora e gira
   as outras, gerando conjuntos ("rondas") de duplas em que ninguem se repete
   dentro do conjunto e toda combinacao aparece uma unica vez. Como as duplas
   de uma ronda nao dividem jogadora, qualquer par delas forma uma partida
   valida -- e ai da para escolher a adversaria pelo criterio acima.
   ------------------------------------------------------------------ */

const BYE = '__folga__'

function circleMethod(ids: string[]): Duo[][] {
  const list = ids.slice()
  if (list.length % 2 === 1) list.push(BYE)
  const n = list.length
  const fixed = list[0]
  let rot = list.slice(1)
  const out: Duo[][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: Duo[] = []
    if (fixed !== BYE && rot[0] !== BYE) pairs.push([fixed, rot[0]])
    for (let i = 1; i < n / 2; i++) {
      const x = rot[i]
      const y = rot[rot.length - i]
      if (x !== BYE && y !== BYE) pairs.push([x, y])
    }
    out.push(pairs)
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)]
  }
  return out
}

function umRodizio(ids: string[], ctx: Contexto, repetidas: Duo[]): Partida[] {
  const partidas: Partida[] = []
  const sobras: Duo[] = []

  circleMethod(shuffle(ids)).forEach((ronda, r) => {
    const pares = ronda.slice()
    if (pares.length % 2 === 1) {
      // Sobra uma dupla desta ronda. A escolhida e a que menos repete
      // jogadoras ja presentes nas outras sobras: se todas as sobras caem em
      // cima da mesma menina elas nao conseguem se enfrentar depois e viram
      // duplas sem adversaria.
      sobras.push(...pares.splice(menosRepetida(pares, sobras), 1))
    }
    const { partidas: ps, orfas } = emparelhar(pares, ctx, r)
    partidas.push(...ps)
    sobras.push(...orfas)
  })

  // As duplas que repetem entram AQUI, junto das sobras, e nao como remendo no
  // fim: escolhidas assim, cada jogadora repete a mesma quantidade de vezes e
  // o grupo inteiro termina com o mesmo numero de jogos. QUAIS sao elas e
  // decidido em `rodizioDoGrupo`, que compara as possibilidades.
  sobras.push(...repetidas)

  // as sobras vem de rondas diferentes, entao podem dividir jogadora
  const { partidas: extras, orfas } = emparelhar(sobras, ctx)
  partidas.push(...extras)

  // Sobrou dupla sem adversaria (o total de combinacoes do grupo e impar):
  // uma dupla ja formada joga uma segunda vez, so para ela ter contra quem
  // jogar. O app marca a partida como repetida em vez de esconder isso.
  // quem ja repete parceira (pelo ciclo) nao deve ser a que joga de novo aqui:
  // a repeticao extra cai em quem ainda nao repetiu, para nao pesar duas vezes
  // na mesma pessoa
  const repeticoes = new Map<string, number>()
  for (const d of repetidas) for (const id of d) repeticoes.set(id, (repeticoes.get(id) ?? 0) + 1)
  for (const orfa of orfas) {
    const rival = escolherRival(partidas, orfa, ctx, repeticoes)
    if (!rival) continue
    partidas.push({ team_a: orfa, team_b: rival, repetida: true })
    marcarConfronto(orfa, rival, ctx.dia)
    for (const id of rival) repeticoes.set(id, (repeticoes.get(id) ?? 0) + 1)
  }

  melhorarConfrontos(partidas, ctx)
  return partidas
}

/** Ate quantos jeitos de repetir o app compara um por um. */
const LIMITE_EXAUSTIVO = 1000
/** Acima do limite, quantos jeitos sorteados ele compara. */
const AMOSTRA_DE_REPETIDAS = 300

/**
 * TODOS os jeitos de escolher quem repete com quem, respeitando a regra de
 * cada pessoa repetir o mesmo tanto:
 *
 *  - grupo com resto 2 (6, 10, 14...): cada uma repete 1 -> um pareamento
 *    perfeito do grupo; 6 pessoas dao 15, 10 dao 945.
 *  - grupo com resto 3 (7, 11, 15...): cada uma repete 2 -> um ciclo por
 *    todas; 7 pessoas dao 360, 11 dao 1,8 milhao (ai vai por amostra).
 *
 * Devolve vazio quando o grupo nao repete. Para de contar quando passa do
 * limite: nao adianta listar o que nao vai ser comparado.
 */
function conjuntosDeRepetidas(ids: string[]): Duo[][] {
  const k = repeticoesPorJogadora(ids.length)
  if (k === 0 || ids.length < 4) return []
  const out: Duo[][] = []
  if (k === 1) {
    const pareamentos = (restantes: string[], atual: Duo[]) => {
      if (out.length > LIMITE_EXAUSTIVO) return
      if (restantes.length === 0) {
        out.push(atual.slice())
        return
      }
      const [a, ...resto] = restantes
      for (let i = 0; i < resto.length; i++) {
        atual.push([a, resto[i]])
        pareamentos([...resto.slice(0, i), ...resto.slice(i + 1)], atual)
        atual.pop()
      }
    }
    pareamentos(ids, [])
    return out
  }
  // ciclos: fixa a primeira pessoa e permuta as outras; cada ciclo aparece
  // duas vezes (ida e volta), entao so vale a permutacao em que a segunda
  // pessoa vem antes da ultima
  const [primeira, ...outras] = ids
  const permuta = (restantes: string[], atual: string[]) => {
    if (out.length > LIMITE_EXAUSTIVO) return
    if (restantes.length === 0) {
      if (atual[0] > atual[atual.length - 1]) return
      const ciclo = [primeira, ...atual]
      out.push(ciclo.map((id, i) => [id, ciclo[(i + 1) % ciclo.length]] as Duo))
      return
    }
    for (let i = 0; i < restantes.length; i++) {
      atual.push(restantes[i])
      permuta([...restantes.slice(0, i), ...restantes.slice(i + 1)], atual)
      atual.pop()
    }
  }
  permuta(outras, [])
  return out
}

/**
 * As duplas que vao jogar duas vezes, escolhidas para cair igualmente sobre
 * todas as jogadoras do grupo.
 *
 * `k = 1` (grupo par): pares soltos -- cada uma aparece exatamente uma vez.
 * `k = 2` (grupo impar): um ciclo passando por todas -- cada uma aparece duas.
 * A ordem e sorteada: e o gerador da AMOSTRA, para os grupos grandes demais
 * para `conjuntosDeRepetidas` listar tudo.
 */
function duplasQueRepetem(ids: string[], k: number): Duo[] {
  if (k <= 0 || ids.length < 4) return []
  const v = shuffle(ids)
  if (k === 1) {
    const out: Duo[] = []
    for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i], v[i + 1]])
    return out
  }
  return v.map((id, i) => [id, v[(i + 1) % v.length]] as Duo)
}

/** Indice da dupla cujas jogadoras menos aparecem nas sobras ate agora. */
function menosRepetida(pares: Duo[], sobras: Duo[]): number {
  const usos = new Map<string, number>()
  for (const s of sobras) for (const id of s) usos.set(id, (usos.get(id) ?? 0) + 1)
  let escolhido = 0
  let menor = Infinity
  pares.forEach((p, i) => {
    const u = (usos.get(p[0]) ?? 0) + (usos.get(p[1]) ?? 0)
    if (u < menor) {
      menor = u
      escolhido = i
    }
  })
  return escolhido
}

/** Dupla ja formada, que nao divide jogadora com a orfa e menos a enfrentou. */
function escolherRival(
  partidas: Partida[],
  orfa: Duo,
  ctx: Contexto,
  /** Quantas vezes cada pessoa ja repete parceira; quem mais repete pesa mais. */
  repeticoes?: Map<string, number>,
): Duo | null {
  let melhor: Duo | null = null
  let melhorCusto = Infinity
  for (const p of partidas) {
    for (const d of [p.team_a, p.team_b]) {
      if (!disjuntas(d, orfa)) continue
      const jaRepete = (repeticoes?.get(d[0]) ?? 0) + (repeticoes?.get(d[1]) ?? 0)
      const c = custoDoConfronto(d, orfa, ctx) + W_REPETIDA * jaRepete
      if (c < melhorCusto) {
        melhorCusto = c
        melhor = d
      }
    }
  }
  return melhor
}

/**
 * Nota de um rodizio inteiro, para escolher a melhor de varias tentativas.
 * Refaz a contagem do zero: o custo de cada confronto e quantas vezes aquele
 * par ja tinha se cruzado, entao repetir a quarta vez pesa mais que a segunda.
 */
function custoDoRodizio(partidas: Partida[], ctx: Contexto): number {
  const dia: Confrontos = new Map(ctx.dia)
  let c = 0
  for (const m of partidas) {
    c += W_BALANCE * Math.abs(forcaDuo(m.team_a, ctx) - forcaDuo(m.team_b, ctx))
    for (const x of m.team_a) {
      for (const y of m.team_b) {
        const k = pairKey(x, y)
        c += W_OPP_DIA * (dia.get(k) ?? 0) + W_OPP_HIST * (ctx.antes.get(k) ?? 0)
        dia.set(k, (dia.get(k) ?? 0) + 1)
      }
    }
    if (m.repetida) c += W_REPETIDA
  }
  return c
}

function rodizioDoGrupo(
  ids: string[],
  ratings: Map<string, number>,
  antes: Confrontos,
  diaAteAgora: Confrontos,
  entrosamento?: Map<string, number>,
): Partida[] {
  if (ids.length < 4) return []
  let melhor: Partida[] = []
  let melhorCusto = Infinity
  /*
   * QUEM REPETE COM QUEM E ESCOLHIDO, NAO SORTEADO
   *
   * Ate 1000 jeitos de montar as repetidas (grupos de 6, 7 e 10), o app olha
   * TODOS e fica com o que deixa a noite mais equilibrada -- as partidas mais
   * parelhas em forca e os mesmos pares se enfrentando o menos possivel.
   * Acima disso (11 ou mais) nao cabe no celular, e vale uma amostra grande.
   * Sem repetida (4, 5, 8, 9) sobra so o sorteio de sempre.
   */
  const conjuntos = conjuntosDeRepetidas(ids)
  const tentativas: Duo[][] =
    conjuntos.length === 0
      ? Array.from({ length: 24 }, () => [])
      : conjuntos.length <= LIMITE_EXAUSTIVO
        ? conjuntos.flatMap((c) => Array.from({ length: Math.max(1, Math.floor(600 / conjuntos.length)) }, () => c))
        : Array.from({ length: AMOSTRA_DE_REPETIDAS }, (_, i) => {
            sorteio = comSemente(1000003 + i)
            const c = duplasQueRepetem(ids, repeticoesPorJogadora(ids.length))
            sorteio = Math.random
            return c
          })
  // a semente sai das pessoas do grupo: o mesmo grupo compara sempre as mesmas
  // tentativas, e quem esta em outro grupo nao muda o resultado deste
  const base = [...ids].sort().join('|').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  tentativas.forEach((repetidas, t) => {
    sorteio = comSemente(base + t * 7919)
    // cada tentativa comeca do mesmo ponto: os confrontos ja marcados fora
    const ctx: Contexto = { ratings, entrosamento, antes, dia: new Map(diaAteAgora) }
    const cand = umRodizio(ids, ctx, repetidas)
    // ninguem jogar a mais que a outra vale mais que qualquer ajuste fino de
    // confronto: uma partida a mais para duas meninas e injustica visivel
    const custo =
      desigualdadeDeJogos(cand, ids) * 1e6 +
      custoDoRodizio(cand, { ratings, entrosamento, antes, dia: diaAteAgora })
    if (custo < melhorCusto) {
      melhorCusto = custo
      melhor = cand
    }
  })
  sorteio = Math.random
  return melhor
}

/** Diferenca entre quem mais joga e quem menos joga no grupo. */
function desigualdadeDeJogos(partidas: Partida[], ids: string[]): number {
  const jogos = new Map(ids.map((id) => [id, 0]))
  for (const p of partidas) {
    for (const id of jogadorasDaPartida(p)) jogos.set(id, (jogos.get(id) ?? 0) + 1)
  }
  const v = [...jogos.values()]
  return Math.max(...v) - Math.min(...v)
}

/* ------------------------------------------------------------------
   Ordem da fila

   A fila e so uma sugestao de ordem -- na quadra quem manda e quem esta livre
   -- mas ela ja sai espalhada: a proxima partida e sempre a que pega as
   jogadoras que estao ha mais tempo sem jogar, para ninguem emendar dois
   jogos cansada enquanto outra espera sentada.
   ------------------------------------------------------------------ */

function ordenarFila(partidas: PlannedMatch[]): PlannedMatch[] {
  // varias ordens candidatas, e fica a que menos emenda partidas seguidas:
  // a escolha gulosa se encurrala no fim, e trocar o comeco muda o fim
  let melhor: PlannedMatch[] = partidas
  let melhorNota = Infinity
  for (let t = 0; t < 12; t++) {
    const restantes = shuffle(partidas)
    const estado = estadoInicial(jogadorasDe(partidas), gruposDe(partidas))
    const out: PlannedMatch[] = []
    while (restantes.length > 0) {
      let escolhida = 0
      let menor = Infinity
      for (let k = 0; k < restantes.length; k++) {
        const c = custoNaFila(restantes[k], estado, k)
        if (c < menor) {
          menor = c
          escolhida = k
        }
      }
      const m = restantes.splice(escolhida, 1)[0]
      avancar(estado, [m])
      out.push(m)
    }
    const nota = estado.maiorSequencia * 1e6 + estado.emendas
    if (nota < melhorNota) {
      melhorNota = nota
      melhor = out
    }
  }
  return melhor
}

function jogadorasDe(partidas: { team_a: Duo; team_b: Duo }[]): string[] {
  return [...new Set(partidas.flatMap((m) => jogadorasDaPartida(m)))]
}

/** Os grupos, lidos do campo `grupo` das partidas planejadas (null = um so). */
function gruposDe(partidas: PlannedMatch[]): string[][] | null {
  const por = new Map<number, Set<string>>()
  for (const m of partidas) {
    const g = m.grupo ?? 0
    if (!por.has(g)) por.set(g, new Set())
    for (const id of jogadorasDaPartida(m)) por.get(g)!.add(id)
  }
  return por.size > 1 ? [...por.values()].map((x) => [...x]) : null
}

/* ------------------------------------------------------------------
   O ESTADO DA FILA, para escolher a proxima partida

   E o mesmo tanto na geracao, na sugestao das quadras e na lista "proximas":
   ha quanto tempo cada uma jogou, quantas seguidas acabou de jogar, e que
   duplas ja se formaram hoje (a segunda vez de uma dupla vai para o fim).
   ------------------------------------------------------------------ */

export type EstadoDaFila = {
  /** "Ha quanto tempo jogou", em passos: menor = esperando ha mais tempo. */
  ultima: Map<string, number>
  /** Quantas partidas seguidas cada uma acabou de jogar (0 = descansou na ultima). */
  seguidas: Map<string, number>
  /** Duplas (pairKey) que ja jogaram hoje: a segunda vez vai para o fim. */
  jaFormadas: Set<string>
  /** Quantas partidas cada uma ja fez hoje: quem fez menos entra antes, no empate. */
  jogos: Map<string, number>
  /**
   * Os grupos, quando ha: uma partida so mexe na sequencia de quem e do MESMO
   * grupo -- a quadra do grupo 2 terminar nao quer dizer que o grupo 1
   * descansou.
   */
  grupos: string[][] | null
  /** Contadores da simulacao: o pior encadeamento e quantas emendas de 2+. */
  passo: number
  maiorSequencia: number
  emendas: number
}

function estadoInicial(jogadoras: string[], grupos: string[][] | null = null): EstadoDaFila {
  return {
    ultima: new Map(jogadoras.map((id) => [id, -50])),
    seguidas: new Map(),
    jaFormadas: new Set(),
    jogos: new Map(),
    grupos,
    passo: 0,
    maiorSequencia: 0,
    emendas: 0,
  }
}

/** Jogar tres seguidas custa muito; a segunda dupla igual, mais ainda. */
const W_TERCEIRA_SEGUIDA = 5e5
const W_SEGUNDA_SEGUIDA = 2e4
const W_DUPLA_REPETIDA = 1e6

/**
 * O custo de uma partida entrar AGORA. Menor e melhor: quem descansou mais
 * entra antes; quem acabou de jogar duas seguidas so entra se nao houver
 * outra; e a dupla que ja se formou hoje espera todas as outras.
 */
function custoNaFila(m: { team_a: Duo; team_b: Duo }, e: EstadoDaFila, desempate: number): number {
  const ids = jogadorasDaPartida(m)
  let c = 0
  for (const id of ids) {
    c += (e.passo - (e.ultima.get(id) ?? -50)) * -1000 // descansou mais = custo menor
    const seq = e.seguidas.get(id) ?? 0
    if (seq >= 2) c += W_TERCEIRA_SEGUIDA
    else if (seq === 1) c += W_SEGUNDA_SEGUIDA
    c += (e.jogos.get(id) ?? 0) * 10
  }
  if (e.jaFormadas.has(pairKey(m.team_a[0], m.team_a[1])) || e.jaFormadas.has(pairKey(m.team_b[0], m.team_b[1]))) {
    c += W_DUPLA_REPETIDA
  }
  return c + desempate
}

/**
 * Uma rodada aconteceu: quem jogou emenda, quem nao jogou descansou -- mas
 * so dentro do grupo de cada partida: o grupo que nao teve partida nesta
 * rodada nao descansou nem emendou, ele nem entrou.
 */
function avancar(e: EstadoDaFila, jogadas: { team_a: Duo; team_b: Duo }[]) {
  const jogaram = new Set(jogadas.flatMap((m) => jogadorasDaPartida(m)))
  const tocadas = new Set<string>()
  for (const m of jogadas) {
    const grupo = e.grupos?.find((g) => g.includes(m.team_a[0]))
    for (const id of grupo ?? e.ultima.keys()) tocadas.add(id)
  }
  e.passo++
  for (const id of e.ultima.keys()) {
    if (!tocadas.has(id)) continue
    if (jogaram.has(id)) {
      const seq = (e.seguidas.get(id) ?? 0) + 1
      e.seguidas.set(id, seq)
      e.ultima.set(id, e.passo)
      e.jogos.set(id, (e.jogos.get(id) ?? 0) + 1)
      if (seq > e.maiorSequencia) e.maiorSequencia = seq
      if (seq >= 2) e.emendas++
    } else {
      e.seguidas.set(id, 0)
    }
  }
  for (const m of jogadas) {
    e.jaFormadas.add(pairKey(m.team_a[0], m.team_a[1]))
    e.jaFormadas.add(pairKey(m.team_b[0], m.team_b[1]))
  }
}


export type ScheduleOptions = {
  playerIds: string[]
  ratings: Map<string, number>
  /** Entrosamento de cada dupla (`pairKey` -> ajuste), de `ajusteDeEntrosamento`. */
  entrosamento?: Map<string, number>
  /** Historico de partidas anteriores (outros dias), para variar as duplas. */
  history?: History
  /** Peso do historico antigo em relacao ao do proprio dia (0 a 1). */
  historyWeight?: number
  /** No modo em grupos, os grupos ja formados. Sem isso, um grupo so. */
  groups?: string[][]
}

/** Monta a fila de partidas do dia. */
export function gerarFila(opts: ScheduleOptions): PlannedMatch[] {
  const hw = opts.historyWeight ?? 0.45
  const antes: Confrontos = new Map()
  if (opts.history) {
    for (const [k, v] of opts.history.opponent) antes.set(k, v * hw)
  }

  const dia: Confrontos = new Map()
  const grupos = opts.groups?.length ? opts.groups : [opts.playerIds]
  const todas: PlannedMatch[] = []
  grupos.forEach((ids, i) => {
    for (const m of rodizioDoGrupo(ids, opts.ratings, antes, dia, opts.entrosamento)) {
      todas.push({ ...m, grupo: i })
      marcarConfronto(m.team_a, m.team_b, dia)
    }
  })
  return ordenarFila(todas)
}

export type RefazerOptions = ScheduleOptions & {
  /** Partidas do dia que ja tem placar. Elas ficam como estao. */
  jogadas: Match[]
}

/**
 * Remonta so o que ainda falta: junta as duplas que ainda nao se formaram e
 * monta as partidas em cima do que ja aconteceu hoje. Serve para quando o dia
 * sai do roteiro -- trocas na mao, quadra travada, play que comecou no papel.
 */
export function refazerFila(opts: RefazerOptions): PlannedMatch[] {
  const hw = opts.historyWeight ?? 0.45
  const antes: Confrontos = new Map()
  if (opts.history) for (const [k, v] of opts.history.opponent) antes.set(k, v * hw)

  const dia: Confrontos = new Map()
  const feitas = new Set<string>()
  for (const m of opts.jogadas) {
    marcarConfronto(m.team_a, m.team_b, dia)
    feitas.add(pairKey(m.team_a[0], m.team_a[1]))
    feitas.add(pairKey(m.team_b[0], m.team_b[1]))
  }

  const grupos = opts.groups?.length ? opts.groups : [opts.playerIds]
  const todas: PlannedMatch[] = []
  grupos.forEach((ids, gi) => {
    const faltando: Duo[] = []
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!feitas.has(pairKey(ids[i], ids[j]))) faltando.push([ids[i], ids[j]])
      }
    }
    if (faltando.length === 0) return
    const ctx: Contexto = { ratings: opts.ratings, entrosamento: opts.entrosamento, antes, dia }
    const { partidas, orfas } = emparelhar(shuffle(faltando), ctx)
    /*
     * Dupla que sobrou sem adversaria NUNCA e descartada: e uma dupla que
     * ainda nao aconteceu hoje, e sumir com ela deixa duas pessoas sem jogar
     * juntas (foi o que aconteceu com Izabelle + Karla em 14/09). Se nenhuma
     * dupla das partidas novas serve de rival, vale QUALQUER dupla do grupo que
     * nao divida jogadora com ela -- uma dupla que ja jogou hoje joga de novo,
     * marcada como repetida. E entre as rivais possiveis, quem jogou MENOS hoje
     * vem primeiro: no meio da noite os numeros ja estao desiguais, e a partida
     * extra deve ir para quem esta atras.
     */
    const jogosHoje = new Map<string, number>()
    for (const m of opts.jogadas) for (const id of jogadorasDaPartida(m)) jogosHoje.set(id, (jogosHoje.get(id) ?? 0) + 1)
    for (const orfa of orfas) {
      let rival = escolherRival(partidas, orfa, ctx, jogosHoje)
      if (!rival) {
        const livres = ids.filter((id) => !orfa.includes(id))
        let melhorCusto = Infinity
        for (let i = 0; i < livres.length; i++) {
          for (let j = i + 1; j < livres.length; j++) {
            const d: Duo = [livres[i], livres[j]]
            const c =
              custoDoConfronto(d, orfa, ctx) +
              W_REPETIDA * ((jogosHoje.get(d[0]) ?? 0) + (jogosHoje.get(d[1]) ?? 0))
            if (c < melhorCusto) {
              melhorCusto = c
              rival = d
            }
          }
        }
      }
      if (!rival) continue // grupo com menos de 4: nao ha como
      partidas.push({ team_a: orfa, team_b: rival, repetida: true })
      marcarConfronto(orfa, rival, ctx.dia)
      for (const id of rival) jogosHoje.set(id, (jogosHoje.get(id) ?? 0) + 1)
    }
    /*
     * TODAS JOGAM O MESMO TANTO, mesmo depois de refazer.
     *
     * Cobrir as duplas que faltavam usa o minimo de partidas, e isso deixa
     * quem entrou tarde (ou quem teve menos sorte na fila) com uma ou duas a
     * menos. Enquanto a diferenca entre quem mais e quem menos jogou for de
     * 2 ou mais, entra uma partida com as quatro que menos jogaram -- duplas
     * repetidas, marcadas como tal, na divisao mais parelha entre as quatro.
     */
    const totalDe = (id: string) => (jogosHoje.get(id) ?? 0) + partidas.filter((m) => jogadorasDaPartida(m).includes(id)).length
    for (let volta = 0; volta < ids.length; volta++) {
      const contagem = ids.map((id) => totalDe(id))
      if (Math.max(...contagem) - Math.min(...contagem) < 2 || ids.length < 4) break
      const quatro = [...ids].sort((a, b) => totalDe(a) - totalDe(b)).slice(0, 4)
      const divisoes: [Duo, Duo][] = [
        [[quatro[0], quatro[1]], [quatro[2], quatro[3]]],
        [[quatro[0], quatro[2]], [quatro[1], quatro[3]]],
        [[quatro[0], quatro[3]], [quatro[1], quatro[2]]],
      ]
      let melhor = divisoes[0]
      let melhorCusto = Infinity
      for (const [a, b] of divisoes) {
        const c = custoDoConfronto(a, b, ctx)
        if (c < melhorCusto) {
          melhorCusto = c
          melhor = [a, b]
        }
      }
      partidas.push({ team_a: melhor[0], team_b: melhor[1], repetida: true })
      marcarConfronto(melhor[0], melhor[1], ctx.dia)
    }
    melhorarConfrontos(partidas, ctx)
    for (const p of partidas) todas.push({ ...p, grupo: gi })
  })
  return ordenarFila(todas)
}

/** Numeros para conferir a qualidade da fila antes de gerar o play. */
export type ResumoDaFila = {
  partidas: number
  duplasDistintas: number
  duplasRepetidas: number
  /** Quantas vezes o par que mais se enfrentou vai se enfrentar. */
  maxConfrontos: number
  mediaConfrontos: number
}

export function resumoDaFila(fila: PlannedMatch[]): ResumoDaFila {
  const duplas = new Map<string, number>()
  const confrontos = new Map<string, number>()
  for (const m of fila) {
    for (const d of [m.team_a, m.team_b]) {
      const k = pairKey(d[0], d[1])
      duplas.set(k, (duplas.get(k) ?? 0) + 1)
    }
    marcarConfronto(m.team_a, m.team_b, confrontos)
  }
  const valores = [...confrontos.values()]
  const soma = valores.reduce((a, b) => a + b, 0)
  return {
    partidas: fila.length,
    duplasDistintas: duplas.size,
    duplasRepetidas: [...duplas.values()].filter((n) => n > 1).length,
    maxConfrontos: valores.length === 0 ? 0 : Math.max(...valores),
    mediaConfrontos: valores.length === 0 ? 0 : soma / valores.length,
  }
}

export function planToMatches(sessionId: string, fila: PlannedMatch[]): Match[] {
  return fila.map((m, i) => ({
    id: uid(),
    session_id: sessionId,
    round: i + 1, // posicao na fila (a coluna do banco se chama round)
    court: 0, // a quadra e definida quando a partida entra em quadra
    team_a: m.team_a,
    team_b: m.team_b,
    score_a: null,
    score_b: null,
    fase: m.fase ?? 1,
    disputa_3o: m.disputa3o ?? false,
    started_at: null,
    ended_at: null,
  }))
}

export function historyFromMatches(matches: Match[]): History {
  return buildHistory(matches)
}

/* ------------------------------------------------------------------
   Quem entra na proxima

   Quando uma quadra vaga, o app olha a fila inteira e pega a primeira partida
   cujas quatro jogadoras estao livres, dando preferencia para quem esta fora
   ha mais tempo -- senao acontece de a menina terminar o jogo e ja entrar de
   novo, cansada, enquanto outra espera sentada.
   ------------------------------------------------------------------ */

/**
 * Fila de espera das jogadoras: 0 e quem esta fora ha mais tempo.
 * `fimDe` devolve quando ela terminou a ultima partida (ms), 0 quando jogou
 * mas nao se sabe a hora, e null quando ainda nao jogou hoje.
 */
export function ordemDeEspera(
  jogadoras: string[],
  fimDe: (id: string) => number | null,
): Map<string, number> {
  // Quem esta na MESMA situacao recebe a MESMA posicao. Dar posicoes
  // diferentes para quem esta empatado (por exemplo, no comeco do play, quando
  // ninguem jogou ainda) inventa uma preferencia que nao existe -- e essa
  // preferencia inventada atropelava a ordem da fila, desmontando as rondas e
  // deixando quadra parada logo na primeira troca.
  const distintos = [...new Set(jogadoras.map((id) => fimDe(id)))]
  distintos.sort((a, b) => {
    if (a === null && b === null) return 0
    if (a === null) return -1 // ainda nao jogou hoje: entra na frente
    if (b === null) return 1
    return a - b
  })
  const posicao = new Map<number | null, number>(distintos.map((v, i) => [v, i]))
  return new Map(jogadoras.map((id) => [id, posicao.get(fimDe(id)) ?? 0]))
}

export type EscolhaOpts = {
  /** Partidas sem placar e sem inicio, na ordem da fila. */
  pendentes: Match[]
  /** Quem esta em quadra agora. */
  ocupadas: Set<string>
  /** Fila de espera (0 = fora ha mais tempo). */
  espera: Map<string, number>
  /** Quantas partidas cada uma ja fez hoje. */
  jogos: Map<string, number>
  /** Quadras sem partida em andamento, na ordem em que aparecem na tela. */
  quadrasLivres: number[]
  /** Quantas partidas seguidas cada uma acabou de jogar (0 = descansou na ultima). */
  seguidas?: Map<string, number>
  /** Duplas (pairKey) que ja jogaram ou estao jogando hoje. */
  jaFormadas?: Set<string>
  /** Todas as jogadoras do play (para a simulacao do que vem depois). */
  jogadoras?: string[]
  /** Os grupos do play, quando ha. */
  grupos?: string[][] | null
}

/** O estado da fila a partir do que a tela sabe agora. */
function estadoDaTela(opts: EscolhaOpts): EstadoDaFila {
  const jogadoras = opts.jogadoras ?? jogadorasDe(opts.pendentes)
  const e = estadoInicial(jogadoras, opts.grupos ?? null)
  // a posicao na espera vira "ha quanto tempo jogou": 0 = ha mais tempo
  for (const id of jogadoras) e.ultima.set(id, opts.espera.get(id) ?? 0)
  for (const id of opts.ocupadas) e.ultima.set(id, jogadoras.length + (opts.espera.get(id) ?? 0))
  e.passo = 2 * jogadoras.length
  if (opts.seguidas) for (const [id, n] of opts.seguidas) e.seguidas.set(id, n)
  if (opts.jaFormadas) for (const k of opts.jaFormadas) e.jaFormadas.add(k)
  for (const [id, n] of opts.jogos) e.jogos.set(id, n)
  return e
}

/** Custo de uma partida agora, com o desempate pela ordem em que foi gerada. */
function custoAgora(m: Match, e: EstadoDaFila): number {
  return custoNaFila(m, e, m.round)
}

/**
 * Os melhores CONJUNTOS de partidas para as quadras livres, do mais barato ao
 * mais caro, preenchendo o maior numero de quadras possivel.
 */
function conjuntosCandidatos(pendentes: Match[], ocupadas: Set<string>, quadras: number, e: EstadoDaFila): Match[][] {
  const ordenadas = [...pendentes].sort((a, b) => custoAgora(a, e) - custoAgora(b, e))
  const LARGURA = 8
  const TETO = 3000
  let visitas = 0
  const completos: { nota: number; escolhidas: Match[] }[] = []
  const busca = (nivel: number, tomadas: Set<string>, escolhidas: Match[], acumulado: number) => {
    // preencher mais quadras vale mais que qualquer economia de custo
    completos.push({ nota: -escolhidas.length * 1e9 + acumulado, escolhidas: escolhidas.slice() })
    if (nivel >= quadras || visitas > TETO) return
    const usadas = new Set(escolhidas.map((m) => m.id))
    const cabem = ordenadas.filter(
      (m) => !usadas.has(m.id) && jogadorasDaPartida(m).every((id) => !tomadas.has(id)),
    )
    for (const m of cabem.slice(0, LARGURA)) {
      visitas++
      if (visitas > TETO) return
      const t2 = new Set(tomadas)
      for (const id of jogadorasDaPartida(m)) t2.add(id)
      busca(nivel + 1, t2, [...escolhidas, m], acumulado + custoAgora(m, e))
    }
  }
  busca(0, new Set(ocupadas), [], 0)
  completos.sort((a, b) => a.nota - b.nota)
  return completos.map((c) => c.escolhidas)
}

/**
 * O que acontece com o resto da fila se estas partidas entrarem agora: roda
 * o mesmo criterio ate o fim, rodada a rodada, e devolve o pior encadeamento
 * que alguem vai ter. E isto que evita a escolha gulosa se encurralar no
 * fim -- a Beatriz jogando quatro seguidas porque as partidas que sobraram
 * so tinham ela.
 */
function simularResto(escolha: Match[], pendentes: Match[], quadras: number, e0: EstadoDaFila): [number, number] {
  const e = clonar(e0)
  let restantes = pendentes.filter((m) => !escolha.some((x) => x.id === m.id))
  avancar(e, escolha)
  while (restantes.length > 0) {
    const proxima = conjuntosCandidatos(restantes, new Set(), quadras, e)[0] ?? []
    if (proxima.length === 0) break
    avancar(e, proxima)
    restantes = restantes.filter((m) => !proxima.some((x) => x.id === m.id))
  }
  return [e.maiorSequencia, e.emendas]
}

/** Ate quantas partidas pendentes a ordem e buscada por completo (quadra unica). */
const LIMITE_ORDEM_EXATA = 12

/**
 * A MELHOR ordem para o que falta, numa quadra so: a que deixa o menor
 * encadeamento de partidas seguidas (e, no empate, menos emendas de duas).
 *
 * A escolha gulosa se encurrala no fim -- sobra so partida com quem acabou de
 * jogar. Com poucas partidas pendentes da para olhar todas as ordens: a busca
 * parte da ordem gulosa como teto e corta todo ramo que ja emenda tanto
 * quanto ela. O teto de nos e para o celular nunca travar; sem completar, fica
 * a melhor ordem vista ate ali, que nunca e pior que a gulosa.
 */
function ordemExata(pendentes: Match[], e0: EstadoDaFila): Match[] {
  // a gulosa: teto inicial e resposta de reserva
  const gulosa: Match[] = []
  {
    const e = clonar(e0)
    let restantes = pendentes.slice()
    while (restantes.length > 0) {
      const m = conjuntosCandidatos(restantes, new Set(), 1, e)[0]?.[0]
      if (!m) break
      avancar(e, [m])
      gulosa.push(m)
      restantes = restantes.filter((x) => x.id !== m.id)
    }
    if (gulosa.length < pendentes.length) return gulosa
  }
  let melhor = gulosa
  let melhorNota = notaDaOrdem(gulosa, e0)
  let nos = 0
  const TETO = 40000
  const dfs = (e: EstadoDaFila, ordem: Match[], restantes: Match[]) => {
    if (nos++ > TETO) return
    const notaAteAqui = e.maiorSequencia * 1e6 + e.emendas * 1e3
    if (notaAteAqui >= melhorNota) return // ja nao bate a melhor
    if (restantes.length === 0) {
      melhorNota = notaAteAqui
      melhor = ordem.slice()
      return
    }
    // as candidatas mais baratas primeiro: acha uma boa ordem cedo e poda mais
    const candidatas = [...restantes].sort((a, b) => custoAgora(a, e) - custoAgora(b, e))
    for (const m of candidatas) {
      const e2 = clonar(e)
      avancar(e2, [m])
      dfs(e2, [...ordem, m], restantes.filter((x) => x.id !== m.id))
      if (nos > TETO) return
    }
  }
  dfs(clonar(e0), [], pendentes.slice())
  return melhor
}

function notaDaOrdem(ordem: Match[], e0: EstadoDaFila): number {
  const e = clonar(e0)
  for (const m of ordem) avancar(e, [m])
  return e.maiorSequencia * 1e6 + e.emendas * 1e3
}

function clonar(e0: EstadoDaFila): EstadoDaFila {
  return {
    ultima: new Map(e0.ultima),
    seguidas: new Map(e0.seguidas),
    jaFormadas: new Set(e0.jaFormadas),
    jogos: new Map(e0.jogos),
    grupos: e0.grupos,
    passo: e0.passo,
    maiorSequencia: 0,
    emendas: 0,
  }
}

/**
 * Sugere a proxima partida de cada quadra livre.
 *
 * Escolhe o CONJUNTO de partidas de uma vez, nao uma quadra por vez: pegando
 * a melhor partida para a quadra 1 sem olhar as outras, sobra jogadora
 * repetida entre duas quadras (a mesma menina nao pode entrar em duas ao
 * mesmo tempo). A busca preenche o maior numero de quadras possivel e, entre
 * as opcoes que preenchem o mesmo tanto, olha o que cada uma faz com o RESTO
 * da noite: fica a que deixa o menor encadeamento de partidas seguidas, e so
 * depois a mais barata agora.
 *
 * Pode devolver menos quadras do que as livres: quando as partidas que faltam
 * so envolvem quem ja esta jogando, a tela mostra a quadra esperando.
 */
export function proximasDasQuadras(opts: EscolhaOpts): Map<number, Match> {
  const { pendentes, ocupadas, quadrasLivres } = opts
  const e = estadoDaTela(opts)
  const out = new Map<number, Match>()
  // uma quadra livre e pouca coisa pendente: da para achar a melhor ordem
  // de verdade, e a proxima e a primeira dela (so entre quem esta livre)
  if (quadrasLivres.length === 1 && pendentes.length <= LIMITE_ORDEM_EXATA) {
    const livres = pendentes.filter((m) => jogadorasDaPartida(m).every((id) => !ocupadas.has(id)))
    const ordem = ordemExata(livres, e)
    if (ordem[0]) out.set(quadrasLivres[0], ordem[0])
    return out
  }
  const candidatos = conjuntosCandidatos(pendentes, ocupadas, quadrasLivres.length, e)
  if (candidatos.length === 0) return out
  const maisCheio = candidatos[0].length
  // so os que preenchem o maximo de quadras, e os 10 mais baratos entre eles
  const finalistas = candidatos.filter((c) => c.length === maisCheio).slice(0, 10)
  let melhor = finalistas[0]
  let melhorNota = Infinity
  finalistas.forEach((c, i) => {
    const [maior, emendas] = simularResto(c, pendentes, Math.max(1, quadrasLivres.length), e)
    const nota = maior * 1e6 + emendas * 1e3 + i
    if (nota < melhorNota) {
      melhorNota = nota
      melhor = c
    }
  })
  melhor.forEach((m, i) => out.set(quadrasLivres[i], m))
  return out
}

/**
 * A ordem em que as partidas que faltam devem acontecer.
 *
 * Nao e a ordem em que elas foram geradas: essa e so o ponto de partida, e
 * mostra-la na tela engana, porque aparece na frente quem acabou de sair da
 * quadra. Aqui a fila e projetada rodando o mesmo criterio das quadras, uma
 * partida por vez. So muda a ORDEM: as duplas ja estao formadas, entao o
 * rodizio continua intacto.
 */
export function ordemPrevista(opts: {
  /** Partidas sem placar e sem inicio. */
  pendentes: Match[]
  /** Fila de espera atual (0 = fora ha mais tempo). */
  espera: Map<string, number>
  /** Quem esta em quadra ou ja escalada: vai para o fim da espera. */
  ocupadas: Set<string>
  /** Todas as jogadoras do play. */
  jogadoras: string[]
  seguidas?: Map<string, number>
  jaFormadas?: Set<string>
  grupos?: string[][] | null
  /** Quem ainda nao chegou: as partidas dela vao para depois de todas as outras. */
  ausentes?: Set<string>
}): Match[] {
  const e = estadoDaTela({ ...opts, jogos: new Map(), quadrasLivres: [1] })
  const ausentes = opts.ausentes ?? new Set<string>()
  // primeiro o que da para jogar sem quem nao chegou; o resto vem depois,
  // continuando do estado em que a primeira parte terminou
  const semAusentes = opts.pendentes.filter((m) => !jogadorasDaPartida(m).some((id) => ausentes.has(id)))
  const comAusentes = opts.pendentes.filter((m) => jogadorasDaPartida(m).some((id) => ausentes.has(id)))
  const out: Match[] = []
  for (const parte of [semAusentes, comAusentes]) {
    if (parte.length === 0) continue
    const ordem =
      parte.length <= LIMITE_ORDEM_EXATA ? ordemExata(parte, e) : ordemGulosa(parte, e)
    for (const m of ordem) avancar(e, [m])
    out.push(...ordem)
  }
  return out
}

function ordemGulosa(pendentes: Match[], e0: EstadoDaFila): Match[] {
  const e = clonar(e0)
  let restantes = pendentes.slice()
  const out: Match[] = []
  while (restantes.length > 0) {
    const proxima = conjuntosCandidatos(restantes, new Set(), 1, e)[0]?.[0]
    if (!proxima) break
    avancar(e, [proxima])
    out.push(proxima)
    restantes = restantes.filter((m) => m.id !== proxima.id)
  }
  return out
}

/* ------------------------------------------------------------------
   NAO existe mais "montar partida com quem esta livre".

   Havia um `liberarPartida` que, com a quadra parada, trocava quem estava
   ocupada por quem estava livre. Ele desfazia uma dupla do rodizio e dava um
   jogo a mais para uma menina e a menos para outra -- o oposto da regra de
   todas jogarem o mesmo tanto. Medido: em modo grupos a quadra fica parada de
   0,1% a 11% do tempo e a maior espera e de uns 17 minutos, uma partida.
   Esperar sai mais barato que quebrar o rodizio. Se alguem foi embora de
   verdade, a troca continua existindo no card da partida, feita na mao.
   ------------------------------------------------------------------ */

