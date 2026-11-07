import test from 'node:test'
import assert from 'node:assert/strict'
import { contaPrincipalVirtual, textoDoRelatorio, creditosDeCheckin, disponibilidade, relatorioDasArenas } from '../src/lib/checkins'
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

type Item = AppData['mensalidadeItens'][number]
const item = (id: string, date: string, extra: Partial<Item> = {}): Item => ({
  id, player_id: 'bia', mes: '2027-01', tipo: 'checkin', date, local_id: 'v3', conta_id: null,
  confirmado: false, valor: null, observacao: null, created_at: '', ...extra,
})
const filtro = { mes: '2026-12', de: null, ate: null, locais: null }

test('três plays e quatro check-ins de mensalidade na V3 deixam cinco livres em dezembro', () => {
  const d = base()
  d.checkinDias = ['01', '02', '03'].map((dia) => ({ ...d.checkinDias[0], id: dia, date: `2026-12-${dia}` }))
  d.checkins = d.checkinDias.map((dia) => lanc(dia.id, dia.id))
  d.mensalidadeItens = ['03', '06', '06', '08'].map((dia, i) => item(String(i), `2026-12-${dia}`))
  d.mensalidadeItens.push(item('pix', '2026-12-08', { tipo: 'dinheiro' }), item('ab', '2026-12-08', { tipo: 'abatimento' }))
  const uso = disponibilidade(d, 'bia', filtro.mes).contas[0]
  assert.equal(uso.locais[0].disponiveis, 5)
  assert.equal(uso.locais[0].usadosEmPlays, 3)
  assert.equal(uso.usadosNoMes, 7)
  assert.equal(uso.avisos.length, 2)
  assert.match(uso.avisos.join(' '), /03\/12\/2026/)
  assert.match(uso.avisos.join(' '), /06\/12\/2026/)
  const rel = relatorioDasArenas(d, filtro, (id) => id)
  assert.equal(rel.total, 7)
  assert.match(textoDoRelatorio(rel), /mensalidade de janeiro de 2027/)
  assert.equal(relatorioDasArenas(d, { ...filtro, mes: '2027-01' }, (id) => id).total, 0)
})

test('conta emprestada gasta a cota da titular; sem arena gasta só o teto do mês', () => {
  const d = base()
  d.checkinContas = [{ ...contaPrincipalVirtual('ana'), id: 'sec', principal: false, nome: 'Matheus' }]
  d.mensalidadeItens = [
    item('a', '2026-12-06', { conta_id: 'sec' }),
    item('b', '2026-12-06', { conta_id: 'principal:ana', local_id: null }),
  ]
  assert.equal(disponibilidade(d, 'bia', filtro.mes).contas[0].usadosNoMes, 0)
  const [ana, matheus] = disponibilidade(d, 'ana', filtro.mes).contas
  assert.equal(ana.locais[0].disponiveis, 12)
  assert.equal(ana.livresNoMes, 30)
  assert.equal(ana.avisos.length, 1)
  assert.match(ana.avisos[0], /sem arena/)
  assert.equal(matheus.locais[0].disponiveis, 11)
  assert.deepEqual(matheus.avisos, [])
  const nomes = (id: string) => id === 'ana' ? 'Ana' : 'Beatriz Souza'
  const rel = relatorioDasArenas(d, filtro, nomes)
  assert.deepEqual(rel.blocos.map((b) => b.linhas[0].titular), ['Matheus', 'Ana'])
  const arena = relatorioDasArenas(d, { ...filtro, locais: ['v3'], de: '2026-12-06', ate: '2026-12-06' }, nomes)
  assert.equal(arena.total, 1)
  const linha = arena.blocos[0].linhas[0]
  assert.equal(linha.atleta, 'Beatriz Souza')
  assert.equal(linha.dia, 'mensalidade de janeiro de 2027')
  assert.equal(linha.confirmado, false)
  assert.equal(relatorioDasArenas(d, { ...filtro, de: '2026-12-07', ate: '2026-12-08' }, nomes).total, 0)
})

test('histórico e mês sem itens preservam toda a disponibilidade e o relatório', () => {
  const d = base()
  d.checkins = [lanc('c1', 'd1')]
  const resultado = (mes: string) => [
    disponibilidade(d, 'bia', mes), relatorioDasArenas(d, { ...filtro, mes }, (id) => id),
  ]
  const meses = ['2026-10', '2026-11', '2027-01']
  const antes = meses.map(resultado)
  d.mensalidadeItens = [item('novo', '2026-12-06'), item('transicao', '2026-11-20', { mes: '2026-12' })]
  assert.deepEqual(meses.map(resultado), antes)
})
