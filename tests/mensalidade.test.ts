import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dividaDaMensalidade,
  emDiaNaData,
  faltaDaFicha,
  fichaDe,
  mesSugeridoDoCheckin,
  valorDaFicha,
} from '../src/lib/fichaDaMensalidade'
import { emptyData, type AppData, type ItemDaMensalidade, type Player } from '../src/lib/types'

/*
 * A MENSALIDADE NOVA (dono, 07/11/2026): 180 integral ou 80 + 4 check-ins (25 cada),
 * ciclo do dia 6 do mes anterior ao dia 5; regra nova a partir da de dezembro/2026.
 */
const bia = { id: 'bia', name: 'Bia', categoria: 'mensalista', pago_mes: '2026-11' } as Player

let n = 0
function item(mes: string, tipo: ItemDaMensalidade['tipo'], date: string, valor: number | null = null): ItemDaMensalidade {
  return { id: `i${n++}`, player_id: 'bia', mes, tipo, date, valor, conta_id: null, local_id: null, confirmado: true, observacao: null, created_at: date }
}
function dados(itens: ItemDaMensalidade[], p: Player = bia): AppData {
  const d = emptyData()
  d.players = [p]
  d.mensalidadeItens = itens
  return d
}
const quatro = (mes: string, dias: string[]) => dias.map((x) => item(mes, 'checkin', x))

test('ate novembro vale a regra antiga (pago_mes)', () => {
  const d = dados([])
  assert.equal(emDiaNaData(d, bia, '2026-11-09'), true)
  assert.equal(emDiaNaData(d, { ...bia, pago_mes: '2026-10' }, '2026-11-09'), false)
  assert.equal(emDiaNaData(d, { ...bia, pago_mes: '2026-10' }, '2026-11-02'), true) // prazo do dia 5
})

test('80 + 4 check-ins no ciclo: em dia o mes todo', () => {
  const d = dados([item('2026-12', 'dinheiro', '2026-11-20', 80), ...quatro('2026-12', ['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-04'])])
  const f = fichaDe(d, 'bia', '2026-12')
  assert.equal(valorDaFicha(f), 180)
  assert.equal(faltaDaFicha(f), 0)
  for (const dia of ['2026-12-01', '2026-12-07', '2026-12-28']) assert.equal(emDiaNaData(d, bia, dia), true, dia)
  assert.equal(dividaDaMensalidade(d, 'bia', '2026-12-28').total, 0)
})

test('integral 180 em dinheiro', () => {
  const d = dados([item('2026-12', 'dinheiro', '2026-12-03', 180)])
  assert.equal(emDiaNaData(d, bia, '2026-12-14'), true)
})

test('pagou 80 e so 2 check-ins: no prazo em dia; dia 6 vira avulsa com divida; quita e volta', () => {
  const base = [item('2026-12', 'dinheiro', '2026-11-20', 80), ...quatro('2026-12', ['2026-11-23', '2026-11-30'])]
  let d = dados(base)
  assert.equal(emDiaNaData(d, bia, '2026-12-01'), true) // novembro pago + dezembro iniciada, no prazo
  assert.equal(emDiaNaData(d, bia, '2026-12-07'), false)
  assert.deepEqual(dividaDaMensalidade(d, 'bia', '2026-12-07'), { total: 50, porMes: [{ mes: '2026-12', falta: 50 }] })
  // dia 10: mais um check-in e R$ 25 no lugar do outro
  d = dados([...base, item('2026-12', 'checkin', '2026-12-10'), item('2026-12', 'dinheiro', '2026-12-10', 25)])
  assert.equal(emDiaNaData(d, bia, '2026-12-07'), false) // o play do dia 7 continua avulso
  assert.equal(emDiaNaData(d, bia, '2026-12-14'), true)
  assert.equal(dividaDaMensalidade(d, 'bia', '2026-12-14').total, 0)
})

test('nao renovou: no prazo vale o mes anterior; dia 6 avulsa SEM divida', () => {
  const d = dados([item('2026-12', 'dinheiro', '2026-12-02', 180)])
  assert.equal(emDiaNaData(d, bia, '2027-01-04'), true)
  assert.equal(emDiaNaData(d, bia, '2027-01-11'), false)
  assert.equal(dividaDaMensalidade(d, 'bia', '2027-01-11').total, 0)
})

test('so check-in sem pagar nao inicia a mensalidade nem gera divida', () => {
  const d = dados(quatro('2026-12', ['2026-11-16', '2026-11-23']), { ...bia, pago_mes: '2026-10' })
  assert.equal(emDiaNaData(d, bia, '2026-12-07'), false)
  assert.equal(dividaDaMensalidade(d, 'bia', '2026-12-07').total, 0)
})

test('entrou depois do dia 5: joga o mes como avulsa e a mensalidade comeca no seguinte', () => {
  const nova = { ...bia, pago_mes: null }
  const d = dados([item('2027-01', 'dinheiro', '2026-12-10', 80)], nova)
  assert.equal(emDiaNaData(d, nova, '2026-12-14'), false)
  assert.equal(emDiaNaData(d, nova, '2027-01-04'), true) // iniciada, no prazo
  assert.equal(emDiaNaData(d, nova, '2027-01-11'), false) // faltam os check-ins
  assert.equal(dividaDaMensalidade(d, 'bia', '2027-01-11').total, 100)
})

test('comprovante com data antiga registrado depois conta pela data dele', () => {
  const d = dados([item('2026-12', 'dinheiro', '2026-12-03', 180)])
  assert.equal(emDiaNaData(d, bia, '2026-12-02'), true) // pelo prazo (novembro pago)
  assert.equal(emDiaNaData(dados([item('2026-12', 'dinheiro', '2026-12-09', 180)]), bia, '2026-12-07'), false)
})

test('quem nao e mensalista nunca esta em dia por aqui', () => {
  const avulsa = { ...bia, categoria: 'avulsa' }
  assert.equal(emDiaNaData(dados([item('2026-12', 'dinheiro', '2026-12-01', 180)], avulsa), avulsa, '2026-12-07'), false)
})

test('para qual mensalidade vai o check-in', () => {
  // ciclo: 20/11 vai para dezembro, 03/12 tambem, 08/12 ja e janeiro
  assert.equal(mesSugeridoDoCheckin(dados([]), 'bia', '2026-11-20'), '2026-12')
  assert.equal(mesSugeridoDoCheckin(dados([]), 'bia', '2026-12-03'), '2026-12')
  assert.equal(mesSugeridoDoCheckin(dados([]), 'bia', '2026-12-08'), '2027-01')
  // antes da regra nova, cai na primeira mensalidade dela
  assert.equal(mesSugeridoDoCheckin(dados([]), 'bia', '2026-10-20'), '2026-12')
  // com divida de dezembro, o check-in do dia 8 quita dezembro primeiro
  const devendo = dados([item('2026-12', 'dinheiro', '2026-11-20', 80), ...quatro('2026-12', ['2026-11-23'])])
  assert.equal(mesSugeridoDoCheckin(devendo, 'bia', '2026-12-08'), '2026-12')
  // dezembro cheio de check-ins: o proximo vai para janeiro
  const cheio = dados(quatro('2026-12', ['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-01']))
  assert.equal(mesSugeridoDoCheckin(cheio, 'bia', '2026-12-03'), '2027-01')
})
