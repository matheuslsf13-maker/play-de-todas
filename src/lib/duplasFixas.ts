/**
 * DUPLAS FIXAS DESDE O INICIO
 *
 * A dupla joga a noite toda junta. O play e um campeonato com uma categoria =
 * um grupo: as duplas de cada categoria se enfrentam uma vez (a fase 1, que nao
 * pontua) e a classificacao delas monta o mata-mata. Dali em diante e o fluxo do
 * campeonato de sempre (chave, bye, podio, pontos por colocacao, status).
 *
 * Fica gravado em `sessions.duplas_definidas`; `sessions.duos` continua sendo
 * so a chave do mata-mata, preenchida quando a fase 1 acaba.
 */
import { circleMethod, filaPorForca, ordenarFila, type PlannedMatch } from './pairing'
import { isPlayed, matchPoints } from './scoring'
import type { DesempateDeGrupo, Match } from './types'

export type Duo = [string, string]
export type Genero = 'F' | 'M'

export const chaveDaDupla = (d: readonly string[]) => [...d].sort().join('+')

/* ------------------------------------------------------------- montar */

export type DuplasMontadas = {
  duplas: Duo[]
  /** No misto: duplas que sairam do mesmo genero porque sobrou gente de um lado. */
  mesmoGenero: Duo[]
  /** Numero impar: quem ficou sem par (o "criar" recusa enquanto houver). */
  semPar: string | null
}

/**
 * Monta as duplas POR NIVEL: forte com forte. Num app de um genero so, a 1a com
 * a 2a, a 3a com a 4a... No misto (com `genero`), a i-esima mulher com o
 * i-esimo homem, os dois pela forca; quem sobra de um lado forma dupla com
 * alguem do mesmo genero, tambem por nivel, e volta em `mesmoGenero` para a tela
 * avisar.
 *
 * Por nivel, e nao "forte com fraco", porque as categorias saem da forca da
 * dupla: a A junta as duplas fortes, e cada categoria joga parelho por dentro.
 */
export function montarDuplasPorNivel(
  ids: string[],
  forca: Map<string, number>,
  genero?: Map<string, Genero>,
  /** Semente do sorteio entre empatados na forca (as novatas): "montar de novo" troca. */
  semente = 1,
): DuplasMontadas {
  // empatados na forca (toda estreante tem a mesma nota) sao sorteados, com
  // semente: a tela recalcula a cada mudanca e as duplas nao podem pular sozinhas
  const porForca = (lista: string[]) => filaPorForca(lista, forca, semente)
  const emPares = (lista: string[]): { duplas: Duo[]; sobra: string | null } => {
    const duplas: Duo[] = []
    for (let i = 0; i + 1 < lista.length; i += 2) duplas.push([lista[i], lista[i + 1]])
    return { duplas, sobra: lista.length % 2 === 1 ? lista[lista.length - 1] : null }
  }

  if (!genero) {
    const { duplas, sobra } = emPares(porForca(ids))
    return { duplas, mesmoGenero: [], semPar: sobra }
  }

  const mulheres = porForca(ids.filter((id) => genero.get(id) === 'F'))
  const homens = porForca(ids.filter((id) => genero.get(id) === 'M'))
  // quem nao tem genero marcado entra no lado que estiver menor
  for (const id of porForca(ids.filter((id) => !genero.has(id)))) {
    ;(mulheres.length <= homens.length ? mulheres : homens).push(id)
  }
  const n = Math.min(mulheres.length, homens.length)
  const mistas: Duo[] = []
  for (let i = 0; i < n; i++) mistas.push([mulheres[i], homens[i]])
  // a sobra e de um lado so; ela tambem sai por nivel, mas a dupla mista que
  // tem o mesmo nivel da sobra NAO e desfeita: a mista vale mais
  const sobra = mulheres.length > n ? mulheres.slice(n) : homens.slice(n)
  const { duplas: mesmoGenero, sobra: semPar } = emPares(sobra)
  return { duplas: [...mistas, ...mesmoGenero], mesmoGenero, semPar }
}

