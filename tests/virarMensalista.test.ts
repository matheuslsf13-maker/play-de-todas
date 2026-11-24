import test from 'node:test'
import assert from 'node:assert/strict'
import {
  comecaNoMesSeguinte, contaDaRenovacao, creditoDaMensalidade, dividaDaMensalidade, emDiaNaData, fichaDe, mesSugeridoParaVirar, renovada,
} from '../src/lib/fichaDaMensalidade'
import { naoRenovaram, perdeuAVaga } from '../src/lib/vagasDeMensalista'
import { emptyData, type AppData, type ItemDaMensalidade, type Player } from '../src/lib/types'

/*
 * VIRAR MENSALISTA E RENOVACAO ATRASADA (dono, 24/11): ate o dia 5 a mensalidade do mes; depois a seguinte, ou a
 * do mes "atrasada". Dia 6 quem nao renovou vira avulsa (naoRenovaram), e volta pela janela "Virar mensalista".
 */
const bia = { id: 'bia', name: 'Bia', categoria: 'mensalista', active: true, pago_mes: null } as Player
let n = 0
const pix = (mes: string, date: string, valor: number): ItemDaMensalidade =>
  ({ id: `i${n++}`, player_id: 'bia', mes, tipo: 'dinheiro', date, valor, conta_id: null, local_id: null, confirmado: true, observacao: null, created_at: date })
function dados(itens: ItemDaMensalidade[], p: Player = bia): AppData {
  const d = emptyData()
  d.players = [p]
  d.mensalidadeItens = itens
  return d
}

test('mês sugerido: até o dia 5 o do mês, depois o seguinte', () => {
  assert.equal(mesSugeridoParaVirar('2026-12-05'), '2026-12')
  assert.equal(mesSugeridoParaVirar('2026-12-06'), '2027-01')
  assert.equal(mesSugeridoParaVirar('2026-12-31'), '2027-01')
})

test('dia 6 sem renovar: entra em naoRenovaram (vira avulsa); antes do dia 6 e em novembro, não', () => {
  const d = dados([])
  assert.deepEqual(naoRenovaram(d, '2026-12-06').map((p) => p.id), ['bia'])
  assert.equal(perdeuAVaga(d, bia, '2026-12-05'), false)
  assert.equal(perdeuAVaga(d, bia, '2026-11-24'), false)
})

test('renovação atrasada no dia 7: em dia a partir do Pix, sem dívida e sem perder a vaga', () => {
  const d = dados([pix('2026-12', '2026-12-07', 80)])
  assert.equal(emDiaNaData(d, bia, '2026-12-06'), false) // o play de antes do Pix segue avulso
  assert.equal(emDiaNaData(d, bia, '2026-12-14'), true)
  assert.equal(perdeuAVaga(d, bia, '2026-12-14'), false)
  assert.equal(dividaDaMensalidade(d, 'bia', '2026-12-14').total, 0)
})

test('mensalista a partir do mês seguinte: segura a vaga, joga este mês como avulsa', () => {
  const d = dados([pix('2027-01', '2026-12-07', 80)])
  assert.equal(emDiaNaData(d, bia, '2026-12-14'), false)
  assert.equal(comecaNoMesSeguinte(d, bia, '2026-12-14'), true)
  assert.equal(perdeuAVaga(d, bia, '2026-12-14'), false)
  assert.equal(emDiaNaData(d, bia, '2027-01-10'), true)
})

test('pagou parte antes do dia 5: no atraso cobra só o resto e o crédito daquele mês não conta duas vezes', () => {
  const d = dados([pix('2026-12', '2026-12-03', 50)])
  // dia 7: os 50 viraram credito no saldo (nao renovou); a janela tira o credito da propria ficha
  const doMes = creditoDaMensalidade(d, 'bia', '2026-12-07').porMes.find((c) => c.mes === '2026-12')?.valor ?? 0
  assert.equal(doMes, 50)
  const f = fichaDe(d, 'bia', '2026-12')
  assert.deepEqual(contaDaRenovacao(f, 50 - doMes, 0, '2026-12-07'), { usa: 0, cobrar: 30 })
  assert.deepEqual(contaDaRenovacao(f, 0, 0, '2026-12-07', 180), { usa: 0, cobrar: 130 })
  d.mensalidadeItens.push(pix('2026-12', '2026-12-07', 30))
  assert.equal(renovada(fichaDe(d, 'bia', '2026-12'), '2026-12-07'), true)
  assert.equal(creditoDaMensalidade(d, 'bia', '2026-12-07').total, 0) // o credito some: virou a renovacao
})
