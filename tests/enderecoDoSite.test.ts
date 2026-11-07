import test from 'node:test'
import assert from 'node:assert/strict'
import { LIGAS, enderecoDoSite } from '../liga.config'

test('endereco do site de cada liga, sem barra no fim', () => {
  assert.equal(enderecoDoSite(LIGAS.feminino), 'playdetodas.com.br')
  assert.equal(enderecoDoSite(LIGAS.masculino), 'playdetodas.com.br/masculino')
  assert.equal(enderecoDoSite(LIGAS.misto), 'playdetodas.com.br/mista')
})
