/*
 * MODO CAMPEONATO -- as regras puras.
 *
 * O campeonato e UM play `grupos-duplas` dividido em categorias por nivel
 * (A, B, C...), cada uma com os seus grupos e as suas quadras fixas. Por
 * dentro, `session.groups` continua sendo uma lista so (A-G1, A-G2, B-G1...),
 * entao o rodizio, a fila e o "quem esta em quadra" nao mudam; a categoria e
 * uma camada por cima, guardada em `session.categorias`. Sem ela o play e uma
 * categoria so -- o grupos+duplas de sempre.
 *
 * Desenho em docs/superpowers/specs/2026-10-06-campeonato-design.md.
 */
import { duplasVivas, filaPorForca, type Colocacao } from './pairing'
import { isPlayed, matchPoints } from './scoring'
import { rankDuplasDoDia } from './stats'
import type { Categoria, DesempateDeGrupo, Match, PlaySession } from './types'

/** 'A', 'B', 'C'... */
export function nomeDaCategoria(i: number): string {
  return String.fromCharCode(65 + i)
}

/** Corta a lista em `partes` pedacos de tamanhos o mais iguais possivel; a sobra vai para os primeiros. */
export function fatiar<T>(lista: T[], partes: number): T[][] {
  const n = Math.max(1, partes)
  const base = Math.floor(lista.length / n)
  const sobra = lista.length % n
  const out: T[][] = []
  let i = 0
  for (let k = 0; k < n; k++) {
    const tam = base + (k < sobra ? 1 : 0)
    out.push(lista.slice(i, i + tam))
    i += tam
  }
  return out
}

/**
 * A divisao automatica: categorias e grupos POR NIVEL.
 *
 * A fila por forca (empatadas sorteadas com a semente) e cortada em fatias
 * seguidas: a primeira fatia e a categoria A, e dentro dela a primeira e o
 * grupo 1. Fatias seguidas de uma fila ordenada sao exatamente "as mais
 * fortes juntas", que e o que a organizacao pediu -- com grupos equilibrados,
 * a 1a de cada grupo virava uma superdupla na fase 2.
 */
export function dividirEmCategorias(
  ids: string[],
  ratings: Map<string, number>,
  nCategorias: number,
  gruposPorCategoria: number,
  semente?: number,
): string[][][] {
  const fila = filaPorForca(ids, ratings, semente)
  return fatiar(fila, nCategorias).map((cat) => fatiar(cat, gruposPorCategoria))
}

/**
 * As quadras de cada categoria, numeradas em sequencia (A nas primeiras). Com
 * menos quadras que categorias, as que sobram dividem a ultima quadra.
 */
export function quadrasPadrao(nCategorias: number, total: number): number[][] {
  if (total >= nCategorias) {
    return fatiar(Array.from({ length: total }, (_, i) => i + 1), nCategorias)
  }
  return Array.from({ length: nCategorias }, (_, i) => [Math.min(i + 1, Math.max(1, total))])
}

/** De [categoria][grupo][ids] para o que a sessao grava: os grupos numa lista so e as categorias apontando para eles. */
export function montarCategorias(
  estrutura: string[][][],
  quadras: number[][],
): { groups: string[][]; categorias: Categoria[] } {
  const groups: string[][] = []
  const categorias: Categoria[] = estrutura.map((grupos, c) => {
    const indices = grupos.map((g) => {
      groups.push(g.slice())
      return groups.length - 1
    })
    return { nome: nomeDaCategoria(c), grupos: indices, quadras: (quadras[c] ?? []).slice() }
  })
  return { groups, categorias }
}

/** As categorias do play; sem elas, uma categoria so com todos os grupos e todas as quadras. */
export function categoriasDoPlay(
  s: Pick<PlaySession, 'categorias' | 'groups' | 'courts'>,
): Categoria[] {
  if (s.categorias?.length) return s.categorias
  const grupos = s.groups?.length ? s.groups.map((_, i) => i) : [0]
  return [
    {
      nome: nomeDaCategoria(0),
      grupos,
      quadras: Array.from({ length: Math.max(1, s.courts) }, (_, i) => i + 1),
    },
  ]
}

