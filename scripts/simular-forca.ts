/**
 * TEMPORADAS SIMULADAS para comparar regras da forca onde o historico real e
 * curto demais. Cada menina tem uma habilidade REAL (conhecida so aqui); os
 * grupos e a fila sao montados pelo proprio app com a forca do momento; o
 * placar sai da habilidade real (cada game: chance de Elo pela diferenca real,
 * ate 4). Tem faltas (frequentes e eventuais) e novatas chegando no meio.
 *
 *   node scripts/medir-forca.mjs --simular
 *
 * Mede, com a mesma semente para todas as regras:
 *   - correlacao entre a forca e a habilidade real no fim (1 = perfeita);
 *   - erro da NOVATA depois do 1o e do 2o play (|forca - real|, com as duas
 *     escalas centradas na media de quem joga) -- o "quanto ela se encaixou";
 *   - acerto da favorita nas partidas da temporada.
 */
import { formarGrupos, gerarFila, planToMatches } from '../src/lib/pairing'
import { calcularElo, REGRA_DA_FORCA, type RegraDaForca } from '../src/lib/stats'
import { emptyData, type AppData, type PlaySession } from '../src/lib/types'

function rng(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())

const SEMANAS = 16
function dataDa(semana: number) {
  const d = new Date(Date.UTC(2026, 10, 2 + 7 * semana))
  return d.toISOString().slice(0, 10)
}

type Resultado = { correl: number; novata1: number; novata2: number; acerto: number }