/** Troca duas pessoas de lugar (cada uma vai para a dupla da outra). */
export function trocarNasDuplas(duplas: Duo[], a: string, b: string): Duo[] {
  if (a === b) return duplas
  return duplas.map((d) => d.map((id) => (id === a ? b : id === b ? a : id)) as Duo)
}

/** A forca da dupla: a soma das duas (a mesma conta do equilibrio das partidas). */
export function forcaDaDupla(d: Duo, forca: Map<string, number>): number {
  return (forca.get(d[0]) ?? 2) + (forca.get(d[1]) ?? 2)
}

/**
 * Divide as duplas em `n` categorias pela forca da dupla (A = as mais fortes),
 * com tamanhos o mais parecidos possivel -- a sobra vai para as primeiras.
 */
export function dividirDuplasEmCategorias(duplas: Duo[], forca: Map<string, number>, n: number): Duo[][] {
  const ordem = [...duplas].sort((a, b) => forcaDaDupla(b, forca) - forcaDaDupla(a, forca))
  const partes = Math.max(1, Math.min(n, Math.floor(ordem.length / 2) || 1))
  const base = Math.floor(ordem.length / partes)
  const resto = ordem.length % partes
  const out: Duo[][] = []
  let i = 0
  for (let c = 0; c < partes; c++) {
    const t = base + (c < resto ? 1 : 0)
    out.push(ordem.slice(i, i + t))
    i += t
  }
  return out
}

/** Leva uma dupla (pela chave de qualquer uma das duas) para outra categoria. */
export function moverDupla(cats: Duo[][], id: string, para: number): Duo[][] {
  const dupla = cats.flat().find((d) => d.includes(id))
  if (!dupla) return cats
  const out = cats.map((c) => c.filter((d) => d !== dupla))
  out[para] = [...(out[para] ?? []), dupla]
  return out
}

/**
 * Troca `sai` por `entra` numa lista de duplas. Se `entra` ja esta em outra
 * dupla, as duas pessoas trocam de lugar (as duas duplas mudam).
 */
export function substituirNasDuplas(duplas: Duo[], sai: string, entra: string): Duo[] {
  return trocarNasDuplas(duplas, sai, entra)
}

/* --------------------------------------------------------------- fila */

/** Quantas partidas a fase 1 tem com `k` duplas: todas contra todas. */
export function partidasEntreDuplas(k: number): number {
  return (k * (k - 1)) / 2
}

/**
 * A fase 1: em cada categoria, cada dupla enfrenta todas as outras uma vez. As
 * rodadas saem do metodo do circulo aplicado as DUPLAS (com dupla de folga
 * quando o numero e impar), e a ordem final passa pelo `ordenarFila` de sempre,
 * que espalha para ninguem emendar partidas seguidas.
 *
 * `grupos[c]` e o indice do grupo da categoria em `session.groups` -- e o que a
 * fila e o "quem esta em quadra" usam para separar as categorias.
 */
export function filaDeDuplas(categorias: Duo[][], grupos: number[]): PlannedMatch[] {
  const todas: PlannedMatch[] = []
  categorias.forEach((duplas, c) => {
    const porChave = new Map(duplas.map((d) => [chaveDaDupla(d), d] as const))
    for (const rodada of circleMethod([...porChave.keys()])) {
      for (const [x, y] of rodada) {
        todas.push({ team_a: porChave.get(x)!, team_b: porChave.get(y)!, grupo: grupos[c] ?? c, fase: 1 })
      }
    }
  })
  return ordenarFila(todas)
}

/* ------------------------------------------------------- classificacao */

export type LinhaDaDupla = {
  dupla: Duo
  jogos: number
  vitorias: number
  pontos: number
  saldo: number
  /** 1 = primeira. Empatadas sem desempate dividem a posicao. */
  posicao: number
  /** Com quem segue empatada em tudo. */
  empatadas: Duo[]
}

