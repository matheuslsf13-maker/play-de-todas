import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarNaStore } from '../src/lib/reducerDaStore'
import { emptyData, type Mensalidade, type ItemDaMensalidade } from '../src/lib/types'

const ficha = (jogadora: string, mes = '2026-12', valor = 180): Mensalidade => ({
  id: `mensalidade:${jogadora}:${mes}`, player_id: jogadora, mes,
  valor_cheio: valor, valor_checkin: 25, max_checkins: 4, created_at: '2026-11-07T12:00:00Z',
})
const item: ItemDaMensalidade = {
  id: 'pix', player_id: 'a', mes: '2026-12', tipo: 'dinheiro', date: '2026-11-07',
  valor: 80, conta_id: null, local_id: null, confirmado: false, observacao: null, created_at: ficha('a').created_at,
}

test('salvar novamente atualiza a ficha e o item, excluir remove apenas o item', () => {
  let d = emptyData()
  for (const valor of [180, 190]) {
    d = aplicarNaStore(d, { id: '1', type: 'saveMensalidade', ficha: ficha('a', '2026-12', valor) }, false)
    d = aplicarNaStore(d, { id: '2', type: 'saveItemDaMensalidade', item: { ...item, valor } }, false)
  }
  assert.deepEqual(d.mensalidades, [ficha('a', '2026-12', 190)])
  assert.deepEqual(d.mensalidadeItens, [{ ...item, valor: 190 }])
  d = aplicarNaStore(d, { id: '3', type: 'deleteItemDaMensalidade', itemId: 'pix' }, false)
  assert.equal(d.mensalidadeItens.length, 0)
  assert.equal(d.mensalidades.length, 1)
})

test('juntar preserva o destino, renomeia a ficha do outro mês e move itens mesmo sem ficha', () => {
  const destino = ficha('b', '2026-12', 200)
  const outra = ficha('c')
  const semFicha = { ...item, id: 'check', mes: '2027-02', tipo: 'checkin' as const, valor: null, conta_id: 'principal:a' }
  const d = { ...emptyData(), mensalidades: [ficha('a'), destino, outra, ficha('a', '2027-01')],
    mensalidadeItens: [item, semFicha, { ...item, id: 'terceira', player_id: 'c' }] }
  const op = { id: '4', type: 'mergePlayers' as const, fromId: 'a', intoId: 'b', matches: [], sessions: [] }
  const junto = aplicarNaStore(d, op, false)
  assert.deepEqual(junto.mensalidades, [destino, outra, ficha('b', '2027-01')])
  assert.deepEqual(junto.mensalidadeItens, [{ ...item, player_id: 'b' },
    { ...semFicha, player_id: 'b', conta_id: 'principal:b' }, d.mensalidadeItens[2]])
  assert.deepEqual(aplicarNaStore(junto, op, false), junto)
})
