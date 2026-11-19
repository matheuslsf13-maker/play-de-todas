import test from 'node:test'
import assert from 'node:assert/strict'
import { planilhasCompletas } from '../src/lib/exportarCheckins'
import { emptyData, type Player } from '../src/lib/types'

/* O Excel completo traz o que entrou em novembro/2026: aluguel detalhado, substituta e a aba Mensalistas (limite e fila). */
const p = (id: string, extra: Partial<Player> = {}) => ({ id, name: id, active: true, categoria: 'avulsa', ...extra }) as Player

test('Pagamentos detalha o aluguel (cobrado, plano, check-ins abatidos, caixa de eventos)', () => {
  const d = emptyData()
  d.caixa = [{ id: 'a', date: '2026-11-08', descricao: 'Aluguel', categoria: 'aluguel', tipo: 'saida', valor: 800, plano_mensal: true, valor_cobrado: 950, checkins_abatidos: 6, created_at: '' }]
  const pg = planilhasCompletas(d, (id) => id, null, '2026-11-08').find((a) => a.nome === 'Pagamentos')!.linhas
  assert.equal(pg[0].length, pg[1].length)
  assert.deepEqual(pg[1].slice(5), [{ reais: 950 }, 'Sim', 5, 6, { reais: 50 }, ''])
})

test('aba Mensalistas: limite, vagas, deve/credito e a lista de espera', () => {
  const d = emptyData()
  d.players = [p('ana', { categoria: 'mensalista' }), p('bia', { espera_mensalista: '2026-11-07T12:00:00Z' })]
  d.ajustes = [{ id: 'limite_mensalistas', valor: 1, updated_at: '' }]
  const abas = planilhasCompletas(d, (id) => id, null, '2026-11-08')
  const m = abas.find((a) => a.nome === 'Mensalistas')!.linhas
  assert.deepEqual(m[0], ['Limite de mensalistas', 1, 'Ocupadas', 1, 'Vagas livres', 0, 'Na lista de espera', 1])
  assert.equal(m[3][0], 'ana')
  assert.ok(m.some((l) => l[0] === 'bia' && l[1] === '1º'))
})

test('divida paga com check-in (script 41): aba Acertos e relatorio da arena, inclusive o check-in de credito', async () => {
  const { relatorioDasArenas } = await import('../src/lib/checkins')
  const { planilhasDasArenas } = await import('../src/lib/exportarCheckins')
  const d = emptyData()
  d.players = [p('bia')]
  d.checkinLocais = [{ id: 'v3', nome: 'Arena V3', ordem: 0, ativo: true } as typeof d.checkinLocais[number]]
  d.checkinDias = [{ id: 'd1', date: '2026-11-10', session_id: null, titulo: null, valor_cheio: 50, valor_com_checkin: 25, created_at: '' }]
  d.checkins = [{ id: 'c1', dia_id: 'd1', player_id: 'bia', conta_id: null, local_id: 'v3', modo: 'checkin', compareceu: false, credito_checkin: true, checkin_confirmado: true } as typeof d.checkins[number]]
  d.checkinAcertos = [
    { id: 'divida:x:0', player_id: 'bia', date: '2026-11-17', valor: 25, dinheiro: false, descricao: 'pagou dívida com check-in', created_at: '', conta_id: null, local_id: 'v3' },
    { id: 'divida:x:1', player_id: 'bia', date: '2026-11-17', valor: 25, dinheiro: false, descricao: 'pagou dívida com check-in', created_at: '', credito_de: 'c1' },
  ]
  const ac = planilhasCompletas(d, (id) => id, '2026-11', '2026-11-18').find((a) => a.nome === 'Acertos')!.linhas
  assert.equal(ac.length, 3)
  assert.ok(ac.every((l) => l.length === ac[0].length))
  assert.deepEqual(ac[1].slice(3, 7), [{ reais: 25 }, 'Não', 'Sim', 'Arena V3'])
  assert.deepEqual(ac[2].slice(5, 7), ['Check-in de crédito de 10/11/2026', 'Arena V3'])
  const v3 = planilhasDasArenas(relatorioDasArenas(d, { mes: '2026-11' }, (id) => id))[0].linhas
  // o "nao veio" do play, o check-in novo e o do credito; nada de "divida" (a arena nao ve o financeiro)
  assert.equal(v3.filter((l) => /\d\d\/\d\d\/\d{4}/.test(String(l[0]))).length, 3)
  assert.ok(v3.some((l) => String(l[3]).includes('crédito do check-in de 10/11/2026 · fora do play')))
  assert.ok(!JSON.stringify(v3).includes('dívida'))
})
