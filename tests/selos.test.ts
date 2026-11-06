import test from 'node:test'
import assert from 'node:assert/strict'
import { selosDosPlays } from '../src/lib/selos'
import { calcularElo } from '../src/lib/stats'
import { emptyData, type AppData, type Match, type PlaySession } from '../src/lib/types'

/*
 * OS SELOS DA LISTA DE PLAYS: a forca do play (media da forca do DIA de quem
 * jogou) e no maximo um selo por play, o mais raro que ele detem agora.
 *
 * Nos cenarios cada play tem atletas proprias, com forca escolhida no cadastro:
 * assim a forca do dia de cada uma e exatamente essa (ninguem jogou antes).
 */
type Placar = [number, number, number?]

function play(
  d: AppData,
  id: string,
  date: string,
  forcas: number[],
  placares?: Placar[],
  extra: Partial<PlaySession> = {},
  ids: string[] = forcas.map((_, i) => `${id}-${i}`),
) {
  ids.forEach((pid, i) => {
    if (!d.players.some((p) => p.id === pid))
      d.players.push({ id: pid, name: pid, photo_url: null, active: true, created_at: '', forca_inicial: forcas[i] })
  })
  d.sessions.push({
    id, date, title: id, courts: 2, rounds: 0, target: 4, player_ids: ids,
    status: 'finished', created_at: `${date}T20:00:00Z`, format: 'todas', ...extra,
  })
  // cada partida pega as quatro seguintes da lista (dando a volta): todas jogam
  const lista = placares ?? Array.from({ length: Math.ceil(ids.length / 4) }, (): Placar => [4, 2])
  lista.forEach(([a, b, tie], k) => {
    const q = [0, 1, 2, 3].map((j) => ids[(4 * k + j) % ids.length])
    const m: Match = {
      id: `${id}-m${k}`, session_id: id, round: k + 1, court: 1,
      team_a: [q[0], q[1]], team_b: [q[2], q[3]], score_a: a, score_b: b, tie: tie ?? null,
    }
    d.matches.push(m)
  })
}

const seloDe = (d: AppData, id: string) => selosDosPlays(d).get(id)?.selo?.chave
const quatro = (f: number) => [f, f, f, f]
const oito = (f: number) => [...quatro(f), ...quatro(f)]

test('forca do play: a do DIA de quem jogou, e nao muda depois', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-05', [1400, 1500, 1600, 1700], [[4, 0], [4, 1]])
  // o app troca o `data` inteiro a cada mudanca (o resultado e guardado por ele): aqui, copias
  assert.equal(selosDosPlays({ ...d }).get('a')?.forca, 1550)

  // o 2o play, com as duas que venceram tudo no 1o e duas novas: a forca do dia
  // delas e a de depois do 1o (nem a do cadastro, nem a de hoje)
  const b = ['a-0', 'a-1', 'b-0', 'b-1']
  play(d, 'b', '2026-01-12', [0, 0, 1500, 1500], [[0, 4], [1, 4]], {}, b)
  const depoisDoA = calcularElo(d, '2026-01-05').nota
  const esperada = Math.round(b.reduce((t, id) => t + depoisDoA(id), 0) / 4)
  assert.ok(esperada > Math.round((1400 + 1500 + 1500 + 1500) / 4), 'subiram no 1o play')
  assert.equal(selosDosPlays({ ...d }).get('b')?.forca, esperada)
  // um play novo nao mexe no numero dos antigos (e a forca de hoje ja e outra)
  play(d, 'c', '2026-01-19', [], [[0, 4], [0, 4]], {}, b)
  const hoje = calcularElo(d).nota
  assert.notEqual(Math.round(b.reduce((t, id) => t + hoje(id), 0) / 4), esperada)
  assert.equal(selosDosPlays({ ...d }).get('a')?.forca, 1550)
  assert.equal(selosDosPlays({ ...d }).get('b')?.forca, esperada)
})

test('so quem jogou entra na media; play sem partida jogada nao tem forca', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-05', [1500, 1500, 1500, 1500, 2000]) // a 5a nao jogou (1 partida so)
  d.matches.splice(1) // fica so a 1a partida
  assert.equal(selosDosPlays(d).get('a')?.forca, 1500)
  play(d, 'b', '2026-01-12', quatro(1500), [])
  assert.equal(selosDosPlays(d).get('b'), undefined)
})