/** Em que categoria a jogadora esta (-1 se em nenhuma). */
export function categoriaDaJogadora(cats: Categoria[], groups: string[][] | null | undefined, id: string): number {
  const g = (groups ?? []).findIndex((x) => x.includes(id))
  if (g < 0) return cats.length === 1 ? 0 : -1
  return cats.findIndex((c) => c.grupos.includes(g))
}

/** A categoria de uma partida sai de quem joga nela, como o grupo. */
export function categoriaDaPartida(cats: Categoria[], groups: string[][] | null | undefined, m: Match): number {
  return categoriaDaJogadora(cats, groups, m.team_a[0])
}

/* ------------------------------------------------ classificacao do grupo */

/** Uma linha da classificacao de um grupo na fase de grupos. */
export type LinhaDoGrupo = {
  id: string
  jogos: number
  vitorias: number
  pontos: number
  /** Games feitos menos sofridos, contando as derrotas. */
  saldo: number
  /** 1 = primeira. Empatadas ainda sem desempate dividem a posicao. */
  posicao: number
  /** Com quem ela segue empatada em tudo (vazio quando a posicao e so dela). */
  empatadas: string[]
}

/**
 * O confronto direto entre duas, SO QUANDO E JUSTO.
 *
 * Em dupla, quem vence o confronto depende tambem da parceira. Ele so conta
 * quando, nas partidas em que as duas se enfrentaram, cada uma teve AS MESMAS
 * parceiras -- o que sempre acontece num grupo de 4 (a sorte da parceira se
 * anula). Fora disso devolve 0 e o empate vai para a quadra.
 *
 * > 0: `a` na frente; < 0: `b` na frente; 0: nao decide.
 */
export function confrontoJusto(a: string, b: string, partidas: Match[]): number {
  const parceirasDeA: string[] = []
  const parceirasDeB: string[] = []
  let saldo = 0
  for (const m of partidas) {
    if (!isPlayed(m)) continue
    const aNoA = m.team_a.includes(a)
    const aNoB = m.team_b.includes(a)
    const bNoA = m.team_a.includes(b)
    const bNoB = m.team_b.includes(b)
    if (!((aNoA && bNoB) || (aNoB && bNoA))) continue
    const timeDeA = aNoA ? m.team_a : m.team_b
    const timeDeB = aNoA ? m.team_b : m.team_a
    parceirasDeA.push(timeDeA[0] === a ? timeDeA[1] : timeDeA[0])
    parceirasDeB.push(timeDeB[0] === b ? timeDeB[1] : timeDeB[0])
    const aVenceu = aNoA ? (m.score_a as number) > (m.score_b as number) : (m.score_b as number) > (m.score_a as number)
    saldo += aVenceu ? 1 : -1
  }
  if (parceirasDeA.length === 0) return 0
  const iguais = [...parceirasDeA].sort().join('|') === [...parceirasDeB].sort().join('|')
  return iguais ? saldo : 0
}

/**
 * A classificacao de um grupo: vitorias -> pontos -> saldo de games ->
 * confronto direto (so justo, so entre duas) -> desempate em quadra.
 * NUNCA ordem alfabetica: empate que nada decide fica `pendente` ate a
 * organizadora gravar o desempate (simples 1x1 ou par ou impar).
 *
 * O desempate gravado so vale para o MESMO conjunto de empatadas: se um placar
 * foi corrigido depois e o empate mudou, ele nao serve mais.
 */
