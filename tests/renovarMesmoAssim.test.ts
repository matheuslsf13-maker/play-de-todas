import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alertaDosCheckins,
  dividaDaMensalidade,
  dividirPix,
  emDiaNaData,
  faltaDaFicha,
  fichaDe,
  idDaFaltaPassada,
  pendenteDaAnterior,
  renovada,
} from '../src/lib/fichaDaMensalidade'
import { checkinJaFeito, creditosDeCheckin } from '../src/lib/checkins'
import { emptyData, type AppData, type Checkin, type ItemDaMensalidade, type Player } from '../src/lib/types'

/* RENOVAR MESMO ASSIM, QUITAR PRIMEIRO, ALERTA DOS CHECK-INS E A TRAVA DE UM CHECK-IN POR DIA (dono, 18/11/2026) */
const bia = { id: 'bia', name: 'Bia', categoria: 'mensalista', active: true } as Player
let n = 0
const item = (mes: string, tipo: ItemDaMensalidade['tipo'], date: string, valor: number | null = null, id = `i${n++}`): ItemDaMensalidade =>
  ({ id, player_id: 'bia', mes, tipo, date, valor, conta_id: null, local_id: 'v3', confirmado: true, observacao: null, created_at: date })
function dados(itens: ItemDaMensalidade[]): AppData {
  const d = emptyData()
  d.players = [bia]
  d.mensalidadeItens = itens
  return d
}
// dezembro renovado com 3 dos 4 check-ins: falta 1
const dezembro = [item('2026-12', 'dinheiro', '2026-11-20', 80), ...['2026-11-23', '2026-11-30', '2026-12-07'].map((x) => item('2026-12', 'checkin', x))]

test('falta 1 check-in de dezembro no dia 3 de janeiro: pendente, ainda nao e divida', () => {
  const d = dados(dezembro)
  assert.deepEqual(pendenteDaAnterior(d, 'bia', '2027-01', '2027-01-03'), [{ mes: '2026-12', falta: 25, checkins: 1 }])
  assert.equal(dividaDaMensalidade(d, 'bia', '2027-01-03').total, 0)
  assert.deepEqual(pendenteDaAnterior(d, 'bia', '2027-01', '2027-01-06'), [], 'depois do prazo e divida, nao pendente')
})

test('renovar e passar a falta para janeiro: dezembro fecha, janeiro com 5 check-ins, sem divida', () => {
  const passou = { ...item('2026-12', 'abatimento', '2027-01-03', 25, idDaFaltaPassada('bia', '2026-12', '2027-01')), observacao: 'falta passada para janeiro' }
  const d = dados([...dezembro, passou, item('2027-01', 'dinheiro', '2027-01-03', 80)])
  assert.equal(faltaDaFicha(fichaDe(d, 'bia', '2026-12')), 0)
  const jan = fichaDe(d, 'bia', '2027-01')
  assert.equal(jan.max_checkins, 5)
  assert.equal(jan.valor_cheio, 205)
  assert.equal(renovada(jan), true, 'os 80 ainda renovam')
  assert.equal(faltaDaFicha(jan), 125, '5 check-ins')
  assert.equal(emDiaNaData(d, bia, '2027-01-12'), true, 'nao e devedora')
  assert.equal(dividaDaMensalidade(d, 'bia', '2027-01-12').total, 0)
  // nao fechou janeiro ate 05/02: a divida e de janeiro, com tudo
  assert.equal(dividaDaMensalidade(d, 'bia', '2027-02-06').total, 125)
  // apagar o abatimento desfaz
  const sem = dados([...dezembro, item('2027-01', 'dinheiro', '2027-01-03', 80)])
  assert.equal(fichaDe(sem, 'bia', '2027-01').max_checkins, 4)
})

test('falta quebrada (R$ 15): passa 1 check-in e os 10 ja pagos viram abatimento na nova', () => {
  const quebrada = [...dezembro, item('2026-12', 'dinheiro', '2026-12-20', 10)]
  const passou = item('2026-12', 'abatimento', '2027-01-03', 15, idDaFaltaPassada('bia', '2026-12', '2027-01'))
  const d = dados([...quebrada, passou, item('2027-01', 'dinheiro', '2027-01-03', 80)])
  assert.equal(faltaDaFicha(fichaDe(d, 'bia', '2027-01')), 115, '205 - 80 - 10')
})

