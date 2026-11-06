import type { Match, PlaySession } from './types'
import { isPlayed } from './scoring'
import { estadoDaNoite, filaPorGrupo, proximasPelaFila } from './fila'
import { jogadorasDaPartida } from './pairing'
import { chavesDoPlay, quadrasDaCategoriaAgora, regrasDoPlay } from './previsaoDaNoite'

export type MudancaDeQuadra = 'abrir_quadra' | 'tirar_quadra'

/** Editar titulo, grupos ou finalizar nao restaura quadras de uma copia antiga. */
export function preservarQuadras(nova: PlaySession, atual?: PlaySession): PlaySession {
  if (!atual) return nova
  const { quadras_abertas: _abertas, quadras_operacoes: _ops, ...resto } = nova
  return { ...resto, courts: atual.courts,
    ...('quadras_abertas' in atual ? { quadras_abertas: atual.quadras_abertas, quadras_operacoes: atual.quadras_operacoes } : {}) }
}

/** Espelho local do gatilho do 33: a quadra reaberta pelo inicio fica aberta. */
export function garantirQuadrasEmJogo(s: PlaySession, matches: Match[]): PlaySession {
  const quadras = quadrasAbertas(s, matches.filter((m) => m.session_id === s.id))
  return quadras.length === quadrasAbertas(s).length ? s : { ...s, courts: quadras.length, quadras_abertas: quadras }
}

/** Numeros fisicos; uma partida iniciada nunca perde seu cartao, mesmo com dados atrasados. */
export function quadrasAbertas(s: Pick<PlaySession, 'courts' | 'quadras_abertas'>, matches: Match[] = []): number[] {
  const base = s.quadras_abertas ?? Array.from({ length: Math.max(1, s.courts) }, (_, i) => i + 1)
  return [...new Set([...base, ...matches.filter((m) => !isPlayed(m) && m.started_at).map((m) => m.court)])]
    .filter((q) => Number.isInteger(q) && q > 0).sort((a, b) => a - b)
}

/** A mesma fila alimenta os cards e o selo: quatro livres, sem ausentes nem reservas repetidas. */
export function estadoDasQuadras(s: PlaySession, matches: Match[], escolhas = s.escolhas ?? {}) {
  const quadras = quadrasAbertas(s, matches)
  const noite = { jogadoras: s.player_ids, grupos: s.groups ?? null, matches, ausentes: new Set(s.ausentes ?? []), quadras: quadras.length }
  const e = estadoDaNoite(noite)
  const emQuadra = new Map(e.emJogo.map((m) => [m.court, m]))
  const livres = quadras.filter((q) => !emQuadra.has(q))
  const regras = regrasDoPlay(s, matches)
  const porCategoria = quadrasDaCategoriaAgora(s, chavesDoPlay(s, matches, regras), emQuadra, regras.catDe)
  const filas = filaPorGrupo(noite)
  const proximas = new Map<number, Match>()
  const tomadas = new Set(e.indisponiveis)
  for (const q of livres) {
    const m = e.pendentes.find((m) => m.id === escolhas[String(q)])
    if (m && jogadorasDaPartida(m).every((id) => !tomadas.has(id))) {
      proximas.set(q, m)
      jogadorasDaPartida(m).forEach((id) => tomadas.add(id))
    }
  }
  const restantes = livres.filter((q) => !proximas.has(q))
  if (porCategoria) {
    regras.cats.forEach((cat, ci) => {
      const filasDaCat = cat.grupos.map((g) => filas[g] ?? [])
      const revezar = filasDaCat.filter((f) => f.length).length > porCategoria[ci].length
      const noiteDaCat = { ...noite, grupos: cat.grupos.map((g) => s.groups?.[g] ?? []), quadras: porCategoria[ci].length }
      const auto = proximasPelaFila(noiteDaCat, restantes.filter((q) => porCategoria[ci].includes(q)), revezar ? undefined : cat.quadras,
        filasDaCat, [...proximas.values()])
      for (const [q, m] of auto) proximas.set(q, m)
    })
  } else {
    for (const [q, m] of proximasPelaFila(noite, restantes, undefined, filas, [...proximas.values()])) proximas.set(q, m)
  }
  // Simula vagas adicionais na mesma ordem da fila, reservando o que ja esta nos cards.
  const vagas = Array.from({ length: Math.floor(s.player_ids.length / 4) }, (_, i) => Math.max(0, ...quadras) + i + 1)
  const prontas = [...proximasPelaFila(noite, vagas, undefined, filas, [...proximas.values()]).values()]
  const abrir = prontas.slice(Math.max(0, livres.length - proximas.size))
  return { quadras, livres, emQuadra, porCategoria, filas, proximas, abrir }
}

/** Relativa ao estado atual, idempotente para o reenvio da fila offline. */
export function mudarQuadra(s: PlaySession, matches: Match[], campo: MudancaDeQuadra, operacao: string, legado = false): PlaySession {
  if (s.quadras_operacoes?.includes(operacao)) return s
  const e = estadoDasQuadras(s, matches)
  if (legado) {
    // shortcut: sem o 33 so existe o total, retirada do meio espera a migracao.
    const podeTirar = s.courts > 1 && e.livres.includes(s.courts) && !s.categorias?.some((c) => c.quadras.includes(s.courts))
    return { ...s, courts: s.courts + (campo === 'abrir_quadra' ? Number(e.abrir.length > 0) : -Number(podeTirar)) }
  }
  let abertas = e.quadras
  let cedidas = s.quadras_cedidas
  let escolhas = s.escolhas
  if (s.status === 'open' && campo === 'abrir_quadra' && e.abrir.length) {
    let q = 1
    while (abertas.includes(q)) q++
    abertas = [...abertas, q].sort((a, b) => a - b)
    if (s.categorias?.length) cedidas = { ...cedidas, [q]: regrasDoPlay(s, matches).catDe(e.abrir[0]) }
  } else if (s.status === 'open' && campo === 'tirar_quadra' && abertas.length > 1 && e.livres.length) {
    const q = e.livres[e.livres.length - 1]
    abertas = abertas.filter((n) => n !== q)
    escolhas = { ...escolhas }
    delete escolhas[String(q)]
  }
  return { ...s, courts: abertas.length, quadras_abertas: abertas, quadras_operacoes: [...(s.quadras_operacoes ?? []), operacao], quadras_cedidas: cedidas, escolhas }
}
