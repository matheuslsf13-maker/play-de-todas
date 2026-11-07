import { Modal } from './ui'
import { useStore } from '../lib/store'
import { contasDaAtleta, extratoDaAtleta, formatarReais, nomeDoTitular, rotuloDoDia } from '../lib/checkins'
import {
  checkinsDaFicha,
  dividaDaMensalidade,
  fichaDe,
  MES_INICIAL,
  mensalidadeDaData,
  prazoDosCheckins,
  proximoMes,
  quitada,
  renovada,
  vencimento,
} from '../lib/fichaDaMensalidade'
import { dateLabel, monthLabel, todayISO, type ItemDaMensalidade } from '../lib/types'

/*
 * 📜 HISTORICO FINANCEIRO DA ATLETA (dono, 07/11): para a Ingryd saber para onde foi cada dinheiro e
 * cada check-in, e como ficou cada mensalidade (renovou, quitou, deve, nao renovou e virou credito).
 * So leitura: junta o que ja existe (fichas da mensalidade + extrato dos plays, com o credito correndo).
 */
type Linha = { date: string; ordem: string; icone: string; texto: string; valor?: number; saldo?: number }

const dm = (d: string) => dateLabel(d).slice(0, 5)
const mesCurto = (mes: string) => monthLabel(mes).toLowerCase().replace(' de ', '/')