test('quitar primeiro: o Pix de 105 completa dezembro e renova janeiro', () => {
  const d = dados(dezembro)
  assert.deepEqual(dividirPix(d, 'bia', '2027-01', 105, '2027-01-03', true).map((p) => [p.mes, p.valor]), [['2026-12', 25], ['2027-01', 80]])
  assert.deepEqual(dividirPix(d, 'bia', '2027-01', 105, '2027-01-03').map((p) => [p.mes, p.valor]), [['2027-01', 105]], 'sem a opcao, como antes')
})

test('alerta: faltam 3 check-ins e 4 dias ate o prazo', () => {
  const um = [item('2026-12', 'dinheiro', '2026-11-20', 80), item('2026-12', 'checkin', '2026-11-23')]
  const d = dados(um)
  assert.equal(alertaDosCheckins(d, 'bia', '2027-01-01'), null, '5 dias para 3: ainda folga')
  assert.deepEqual(alertaDosCheckins(d, 'bia', '2027-01-02'), { mes: '2026-12', checkins: 3, dias: 4, falta: 75 })
  assert.equal(alertaDosCheckins(d, 'bia', '2027-01-06'), null, 'passou o prazo: virou divida')
  assert.equal(alertaDosCheckins(dados([item('2026-12', 'checkin', '2026-11-23')]), 'bia', '2027-01-04'), null, 'sem renovar nao alerta')
})

test('um check-in por conta por dia: ficha, play e o check-in de credito', () => {
  const d = dados([item('2026-12', 'checkin', '2026-12-10')])
  d.checkinDias = [{ id: 'd1', date: '2026-12-14', session_id: null, titulo: null, valor_cheio: 50, valor_com_checkin: 25, created_at: '' }]
  const naoVeio = { id: 'c1', dia_id: 'd1', player_id: 'bia', conta_id: null, local_id: 'v3', modo: 'checkin', compareceu: false, credito_checkin: true, checkin_confirmado: true } as Checkin
  d.checkins = [naoVeio]
  d.checkinContas = [{ id: 'outra', player_id: 'bia', principal: false, nome: 'Marido' } as AppData['checkinContas'][number]]
  assert.match(checkinJaFeito(d, 'bia', null, '2026-12-10')!.texto, /mensalidade/)
  assert.equal(checkinJaFeito(d, 'bia', 'outra', '2026-12-10'), null, 'outra conta pode')
  assert.equal(checkinJaFeito(d, 'bia', null, '2026-12-14')!.credito?.id, 'c1', 'oferece usar o credito')
  // usado para pagar a divida: some dos creditos e a trava diz que ja foi gasto
  d.checkinAcertos = [{ id: 'divida:x:0', player_id: 'bia', date: '2026-12-20', valor: 25, dinheiro: false, descricao: '', created_at: '', credito_de: 'c1' }]
  assert.equal(creditosDeCheckin(d, 'bia').length, 0)
  assert.equal(checkinJaFeito(d, 'bia', null, '2026-12-14')!.credito, undefined)
})

test('pagar dividas no 💰: check-in vai primeiro para a mensalidade, o resto para a divida do play', async () => {
  const { pagarDividas } = await import('../src/lib/pagamentoNaLista')
  // dezembro renovado, faltou 1 check-in; passou o prazo (06/01): deve 25 da mensalidade
  const d = dados(dezembro)
  const linhas = [
    { date: '2027-01-07', contaId: null, localId: 'v3' },
    { date: '2027-01-08', contaId: null, localId: 'v3' },
    { date: '2026-12-14', contaId: null, localId: null, credito: 'c9' },
  ]
  const r = pagarDividas(d, 'bia', 'L', '2027-01-11', linhas, 25, 0)
  assert.deepEqual(r.itens.map((i) => [i.mes, i.tipo, i.date]), [['2026-12', 'checkin', '2027-01-07']])
  assert.deepEqual(r.acertos.map((a) => [a.valor, a.local_id, a.credito_de]), [[25, 'v3', null], [25, null, 'c9']])
  assert.ok([...r.itens, ...r.acertos].every((x) => x.id.startsWith('divida:L:')))
  // dinheiro acima do play paga a mensalidade e para no que falta
  const p = pagarDividas(d, 'bia', 'L', '2027-01-11', [], 25, 40)
  assert.deepEqual(p.itens.map((i) => [i.tipo, i.valor]), [['dinheiro', 25]])
})