function temporada(semente: number, regra: RegraDaForca): Resultado {
  const r = rng(semente)
  Math.random = rng(semente * 7919)
  // 24 frequentes (vem 85%), 10 eventuais (40%), 8 novatas: 2 chegam nas semanas 3, 6, 9 e 12
  type Pessoa = { id: string; real: number; chance: number; chega: number }
  const pessoas: Pessoa[] = []
  for (let i = 0; i < 24; i++) pessoas.push({ id: `f${i}`, real: 1500 + normal(r) * 60, chance: 0.85, chega: 0 })
  for (let i = 0; i < 10; i++) pessoas.push({ id: `e${i}`, real: 1500 + normal(r) * 60, chance: 0.4, chega: 0 })
  for (let i = 0; i < 8; i++) pessoas.push({ id: `n${i}`, real: 1500 + normal(r) * 70, chance: 0.85, chega: 3 + 3 * Math.floor(i / 2) })
  const real = new Map(pessoas.map((p) => [p.id, p.real]))

  const d: AppData = emptyData()
  d.players = pessoas.map((p) => ({ id: p.id, name: p.id, photo_url: null, active: true, created_at: '' }) as never)
  const errosNovata: [number[], number[]] = [[], []]
  const playsDaNovata = new Map<string, number>()
  let acertos = 0
  let partidas = 0

  for (let semana = 0; semana < SEMANAS; semana++) {
    const vem = pessoas.filter((p) => semana >= p.chega && (semana === p.chega || r() < p.chance)).map((p) => p.id)
    if (vem.length < 8) continue
    const elo = calcularElo(d, undefined, undefined, regra)
    const ratings = new Map(vem.map((id) => [id, 2 + (elo.nota(id) - 1500) / 110]))
    const grupos = formarGrupos(vem, ratings, 8, semente * 31 + semana)
    const id = `s${semana}`
    const s: PlaySession = {
      id, date: dataDa(semana), title: id, courts: 3, rounds: 0, target: 4, player_ids: vem,
      status: 'finished', created_at: `${dataDa(semana)}T20:00:00Z`, format: 'grupos', groups: grupos, ranked: true,
    } as PlaySession
    const ms = planToMatches(id, gerarFila({ playerIds: vem, ratings, groups: grupos }))
    for (const m of ms) {
      const media = (ids: [string, string]) => ((real.get(ids[0]) as number) + (real.get(ids[1]) as number)) / 2
      const pg = 1 / (1 + Math.pow(10, (media(m.team_b) - media(m.team_a)) / 400))
      let ga = 0
      let gb = 0
      while (ga < 4 && gb < 4) if (r() < pg) ga++
      else gb++
      m.score_a = ga
      m.score_b = gb
      // a previsao com a forca de antes do play (aproximacao: notas do inicio da noite)
      const fa = (elo.nota(m.team_a[0]) + elo.nota(m.team_a[1])) / 2
      const fb = (elo.nota(m.team_b[0]) + elo.nota(m.team_b[1])) / 2
      if (fa !== fb) {
        partidas++
        if (fa > fb === ga > gb) acertos++
      }
    }
    d.sessions.push(s)
    d.matches.push(...ms)

    // como as novatas ficaram depois deste play (escalas centradas em quem joga)
    const depois = calcularElo(d, undefined, undefined, regra)
    const ativas = pessoas.filter((p) => semana >= p.chega).map((p) => p.id)
    const mediaNota = ativas.reduce((t, x) => t + depois.nota(x), 0) / ativas.length
    const mediaReal = ativas.reduce((t, x) => t + (real.get(x) as number), 0) / ativas.length
    for (const x of vem) {
      if (!x.startsWith('n')) continue
      const k = (playsDaNovata.get(x) ?? 0) + 1
      playsDaNovata.set(x, k)
      if (k <= 2) errosNovata[k - 1].push(Math.abs(depois.nota(x) - mediaNota - ((real.get(x) as number) - mediaReal)))
    }
  }

  const fim = calcularElo(d, undefined, undefined, regra)
  const jogou = pessoas.filter((p) => d.matches.some((m) => [...m.team_a, ...m.team_b].includes(p.id))).map((p) => p.id)
  const a = jogou.map((x) => fim.nota(x))
  const b = jogou.map((x) => real.get(x) as number)
  const media = (v: number[]) => v.reduce((t, x) => t + x, 0) / v.length
  const ma = media(a)
  const mb = media(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return {
    correl: num / Math.sqrt(da * db),
    novata1: media(errosNovata[0]),
    novata2: media(errosNovata[1]),
    acerto: acertos / partidas,
  }
}

export function simular(variantes: [string, RegraDaForca][], temporadas = 30) {
  console.log(`\n${temporadas} temporadas simuladas, ${SEMANAS} plays, grupos de 8, faltas e 8 novatas por temporada\n`)
  console.log('variante'.padEnd(34), 'correl fim'.padStart(10), 'novata 1o play'.padStart(15), '2o play'.padStart(8), 'acerto'.padStart(7))
  for (const [nome, regra] of variantes) {
    const rs = Array.from({ length: temporadas }, (_, i) => temporada(1000 + i, regra))
    const m = (f: (x: Resultado) => number) => rs.reduce((t, x) => t + f(x), 0) / rs.length
    console.log(
      nome.padEnd(34),
      m((x) => x.correl).toFixed(3).padStart(10),
      m((x) => x.novata1).toFixed(1).padStart(15),
      m((x) => x.novata2).toFixed(1).padStart(8),
      (100 * m((x) => x.acerto)).toFixed(1).padStart(7),
    )
  }
}

/** Duas regras temporada a temporada (mesmas sementes): a diferenca media e o erro dela. */
export function compararPar(a: [string, RegraDaForca], b: [string, RegraDaForca], temporadas = 40) {
  const difs = { correl: [] as number[], novata1: [] as number[], novata2: [] as number[] }
  for (let i = 0; i < temporadas; i++) {
    const x = temporada(2000 + i, a[1])
    const y = temporada(2000 + i, b[1])
    difs.correl.push(y.correl - x.correl)
    difs.novata1.push(y.novata1 - x.novata1)
    difs.novata2.push(y.novata2 - x.novata2)
  }
  const resumo = (v: number[]) => {
    const m = v.reduce((t, x) => t + x, 0) / v.length
    const dp = Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / (v.length - 1))
    return `${m >= 0 ? '+' : ''}${m.toFixed(3)} ± ${(1.96 * dp / Math.sqrt(v.length)).toFixed(3)}`
  }
  console.log(`
${b[0]} menos ${a[0]} (${temporadas} temporadas, 95%):`)
  console.log('  correlacao no fim:', resumo(difs.correl))
  console.log('  erro da novata no 1o play:', resumo(difs.novata1), '(negativo = melhor)')
  console.log('  erro da novata no 2o play:', resumo(difs.novata2))
}

export { REGRA_DA_FORCA }
