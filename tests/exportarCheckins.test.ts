import test from 'node:test'
import assert from 'node:assert/strict'
import { contaPrincipalVirtual, formatarReais } from '../src/lib/checkins'
import { planilhasCompletas } from '../src/lib/exportarCheckins'
import { emptyData, type ItemDaMensalidade } from '../src/lib/types'

const mes = '2026-12'
const hoje = '2026-12-06'
const nomes: Record<string, string> = { ana: 'Ana Souza', bia: 'Beatriz Lima', cris: 'Cristina Alves' }
const nome = (id: string) => nomes[id] ?? '-'
const reais = (valor: number) => ({ reais: valor })

function exemplo() {
  const d = emptyData()
  d.checkinContas = [{ ...contaPrincipalVirtual('bia'), id: 'segunda', principal: false, nome: 'Maria Lima' }]
  d.checkinLocais = [{ id: 'v3', nome: 'V3', ativo: true, ordem: 1 }]
  d.caixa = [{ id: 'aluguel', date: '2026-11-20', descricao: 'Quadra', categoria: 'aluguel', tipo: 'saida', valor: 10, created_at: '' }]
  d.mensalidades = [{ id: 'f', player_id: 'ana', mes, valor_cheio: 180, valor_checkin: 25, max_checkins: 4, created_at: '' }]
  function item(player_id: string, tipo: ItemDaMensalidade['tipo'], date: string, valor: number | null, extra: Partial<ItemDaMensalidade> = {}) {
    d.mensalidadeItens.push({ id: String(d.mensalidadeItens.length), player_id, mes, tipo, date, valor,
      conta_id: null, local_id: null, confirmado: false, observacao: null, created_at: '', ...extra })
  }
  item('ana', 'dinheiro', '2026-11-29', 80)
  for (const dia of ['01', '02', '03', '04']) {
    item('ana', 'checkin', '2026-12-' + dia, null, { local_id: 'v3', conta_id: dia === '01' ? 'segunda' : null,
      confirmado: true, observacao: 'Conferido' })
  }
  item('bia', 'dinheiro', '2026-12-01', 180)
  item('cris', 'dinheiro', '2026-12-03', 80)
  item('cris', 'abatimento', '2026-12-04', 25)
  return d
}

// o Resumo e de todo o historico e mostra o dinheiro que ENTROU (o Pix de 29/11 da mensalidade de dezembro entra
// em novembro); as outras abas de outubro e novembro ficam iguais
test('exportações anteriores à regra preservam as abas do período', () => {
  const d = exemplo()
  const semFichas = { ...d, mensalidades: [], mensalidadeItens: [] }
  for (const periodo of ['2026-10', '2026-11']) {
    const anterior = planilhasCompletas(semFichas, nome, periodo, hoje)
    assert.deepEqual(anterior.map(a => a.nome), ['Controle Play', 'Pagamentos', 'Resumo', 'Saldos'])
    const semResumo = (abas: typeof anterior) => abas.filter((a) => a.nome !== 'Resumo')
    assert.deepEqual(semResumo(planilhasCompletas(d, nome, periodo, hoje)), semResumo(anterior))
  }
})

test('dezembro mostra as fichas, os comprovantes e a virada do dia 5 para o dia 6', () => {
  const d = exemplo()
  const linhas = (dia: string) => planilhasCompletas(d, nome, mes, dia).find(a => a.nome === 'Mensalidades')!.linhas
  const l = linhas(hoje)
  assert.deepEqual(l.slice(1, 4), [
    ['Ana Souza', 'dezembro/2026', reais(80), 4, reais(0), reais(180), reais(0), 'Quitada'],
    ['Beatriz Lima', 'dezembro/2026', reais(180), 0, reais(0), reais(180), reais(0), 'Quitada'],
    ['Cristina Alves', 'dezembro/2026', reais(80), 0, reais(25), reais(105), reais(75), 'Deve ' + formatarReais(75) + ' - virou avulsa'],
  ])
  assert.equal(linhas('2026-12-05')[3][7], 'Falta ' + formatarReais(75))
  assert.equal(l.length - 6, d.mensalidadeItens.length)
  assert.deepEqual(l[6], ['Ana Souza', 'dezembro/2026', '29/11/2026', 'Pix', '', '', reais(80), 'Não', ''])
  assert.deepEqual(l[7], ['Ana Souza', 'dezembro/2026', '01/12/2026', 'Check-in', 'V3', 'Maria Lima', reais(25), 'Sim', 'Conferido'])
  assert.equal(l[8][5], 'Ana Souza')
  assert.equal(l.at(-1)?.[3], 'Abatimento')
})

test('o Resumo recebe o Pix no mês do recebimento e carrega o saldo para meses sem ficha', () => {
  const d = exemplo()
  d.mensalidadeItens.push({ ...d.mensalidadeItens[0], id: 'pix-tardio', date: '2027-01-08', valor: 15 })
  const abas = planilhasCompletas(d, nome, '2027-01', hoje)
  assert.ok(!abas.some(a => a.nome === 'Mensalidades'))
  const resumo = abas.find(a => a.nome === 'Resumo')!.linhas
  // colunas: plays, mensalidades, extras, receita, aluguel, brindes, confrat., outras, despesa, saldo, acumulado, eventos
  assert.deepEqual(resumo[1].slice(1), [reais(0), reais(80), reais(0), reais(80), reais(10), reais(0), reais(0), reais(0), reais(10), reais(70), reais(70), reais(0)])
  assert.deepEqual(resumo[2][2], reais(260))
  assert.deepEqual(resumo[2].slice(-3), [reais(260), reais(330), reais(0)])
  assert.deepEqual(resumo[3].slice(-3), [reais(15), reais(345), reais(0)])
  d.mensalidades.push({ ...d.mensalidades[0], id: 'jan', mes: '2027-01' })
  const tudo = planilhasCompletas(d, nome, null, '2027-01-10').find(a => a.nome === 'Mensalidades')!.linhas
  assert.deepEqual(tudo[4], ['Ana Souza', 'janeiro/2027', reais(0), 0, reais(0), reais(0), reais(180), 'Falta ' + formatarReais(180)])
})
