import test from 'node:test'
import assert from 'node:assert/strict'
import { entradaComo, filaDeEspera } from '../src/lib/vagasDeMensalista'
import { fichaDe, marcasDaMensalista, mesSugeridoDoCheckin } from '../src/lib/fichaDaMensalidade'
import { desfazerDoPlay, lancadosPelaLista, pagoAvulsoDaLista } from '../src/lib/pagamentoNaLista'
import { ehMensalista, type Lista, type NomeNaLista } from '../src/lib/listaDePresenca'
import { situacaoDoAtleta } from '../src/lib/mensalidade'
import { emptyData, type AppData, type ItemDaMensalidade, type Player, type PlaySession } from '../src/lib/types'

/* Correcoes da revisao de 08/11/2026 (achados graves): cada teste prova um cenario que antes dava errado. */

const p = (id: string, extra: Partial<Player> = {}) => ({ id, name: id, active: true, categoria: 'avulsa', ...extra }) as Player
let n = 0
const item = (player: string, mes: string, tipo: 'dinheiro' | 'checkin' | 'abatimento', date: string, valor: number | null): ItemDaMensalidade =>
  ({ id: `i${n++}`, player_id: player, mes, tipo, date, valor, conta_id: null, local_id: null, confirmado: true, observacao: null, created_at: '' }) as ItemDaMensalidade

test('check-in sugerido nao cai em mes que nao renovou (virou credito)', () => {
  const d = emptyData()
  d.players = [p('bia', { categoria: 'mensalista' })]
  d.mensalidadeItens = [item('bia', '2026-12', 'dinheiro', '2026-12-03', 50), item('bia', '2027-01', 'dinheiro', '2027-01-03', 80)]
  assert.equal(mesSugeridoDoCheckin(d, 'bia', '2027-01-20'), '2027-01')
})

test('renovou so com credito (abatimento): nao e "sem pagamento"; quitada com divida anterior nao marca quitada', () => {
  const d = emptyData()
  d.mensalidadeItens = [item('bia', '2027-01', 'abatimento', '2027-01-03', 80)]
  const marcas = marcasDaMensalista(fichaDe(d, 'bia', '2027-01'), 0)
  assert.equal(marcas.includes('sem-pagamento'), false)
  assert.equal(marcas.includes('falta'), true)
  d.mensalidadeItens = [item('ana', '2027-01', 'dinheiro', '2027-01-02', 180)]
  assert.equal(marcasDaMensalista(fichaDe(d, 'ana', '2027-01'), 50).includes('quitada'), false)
})

test('fila de espera ignora atleta inativa (nao segura a vaga reservada)', () => {
  const d = emptyData()
  d.players = [p('duda', { espera_mensalista: '2027-01-02T10:00:00Z', active: false }), p('eva', { espera_mensalista: '2027-01-03T10:00:00Z' })]
  assert.deepEqual(filaDeEspera(d).map((x) => x.id), ['eva'])
})

test('entrada de atleta nova: mensalista so se couber; lotado vai para a fila avulsa; a leva conta', () => {
  const d = emptyData()
  d.players = [p('m1', { categoria: 'mensalista' })]
  d.ajustes = [{ id: 'limite_mensalistas', valor: 2, updated_at: '' }]
  const um = entradaComo(d, 'mensalista')
  assert.equal(um.lotado, false)
  assert.equal(um.categoria, 'mensalista')
  const segunda = entradaComo(d, 'mensalista', { jaNaLeva: 1 })
  assert.equal(segunda.lotado, true)
  assert.equal(segunda.categoria, 'avulsa')
  assert.ok(segunda.espera_mensalista)
  assert.equal(entradaComo(d, 'avulsa').lotado, false)
  assert.equal(entradaComo(d, 'mensalista', { jaNaLeva: 1, feminino: false }).lotado, false, 'fora do Play de Todas nada muda')
  d.players.push(p('duda', { espera_mensalista: '2027-01-02T10:00:00Z' }))
  assert.equal(entradaComo(d, 'mensalista').lotado, true, 'a vaga livre e da primeira da fila')
})

test('apagar o play desfaz o pago_avulso da mensalista que pagou como avulsa (dezembro)', () => {
  const d = emptyData()
  const ana = p('ana', { categoria: 'mensalista', pago_avulso: true })
  d.players = [ana]
  const s = { id: 's', date: '2026-12-14', status: 'open', player_ids: ['ana'], eventos: [] } as unknown as PlaySession
  d.sessions = [s]
  d.checkinDias = [{ id: 'dia:2026-12-14', date: '2026-12-14', session_id: 's', titulo: null, valor_cheio: 50, valor_com_checkin: 25, created_at: '' }]
  d.checkins = [{ id: 'checkin:dia%3A2026-12-14:ana', dia_id: 'dia:2026-12-14', player_id: 'ana', conta_id: null, local_id: null, modo: 'integral', compareceu: true, checkin_confirmado: false, created_at: '' }]
  d.checkinPagamentos = [{ id: 'pg', checkin_id: 'checkin:dia%3A2026-12-14:ana', valor_pago: 50, pagamento_confirmado: true, created_at: '' } as never]
  const desfazer = desfazerDoPlay(d, s)
  assert.equal(desfazer.players.length, 1)
  assert.equal(desfazer.players[0].pago_avulso, false)
})

test('apagar lista/play leva junto a compensacao da falta avisada', () => {
  const d = emptyData()
  d.mensalidadeItens = [item('ana', '2027-01', 'abatimento', '2026-12-14', 25), item('bia', '2027-01', 'abatimento', '2026-12-14', 25)]
  d.mensalidadeItens[0].id = 'falta:l1:ana'
  d.mensalidadeItens[1].id = 'falta:play:s1:bia'
  const lista = { id: 'l1', play_em: '2026-12-14T23:00:00Z', session_id: null } as Lista
  assert.deepEqual(lancadosPelaLista(d, lista, ['ana']).itens, ['falta:l1:ana'])
  const s = { id: 's1', date: '2026-12-14', status: 'open', player_ids: [], eventos: [] } as unknown as PlaySession
  assert.deepEqual(desfazerDoPlay(d, s).itens, ['falta:play:s1:bia'])
})

test('quem entrou como mensalista na lista e virou avulsa nao e mais "avisou com 24h"', () => {
  const d = emptyData()
  d.players = [p('ana', { categoria: 'avulsa' })]
  const nome = { id: 'n', player_id: 'ana', origem: 'mensalista', nome: 'ana' } as NomeNaLista
  assert.equal(ehMensalista(nome, d, '2026-12-14'), false)
  d.players[0].categoria = 'mensalista'
  assert.equal(ehMensalista(nome, d, '2026-12-14'), true)
})

test('novembro: a mensalista atrasada que pagou o play pelo 💰 fica liberada para montar o play', () => {
  const lista = { id: 'l', play_em: '2026-11-09T23:00:00Z', session_id: null } as Lista
  const d: AppData = { ...emptyData(), players: [p('ana', { categoria: 'mensalista', pago_mes: '2026-10' })] }
  const marcada = pagoAvulsoDaLista(d, lista, d.players[0], true)!
  assert.equal(marcada.pago_mes, '2026-10')
  assert.equal(situacaoDoAtleta(marcada, d, '2026-11-09').liberado, true)
  assert.equal(situacaoDoAtleta(d.players[0], d, '2026-11-09').liberado, false)
})
