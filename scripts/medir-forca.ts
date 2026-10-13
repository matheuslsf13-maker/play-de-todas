/**
 * O MEDIDOR DA FORCA: roda cada variacao da regra sobre o historico real e
 * mede quanto ela ACERTA antes de cada partida -- o "esperado" de cada partida
 * e calculado com as notas de ANTES dela, e comparado com o que aconteceu.
 *
 *   node scripts/medir-forca.mjs
 *
 * Le o banco pela chave publica (players, sessions e matches sao de leitura
 * publica). Nao grava nada.
 *
 *   acerto  = % das partidas em que a dupla favorita venceu
 *   erro    = raiz do erro quadratico entre a fatia de games esperada e a real
 *             (em pontos percentuais: 10 = errou ~10% dos games)
 *   ... nas partidas com novata (alguem com menos de 3 jogos) e nas firmes
 *       (as quatro com 3+ jogos)
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../src/config'
import { calcularElo, REGRA_DA_FORCA, type RegraDaForca } from '../src/lib/stats'
import { emptyData, type AppData } from '../src/lib/types'
import { compararPar, doElo, simular, type Motor } from './simular-forca'
import { forcaPeloHistorico, forcaPorEpoca } from '../src/lib/forcaHistorico'

async function ler(tabela: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!r.ok) throw new Error(`${tabela}: ${r.status} ${await r.text()}`)
  return r.json()
}

type Placar = { n: number; acertos: number; erro2: number }
const vazio = (): Placar => ({ n: 0, acertos: 0, erro2: 0 })
function somar(p: Placar, esperado: number, real: number) {
  p.n++
  if (esperado > 0.5 === real > 0.5) p.acertos++
  p.erro2 += (esperado - real) ** 2
}
const pct = (p: Placar) => (p.n ? ((100 * p.acertos) / p.n).toFixed(1) : '-')
const erro = (p: Placar) => (p.n ? (100 * Math.sqrt(p.erro2 / p.n)).toFixed(2) : '-')

function medir(d: AppData, regra: RegraDaForca) {
  const tudo = vazio()
  const novata = vazio()
  const firmes = vazio()
  calcularElo(d, undefined, undefined, {
    ...regra,
    aoPrever: ({ esperado, real, jogosAntes }) => {
      // 0,5 cravado e o caso sem informacao (todas estreando): fica fora do acerto
      if (Math.abs(esperado - 0.5) < 1e-9) return
      somar(tudo, esperado, real)
      if (jogosAntes.some((j) => j < 3)) somar(novata, esperado, real)
      else somar(firmes, esperado, real)
    },
  })
  return { tudo, novata, firmes }
}

const d = emptyData()
if (!process.argv.includes('--simular') && !process.argv.includes('--par')) {
  d.players = await ler('players')
  d.sessions = await ler('sessions')
  d.matches = await ler('matches')
}

const HOJE = REGRA_DA_FORCA
const CONFIANCA: RegraDaForca = { ...HOJE, confianca: 1, somaZero: false, aceleraDesde: null }
const variantes: [string, RegraDaForca][] = [
  ['1 hoje', HOJE],
  ['2 confianca', CONFIANCA],
  ['2b confianca c=0.5', { ...CONFIANCA, confianca: 0.5 }],
  ['2c confianca c=2', { ...CONFIANCA, confianca: 2 }],
  ['3 confianca + acelera', { ...CONFIANCA, aceleraDesde: '' }],
  ['4 confianca + falta desconfia 3', { ...CONFIANCA, faltaDesconfia: 3 }],
  ['5 confianca + novata na media', { ...CONFIANCA, novataNaMedia: true }],
  ['6 confianca + soma zero', { ...CONFIANCA, somaZero: true }],
  // calibragem, uma alavanca de cada vez em volta de hoje
  ['k 16', { ...HOJE, k: 16 }],
  ['k 32', { ...HOJE, k: 32 }],
  ['k 40', { ...HOJE, k: 40 }],
  ['escala 300', { ...HOJE, escala: 300 }],
  ['escala 500', { ...HOJE, escala: 500 }],
  ['forte pesa 0.6', { ...HOJE, pesoForte: 0.6 }],
  ['forte pesa 0.7', { ...HOJE, pesoForte: 0.7 }],
  ['vitoria pesa 0.25', { ...HOJE, pesoVitoria: 0.25 }],
  ['vitoria pesa 0.5', { ...HOJE, pesoVitoria: 0.5 }],
]

const json = process.argv.slice(2).find((x) => x.startsWith('['))
const extra = json ? (JSON.parse(json) as [string, Partial<RegraDaForca>][]) : []
for (const [nome, r] of extra) variantes.push([nome, { ...CONFIANCA, ...r }])

// os motores que nao sao Elo: a forca pelo historico inteiro, com algumas calibragens
const SEM_QUEDA: RegraDaForca = { ...HOJE, queda: false }
const motores: [string, Motor][] = [
  ...variantes.map(([n, r]) => [n, doElo(r)] as [string, Motor]),
  ['hoje sem queda', doElo(SEM_QUEDA)],
  ['hoje sem acelera', doElo({ ...HOJE, aceleraDesde: null })],
  ['antiga (soma zero, 1500 fixo)', doElo({ ...HOJE, somaZero: true, novataNaMedia: false })],
  ['glicko 60/35/10', doElo({ ...HOJE, glicko: { inicial: 60, minima: 35, porSemana: 10 } })],
  ['glicko 70/35/10', doElo({ ...HOJE, glicko: { inicial: 70, minima: 35, porSemana: 10 } })],
  ['glicko 60/35/0', doElo({ ...HOJE, glicko: { inicial: 60, minima: 35, porSemana: 0 } })],
  ['glicko 50/30/10', doElo({ ...HOJE, glicko: { inicial: 50, minima: 30, porSemana: 10 } })],
  ['peso pelos games', doElo({ ...HOJE, pesoPelosGames: true })],
  ['curva 1', doElo({ ...HOJE, curvaDeAprendizado: 1 })],
  ['curva 2', doElo({ ...HOJE, curvaDeAprendizado: 2 })],
  ['curva 3', doElo({ ...HOJE, curvaDeAprendizado: 3 })],
  ['glicko + curva 1', doElo({ ...HOJE, glicko: { inicial: 60, minima: 35, porSemana: 10 }, curvaDeAprendizado: 1 })],
  ['glicko + curva 2', doElo({ ...HOJE, glicko: { inicial: 60, minima: 35, porSemana: 10 }, curvaDeAprendizado: 2 })],
  ['glicko + epoca (media das duas)', (d) => {
    const a = doElo({ ...HOJE, glicko: { inicial: 60, minima: 35, porSemana: 10 } })(d)
    const b = forcaPorEpoca(d, { sigma: 60, deriva: 8 })
    return (id: string) => (a(id) + b(id)) / 2
  }],
  ['historico s60', (d) => forcaPeloHistorico(d, { sigma: 60, meiaVidaSemanas: null })],
  ['historico s40', (d) => forcaPeloHistorico(d, { sigma: 40, meiaVidaSemanas: null })],
  ['historico s90', (d) => forcaPeloHistorico(d, { sigma: 90, meiaVidaSemanas: null })],
  ['historico s60 meia-vida 26', (d) => forcaPeloHistorico(d, { sigma: 60, meiaVidaSemanas: 26 })],
  ['historico s60 meia-vida 10', (d) => forcaPeloHistorico(d, { sigma: 60, meiaVidaSemanas: 10 })],
  ['epoca s60 d8', (d) => forcaPorEpoca(d, { sigma: 60, deriva: 8 })],
  ['epoca s60 d15', (d) => forcaPorEpoca(d, { sigma: 60, deriva: 15 })],
  ['epoca s90 d8', (d) => forcaPorEpoca(d, { sigma: 90, deriva: 8 })],
  ['epoca s60 d4', (d) => forcaPorEpoca(d, { sigma: 60, deriva: 4 })],
]

if (process.argv.includes('--par')) {
  const nomes = process.argv.slice(2).filter((x) => !x.startsWith('-') && !x.startsWith('['))
  const achar = (n: string) => motores.find(([v]) => v === n) as [string, Motor]
  compararPar(achar(nomes[0]), achar(nomes[1]))
  process.exit(0)
}
if (process.argv.includes('--simular')) {
  const pedidas = process.argv.slice(2).filter((x) => !x.startsWith('-') && !x.startsWith('['))
  const escolhidas = pedidas.length ? motores.filter(([n]) => pedidas.includes(n)) : motores.filter(([n]) => /^1 |^hoje|^historico|^epoca|^glicko|^peso|^curva/.test(n))
  simular(escolhidas)
  process.exit(0)
}

/**
 * Para comparar motores que nao sao Elo: a forca de cada play sai SO do que veio
 * antes dele (foto da noite), e as partidas daquele play sao a prova.
 */
