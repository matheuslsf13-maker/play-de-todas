import test from 'node:test'
import assert from 'node:assert/strict'
import { pagoAvulsoDaLista } from '../src/lib/pagamentoNaLista'
import { consumirAvulsos, situacaoDoAtleta } from '../src/lib/mensalidade'
import { contaInicial, diaDaLista, diaJaExiste, diaParaLigar, prepararPagamento, retrato, tipoNaLista, valorInicial } from '../src/lib/pagamentoNaLista'
import { emptyData, type AppData, type CheckinConta, type CheckinDia, type CheckinLocal, type Player } from '../src/lib/types'
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

test('categoria: avulsa e cobrada; convidada e isenta nao; sem cadastro pede vinculo', () => {
  assert.equal(tipoNaLista(undefined, lista), 'vincular')
  for (const categoria of ['convidada', 'isenta', 'avulsa']) assert.equal(tipoNaLista({ ...atleta, categoria }, lista), categoria)
})

test('mensalista: em dia nao e cobrada; atrasada depois do dia 5 e cobrada como avulsa', () => {
  const m = (pago_mes: string | null) => ({ ...atleta, categoria: 'mensalista', pago_mes }) as Player
  // play 09/11 (depois do dia 5)
  assert.equal(tipoNaLista(m('2026-11'), lista), 'mensalista')
  assert.equal(tipoNaLista(m('2026-10'), lista), 'mensalista-atrasada')
  assert.equal(tipoNaLista(m(null), lista), 'mensalista-atrasada')
  // play 02/11 (ate o dia 5): com outubro pago ainda esta no prazo
  const cedo = { ...lista, play_em: '2026-11-02T23:00:00Z' }
  assert.equal(tipoNaLista(m('2026-10'), cedo), 'mensalista')
  assert.equal(tipoNaLista(m('2026-09'), cedo), 'mensalista-atrasada')
  // atrasada paga o play, nao o mes: o 💰 nao mexe no cadastro dela
  assert.equal(pagoAvulsoDaLista(dados(), lista, m('2026-10'), true), null)
})

test('pago da avulsa em Meninas: marca ao lancar, desmarca ao desfazer; finalizar gasta o credito', () => {
  const d = dados()
  const marcada = pagoAvulsoDaLista(d, lista, atleta, true)!
  assert.equal(marcada.pago_avulso, true)
  assert.equal(situacaoDoAtleta(marcada, d).rotulo, 'Avulsa paga (vale 1 play)')
  assert.equal(pagoAvulsoDaLista(d, lista, marcada, true), null) // ja marcada: nada a gravar
  assert.equal(pagoAvulsoDaLista(d, lista, marcada, false)?.pago_avulso, false) // desfazer
  // o play da lista foi finalizado: o credito e gasto como sempre e o 💰 nao devolve nem tira credito depois
  const play = { id: 's1', status: 'finished', player_ids: [atleta.id] } as AppData['sessions'][number]
  const depois = { ...d, players: [marcada], sessions: [play] }
  const gastas = consumirAvulsos([atleta.id], depois)
  assert.equal(gastas[0].pago_avulso, false)
  assert.equal(situacaoDoAtleta(gastas[0], depois).rotulo, 'Avulsa a pagar')
  const ligada = { ...lista, session_id: 's1' }
  assert.equal(pagoAvulsoDaLista(depois, ligada, gastas[0], true), null)
  assert.equal(pagoAvulsoDaLista(depois, ligada, marcada, false), null)
  const reaberto = { ...depois, sessions: [{ ...play, status: 'open', eventos: [{ tipo: 'reabrir' }] } as unknown as AppData['sessions'][number]] }
  assert.equal(pagoAvulsoDaLista(reaberto, ligada, gastas[0], true), null) // o 2o Finalizar nao gastaria
})

test('desfazer e pagar de novo: reusa o dia que ficou vazio, sem criar outro', () => {
  const dia = diaDaLista(dados(), lista)
  let d = gravar(dados(), dia, 50)
  d = { ...d, checkins: [], checkinPagamentos: [] } // desfazer: apaga o lancamento, o dia fica
  assert.equal(d.checkinDias.length, 1)
  const outra = diaDaLista(d, lista)
  assert.equal(outra.id, dia.id); assert.equal(diaJaExiste(d, outra), true) // sem aviso de "dia novo"
  d = gravar(d, outra, 50)
  assert.equal(d.checkinDias.length, 1); assert.equal(d.checkins.length, 1)
  assert.equal(saldoDaAtleta(d, atleta.id).saldo, 0)
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

/* a conta do check-in: a mesma escolha (e o mesmo palpite) do Lancar da aba Check-ins */
const arena = (id: string, ordem: number) => ({ id, nome: id.toUpperCase(), ativo: true, ordem, afiliacao: null }) as CheckinLocal
const conta = (id: string, extra: Partial<CheckinConta> = {}): CheckinConta => ({ id, player_id: atleta.id, nome: id, principal: false, tipo: 'wellhub',
  aulas_semana: null, plano_id: null, aulas: [], local_padrao_id: null, ativo: true, created_at: '', ...extra })
const comContas = (): AppData => ({ ...dados(), checkinLocais: [arena('v3', 1), arena('gw', 2)] })

test('conta: sem contas gravadas, palpite = principal (conta nula) na 1a arena', () => {
  const d = comContas(); const dia = diaDaLista(d, lista)
  assert.deepEqual(contaInicial(d, dia, atleta.id), { contaId: null, localId: 'v3' })
  const r = prepararPagamento(d, dia, atleta.id, 'checkin', 25)
  assert.equal(r.checkin.conta_id, null); assert.equal(r.checkin.local_id, 'v3'); assert.equal(r.checkin.checkin_confirmado, true)
})

test('conta: arena padrao entra no palpite; a escolhida (conta do marido) e gravada; integral nao tem arena', () => {
  const d = comContas()
  d.checkinContas.push(conta('principal:a', { principal: true, nome: '', local_padrao_id: 'gw' }), conta('marido', { nome: 'Joao' }))
  const dia = diaDaLista(d, lista)
  assert.deepEqual(contaInicial(d, dia, atleta.id), { contaId: null, localId: 'gw' })
  const r = prepararPagamento(d, dia, atleta.id, 'checkin', 25, { contaId: 'marido', localId: 'v3' })
  assert.equal(r.checkin.conta_id, 'marido'); assert.equal(r.checkin.local_id, 'v3')
  const salvo = gravar(d, dia, 25, 'checkin')
  const editado = { ...salvo, checkins: salvo.checkins.map((c) => ({ ...c, conta_id: 'marido', local_id: 'v3' })) }
  assert.deepEqual(contaInicial(editado, dia, atleta.id), { contaId: 'marido', localId: 'v3' }) // reabrir mostra a gravada
  const integral = prepararPagamento(d, dia, atleta.id, 'integral', 50, { contaId: 'marido', localId: 'v3' })
  assert.equal(integral.checkin.local_id, null); assert.equal(integral.checkin.checkin_confirmado, false)
})

test('conta: check-in de credito mantem a conta e a arena do credito', () => {
  const d = comContas(); const dia = diaDaLista(d, lista)
  const s = gravar(d, dia, 25, 'checkin')
  s.checkins[0] = { ...s.checkins[0], credito_de: 'outro', conta_id: 'marido', local_id: 'gw' }
  const r = prepararPagamento(s, dia, atleta.id, 'checkin', 25, { contaId: null, localId: 'v3' })
  assert.equal(r.checkin.conta_id, 'marido'); assert.equal(r.checkin.local_id, 'gw')
})