test('prioridade: o recorde esconde o "mais forte do mes", que nao vai para a 2a', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-05', oito(1600), [[4, 2], [4, 2], [4, 2]])
  play(d, 'b', '2026-01-12', quatro(1550))
  assert.equal(seloDe(d, 'a'), 'recorde-forca')
  assert.equal(seloDe(d, 'b'), undefined)
})

test('empate: o play mais antigo mantem; o novo precisa superar', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-05', quatro(1600))
  play(d, 'b', '2026-02-02', quatro(1600))
  assert.equal(seloDe(d, 'a'), 'recorde-forca')
  // em fevereiro ele e o mais forte do mes (o unico)
  assert.equal(seloDe(d, 'b'), 'forte-mes')
})

test('o selo muda de dono quando um play novo supera', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-05', quatro(1600))
  play(d, 'b', '2026-02-02', quatro(1600))
  play(d, 'c', '2026-03-02', quatro(1650))
  assert.equal(seloDe(d, 'c'), 'recorde-forca')
  // o "a" perdeu a forca, mas segue com o recorde de publico (empate: o mais antigo)
  assert.equal(seloDe(d, 'a'), 'recorde-publico')
  assert.equal(seloDe(d, 'b'), 'forte-mes')
})

test('mes = mes da data do play', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-31', quatro(1500))
  play(d, 'b', '2026-02-01', quatro(1450))
  play(d, 'c', '2026-01-10', quatro(1400))
  assert.equal(seloDe(d, 'c'), 'recorde-publico')
  assert.equal(seloDe(d, 'a'), 'recorde-forca')
  // janeiro foi do "a"; fevereiro comeca do zero
  assert.equal(seloDe(d, 'b'), 'forte-mes')
})

/** Um play grande e forte no comeco do mes, que leva tudo o que e de volume. */
function base(d: AppData, mes: string) {
  play(d, `base${mes}`, `2026-${mes}-02`, [...oito(1600), ...quatro(1600)], Array.from({ length: 6 }, (): Placar => [4, 2]))
}

test('zebra: so a partir da diferenca minima', () => {
  const pouca = emptyData()
  base(pouca, '01')
  play(pouca, 'z', '2026-01-09', [1485, 1485, 1515, 1515], [[4, 2]])
  assert.equal(seloDe(pouca, 'z'), undefined)

  const muita = emptyData()
  base(muita, '01')
  play(muita, 'z', '2026-01-09', [1470, 1470, 1530, 1530], [[4, 2]])
  assert.equal(seloDe(muita, 'z'), 'zebra')
  // a forca do dia de quem perdeu conta como a de quem perdeu (a dupla mais forte venceu: sem zebra)
  const favorita = emptyData()
  base(favorita, '01')
  play(favorita, 'z', '2026-01-09', [1470, 1470, 1530, 1530], [[2, 4]])
  assert.equal(seloDe(favorita, 'z'), undefined)
})

test('disputado: so com o minimo de partidas', () => {
  const cinco = emptyData()
  base(cinco, '01')
  play(cinco, 'p', '2026-01-09', quatro(1500), Array.from({ length: 5 }, (): Placar => [4, 3]))
  assert.equal(seloDe(cinco, 'p'), undefined)

  const seis = emptyData()
  base(seis, '01')
  play(seis, 'p', '2026-01-09', quatro(1500), Array.from({ length: 6 }, (): Placar => [4, 3]))
  assert.equal(seloDe(seis, 'p'), 'disputado')
})

test('noite dos ties: partidas decididas no tie (marcadas no placar)', () => {
  const d = emptyData()
  base(d, '01')
  play(d, 't', '2026-01-09', quatro(1500), [[5, 4, 5], [4, 2]])
  assert.equal(seloDe(d, 't'), 'ties')
})

