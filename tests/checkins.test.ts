import test from 'node:test'
import assert from 'node:assert/strict'
import { creditosDeCheckin, disponibilidade, relatorioDasArenas } from '../src/lib/checkins'
import { emptyData, type AppData, type Checkin } from '../src/lib/types'

/*
 * CHECK-IN DE CREDITO: a menina fez o check-in no app e nao foi. A arena
 * recebeu por ele, entao ela ganha um check-in de credito naquela arena: no
 * proximo play usa o credito em vez de um check-in novo (nao gasta cota).
 */
function base(): AppData {
  const d = emptyData()
  d.players = [{ id: 'bia', name: 'Beatriz Souza', nickname: 'Bia', photo_url: null, active: true, created_at: '' }]
  d.checkinLocais = [{ id: 'v3', nome: 'V3', ativo: true, ordem: 1, afiliacao: null } as AppData['checkinLocais'][number]]
  d.checkinDias = [
    { id: 'd1', date: '2026-10-05', session_id: null, titulo: null, valor_cheio: 50, valor_com_checkin: 20, created_at: '' },
    { id: 'd2', date: '2026-10-12', session_id: null, titulo: null, valor_cheio: 50, valor_com_checkin: 20, created_at: '' },
  ]
  return d
}
const lanc = (id: string, dia: string, extra: Partial<Checkin> = {}): Checkin => ({
  id, dia_id: dia, player_id: 'bia', conta_id: null, local_id: 'v3', modo: 'checkin', compareceu: true,
  checkin_confirmado: true, created_at: '', ...extra,
})
const livresNaV3 = (d: AppData) =>
  disponibilidade(d, 'bia', '2026-10').porLocal.find((l) => l.local.id === 'v3')?.disponiveis

test('fez o check-in e nao foi: vira credito e gasta a cota', () => {
  const d = base()
  const antes = livresNaV3(d) as number
  d.checkins = [lanc('c1', 'd1', { compareceu: false, credito_checkin: true })]
  assert.equal(livresNaV3(d), antes - 1, 'o check-in foi feito no app: gastou a cota')
  const cred = creditosDeCheckin(d, 'bia')
  assert.equal(cred.length, 1)
  assert.equal(cred[0].checkin.id, 'c1')
})

test('nao foi sem ter feito o check-in: nada de credito, nada de cota', () => {
  const d = base()
  const antes = livresNaV3(d)
  d.checkins = [lanc('c1', 'd1', { compareceu: false })]
  assert.equal(livresNaV3(d), antes)
  assert.equal(creditosDeCheckin(d, 'bia').length, 0)
})

test('usar o credito: nao gasta cota nova, e o credito acaba', () => {
  const d = base()
  d.checkins = [lanc('c1', 'd1', { compareceu: false, credito_checkin: true })]
  const comCredito = livresNaV3(d)
  d.checkins.push(lanc('c2', 'd2', { credito_de: 'c1' }))
  assert.equal(livresNaV3(d), comCredito, 'veio pelo credito: a cota fica igual')
  assert.equal(creditosDeCheckin(d, 'bia').length, 0)
  // editando o proprio lancamento que usou, o credito aparece de novo para ele
  assert.equal(creditosDeCheckin(d, 'bia', 'c2').length, 1)
})

test('relatorio da arena: o check-in do credito e o dia em que ele foi usado, com o nome do cadastro', () => {
  const d = base()
  d.checkins = [lanc('c1', 'd1', { compareceu: false, credito_checkin: true }), lanc('c2', 'd2', { credito_de: 'c1' })]
  const rel = relatorioDasArenas(d, { mes: '2026-10', de: null, ate: null, locais: null }, (id) =>
    id === 'bia' ? 'Beatriz Souza' : id,
  )
  const linhas = rel.blocos.flatMap((b) => b.linhas)
  assert.equal(linhas.length, 2)
  assert.match(linhas[0].app, /não veio/i)
  assert.match(linhas[1].app, /crédito/i)
  assert.ok(linhas.every((l) => l.atleta === 'Beatriz Souza'))
})
