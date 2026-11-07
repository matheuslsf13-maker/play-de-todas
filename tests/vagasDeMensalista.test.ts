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