function medirPorPlay(d: AppData, motor: Motor) {
  const tudo = vazio()
  const plays = [...d.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
  const jogos = new Map<string, number>()
  for (let i = 0; i < plays.length; i++) {
    const antes = new Set(plays.slice(0, i).map((s) => s.id))
    const nota = motor({ ...d, sessions: plays.slice(0, i), matches: d.matches.filter((m) => antes.has(m.session_id)) })
    for (const m of d.matches.filter((x) => x.session_id === plays[i].id && x.score_a !== null && x.score_b !== null)) {
      const ga = m.score_a as number
      const gb = m.score_b as number
      if (ga + gb === 0) continue
      const fa = (nota(m.team_a[0]) + nota(m.team_a[1])) / 2
      const fb = (nota(m.team_b[0]) + nota(m.team_b[1])) / 2
      if (Math.abs(fa - fb) > 1e-9) somar(tudo, 1 / (1 + Math.pow(10, (fb - fa) / 400)), ga / (ga + gb))
      for (const id of [...m.team_a, ...m.team_b]) jogos.set(id, (jogos.get(id) ?? 0) + 1)
    }
  }
  return tudo
}

if (process.argv.includes('--por-play')) {
  console.log('foto antes de cada play (historico real):')
  for (const [nome, motor] of motores.filter(([n]) => /^1 |^hoje|^historico|^epoca|^glicko|^peso|^curva/.test(n))) {
    const t = medirPorPlay(d, motor)
    console.log(nome.padEnd(34), String(t.n).padStart(4), pct(t).padStart(7), erro(t).padStart(6))
  }
  process.exit(0)
}

console.log(`${d.sessions.length} plays, ${d.matches.filter((m) => m.score_a !== null).length} partidas, ${d.players.length} jogadoras\n`)
console.log('variante'.padEnd(34), 'n'.padStart(4), 'acerto'.padStart(7), 'erro'.padStart(6), '| novata: n  acerto  erro | firmes: n  acerto  erro')
for (const [nome, r] of variantes) {
  const { tudo, novata, firmes } = medir(d, r)
  console.log(
    nome.padEnd(34), String(tudo.n).padStart(4), pct(tudo).padStart(7), erro(tudo).padStart(6),
    '|', String(novata.n).padStart(9), pct(novata).padStart(7), erro(novata).padStart(5),
    '|', String(firmes.n).padStart(9), pct(firmes).padStart(7), erro(firmes).padStart(5),
  )
}
