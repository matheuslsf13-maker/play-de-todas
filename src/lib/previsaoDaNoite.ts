/*
 * QUANTO FALTA A NOITE -- a conta que a tela do play e o cartao da tela
 * inicial mostram. Saiu do Play.tsx (D42) para os dois darem os MESMOS
 * numeros: "faltam N partidas, uns X min -- termina por volta das HHhMM".
 * tests/previsaoDaNoite.test.ts compara com a conta antiga, copiada la.
 */
import {
  categoriaDaPartida,
  categoriaTerminou,
  categoriasDoPlay,
  duosDaCategoria,
  estimativaDaNoite,
  minutosRestantesDaChave,
  quadrasEfetivas,
} from './campeonato'
import { lerRegra, type Regra } from './desempate'
import { duplasQueEntraram, duplasVivas, nomeDaRodada } from './pairing'
import { isPlayed } from './scoring'
import type { Categoria, Match, PlaySession } from './types'

/**
 * Quanto dura um GAME, em media, em quadra. E a calibragem: uma partida ate
 * 4 leva uns 15 min, e ela tem em media 5,5 games (os 4 de quem ganha mais
 * uns 1,5 de quem perde) -- 15 / 5,5.
 */
const MINUTOS_POR_GAME = 15 / 5.5

/**
 * Quanto dura uma partida, em media, contando os games dos DOIS lados: quem
 * perde tambem joga, e um 6x5 e bem mais longo que um 6x0. Quem perde faz,
 * na media, metade do que podia (alvo - 1) / 2. O modo de desempate estica:
 * "so vai a 2" costuma render um game a mais, e o tie vale uns 1,5 (de 7) ou
 * 2 (de 10) games de tempo quando acontece.
 */
export function minutosDaPartida(alvo: number, r: Regra): number {
  const doDesempate = r.modo === 'alvo' ? 0 : r.modo === 'vantagem' ? 1 : r.tie === 10 ? 2 : 1.5
  const games = alvo + (alvo - 1) / 2 + doDesempate
  return games * MINUTOS_POR_GAME
}