export function classificarGrupo(
  grupo: string[],
  partidas: Match[],
  /** Os desempates gravados deste grupo (um grupo pode ter dois empates separados). */
  desempates?: DesempateDeGrupo | DesempateDeGrupo[] | null,
): { linhas: LinhaDoGrupo[]; pendente: string[][] } {
  const gravados = desempates ? (Array.isArray(desempates) ? desempates : [desempates]) : []
  const est = new Map<string, LinhaDoGrupo>(
    grupo.map((id) => [id, { id, jogos: 0, vitorias: 0, pontos: 0, saldo: 0, posicao: 0, empatadas: [] }]),
  )
  const jogadas = partidas.filter(isPlayed)
  for (const m of jogadas) {
    const a = m.score_a as number
    const b = m.score_b as number
    const [pa, pb] = matchPoints(a, b)
    for (const [time, feitos, sofridos, pts] of [
      [m.team_a, a, b, pa],
      [m.team_b, b, a, pb],
    ] as const) {
      for (const id of time) {
        const l = est.get(id)
        if (!l) continue
        l.jogos++
        l.saldo += feitos - sofridos
        if (feitos > sofridos) {
          l.vitorias++
          l.pontos += pts
        }
      }
    }
  }
  const mesmoNumero = (x: LinhaDoGrupo, y: LinhaDoGrupo) =>
    x.vitorias === y.vitorias && x.pontos === y.pontos && x.saldo === y.saldo
  // o id so estabiliza a exibicao de quem segue empatada; nao decide nada
  const ordem = [...est.values()].sort(
    (x, y) => y.vitorias - x.vitorias || y.pontos - x.pontos || y.saldo - x.saldo || x.id.localeCompare(y.id),
  )

  const linhas: LinhaDoGrupo[] = []
  const pendente: string[][] = []
  let i = 0
  while (i < ordem.length) {
    let j = i + 1
    while (j < ordem.length && mesmoNumero(ordem[i], ordem[j])) j++
    let bloco = ordem.slice(i, j)
    let resolvido = bloco.length === 1
    if (!resolvido && bloco.length === 2) {
      const c = confrontoJusto(bloco[0].id, bloco[1].id, jogadas)
      if (c !== 0) {
        if (c < 0) bloco = [bloco[1], bloco[0]]
        resolvido = true
      }
    }
    const desempate = resolvido ? undefined : gravados.find((d) => mesmoConjunto(d.ordem, bloco.map((l) => l.id)))
    if (desempate) {
      bloco = desempate.ordem.map((id) => bloco.find((l) => l.id === id) as LinhaDoGrupo)
      resolvido = true
    }
    if (resolvido) {
      bloco.forEach((l, k) => linhas.push({ ...l, posicao: i + k + 1, empatadas: [] }))
    } else {
      const ids = bloco.map((l) => l.id)
      pendente.push(ids)
      for (const l of bloco) linhas.push({ ...l, posicao: i + 1, empatadas: ids.filter((x) => x !== l.id) })
    }
    i = j
  }
  return { linhas, pendente }
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
}

/* ------------------------------------- categorias na fase 2 e pontuacao */

/**
 * Pontos do mes por colocacao, na ordem
 * [campea, vice, 3o lugar, semifinal, quartas ou antes, fase de grupos].
 * O titulo sempre vale mais: pela diferenca de games a vice podia somar mais
 * que a campea (venceu a semi de 4x0 e perdeu a final; a campea venceu as
 * duas de 4x3).
 */
export const PONTUACAO_PADRAO: number[] = [16, 12, 10, 8, 6, 3]

/** As partidas da categoria (a categoria sai de quem joga, como o grupo). */
export function partidasDaCategoria(s: PlaySession, cat: number, partidas: Match[]): Match[] {
  const cats = categoriasDoPlay(s)
  return partidas.filter((m) => categoriaDaPartida(cats, s.groups, m) === cat)
}

/** As duplas fixas da categoria, na ordem gravada (a ordem e a forca na chave). */
export function duosDaCategoria(s: PlaySession, cat: number): [string, string][] {
  const cats = categoriasDoPlay(s)
  return (s.duos ?? []).filter((d) => categoriaDaJogadora(cats, s.groups, d[0]) === cat)
}

/**
 * Como cada menina da categoria terminou a fase de grupos, no formato que
 * `duplasDaFase2` usa. `Colocacao.grupo` e o grupo DENTRO da categoria (e o
 * que impede dupla do mesmo grupo); `pendentes` traz o indice GLOBAL do grupo,
 * que e o que o desempate grava.
 */
export function colocacoesDaCategoria(
  s: PlaySession,
  cat: number,
  partidas: Match[],
): { colocacoes: Colocacao[]; pendentes: { grupo: number; ids: string[] }[] } {
  const c = categoriasDoPlay(s)[cat]
  const colocacoes: Colocacao[] = []
  const pendentes: { grupo: number; ids: string[] }[] = []
  if (!c) return { colocacoes, pendentes }
  c.grupos.forEach((gi, k) => {
    const grupo = s.groups?.[gi] ?? []
    const doGrupo = new Set(grupo)
    const ms = partidas.filter((m) => (m.fase ?? 1) === 1 && doGrupo.has(m.team_a[0]))
    const desempates = (s.desempates_grupo ?? []).filter((d) => d.grupo === gi)
    const { linhas, pendente } = classificarGrupo(grupo, ms, desempates)
    for (const l of linhas) {
      colocacoes.push({ id: l.id, grupo: k, posicao: l.posicao, pontos: l.pontos, saldo: l.saldo })
    }
    for (const ids of pendente) pendentes.push({ grupo: gi, ids })
  })
  return { colocacoes, pendentes }
}

