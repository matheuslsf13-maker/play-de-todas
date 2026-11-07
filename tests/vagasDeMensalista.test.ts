import test from 'node:test'
import assert from 'node:assert/strict'
import { cabeMensalista, filaDeEspera, limiteDeMensalistas, vagasLivres } from '../src/lib/vagasDeMensalista'
import { emptyData, type Player } from '../src/lib/types'

const p = (id: string, extra: Partial<Player> = {}) => ({ id, name: id, active: true, categoria: 'avulsa', ...extra }) as Player

test('limite padrao 12, configuravel, so ativas ocupam vaga', () => {
  const d = emptyData()
  d.players = [...Array.from({ length: 11 }, (_, i) => p(`m${i}`, { categoria: 'mensalista' })), p('inativa', { categoria: 'mensalista', active: false }), p('nova')]
  assert.equal(limiteDeMensalistas(d), 12)
  assert.equal(vagasLivres(d), 1)
  assert.equal(cabeMensalista(d, d.players.at(-1)!), true)
  d.ajustes = [{ id: 'limite_mensalistas', valor: 11, updated_at: '' }]
  assert.equal(vagasLivres(d), 0)
  assert.equal(cabeMensalista(d, d.players.at(-1)!), false)
  assert.equal(cabeMensalista(d, d.players[0]), true, 'quem ja e mensalista nao ocupa vaga nova')
  d.ajustes = [{ id: 'limite_mensalistas', valor: 'abc', updated_at: '' }]
  assert.equal(limiteDeMensalistas(d), 12, 'valor estranho volta ao padrao')
})

test('espera pela ordem do pedido; quem virou mensalista sai', () => {
  const d = emptyData()
  d.players = [
    p('b', { espera_mensalista: '2026-11-07T10:00:00Z' }),
    p('a', { espera_mensalista: '2026-11-06T10:00:00Z' }),
    p('ja', { espera_mensalista: '2026-11-01T10:00:00Z', categoria: 'mensalista' }),
    p('fora'),
  ]
  assert.deepEqual(filaDeEspera(d).map((x) => x.id), ['a', 'b'])
})

test('dia 6 sem pagar nada: perde a vaga; quem pagou os 80 mantem', async () => {
  const { naoRenovaram, vagasLivres } = await import('../src/lib/vagasDeMensalista')
  const d = emptyData()
  d.players = [p('paga', { categoria: 'mensalista' }), p('nada', { categoria: 'mensalista' }), p('nov', { categoria: 'mensalista' })]
  d.ajustes = [{ id: 'limite_mensalistas', valor: 3, updated_at: '' }]
  d.mensalidadeItens = [{ id: 'i', player_id: 'paga', mes: '2026-12', tipo: 'dinheiro', date: '2026-12-02', valor: 80, conta_id: null, local_id: null, confirmado: true, observacao: null, created_at: '' }]
  assert.equal(vagasLivres(d, '2026-12-05'), 0, 'ate o dia 5 ninguem perde')
  assert.deepEqual(naoRenovaram(d, '2026-12-06').map((x) => x.id), ['nada', 'nov'])
  assert.equal(vagasLivres(d, '2026-12-06'), 2)
  assert.equal(vagasLivres(d, '2026-11-20'), 0, 'novembro e transicao')
})

test('entrou depois do dia 5 e pagou a mensalidade seguinte: nao perde a vaga', async () => {
  const { perdeuAVaga } = await import('../src/lib/vagasDeMensalista')
  const d = emptyData()
  const nova = p('nova', { categoria: 'mensalista' })
  d.players = [nova]
  assert.equal(perdeuAVaga(d, nova, '2026-12-10'), true)
  d.mensalidadeItens = [{ id: 'i', player_id: 'nova', mes: '2027-01', tipo: 'dinheiro', date: '2026-12-10', valor: 80, conta_id: null, local_id: null, confirmado: true, observacao: null, created_at: '' }]
  assert.equal(perdeuAVaga(d, nova, '2026-12-10'), false)
})