/**
 * A classificacao das duplas da categoria: vitorias -> pontos -> saldo ->
 * confronto direto (entre DUAS empatadas: quem venceu mais vezes a outra
 * neste play) -> desempate em quadra. Nunca ordem
 * alfabetica.
 *
 * O desempate gravado (`DesempateDeGrupo.ordem`) guarda a PRIMEIRA de cada
 * dupla, na ordem em que ficaram; ele so vale para o mesmo conjunto de duplas.
 */
export function classificarDuplas(
  duplas: Duo[],
  partidas: Match[],
  desempates?: DesempateDeGrupo[] | null,
): { linhas: LinhaDaDupla[]; pendente: Duo[][] } {
  const est = new Map<string, LinhaDaDupla>(
    duplas.map((d) => [chaveDaDupla(d), { dupla: d, jogos: 0, vitorias: 0, pontos: 0, saldo: 0, posicao: 0, empatadas: [] }]),
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
      const l = est.get(chaveDaDupla(time))
      if (!l) continue
      l.jogos++
      l.saldo += feitos - sofridos
      if (feitos > sofridos) {
        l.vitorias++
        l.pontos += pts
      }
    }
  }
  const mesmoNumero = (x: LinhaDaDupla, y: LinhaDaDupla) =>
    x.vitorias === y.vitorias && x.pontos === y.pontos && x.saldo === y.saldo
  const ordem = [...est.values()].sort(
    (x, y) =>
      y.vitorias - x.vitorias ||
      y.pontos - x.pontos ||
      y.saldo - x.saldo ||
      chaveDaDupla(x.dupla).localeCompare(chaveDaDupla(y.dupla)), // so estabiliza a tela
  )
  const confronto = (x: Duo, y: Duo): number => {
    let saldo = 0
    for (const m of jogadas) {
      const kx = chaveDaDupla(x)
      const ky = chaveDaDupla(y)
      const ka = chaveDaDupla(m.team_a)
      const kb = chaveDaDupla(m.team_b)
      if (!((ka === kx && kb === ky) || (ka === ky && kb === kx))) continue
      const aVenceu = (m.score_a as number) > (m.score_b as number)
      saldo += (ka === kx) === aVenceu ? 1 : -1
    }
    return saldo
  }
  const gravados = desempates ?? []
  const linhas: LinhaDaDupla[] = []
  const pendente: Duo[][] = []
  let i = 0
  while (i < ordem.length) {
    let j = i + 1
    while (j < ordem.length && mesmoNumero(ordem[i], ordem[j])) j++
    let bloco = ordem.slice(i, j)
    let resolvido = bloco.length === 1
    if (!resolvido && bloco.length === 2) {
      const c = confronto(bloco[0].dupla, bloco[1].dupla)
      if (c !== 0) {
        if (c < 0) bloco = [bloco[1], bloco[0]]
        resolvido = true
      }
    }
    if (!resolvido) {
      const primeiras = bloco.map((l) => l.dupla[0])
      const d = gravados.find(
        (g) => g.ordem.length === primeiras.length && [...g.ordem].sort().join('|') === [...primeiras].sort().join('|'),
      )
      if (d) {
        bloco = d.ordem.map((id) => bloco.find((l) => l.dupla[0] === id) as LinhaDaDupla)
        resolvido = true
      }
    }
    if (resolvido) {
      bloco.forEach((l, k) => linhas.push({ ...l, posicao: i + k + 1, empatadas: [] }))
    } else {
      const ds = bloco.map((l) => l.dupla)
      pendente.push(ds)
      for (const l of bloco) linhas.push({ ...l, posicao: i + 1, empatadas: ds.filter((d) => d !== l.dupla) })
    }
    i = j
  }
  return { linhas, pendente }
}