/** A categoria acabou: duplas formadas, nada sem placar e no maximo uma dupla sem derrota. */
export function categoriaTerminou(s: PlaySession, cat: number, partidas: Match[]): boolean {
  const duos = duosDaCategoria(s, cat)
  if (duos.length < 2) return false
  const daqui = partidasDaCategoria(s, cat, partidas)
  if (daqui.some((m) => !isPlayed(m))) return false
  return duplasVivas(duos, daqui.filter((m) => (m.fase ?? 1) >= 2)).length <= 1
}

/**
 * PONTOS POR COLOCACAO de um play (vazio sem `pontuacao` ou em play avulso).
 *
 * So entram as categorias que TERMINARAM: antes da final ninguem sabe quem e
 * campea. A ordem e a do podio da chave (`rankDuplasDoDia`): ouro, prata, o
 * bronze (melhor semifinalista ou quem venceu o 3o lugar), a outra
 * semifinalista, quem caiu antes, e quem nem entrou na chave.
 */
export function pontosDeColocacao(s: PlaySession, partidas: Match[]): Map<string, number> {
  const out = new Map<string, number>()
  const tabela = s.pontuacao
  if (!tabela?.length || s.ranked === false || s.format !== 'grupos-duplas') return out
  const valor = (i: number) => tabela[i] ?? 0
  const cats = categoriasDoPlay(s)
  cats.forEach((c, ci) => {
    if (!categoriaTerminou(s, ci, partidas)) return
    const duos = duosDaCategoria(s, ci)
    const daChave = partidasDaCategoria(s, ci, partidas).filter((m) => (m.fase ?? 1) >= 2 && isPlayed(m))
    const ordem = rankDuplasDoDia(daChave, (id) => id, undefined, duos)
    ordem.forEach((d, p) => {
      const semi = d.saiuEm === 'na semifinal'
      const indice = d.medalha === 3 ? 0 : d.medalha === 2 ? 1 : p === 2 && (d.bronze || semi) ? 2 : semi ? 3 : 4
      out.set(d.a, valor(indice))
      out.set(d.b, valor(indice))
    })
    for (const gi of c.grupos) {
      for (const id of s.groups?.[gi] ?? []) if (!out.has(id)) out.set(id, valor(5))
    }
  })
  return out
}

/* ------------------------------------------------ quadras por categoria */

/**
 * As quadras que cada categoria usa AGORA.
 *
 * Cada categoria tem as suas fixas. Quando uma termina TUDO (final jogada), as
 * dela vao para quem ainda joga, para ninguem esperar com quadra vazia ao lado:
 * para a categoria escolhida na mao (`cedidas`, por quadra) ou, sem escolha,
 * para a que tem mais partidas por jogar. Esperando formar as duplas ela ainda
 * nao terminou -- vai jogar -- e a quadra fica com ela.
 */
export function quadrasEfetivas(
  cats: Categoria[],
  terminou: boolean[],
  pendentes: number[],
  cedidas?: Record<string, number> | null,
): number[][] {
  const out = cats.map((c, i) => (terminou[i] ? [] : c.quadras.slice()))
  const ativas = cats.map((_, i) => i).filter((i) => !terminou[i])
  if (ativas.length === 0) return cats.map((c) => c.quadras.slice())
  const maisCheia = ativas.reduce((melhor, i) => ((pendentes[i] ?? 0) > (pendentes[melhor] ?? 0) ? i : melhor), ativas[0])
  cats.forEach((c, i) => {
    if (!terminou[i]) return
    for (const q of c.quadras) {
      const escolhida = cedidas?.[String(q)]
      const destino = escolhida !== undefined && ativas.includes(escolhida) ? escolhida : maisCheia
      out[destino].push(q)
    }
  })
  return out.map((qs) => [...new Set(qs)].sort((a, b) => a - b))
}
