import test from 'node:test'
import assert from 'node:assert/strict'
import { diaDaLista, diaJaExiste, diaParaLigar, prepararPagamento, retrato, tipoNaLista, valorInicial } from '../src/lib/pagamentoNaLista'
import { emptyData, type AppData, type CheckinDia, type Player } from '../src/lib/types'
import { saldoDaAtleta } from '../src/lib/checkins'
import type { Lista } from '../src/lib/listaDePresenca'

/*
 * 💰 NA LISTA: grava o mesmo par checkin + pagamento da aba Check-ins. Aqui o
 * "gravar" faz o que as acoes da store fazem (upsert por id), na mesma ordem
 * que o componente: dia novo, lancamento, pagamento.
 */
const lista = { id: 'l', play_em: '2026-11-09T23:00:00Z', session_id: null, titulo: 'Play' } as Lista
const atleta = { id: 'a', categoria: 'avulsa' } as Player
const dados = (): AppData => ({ ...emptyData(), players: [atleta] })
function gravar(d: AppData, dia: CheckinDia, pago: number, modo: 'integral' | 'checkin' = 'integral'): AppData {
  const r = prepararPagamento(d, dia, atleta.id, modo, pago)
  return {
    ...d,
    checkinDias: diaJaExiste(d, dia) ? d.checkinDias : [...d.checkinDias, dia],
    checkins: [...d.checkins.filter((c) => c.id !== r.checkin.id), r.checkin],
    checkinPagamentos: [...d.checkinPagamentos.filter((p) => p.checkin_id !== r.checkin.id), r.pagamento],
  }
}

test('categoria: so a avulsa e cobrada; mensalista, convidada e isenta ficam de fora; sem cadastro pede vinculo', () => {
  assert.equal(tipoNaLista(undefined), 'vincular')
  for (const categoria of ['mensalista', 'convidada', 'isenta', 'avulsa']) assert.equal(tipoNaLista({ ...atleta, categoria }), categoria)
  assert.equal(tipoNaLista({ ...atleta, categoria: undefined }), 'mensalista') // sem categoria = mensalista (categoriaDe)
})

test('dia: sem dia, cria um novo com os valores do ultimo; reusa o da data; recusa dia ambiguo', () => {
  const d = dados()
  const novo = diaDaLista(d, lista)
  assert.equal(novo.date, '2026-11-09'); assert.equal(novo.valor_cheio, 50); assert.equal(novo.valor_com_checkin, 25)
  assert.equal(diaJaExiste(d, novo), false)
  d.checkinDias.push({ ...novo, id: 'velho', date: '2026-11-02', valor_cheio: 60, valor_com_checkin: 30 })
  assert.equal(diaDaLista(d, lista).valor_cheio, 60) // copia o ultimo dia, como o "Novo dia"
  d.checkinDias.push({ ...novo, id: 'existente' })
  assert.equal(diaDaLista(d, lista).id, 'existente')
  d.checkinDias.push({ ...novo, id: 'outro' })
  assert.throws(() => diaDaLista(d, lista), /mais de um dia/)
  // ligado ao play: vale o dia do play, mesmo com outros na data
  d.checkinDias.push({ ...novo, id: 'do-play', session_id: 's1' })
  assert.equal(diaDaLista(d, { ...lista, session_id: 's1' }).id, 'do-play')
})

test('dia criado antes do play: ao montar o play ele e ligado; nao liga se ja ha dia do play ou se e ambiguo', () => {
  let d = gravar(dados(), diaDaLista(dados(), lista), 50)
  assert.equal(d.checkinDias.length, 1)
  const ligado = diaParaLigar(d, lista, 's1')
  assert.equal(ligado?.session_id, 's1'); assert.equal(ligado?.id, d.checkinDias[0].id)
  d = { ...d, checkinDias: [ligado!] }
  assert.equal(diaParaLigar(d, lista, 's1'), null)
  d.checkinDias.push({ ...ligado!, id: 'x', session_id: null }, { ...ligado!, id: 'y', session_id: null })
  assert.equal(diaParaLigar(d, lista, 's2'), null)
})

test('pagou a mais vira credito; a menos vira divida; corrigir nao duplica', () => {
  const dia = diaDaLista(dados(), lista)
  let d = gravar(dados(), dia, 65)
  assert.equal(saldoDaAtleta(d, atleta.id).saldo, 15)
  const r = retrato(d, dia.id, atleta.id)!
  assert.equal(r.checkin.compareceu, true); assert.equal(r.pagamento?.pagamento_confirmado, true)
  assert.equal(r.checkin.checkin_confirmado, false); assert.equal(r.pagamento?.valor_devido, null)
  d = gravar(d, dia, 20, 'checkin')
  assert.equal(d.checkins.length, 1); assert.equal(d.checkinPagamentos.length, 1)
  assert.equal(retrato(d, dia.id, atleta.id)?.checkin.checkin_confirmado, true)
  assert.equal(saldoDaAtleta(d, atleta.id).saldo, -5)
})

test('valor sugerido: devido do dia menos o credito que ela trouxe; com lancamento, o que ja pagou', () => {
  const antigo: CheckinDia = { id: 'd0', date: '2026-11-02', session_id: null, titulo: null, valor_cheio: 50, valor_com_checkin: 25, created_at: '' }
  let d = gravar({ ...dados(), checkinDias: [antigo] }, antigo, 70) // 20 de credito
  const dia = diaDaLista(d, lista)
  assert.equal(valorInicial(d, dia, atleta.id, 'integral'), 30)
  assert.equal(valorInicial(d, dia, atleta.id, 'checkin'), 5)
  d = gravar(d, dia, 30)
  assert.equal(saldoDaAtleta(d, atleta.id).saldo, 0) // usou o credito inteiro
  assert.equal(valorInicial(d, dia, atleta.id, 'integral'), 30)
})

test('preco combinado e arena do lancamento existente sao mantidos; valor invalido e recusado', () => {
  const dia = diaDaLista(dados(), lista)
  let d = gravar(dados(), dia, 40)
  d.checkinPagamentos[0] = { ...d.checkinPagamentos[0], valor_devido: 40, observacao: 'combinado' }
  d = gravar(d, dia, 40)
  assert.equal(d.checkinPagamentos[0].observacao, 'combinado')
  assert.equal(saldoDaAtleta(d, atleta.id).saldo, 0)
  for (const valor of [-1, NaN, Infinity, 100000]) assert.throws(() => prepararPagamento(d, dia, atleta.id, 'integral', valor), /valor/)
})
