import test from 'node:test'
import assert from 'node:assert/strict'
import { problemasDaFila } from '../src/lib/arrumarGrupos'
import { filaPorGrupo, proximasPelaFila, type Noite } from '../src/lib/fila'
import { gerarFila, jogadorasDaPartida, pendentesPelaAtrasada, planToMatches } from '../src/lib/pairing'
import type { Match } from '../src/lib/types'

/*
 * A ATRASADA (02/11): a Ana Pretti atrasou num grupo de 6. Montado em
 * quartetos, a unica partida sem ela tirava tambem a parceira de par dela -- a
 * Wanessa esperou 1 hora enquanto as outras 4 emendavam 3. Com a atrasada
 * marcada, o rodizio do grupo gira as partidas sem ela entre TODAS as presentes.
 */
const nome = (i: number) => `Grupo ${i + 1}`

function semAtrasada(fila: { team_a: [string, string]; team_b: [string, string] }[], atrasada: string, presentes: string[]) {
  const sem = fila.filter((m) => !jogadorasDaPartida(m).includes(atrasada))
  return presentes.map((id) => sem.filter((m) => jogadorasDaPartida(m).includes(id)).length)
}

test('grupo de 6 com atrasada: ninguem presente fica de fora das partidas sem ela', () => {
  const ids = ['wan', 'dani', 'ana', 'col', 'cam', 'pretti']
  const ratings = new Map(ids.map((id, i) => [id, 1.5 + (i % 3) * 0.4]))
  const presentes = ids.filter((id) => id !== 'pretti')
  // o plano normal (quartetos): alguem fica com zero -- o defeito de 02/11
  const normal = semAtrasada(gerarFila({ playerIds: ids, ratings }), 'pretti', presentes)
  assert.ok(normal.includes(0), `o plano normal deixava alguem esperando: ${normal}`)
  // com a atrasada marcada: todas entram, e a fila continua sendo o rodizio certo
  const fila = gerarFila({ playerIds: ids, ratings, ausentes: new Set(['pretti']) })
  const agora = semAtrasada(fila, 'pretti', presentes)
  assert.ok(Math.min(...agora) >= 1, `todas as presentes jogam antes de ela chegar: ${agora}`)
  assert.deepEqual(problemasDaFila([ids], fila, nome), [])
})

