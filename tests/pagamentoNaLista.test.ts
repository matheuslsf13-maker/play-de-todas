import test from 'node:test'
import assert from 'node:assert/strict'
import { diaDaLista, prepararPagamento, aplicarPagamento, tipoNaLista, retrato } from '../src/lib/pagamentoNaLista'
import { emptyData, type Player } from '../src/lib/types'
import { saldoDaAtleta } from '../src/lib/checkins'
import type { Lista } from '../src/lib/listaDePresenca'
const lista = { id: 'l', play_em: '2026-11-09T23:00:00Z', session_id: null, titulo: 'Play' } as Lista
const atleta = { id: 'a', categoria: 'avulsa' } as Player
const dados = () => ({ ...emptyData(), players: [atleta] })
test('pagamento: categoria e vinculo; mensalista nao vira avulsa por atraso', () => {
  assert.equal(tipoNaLista(undefined), 'vincular')
  for (const categoria of ['mensalista', 'convidada', 'isenta', 'avulsa']) assert.equal(tipoNaLista({ ...atleta, categoria }), categoria)
})
test('dia: reutiliza vinculo ou data unica; nao escolhe treino nem dia ambiguo', () => {
  const d = dados(); const dia = diaDaLista(d, lista)
  assert.equal(dia.date, '2026-11-09'); assert.equal(dia.valor_cheio, 50)
  d.checkinDias.push({ ...dia, id: 'antigo', valor_cheio: 60 })
  assert.equal(diaDaLista(d, lista).id, 'antigo')
  d.checkinDias.push({ ...dia, id: 'outro' })
  assert.throws(() => diaDaLista(d, lista), /mais de um dia/)
})
test('pagamento: palpite exige conta real; valor pago nao altera devido; edita e desfaz sem duplicar', () => {
  let d = dados(); const dia = diaDaLista(d, lista)
  const novo = prepararPagamento(d, dia, atleta.id, 'integral', 65)
  assert.equal(novo.checkin.checkin_confirmado, false)
  assert.equal(novo.pagamento.valor_devido, null)
  d = aplicarPagamento(d, dia, null, novo)
  assert.equal(saldoDaAtleta(d, atleta.id).saldo, 15)
  const editado = prepararPagamento(d, dia, atleta.id, 'checkin', 20)
  assert.equal(editado.checkin.id, novo.checkin.id)
  assert.equal(editado.checkin.checkin_confirmado, true)
  d = aplicarPagamento(d, dia, retrato(d, dia.id, atleta.id), editado)
  assert.equal(d.checkins.length, 1); assert.equal(saldoDaAtleta(d, atleta.id).saldo, -5)
  d = aplicarPagamento(d, dia, editado, novo)
  assert.equal(saldoDaAtleta(d, atleta.id).saldo, 15)
  d = aplicarPagamento(d, dia, novo, null)
  assert.equal(d.checkins.length, 0); assert.equal(d.checkinPagamentos.length, 0)
})
test('pagamento: dois celulares, repeticao e desfazer antigo nao sobrescrevem', () => {
  const d = dados(); const dia = diaDaLista(d, lista)
  const a = prepararPagamento(d, dia, atleta.id, 'integral', 50)
  const atual = aplicarPagamento(d, dia, null, a)
  assert.throws(() => aplicarPagamento(atual, dia, null, a), /outro aparelho/)
  const b = prepararPagamento(atual, dia, atleta.id, 'integral', 60)
  const corrigido = aplicarPagamento(atual, dia, a, b)
  assert.throws(() => aplicarPagamento(corrigido, dia, a, null), /outro aparelho/)
  for (const valor of [-1, NaN, Infinity, 100000000]) assert.throws(() => prepararPagamento(d, dia, atleta.id, 'integral', valor), /valor/)
})
