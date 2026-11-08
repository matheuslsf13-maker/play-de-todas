import test from 'node:test'
import assert from 'node:assert/strict'
import { cabeMensalista, consequenciasDeSair, filaDeEspera, geridaNaAbaMensalistas, vagasLivres, vagasParaNovas } from '../src/lib/vagasDeMensalista'
import { emptyData, type AppData, type ItemDaMensalidade, type Player } from '../src/lib/types'

/*
 * CENARIO COM VARIAS ATLETAS (dono, 08/11/2026): limite 3; Ana (mensalista devendo check-ins: no dia 6 ja nao
 * renovou e a vaga dela conta livre), Bia, Cris e Gabi (quitadas); Duda e Eva na fila; Fabi avulsa.
 * Em 10/01/2027 o prazo dos check-ins de dezembro (05/01) ja passou.
 */
const HOJE = '2027-01-10'
const p = (id: string, extra: Partial<Player> = {}) => ({ id, name: id, active: true, categoria: 'avulsa', ...extra }) as Player
let n = 0
const pix = (player: string, mes: string, valor: number): ItemDaMensalidade =>
  ({ id: `i${n++}`, player_id: player, mes, tipo: 'dinheiro', date: `${mes}-03`, valor, conta_id: null, local_id: null, confirmado: true, observacao: null, created_at: '' }) as ItemDaMensalidade

function cenario(): AppData {
  const d = emptyData()
  d.players = [
    p('ana', { categoria: 'mensalista' }),
    p('bia', { categoria: 'mensalista' }),
    p('cris', { categoria: 'mensalista' }),
    p('gabi', { categoria: 'mensalista' }),
    p('duda', { espera_mensalista: '2027-01-02T10:00:00Z' }),
    p('eva', { espera_mensalista: '2027-01-03T10:00:00Z' }),
    p('fabi'),
  ]
  d.ajustes = [{ id: 'limite_mensalistas', valor: 3, updated_at: '' }]
  d.mensalidadeItens = [
    pix('ana', '2026-12', 80), // renovou e nao fechou os 4 check-ins: deve 100
    pix('bia', '2026-12', 180),
    pix('cris', '2026-12', 180),
    pix('ana', '2027-01', 80),
    pix('bia', '2027-01', 180),
    pix('cris', '2027-01', 180),
    pix('gabi', '2026-12', 180),
    pix('gabi', '2027-01', 180),
  ]
  return d
}

test('lotado: a fila segura a vaga que abrir; so a primeira dela entra', () => {
  const d = cenario()
  assert.equal(vagasLivres(d, HOJE), 0)
  d.players.find((x) => x.id === 'cris')!.active = false // abriu uma vaga
  assert.equal(vagasLivres(d, HOJE), 1)
  assert.equal(vagasParaNovas(d, HOJE), 0, 'a vaga e de quem esta na fila')
  const por = (id: string) => d.players.find((x) => x.id === id)!
  assert.equal(cabeMensalista(d, por('duda'), HOJE), true, 'a 1a da fila cabe')
  assert.equal(cabeMensalista(d, por('eva'), HOJE), false, 'a 2a espera a vez')
  assert.equal(cabeMensalista(d, por('fabi'), HOJE), false, 'quem chega agora nao fura a fila')
  assert.equal(cabeMensalista(d, por('ana'), HOJE), true, 'quem ja e mensalista sempre cabe')
  d.players.forEach((x) => { x.espera_mensalista = null }) // fila vazia: a vaga e de quem pedir
  assert.equal(cabeMensalista(d, por('fabi'), HOJE), true)
})

test('sair de mensalista: mostra divida, credito e a proxima da fila', () => {
  const d = cenario()
  const ana = consequenciasDeSair(d, d.players.find((x) => x.id === 'ana')!, HOJE)
  assert.equal(ana.divida, 100)
  assert.equal(ana.credito, 0)
  assert.equal(ana.proxima?.id, 'duda')
  const bia = consequenciasDeSair(d, d.players.find((x) => x.id === 'bia')!, HOJE)
  assert.equal(bia.divida, 0)
  assert.equal(bia.proxima?.id, 'duda')
})

test('a divida nao some quando ela deixa de ser mensalista, e a aba continua mostrando', () => {
  const d = cenario()
  const ana = d.players.find((x) => x.id === 'ana')!
  assert.equal(geridaNaAbaMensalistas(d, ana, HOJE), true)
  ana.categoria = 'avulsa' // saiu das mensalistas
  assert.equal(consequenciasDeSair(d, ana, HOJE).divida, 100, 'a ficha continua devendo')
  assert.equal(geridaNaAbaMensalistas(d, ana, HOJE), true, 'ex-mensalista com divida segue na aba')
  const bia = d.players.find((x) => x.id === 'bia')!
  bia.categoria = 'avulsa'
  assert.equal(geridaNaAbaMensalistas(d, bia, HOJE), false, 'ex-mensalista sem saldo sai da aba')
  assert.equal(geridaNaAbaMensalistas(d, d.players.find((x) => x.id === 'fabi')!, HOJE), false)
  assert.deepEqual(filaDeEspera(d).map((x) => x.id), ['duda', 'eva'], 'sair nao coloca ninguem na fila sozinho')
})