for (const n of [5, 7, 8, 9, 10]) {
  test(`grupo de ${n} com atrasada: fila certa e as partidas sem ela giram entre todas`, () => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`)
    const ratings = new Map(ids.map((id, i) => [id, 1 + (i % 4) * 0.4]))
    const fila = gerarFila({ playerIds: ids, ratings, ausentes: new Set([ids[n - 1]]) })
    assert.deepEqual(problemasDaFila([ids], fila, nome), [])
    const v = semAtrasada(fila, ids[n - 1], ids.slice(0, -1))
    assert.ok(Math.min(...v) >= 1, `${v}`)
    assert.ok(Math.max(...v) - Math.min(...v) <= 2, `equilibrado: ${v}`)
  })
}

test('02/11 simulado: numa quadra, enquanto ela nao chega, ninguem espera todas as partidas', () => {
  const ids = ['wan', 'dani', 'ana', 'col', 'cam', 'pretti']
  const ratings = new Map(ids.map((id, i) => [id, 1.5 + (i % 3) * 0.4]))
  const esperaMaxima = (fila: ReturnType<typeof gerarFila>) => {
    let matches: Match[] = planToMatches('s', fila)
    const jogou = new Map(ids.map((id) => [id, 0]))
    // 3 partidas sem ela (o que da para jogar sem a atrasada no grupo de 6)
    for (let k = 0; k < 3; k++) {
      const n: Noite = { jogadoras: ids, grupos: [ids], matches, quadras: 1, ausentes: new Set(['pretti']) }
      const [[, m]] = [...proximasPelaFila(n, [1], undefined, filaPorGrupo(n))]
      assert.ok(!jogadorasDaPartida(m).includes('pretti'), 'a fila nao chama quem nao chegou')
      for (const id of jogadorasDaPartida(m)) jogou.set(id, (jogou.get(id) ?? 0) + 1)
      matches = matches.map((x) => (x.id === m.id ? { ...x, score_a: 4, score_b: 2, ended_at: new Date(k * 900000).toISOString() } : x))
    }
    return Math.min(...ids.filter((id) => id !== 'pretti').map((id) => jogou.get(id) ?? 0))
  }
  assert.equal(esperaMaxima(gerarFila({ playerIds: ids, ratings })), 0, 'antes: uma ficava sem jogar')
  assert.ok(esperaMaxima(gerarFila({ playerIds: ids, ratings, ausentes: new Set(['pretti']) })) >= 1, 'agora: todas jogam')
})

/*
 * D46 -- MARCADA DEPOIS DE O GRUPO COMECAR. So as pendentes mudam
 * (`pendentesPelaAtrasada`). Noites simuladas numa quadra: o grupo joga k
 * partidas, ela e marcada, joga-se sem ela ate ela chegar (depois de `chega`
 * partidas, ou quando nao houver mais partida sem ela) e a noite termina.
 */
type Medida = { espera: number; deFora: number; seguidas: number; seguidasDela: number; fase: number }

function noite(ids: string[], L: string, k: number, chega: number, refazer: boolean, semente: number): Medida {
  // o sorteio da ordem da fila com semente: antes e depois comparam a mesma noite
  const aleatorio = Math.random
  let x = 12345 + semente * 7919 + ids.indexOf(L) * 104729 + k * 31
  Math.random = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296)
  try {
    return noiteSemSorteio(ids, L, k, chega, refazer, semente)
  } finally {
    Math.random = aleatorio
  }
}

function noiteSemSorteio(ids: string[], L: string, k: number, chega: number, refazer: boolean, semente: number): Medida {
  const ratings = new Map(ids.map((id, i) => [id, 1.2 + ((i * 7 + semente) % 5) * 0.3]))
  let matches: Match[] = planToMatches('s', gerarFila({ playerIds: ids, ratings }))
  const total = matches.length
  const ordem: Match[] = []
  let t = 0
  const jogar = (ausentes: Set<string>) => {
    const n: Noite = { jogadoras: ids, grupos: [ids], matches, quadras: 1, ausentes }
    const m = proximasPelaFila(n, [1], undefined, filaPorGrupo(n)).get(1)
    if (!m) return false
    const fim = new Date(++t * 900000).toISOString()
    matches = matches.map((x) => (x.id === m.id ? { ...x, score_a: 4, score_b: 2, started_at: fim, ended_at: fim } : x))
    ordem.push(m)
    return true
  }
  for (let i = 0; i < k; i++) jogar(new Set())
  const ausentes = new Set([L])
  if (refazer) {
    const fixas = matches.filter((m) => m.ended_at)
    const pendentes = matches.filter((m) => !m.ended_at)
    const novas = pendentesPelaAtrasada({ ids, fixas, pendentes, ausentes, ratings })
    if (novas) {
      matches = [...fixas, ...planToMatches('s', novas.map((m) => ({ ...m, grupo: 0 }))).map((m, i) => ({ ...m, round: 100 + i }))]
      // invariantes: mesmo tamanho, todas com jogosDoRodizio, toda dupla, ninguem repetida na partida
      assert.equal(matches.length, total, 'a noite nao cresce')
      assert.deepEqual(problemasDaFila([ids], matches.map((m) => ({ team_a: m.team_a, team_b: m.team_b, grupo: 0 })), nome), [])
      for (const m of fixas) assert.ok(matches.includes(m), 'jogada nao muda')
    }
  }
  const inicioFase = ordem.length
  for (let i = 0; i < chega && jogar(ausentes); i++);
  const fase = ordem.slice(inicioFase)
  while (jogar(new Set()));
  assert.equal(ordem.length, total, 'a noite toda acontece')
  // a maior espera seguida de uma presente enquanto ela nao chega, e quem nao jogou
  // nenhuma numa fase em que daria para todas jogarem duas (fase curta, alguem sempre sobra)
  let espera = 0
  let deFora = 0
  for (const id of ids.filter((x) => x !== L)) {
    let run = 0
    let jogou = 0
    for (const m of fase) {
      if (jogadorasDaPartida(m).includes(id)) { run = 0; jogou++ } else espera = Math.max(espera, ++run)
    }
    if (fase.length * 4 >= (ids.length - 1) * 2 && jogou === 0) deFora++
  }
  // a maior sequencia de uma presente e a dela (que chega e tira o atraso)
  const maiorSequencia = (id: string) => {
    let run = 0
    let max = 0
    for (const m of ordem) max = Math.max(max, (run = jogadorasDaPartida(m).includes(id) ? run + 1 : 0))
    return max
  }
  const seguidas = Math.max(...ids.filter((x) => x !== L).map(maiorSequencia))
  return { espera, deFora, seguidas, seguidasDela: maiorSequencia(L), fase: fase.length }
}

const resumo: string[] = []
for (const n of [5, 6, 7, 8]) {
  test(`grupo de ${n}, atrasada marcada com o grupo ja comecado: ninguem presente fica esperando`, () => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`)
    for (const k of [1, 2, 3]) {
      const zero = () => ({ espera: 0, deFora: 0, seguidas: 0, seguidasDela: 0, tres: 0, maxEspera: 0 })
      const soma = { antes: zero(), depois: zero() }
      let noites = 0
      for (const L of ids) for (const chega of [1, 2, 99]) for (const semente of [0]) {
        noites++
        for (const [lado, refazer] of [['antes', false], ['depois', true]] as const) {
          const r = noite(ids, L, k, chega, refazer, semente)
          soma[lado].espera += r.espera
          soma[lado].maxEspera = Math.max(soma[lado].maxEspera, r.espera)
          soma[lado].deFora += r.deFora
          soma[lado].seguidas = Math.max(soma[lado].seguidas, r.seguidas)
          soma[lado].seguidasDela = Math.max(soma[lado].seguidasDela, r.seguidasDela)
          if (r.seguidas >= 3) soma[lado].tres++
        }
      }
      const a = soma.antes
      const d = soma.depois
      resumo.push(
        `n=${n} k=${k} (${noites} noites): espera media ${(a.espera / noites).toFixed(2)} -> ${(d.espera / noites).toFixed(2)}, ` +
          `pior ${a.maxEspera} -> ${d.maxEspera}, de fora da fase toda ${a.deFora} -> ${d.deFora}, maior sequencia das presentes ${a.seguidas} -> ${d.seguidas} (noites com presente emendando 3+: ${a.tres} -> ${d.tres}), dela ${a.seguidasDela} -> ${d.seguidasDela}`,
      )
      assert.ok(d.espera <= a.espera, `espera nao piora (n=${n} k=${k}): ${a.espera} -> ${d.espera}`)
      assert.ok(d.maxEspera <= a.maxEspera, `pior espera nao piora (n=${n} k=${k})`)
      assert.ok(d.deFora <= a.deFora, `ninguem a mais de fora (n=${n} k=${k})`)
      assert.ok(d.seguidas <= a.seguidas && d.seguidasDela <= a.seguidasDela, `ninguem emenda mais que antes (n=${n} k=${k})`)
    }
  })
}

test('02/11 depois de comecar: grupo de 6, ninguem presente fica de fora de todas sem a atrasada', () => {
  const ids = ['wan', 'dani', 'ana', 'col', 'cam', 'pretti']
  let pior = 0
  for (const k of [1, 2, 3]) for (const s of [0, 1, 2, 3, 4]) pior = Math.max(pior, noite(ids, 'pretti', k, 99, true, s).deFora)
  assert.equal(pior, 0)
})

test('sem atrasada ou sem melhora: nada muda', () => {
  const ids = Array.from({ length: 8 }, (_, i) => `p${i}`)
  const ratings = new Map(ids.map((id) => [id, 1.5]))
  const fila = planToMatches('s', gerarFila({ playerIds: ids, ratings }))
  assert.equal(pendentesPelaAtrasada({ ids, fixas: fila.slice(0, 2), pendentes: fila.slice(2), ausentes: new Set(), ratings }), null)
})

test('resumo D46', () => {
  console.log(resumo.join('\n'))
})
