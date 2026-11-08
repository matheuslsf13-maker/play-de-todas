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

test('renovou com 80: em dia o mes todo; check-ins ate o dia 5 do seguinte; faltando, vira divida e quita', () => {
  const base = [item('2026-12', 'dinheiro', '2026-11-20', 80), ...quatro('2026-12', ['2026-11-23', '2026-11-30'])]
  let d = dados(base)
  assert.equal(emDiaNaData(d, bia, '2026-12-01'), true)
  assert.equal(emDiaNaData(d, bia, '2026-12-07'), true, 'renovou: o mes todo em dia')
  assert.equal(dividaDaMensalidade(d, 'bia', '2026-12-28').total, 0, 'check-ins ate 05/01')
  // renovou janeiro, mas nao fechou os check-ins de dezembro ate 05/01
  d = dados([...base, item('2027-01', 'dinheiro', '2027-01-03', 80)])
  assert.equal(emDiaNaData(d, bia, '2027-01-04'), true, 'ainda no prazo dos check-ins')
  assert.equal(emDiaNaData(d, bia, '2027-01-07'), false)
  assert.deepEqual(dividaDaMensalidade(d, 'bia', '2027-01-07'), { total: 50, porMes: [{ mes: '2026-12', falta: 50 }] })
  // dia 10: mais um check-in e R$ 25 no lugar do outro, na mensalidade de dezembro
  d = dados([...base, item('2027-01', 'dinheiro', '2027-01-03', 80), item('2026-12', 'checkin', '2027-01-10'), item('2026-12', 'dinheiro', '2027-01-10', 25)])
  assert.equal(emDiaNaData(d, bia, '2027-01-07'), false, 'o play do dia 7 continua avulso')
  assert.equal(emDiaNaData(d, bia, '2027-01-14'), true)
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

test('nova mensalista no meio do mes: paga e ja comeca a mensalidade do mes', () => {
  const nova = { ...bia, pago_mes: null }
  const d = dados([item('2026-12', 'dinheiro', '2026-12-10', 80)], nova)
  assert.equal(emDiaNaData(d, nova, '2026-12-07'), false, 'antes de pagar, avulsa')
  assert.equal(emDiaNaData(d, nova, '2026-12-14'), true)
  assert.equal(dividaDaMensalidade(d, 'bia', '2026-12-28').total, 0)
  assert.equal(dividaDaMensalidade(d, 'bia', '2027-01-06').total, 100, 'os 4 check-ins tinham ate 05/01')
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
  assert.equal(mesSugeridoDoCheckin(dados([]), 'bia', '2026-11-20'), '2026-12', 'novembro conta para dezembro')
  assert.equal(mesSugeridoDoCheckin(dados([]), 'bia', '2026-12-08'), '2026-12')
  assert.equal(mesSugeridoDoCheckin(dados([]), 'bia', '2026-10-20'), '2026-12')
  // dezembro renovado e faltando: o check-in de 03/01 ainda fecha dezembro
  const devendo = dados([item('2026-12', 'dinheiro', '2026-11-20', 80), ...quatro('2026-12', ['2026-11-23'])])
  assert.equal(mesSugeridoDoCheckin(devendo, 'bia', '2027-01-03'), '2026-12')
  // dezembro cheio de check-ins: o proximo vai para janeiro
  const cheio = dados(quatro('2026-12', ['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-01']))
  assert.equal(mesSugeridoDoCheckin(cheio, 'bia', '2026-12-03'), '2027-01')
})

test('desde dezembro a mensalista que nao renovou paga o play como avulsa', async () => {
  const { confirmarPagamento, consumirAvulsos, desfazerPagamento, situacaoDoAtleta } = await import('../src/lib/mensalidade')
  const d = dados([], { ...bia, pago_mes: '2026-11' })
  assert.equal(situacaoDoAtleta(bia, d, '2026-12-07').liberado, false)
  const paga = confirmarPagamento(bia, '2026-12-07')
  assert.equal(paga.pago_avulso, true)
  assert.equal(paga.pago_mes, '2026-11', 'nao grava mes pago: a mensalidade e a ficha')
  assert.equal(situacaoDoAtleta(paga, d, '2026-12-07').liberado, true)
  assert.equal(desfazerPagamento(paga, '2026-12-07').pago_avulso, false)
  assert.deepEqual(consumirAvulsos(['bia'], { ...d, players: [paga] }).map((p) => p.pago_avulso), [false])
  // novembro segue como sempre
  assert.equal(confirmarPagamento({ ...bia, pago_mes: null }, '2026-11-09').pago_mes, '2026-11')
})

test('check-in da mensalidade de dezembro feito em novembro gasta a cota de novembro', async () => {
  const { disponibilidade } = await import('../src/lib/checkins')
  const d = dados([item('2026-12', 'checkin', '2026-11-09'), item('2026-12', 'checkin', '2026-11-16')].map((i) => ({ ...i, local_id: 'v3' })))
  d.checkinLocais = [{ id: 'v3', nome: 'V3', ativo: true, ordem: 1 }]
  const livres = (mes: string) => disponibilidade(d, 'bia', mes).porLocal.find((l) => l.local.id === 'v3')?.disponiveis
  assert.equal(livres('2026-11'), 10)
  assert.equal(livres('2026-12'), 12)
})

test('falta avisada: check-in a menos na que ela esta fechando; credito na do mes seguinte', async () => {
  const { mesDaCompensacao } = await import('../src/lib/fichaDaMensalidade')
  assert.equal(mesDaCompensacao(dados([]), 'bia', '2026-11-16', 'checkin'), '2026-12')
  assert.equal(mesDaCompensacao(dados([]), 'bia', '2026-11-16', 'credito'), '2026-12')
  const quitadaDez = dados([item('2026-12', 'dinheiro', '2026-11-10', 180)])
  assert.equal(mesDaCompensacao(quitadaDez, 'bia', '2026-11-16', 'credito'), '2027-01')
  assert.equal(mesDaCompensacao(quitadaDez, 'bia', '2026-12-07', 'checkin'), '2027-01', 'dezembro quitado')
  assert.equal(mesDaCompensacao(dados([]), 'bia', '2026-12-14', 'credito'), '2027-01')
})

test('pago sem renovar vira credito (nao divida); o Pix de quem deve quita a divida primeiro; o credito vai para a proxima', async () => {
  const { creditoDaMensalidade, dividirPix } = await import('../src/lib/fichaDaMensalidade')
  // pagou 50 de dezembro e nao completou: no dia 6 nao renovou, sem divida, com 50 de credito
  const parcial = dados([item('2026-12', 'dinheiro', '2026-12-03', 50)])
  assert.equal(dividaDaMensalidade(parcial, 'bia', '2026-12-06').total, 0)
  assert.equal(creditoDaMensalidade(parcial, 'bia', '2026-12-06').total, 50)
  assert.equal(emDiaNaData(parcial, bia, '2026-12-07'), false)
  // renovou dezembro com 2 check-ins: em 06/01 deve 50; o Pix de 80 quita os 50 e sobram 30 para janeiro
  const base = [item('2026-12', 'dinheiro', '2026-11-20', 80), ...quatro('2026-12', ['2026-11-23', '2026-11-30'])]
  const d = dados(base)
  assert.deepEqual(dividirPix(d, 'bia', '2027-01', 80, '2027-01-06').map((i) => [i.mes, i.valor]), [['2026-12', 50], ['2027-01', 30]])
  // os 30 nao renovam janeiro: viram credito no saldo dos plays a partir de 06/01
  const depois = dados([...base, item('2026-12', 'dinheiro', '2027-01-06', 50), item('2027-01', 'dinheiro', '2027-01-06', 30)])
  assert.equal(emDiaNaData(depois, bia, '2027-01-10'), false, '30 nao renovam')
  assert.equal(creditoDaMensalidade(depois, 'bia', '2027-02-06').total, 30)
})

test('credito do que pagou sem renovar: os avulsos descontam; na rematricula, so a diferenca', async (t) => {
  // o credito aparece depois do dia 5 pelo relogio de hoje: o teste vive em 03/01/2027
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-03T15:00:00Z') })
  const { creditoDisponivel, extratoDaAtleta } = await import('../src/lib/checkins')
  const { contaDaRenovacao } = await import('../src/lib/fichaDaMensalidade')
  // pagou 50 de dezembro e nao renovou; jogou um avulso de 30 em 14/12 sem pagar nada (usou o credito)
  const d = dados([item('2026-12', 'dinheiro', '2026-12-03', 50)])
  d.checkinDias = [{ id: 'dia', date: '2026-12-14', session_id: null, titulo: null, valor_cheio: 30, valor_com_checkin: 15, created_at: '' }]
  d.checkins = [{ id: 'c', dia_id: 'dia', player_id: 'bia', conta_id: null, local_id: null, modo: 'integral', compareceu: true, checkin_confirmado: false, created_at: '2026-12-14' }]
  d.checkinPagamentos = [{ checkin_id: 'c', valor_pago: 0, valor_devido: null, pagamento_confirmado: true, observacao: null }]
  const credito = creditoDisponivel(d, 'bia')
  assert.equal(credito, 20, '50 de credito - 30 do avulso')
  const avulso = extratoDaAtleta(d, 'bia').find((m) => m.tipo === 'lancamento')
  assert.equal(avulso?.tipo === 'lancamento' && avulso.creditoUsado, 30)
  // rematricula em janeiro: 20 do credito + cobrar 60 no Pix
  assert.deepEqual(contaDaRenovacao(fichaDe(d, 'bia', '2027-01'), credito, 0, '2027-01-03'), { usa: 20, cobrar: 60 })
  // com divida de 50 de outra mensalidade, cobra junto
  assert.deepEqual(contaDaRenovacao(fichaDe(d, 'bia', '2027-01'), credito, 50, '2027-01-03'), { usa: 20, cobrar: 110 })

})

test('dia 6: o credito cobre a divida dos check-ins sozinho (inteira se der, senao em parte)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-10T15:00:00Z') })
  const { creditoDisponivel } = await import('../src/lib/checkins')
  // renovou dezembro (80) e fez 2 check-ins: em 06/01 deve 50; renovou janeiro (80) no dia 03
  const base = [item('2026-12', 'dinheiro', '2026-12-02', 80), ...quatro('2026-12', ['2026-12-07', '2026-12-14']), item('2027-01', 'dinheiro', '2027-01-03', 80)]
  const comCredito = (valor: number) => {
    const d = dados(base)
    d.checkinAcertos = [{ id: 'a', player_id: 'bia', date: '2026-12-20', valor, dinheiro: true, descricao: 'pagou a mais', created_at: '' }]
    return d
  }
  // 60 de credito: cobre os 50, sobram 10; janeiro renovado -> em dia
  let d = comCredito(60)
  assert.equal(dividaDaMensalidade(d, 'bia', '2027-01-07').total, 0)
  assert.equal(creditoDisponivel(d, 'bia'), 10)
  assert.equal(emDiaNaData(d, bia, '2027-01-07'), true)
  // 30 de credito: a divida cai para 20, o credito zera; nao renovou (joga como avulsa)
  d = comCredito(30)
  assert.equal(dividaDaMensalidade(d, 'bia', '2027-01-07').total, 20)
  assert.equal(creditoDisponivel(d, 'bia'), 0)
  assert.equal(emDiaNaData(d, bia, '2027-01-07'), false)
  // sem credito: deve os 50, como antes
  assert.equal(dividaDaMensalidade(dados(base), 'bia', '2027-01-07').total, 50)
})

test('marcasDaMensalista: filtros da aba Mensalistas', async () => {
  const { marcasDaMensalista } = await import('../src/lib/fichaDaMensalidade')
  const base = { player_id: 'bia', mes: '2026-12', valor_cheio: 180, valor_checkin: 25, max_checkins: 4 }
  const pix = (v: number) => item('2026-12', 'dinheiro', '2026-12-03', v)
  assert.deepEqual(marcasDaMensalista({ ...base, itens: [] }, 0), ['sem-pagamento'])
  assert.deepEqual(marcasDaMensalista({ ...base, itens: [pix(180)] }, 0), ['quitada', 'integral'])
  assert.deepEqual(marcasDaMensalista({ ...base, itens: [pix(80)] }, 0), ['parcial', 'falta'])
  assert.deepEqual(marcasDaMensalista({ ...base, itens: [pix(80)] }, 50), ['parcial', 'falta', 'deve'])
})