export function HistoricoFinanceiro({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { data, nameOf } = useStore()
  const hoje = todayISO()
  const contas = contasDaAtleta(data, playerId)
  const titular = (i: ItemDaMensalidade) => {
    const c = contas.find((x) => (i.conta_id === null ? x.principal : x.id === i.conta_id))
    return c ? nomeDoTitular(c, nameOf(playerId)) : 'conta apagada'
  }

  // ---- mensalidades, mes a mes (da primeira com registro ate a de hoje)
  const meses = [...new Set([...data.mensalidades, ...data.mensalidadeItens].filter((x) => x.player_id === playerId && x.mes >= MES_INICIAL).map((x) => x.mes))].sort()
  const ate = mensalidadeDaData(hoje)
  const todos: string[] = []
  if (meses.length) for (let m = meses[0]; m <= (meses[meses.length - 1] > ate ? meses[meses.length - 1] : ate); m = proximoMes(m)) todos.push(m)
  const divida = dividaDaMensalidade(data, playerId, hoje)

  const resumoDoMes = (mes: string) => {
    const f = fichaDe(data, playerId, mes)
    const pix = f.itens.filter((i) => i.tipo === 'dinheiro').reduce((t, i) => t + (i.valor ?? 0), 0)
    const ck = checkinsDaFicha(f)
    const deve = divida.porMes.find((d) => d.mes === mes)?.falta ?? 0
    const credito = f.itens.filter((i) => i.id.startsWith('credito-na-divida:') || (i.tipo === 'abatimento' && (i.valor ?? 0) > 0)).reduce((t, i) => t + (i.valor ?? 0), 0)
    const partes = [pix > 0 ? `Pix ${formatarReais(pix)}` : '', ck > 0 ? `${ck}/${f.max_checkins} check-ins` : '', credito > 0 ? `crédito/abatimento ${formatarReais(credito)}` : '']
      .filter(Boolean).join(' · ')
    let st: { t: string; c: string }
    if (quitada(f, hoje)) st = { t: '✅ quitada', c: 'var(--verde)' }
    else if (deve > 0) st = { t: `deve ${formatarReais(deve)}`, c: 'var(--danger)' }
    else if (renovada(f, hoje)) st = { t: `renovada · check-ins até ${dm(prazoDosCheckins(mes))}`, c: 'var(--verde)' }
    else if (vencimento(mes) < hoje) st = { t: pix > 0 ? 'não renovou (o que pagou virou crédito)' : 'não renovou', c: 'var(--muted)' }
    else st = { t: `renovar até ${dm(vencimento(mes))}`, c: 'var(--yellow)' }
    return { partes, st }
  }

  // ---- movimentacoes: os itens das fichas + o extrato dos plays (com o credito correndo)
  const linhas: Linha[] = []
  for (const i of data.mensalidadeItens.filter((x) => x.player_id === playerId)) {
    const arena = data.checkinLocais.find((l) => l.id === i.local_id)?.nome
    linhas.push({
      date: i.date, ordem: i.created_at,
      icone: i.tipo === 'checkin' ? '✅' : i.tipo === 'dinheiro' ? '💸' : '➖',
      texto: i.tipo === 'checkin'
        ? `Check-in ${arena ?? 'sem arena'} (${titular(i)}) → mensalidade de ${mesCurto(i.mes)}`
        : i.tipo === 'dinheiro'
          ? `Pix → mensalidade de ${mesCurto(i.mes)}${i.observacao ? ` · ${i.observacao}` : ''}`
          : `${i.observacao ?? 'abatimento'} → mensalidade de ${mesCurto(i.mes)}`,
      valor: i.tipo === 'checkin' ? undefined : i.valor ?? 0,
    })
  }
  // o credito usado na divida (automatico) sai uma vez so: pelo saldo (o acerto negativo do extrato)
  for (const mv of extratoDaAtleta(data, playerId)) {
    if (mv.tipo === 'acerto') {
      const naDivida = mv.acerto.id.startsWith('credito-na-divida:')
      linhas.push({ date: mv.date, ordem: mv.acerto.created_at, icone: naDivida ? '🔄' : mv.acerto.valor >= 0 ? '💰' : '↘️', texto: mv.acerto.descricao || 'acerto', valor: mv.acerto.valor, saldo: mv.saldoDepois })
    } else {
      const extra = [mv.creditoUsado > 0 ? `usou ${formatarReais(mv.creditoUsado)} do crédito` : '', mv.falta > 0 ? `faltou ${formatarReais(mv.falta)}` : '', mv.sobra > 0 ? `${formatarReais(mv.sobra)} viraram crédito` : '']
        .filter(Boolean).join(' · ')
      linhas.push({
        date: mv.date, ordem: mv.checkin.created_at, icone: '🎾',
        texto: `${rotuloDoDia(mv.dia, data.sessions)}: devia ${formatarReais(mv.devido)}, pagou ${formatarReais(mv.pago)}${extra ? ` · ${extra}` : ''}`,
        saldo: mv.saldoDepois,
      })
    }
  }
  linhas.sort((a, b) => b.date.localeCompare(a.date) || b.ordem.localeCompare(a.ordem))

  return (
    <Modal title={`📜 Histórico · ${nameOf(playerId)}`} onClose={onClose}>
      {todos.length > 0 && (
        <>
          <strong className="small">📅 Mensalidades</strong>
          <div className="stack" style={{ gap: 6, margin: '6px 0 14px' }}>
            {[...todos].reverse().map((m) => {
              const r = resumoDoMes(m)
              return (
                <div key={m} className="ficha-item">
                  <div className="row spread" style={{ gap: 8 }}>
                    <strong>{monthLabel(m)}</strong>
                    <span className="tiny" style={{ color: r.st.c, fontWeight: 700, textAlign: 'right' }}>{r.st.t}</span>
                  </div>
                  {r.partes && <div className="tiny muted">{r.partes}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}
      <strong className="small">💸 Movimentações</strong>
      {linhas.length === 0 ? (
        <p className="tiny muted">Nenhuma movimentação ainda.</p>
      ) : (
        <div className="stack" style={{ gap: 6, marginTop: 6 }}>
          {linhas.map((l, k) => (
            <div key={k} className="row ficha-item" style={{ gap: 8, alignItems: 'flex-start' }}>
              <span aria-hidden="true">{l.icone}</span>
              <span className="grow tiny">
                <strong>{dm(l.date)}</strong> {l.texto}
                {l.saldo !== undefined && <span className="muted" style={{ display: 'block' }}>crédito depois: {formatarReais(l.saldo)}</span>}
              </span>
              {l.valor !== undefined && (
                <span className={`tiny ${l.valor >= 0 ? 'valor-pos' : 'valor-neg'}`} style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {l.valor >= 0 ? '+' : '−'} {formatarReais(Math.abs(l.valor))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
