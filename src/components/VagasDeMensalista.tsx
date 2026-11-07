import { useState } from 'react'
import { useStore } from '../lib/store'
import { plural, todayISO, uid } from '../lib/types'
import { creditoDisponivel, formatarReais } from '../lib/checkins'
import { mensalidadeDaData, MENSALIDADE_PADRAO } from '../lib/fichaDaMensalidade'
import { useGravarNaFicha } from './FichaDaMensalidade'
import { CHAVE_DO_LIMITE, filaDeEspera, limiteDeMensalistas, mensalistasAtivas, naoRenovaram, vagasLivres } from '../lib/vagasDeMensalista'

/*
 * 📅 VAGAS DE MENSALISTA (aba Meninas, so quem organiza; dono 07/11): quantas de quantas, o
 * limite editavel, a lista de espera na ordem do pedido e, com vaga aberta, a proxima com o
 * botao de confirmar (a organizadora decide; nada vira mensalista sozinho).
 */
export function VagasDeMensalista({ onToast }: { onToast: (m: string) => void }) {
  const { data, nameOf, savePlayer, saveAjuste, saveAcerto } = useStore()
  const [editando, setEditando] = useState(false)
  const limite = limiteDeMensalistas(data)
  const [texto, setTexto] = useState(String(limite))
  const ocupadas = mensalistasAtivas(data).length
  const vagas = vagasLivres(data)
  const fila = filaDeEspera(data)
  const semRenovar = naoRenovaram(data)
  const gravarNaFicha = useGravarNaFicha()
  /** A primeira da espera topou: qual valor ela pagou (80 renova com check-ins; 180 integral). */
  const [pagou, setPagou] = useState<number | null>(null)

  // TOPOU E PAGOU (dono, 07/11): o Pix entra na mensalidade DO MES e ela ja vira mensalista
  function confirmarNova(id: string, valor: number) {
    const p = data.players.find((x) => x.id === id)
    if (!p) return
    const hoje = todayISO()
    const mes = mensalidadeDaData(hoje)
    // o credito dela (pago antes sem renovar) entra primeiro: no Pix so a diferenca (dono, 07/11)
    const usa = Math.min(creditoDisponivel(data, id), valor)
    const base = { player_id: id, date: hoje, conta_id: null, local_id: null, confirmado: true, created_at: new Date().toISOString() }
    try {
      if (usa > 0) {
        saveAcerto({ id: uid(), player_id: id, date: hoje, valor: -usa, dinheiro: false, descricao: 'usado na mensalidade (entrou pela lista de espera)', created_at: base.created_at })
        gravarNaFicha({ ...base, id: uid(), mes, tipo: 'abatimento', valor: usa, observacao: 'crédito usado na renovação' })
      }
      const pix = Math.max(0, valor - usa)
      if (pix > 0) gravarNaFicha({ ...base, id: uid(), mes, tipo: 'dinheiro', valor: pix, observacao: 'entrou pela lista de espera' })
    } catch (e) {
      return onToast(e instanceof Error ? e.message : 'Não deu para gravar a mensalidade.')
    }
    savePlayer({ ...p, categoria: 'mensalista', espera_mensalista: null, pago_mes: null, pago_avulso: false })
    setPagou(null)
    onToast(`${nameOf(id)} agora é mensalista (${formatarReais(valor)})`)
  }

  function salvarLimite() {
    const n = Number(texto)
    if (!Number.isInteger(n) || n < 0) return onToast('Digite um número inteiro.')
    try {
      saveAjuste({ id: CHAVE_DO_LIMITE, valor: n, updated_at: new Date().toISOString() })
      setEditando(false)
      onToast(`Limite de mensalistas: ${n}`)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Não deu para salvar.')
    }
  }

  return (
    <div className="card">
      <div className="row spread" style={{ gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>📅 Mensalistas: {ocupadas} de {limite}</div>
        {!editando && <button className="btn ghost sm" onClick={() => { setTexto(String(limite)); setEditando(true) }}>✏️ limite</button>}
      </div>
      {editando && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input className="input" inputMode="numeric" style={{ width: 90 }} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button className="btn pink sm" onClick={salvarLimite}>Salvar</button>
          <button className="btn ghost sm" onClick={() => setEditando(false)}>Cancelar</button>
        </div>
      )}
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>
        {vagas > 0 ? `${plural(vagas, 'vaga livre', 'vagas livres')}.` : 'Lotado: quem pedir entra na lista de espera.'}
        {ocupadas > limite && ` ${ocupadas - limite} acima do limite (ninguém sai sozinha).`}
      </p>
      {semRenovar.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          <strong className="small">🚪 Não renovaram até o dia 5 (a vaga já está livre)</strong>
          {semRenovar.map((p) => (
            <div key={p.id} className="row ficha-item" style={{ gap: 8 }}>
              <span className="grow">{nameOf(p.id)}</span>
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (!confirm(`${nameOf(p.id)} passa para avulsa e vai para o fim da lista de espera?`)) return
                  savePlayer({ ...p, categoria: 'avulsa', espera_mensalista: new Date().toISOString(), pago_mes: null, pago_avulso: false })
                  onToast(`${nameOf(p.id)} agora é avulsa, no fim da espera`)
                }}
              >
                Passar para avulsa (fim da espera)
              </button>
            </div>
          ))}
          <span className="hint">Passou do dia 5: não renova mais pela ficha. Passe para avulsa; quando chegar a vez dela na fila, o crédito que tiver completa o valor.</span>
        </div>
      )}
      {fila.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          <strong className="small">⏳ Lista de espera</strong>
          {fila.map((p, i) => (
            <div key={p.id} className="row ficha-item" style={{ gap: 8 }}>
              <span className="muted" style={{ fontWeight: 800 }}>{i + 1}º</span>
              <span className="grow">{nameOf(p.id)}</span>
              {i === 0 && vagas > 0 && pagou === null && (
                <button className="btn teal sm" onClick={() => setPagou(MENSALIDADE_PADRAO.valor_cheio - MENSALIDADE_PADRAO.max_checkins * MENSALIDADE_PADRAO.valor_checkin)}>
                  ✅ Topou e pagou
                </button>
              )}
              {/* escolhendo quanto ela pagou, o Recusou some (no print parecia que ela tinha recusado) */}
              {!(i === 0 && pagou !== null) && <button
                className="btn ghost sm"
                aria-label={i === 0 && vagas > 0 ? `${nameOf(p.id)} recusou` : `Tirar ${nameOf(p.id)} da espera`}
                onClick={() => {
                  const recusou = i === 0 && vagas > 0
                  if (!confirm(recusou ? `${nameOf(p.id)} recusou a vaga? Ela sai da fila e a próxima é chamada.` : `Tirar ${nameOf(p.id)} da lista de espera?`)) return
                  savePlayer({ ...p, espera_mensalista: null })
                  setPagou(null)
                  if (recusou) onToast(`${nameOf(p.id)} saiu da fila`)
                }}
              >
                {i === 0 && vagas > 0 ? 'Recusou' : '✕'}
              </button>}
            </div>
          ))}
          {vagas > 0 && pagou !== null && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small">
                Quanto {nameOf(fila[0].id)} pagou?
                {creditoDisponivel(data, fila[0].id) > 0 &&
                  ` Ela tem ${formatarReais(creditoDisponivel(data, fila[0].id))} de crédito: cobre só a diferença.`}
              </span>
              <div className="row wrap" style={{ gap: 6 }}>
                {[MENSALIDADE_PADRAO.valor_cheio - MENSALIDADE_PADRAO.max_checkins * MENSALIDADE_PADRAO.valor_checkin, MENSALIDADE_PADRAO.valor_cheio].map((v) => (
                  <button key={v} className={`chip ${pagou === v ? 'on' : ''}`} onClick={() => setPagou(v)}>
                    {formatarReais(v)}{v < MENSALIDADE_PADRAO.valor_cheio ? ' + 4 check-ins no mês' : ' integral'}
                  </button>
                ))}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost sm grow" onClick={() => setPagou(null)}>Cancelar</button>
                <button className="btn teal sm grow" onClick={() => confirmarNova(fila[0].id, pagou)}>Confirmar pagamento</button>
              </div>
            </div>
          )}
          {vagas > 0 && pagou === null && (
            <span className="hint">Abriu vaga: chame <strong>{nameOf(fila[0].id)}</strong>. Pagou, toque em “Topou e pagou”; não quis, “Recusou” e a próxima é chamada.</span>
          )}
        </div>
      )}
    </div>
  )
}