/** "45 min", "2h", "1h35". */
export function formatarMinutos(total: number): string {
  const min = Math.round(total)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** "21h23", no fuso do aparelho. */
export function horaLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * As regras de cada partida do play: categoria, rodada, alvo e desempate.
 * `matches` sao as partidas DESTE play.
 */
export function regrasDoPlay(session: PlaySession, matches: Match[]) {
  const cats = categoriasDoPlay(session)
  const catDe = (m: Match) => Math.max(0, categoriaDaPartida(cats, session.groups, m))
  /** O nome da rodada da partida (Final, Semifinal, Quartas de final...). */
  const rodadaDe = (m: Match): string => {
    const fase = m.fase ?? 1
    // a rodada e da chave da categoria da partida: cada uma tem a sua
    const ci = catDe(m)
    const daCategoria = matches.filter((x) => catDe(x) === ci)
    const entraram = duplasQueEntraram(duosDaCategoria(session, ci), daCategoria, fase)
    if (entraram > 0) return nomeDaRodada(entraram)
    // sem as duplas gravadas (play antigo) sobra contar os jogos da fase
    const jogos = daCategoria.filter((x) => (x.fase ?? 1) === fase && !x.disputa_3o).length
    return jogos === 1 ? 'Final' : jogos === 2 ? 'Semifinal' : nomeDaRodada(jogos * 2)
  }
  /** Qual dos quatro alvos/desempates vale para a partida: 0 grupos, 1 duplas, 2 semi, 3 final. */
  const degrauDe = (m: Match): 0 | 1 | 2 | 3 => {
    if ((m.fase ?? 1) === 1) return 0
    const nome = rodadaDe(m)
    return nome === 'Final' ? 3 : nome === 'Semifinal' ? 2 : 1
  }
  const regraDe = (m: Match): Regra => {
    const lista = session.desempates
    if (!lista?.length) return lerRegra(session.desempate)
    return lerRegra(lista[degrauDe(m)])
  }
  const alvoDe = (m: Match) => {
    const alvos = session.alvos
    if (!alvos?.length) return session.target
    return alvos[degrauDe(m)] ?? session.target
  }
  /** Quanto dura, em media, uma partida deste conjunto: no grupos+duplas cada fase tem alvo e regra proprios. */
  const minutosMedios = (ms: Match[]) =>
    ms.length === 0
      ? minutosDaPartida(session.target, lerRegra(session.desempate))
      : ms.reduce((t, m) => t + minutosDaPartida(alvoDe(m), regraDe(m)), 0) / ms.length
  return { cats, catDe, rodadaDe, degrauDe, regraDe, alvoDe, minutosMedios }
}

export type ChaveDaCategoria = {
  cat: Categoria
  ci: number
  daqui: Match[]
  daFase1: Match[]
  daFase2: Match[]
  /** Todas as partidas do mata-mata (fase 2 em diante). */
  doMataMata: Match[]
  ultimaFase: number
  /** A ultima rodada do mata-mata, sem a disputa de 3o. */
  daUltimaRodada: Match[]
  duos: [string, string][]
  /** Quem ainda nao perdeu. Uma dupla so = ja tem campea. */
  vivas: [string, string][]
  terminou: boolean
  porJogar: number
}

/**
 * A CHAVE DE CADA CATEGORIA. No campeonato cada categoria tem a sua fase de
 * grupos, as suas duplas e o seu mata-mata, e anda no seu ritmo. Sem
 * categorias o play e uma so -- o grupos+duplas de sempre.
 */
export function chavesDoPlay(session: PlaySession, matches: Match[], regras = regrasDoPlay(session, matches)): ChaveDaCategoria[] {
  const soFase2 = session.format === 'grupos-duplas'
  return regras.cats.map((cat, ci) => {
    const daqui = matches.filter((m) => regras.catDe(m) === ci)
    const daFase1 = daqui.filter((m) => (m.fase ?? 1) === 1)
    const daFase2 = daqui.filter((m) => (m.fase ?? 1) === 2)
    const doMataMata = daqui.filter((m) => (m.fase ?? 1) >= 2)
    const ultimaFase = doMataMata.reduce((t, m) => Math.max(t, m.fase ?? 1), 1)
    // a disputa de 3o fica de fora: ela nao gera proxima rodada nem decide
    // quem segue vivo na chave
    const daUltimaRodada = doMataMata.filter((m) => (m.fase ?? 1) === ultimaFase && !m.disputa_3o)
    const duos = duosDaCategoria(session, ci)
    const vivas = duos.length ? duplasVivas(duos, doMataMata) : []
    return {
      cat,
      ci,
      daqui,
      daFase1,
      daFase2,
      doMataMata,
      ultimaFase,
      daUltimaRodada,
      duos,
      vivas,
      terminou: soFase2 && categoriaTerminou(session, ci, matches),
      porJogar: daqui.filter((m) => !isPlayed(m)).length,
    }
  })
}

/**
 * CAMPEONATO: as quadras que cada categoria usa agora -- as fixas dela, e as
 * de quem ja terminou tudo. `emQuadra`: a partida rolando em cada quadra.
 * Null fora do campeonato.
 */
export function quadrasDaCategoriaAgora(
  session: PlaySession,
  chaves: ChaveDaCategoria[],
  emQuadra: Map<number, Match>,
  catDe: (m: Match) => number,
): number[][] | null {
  const cats = chaves.map((c) => c.cat)
  if (cats.length <= 1) return null
  const base = quadrasEfetivas(
    cats,
    chaves.map((c) => c.terminou),
    chaves.map((c) => c.porJogar),
    session.quadras_cedidas,
    session.courts,
  )
  // quadra com jogo em andamento e de quem esta jogando nela: a conta de
  // "quem tem mais jogo" muda a cada rodada, e a partida nao pode mudar de
  // categoria (nem sumir do filtro de quem cuida dela) no meio do jogo
  for (const [q, m] of emQuadra) {
    const dona = catDe(m)
    base.forEach((qs, i) => {
      const k = qs.indexOf(q)
      if (k >= 0 && i !== dona) qs.splice(k, 1)
    })
    if (base[dona] && !base[dona].includes(q)) base[dona].push(q)
  }
  return base.map((qs) => [...qs].sort((a, b) => a - b))
}

export type RestanteDaNoite = {
  minutos: number
  falta: number
  categorias: { ci: number; nome: string; minutos: number }[]
}

/**
 * QUANTO FALTA A NOITE, com o play rolando. Nos modos com fases conta
 * tambem o mata-mata que ainda nem foi montado, rodada por rodada, com o alvo
 * e o desempate de cada fase; no campeonato, por categoria (elas jogam ao
 * mesmo tempo, a noite acaba com a mais longa). Null com o play finalizado.
 */
export function restanteDaNoite(
  session: PlaySession,
  matches: Match[],
  regras: ReturnType<typeof regrasDoPlay>,
  chaves: ChaveDaCategoria[],
  quadrasDaCategoria: number[][] | null,
): RestanteDaNoite | null {
  if (session.status === 'finished') return null
  const falta = matches.filter((m) => !isPlayed(m)).length
  if (session.format !== 'grupos-duplas') {
    return {
      minutos: Math.ceil(falta / Math.max(1, session.courts)) * regras.minutosMedios(matches.filter((m) => !isPlayed(m))),
      falta,
      categorias: [],
    }
  }
  const minutos = [0, 1, 2, 3].map((d) =>
    minutosDaPartida(session.alvos?.[d] ?? session.target, lerRegra(session.desempates?.[d] ?? session.desempate)),
  )
  const categorias = chaves.map((c) => {
    const q = Math.max(1, quadrasDaCategoria?.[c.ci]?.length ?? session.courts)
    let t = Math.ceil(c.daFase1.filter((m) => !isPlayed(m)).length / q) * minutos[0]
    if (!c.duos.length) {
      // o mata-mata ainda nao existe: entra a chave inteira
      t += estimativaDaNoite({
        grupos: [c.cat.grupos.map((g) => session.groups?.[g]?.length ?? 0)],
        quadras: [q],
        duplasMM: session.duplas_mm ?? 8,
        minutos,
      }).categorias[0].mataMata
    } else {
      t += minutosRestantesDaChave({
        vivas: c.vivas.length,
        pendentesNaRodada: c.daUltimaRodada.filter((m) => !isPlayed(m)).length,
        degrauAtual: c.daUltimaRodada[0] ? regras.degrauDe(c.daUltimaRodada[0]) : 3,
        teveSemi: c.duos.length >= 4,
        quadras: q,
        minutos,
      })
    }
    return { ci: c.ci, nome: c.cat.nome, minutos: c.terminou ? 0 : t }
  })
  return { minutos: Math.max(0, ...categorias.map((c) => c.minutos)), falta, categorias }
}

/**
 * Partidas do mata-mata que ainda nao existem (nem na fila): a chave inteira
 * se ela nao foi montada, senao o que falta dela. Cada partida elimina uma
 * dupla; a final leva junto o 3o lugar quando houve semifinal.
 */
function partidasPorMontar(session: PlaySession, c: ChaveDaCategoria): number {
  if (c.terminou) return 0
  if (!c.duos.length) {
    const meninas = c.cat.grupos.reduce((t, g) => t + (session.groups?.[g]?.length ?? 0), 0)
    const duplas = Math.min(Math.floor(meninas / 2), Math.max(2, session.duplas_mm ?? 8))
    return duplas >= 2 ? duplas - 1 + (duplas >= 4 ? 1 : 0) : 0
  }
  const pendentes = c.daUltimaRodada.filter((m) => !isPlayed(m)).length
  const terceiro = c.duos.length >= 4 && !c.daqui.some((m) => m.disputa_3o) ? 1 : 0
  return Math.max(0, c.vivas.length - 1 - pendentes) + terceiro
}

export type ResumoAoVivo = {
  jogadas: number
  /** Todas as partidas da noite, contando o mata-mata ainda nao montado. */
  total: number
  /** "fase de grupos" / "mata-mata", so nos formatos com fases. */
  fase: string | null
  /** Onde o mata-mata comeca na barra (0 a 1), so nos formatos com fases. */
  marca: number | null
  /** Partidas iniciadas e ainda sem placar. */
  jogando: number
  /** Minutos que faltam, a mesma conta da tela do play. */
  minutos: number
  /** A primeira partida que entrou em quadra (ou a 1a lancada), se houver hora. */
  comecouEm: string | null
}

/**
 * O resumo do cartao AO VIVO da tela inicial, com a conta da tela do play.
 * Aqui o "em quadra" e o do banco (`started_at`): o inicio guardado so no
 * celular de quem tocou nao chega a quem so olha.
 */
export function resumoAoVivo(session: PlaySession, todas: Match[]): ResumoAoVivo {
  const matches = todas
    .filter((m) => m.session_id === session.id)
    .sort((a, b) => a.round - b.round || a.court - b.court)
  const regras = regrasDoPlay(session, matches)
  const chaves = chavesDoPlay(session, matches, regras)
  const emJogo = matches.filter((m) => !isPlayed(m) && !!m.started_at)
  const emQuadra = new Map<number, Match>()
  for (const m of emJogo) if (!emQuadra.has(m.court)) emQuadra.set(m.court, m)
  const quadras = quadrasDaCategoriaAgora(session, chaves, emQuadra, regras.catDe)
  const r = restanteDaNoite(session, matches, regras, chaves, quadras)
  const comFases = session.format === 'grupos-duplas'
  const total = matches.length + (comFases ? chaves.reduce((t, c) => t + partidasPorMontar(session, c), 0) : 0)
  const noMataMata = chaves.filter((c) => c.doMataMata.length > 0).length
  const fase = !comFases
    ? null
    : noMataMata === 0
      ? 'fase de grupos'
      : noMataMata === chaves.length
        ? 'mata-mata'
        : 'grupos e mata-mata'
  const inicios = matches
    .map((m) => m.started_at ?? m.ended_at)
    .filter((x): x is string => !!x && Number.isFinite(Date.parse(x)))
    .sort()
  return {
    jogadas: matches.filter(isPlayed).length,
    total,
    fase,
    marca: comFases && total > 0 ? chaves.reduce((t, c) => t + c.daFase1.length, 0) / total : null,
    jogando: emJogo.length,
    minutos: r?.minutos ?? 0,
    comecouEm: inicios[0] ?? null,
  }
}