test('estreias: minimo de 2 que estrearam no play', () => {
  for (const [novas, esperado] of [[1, undefined], [2, 'estreias']] as const) {
    const d = emptyData()
    base(d, '01')
    // fevereiro: um play so de veteranas (leva forca, casa cheia, maratona)...
    const veteranas = Array.from({ length: 12 }, (_, i) => `base01-${i}`)
    play(d, 'vet', '2026-02-02', [], Array.from({ length: 6 }, (): Placar => [4, 2]), {}, veteranas)
    // ...e um menor com novatas mais fracas, em que a dupla mais forte vence
    const ids = [...veteranas.slice(0, 4 - novas), ...Array.from({ length: novas }, (_, i) => `nova${i}`)]
    play(d, 'e', '2026-02-09', [...Array(4 - novas).fill(0), ...Array(novas).fill(1400)], [[4, 2]], {}, ids)
    assert.equal(seloDe(d, 'e'), esperado)
  }
})

test('casa cheia e maratona do mes', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-05', quatro(1700)) // recordes
  play(d, 'b', '2026-02-02', quatro(1600), [[4, 2], [4, 2], [4, 2]]) // forte de fevereiro, maratona
  play(d, 'c', '2026-02-09', oito(1500)) // mais gente
  assert.equal(seloDe(d, 'a'), 'recorde-forca')
  assert.equal(seloDe(d, 'b'), 'forte-mes')
  assert.equal(seloDe(d, 'c'), 'recorde-publico')
  const d2 = emptyData()
  play(d2, 'a', '2026-01-05', oito(1700))
  play(d2, 'b', '2026-02-02', quatro(1600))
  play(d2, 'c', '2026-02-09', oito(1500).slice(0, 6))
  play(d2, 'm', '2026-02-16', quatro(1500), [[4, 2], [4, 2], [4, 2]])
  assert.equal(seloDe(d2, 'c'), 'casa-cheia')
  assert.equal(seloDe(d2, 'm'), 'maratona')
})

test('noite da coroacao: alguem virou Duquesa no play', () => {
  const d = emptyData()
  play(d, 'w', '2026-10-01', oito(1700)) // os recordes ficam com este
  const ids = ['q0', 'q1', 'q2', 'q3']
  for (const id of ids) d.players.push({ id, name: id, photo_url: null, active: true, created_at: '', forca_inicial: 1500 })
  const datas = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']
  datas.forEach((date, k) => {
    // a q0 vence todas: ela sobe ao podio toda noite e vira Duquesa na 5a
    d.sessions.push({
      id: `s${k}`, date, title: date, courts: 1, rounds: 3, target: 4, player_ids: ids,
      status: 'finished', created_at: `${date}T20:00:00Z`, format: 'todas', criterio_dia: 'vitorias',
    })
    const duplas: [string, string][][] = [[['q0', 'q1'], ['q2', 'q3']], [['q0', 'q2'], ['q1', 'q3']], [['q0', 'q3'], ['q1', 'q2']]]
    duplas.forEach(([a, b], j) =>
      d.matches.push({ id: `s${k}-${j}`, session_id: `s${k}`, round: j + 1, court: 1, team_a: a, team_b: b, score_a: 4, score_b: 2 }),
    )
  })
  // o mais forte de novembro vem depois: a coroacao e mais rara que o "mais forte do mes"
  play(d, 'nov', '2026-11-10', quatro(1650))
  assert.equal(seloDe(d, 's4'), 'coroacao')
  assert.equal(seloDe(d, 'nov'), 'forte-mes')
})

test('avulso: tem forca, mas nao concorre a selo', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-05', quatro(1500))
  play(d, 'av', '2026-01-12', oito(1800), undefined, { ranked: false })
  assert.equal(selosDosPlays(d).get('av')?.forca, 1800)
  assert.equal(seloDe(d, 'av'), undefined)
  assert.equal(seloDe(d, 'a'), 'recorde-forca')
})

test('play em andamento nao entra', () => {
  const d = emptyData()
  play(d, 'a', '2026-01-05', quatro(1500))
  play(d, 'b', '2026-01-12', quatro(1600), undefined, { status: 'open' })
  assert.equal(selosDosPlays(d).get('b'), undefined)
  assert.equal(seloDe(d, 'a'), 'recorde-forca')
})
