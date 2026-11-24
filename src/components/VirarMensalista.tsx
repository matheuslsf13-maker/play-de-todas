import { useState } from 'react'
import { Modal } from './ui'
import { useGravarNaFicha } from './FichaDaMensalidade'
import { useStore } from '../lib/store'
import { creditoDisponivel, formatarReais } from '../lib/checkins'
import {
  contaDaRenovacao, creditoDaMensalidade, dividaDaMensalidade, dividirPix, fichaDe, MES_INICIAL, mesSugeridoParaVirar, prazoDosCheckins,
  proximoMes, vencimento,
} from '../lib/fichaDaMensalidade'
import { dateLabel, monthLabel, todayISO, uid, type ItemDaMensalidade, type Player } from '../lib/types'

const nomeDoMes = (mes: string) => monthLabel(mes).split(' ')[0].toLowerCase()
const dm = (date: string) => dateLabel(date).slice(0, 5)

/*
 * VIRAR MENSALISTA (dono, 24/11): uma janela so para a Forma de pagamento e o "Topou e pagou" da fila.
 * Escolhe o mes (ate o dia 5 o do mes; depois o seguinte, e o do mes vira "renovacao atrasada"), o valor
 * (80 + check-ins ou 180) e a data do Pix (pode ser de dias atras). O credito dela entra primeiro e a divida
 * da mensalidade anterior e quitada antes (`contaDaRenovacao`, `dividirPix`: a mesma conta da ficha).
 * Mes passado nao entra: o prazo dos check-ins dele ja venceu e viraria divida na hora.
 * Novembro/2026 (transicao) so marca o `pago_mes`, como antes.
 */
export function VirarMensalista({ jogadora, origem, onClose, onToast }: {
  jogadora: Player
  origem: 'plano' | 'fila'
  onClose: () => void
  onToast: (m: string) => void
}) {
  const { data, nameOf, savePlayer, saveAcerto } = useStore()
  const gravarNaFicha = useGravarNaFicha()
  const hoje = todayISO()
  const mesHoje = hoje.slice(0, 7)
  const [mes, setMes] = useState(mesSugeridoParaVirar(hoje))
  const [date, setDate] = useState(hoje)
  const id = jogadora.id
  const transicao = mes < MES_INICIAL
  const f = fichaDe(data, id, mes)
  const parcial = f.valor_cheio - f.max_checkins * f.valor_checkin
  const [valor, setValor] = useState(parcial)
  const atrasada = mes === mesHoje && vencimento(mes) < hoje
  const divida = dividaDaMensalidade(data, id, date).porMes.filter((d) => d.mes !== mes).reduce((t, d) => t + d.falta, 0)
  // o credito que nasceu desta mesma ficha (pago sem renovar) ja esta nela: nao conta duas vezes
  const doMes = creditoDaMensalidade(data, id, hoje).porMes.find((c) => c.mes === mes)?.valor ?? 0
  const credito = Math.max(0, creditoDisponivel(data, id) - doMes)
  const { usa, cobrar } = contaDaRenovacao(f, credito, divida, date, valor)

  function confirmar() {
    if (date > hoje) return onToast('A data do Pix não pode ser no futuro.')
    const agora = new Date().toISOString()
    const item = (i: Pick<ItemDaMensalidade, 'mes' | 'tipo' | 'valor' | 'observacao'>): ItemDaMensalidade => ({
      ...i, id: uid(), player_id: id, date, conta_id: null, local_id: null, confirmado: true, created_at: agora,
    })
    try {
      if (!transicao) {
        if (usa > 0) {
          // mesmo id da ficha: apagar o abatimento la devolve o credito
          saveAcerto({ id: `renovacao-credito:${id}:${mes}`, player_id: id, date, valor: -usa, dinheiro: false, descricao: `usado na mensalidade de ${monthLabel(mes).toLowerCase()}`, created_at: agora })
          gravarNaFicha(item({ mes, tipo: 'abatimento', valor: usa, observacao: 'crédito usado na renovação' }))
        }
        const obs = origem === 'fila' ? 'entrou pela lista de espera' : atrasada ? 'renovação atrasada' : null
        for (const p of cobrar > 0 ? dividirPix(data, id, mes, cobrar, date) : []) gravarNaFicha(item({ ...p, observacao: p.observacao ?? obs }))
      }
    } catch (e) {
      return onToast(e instanceof Error ? e.message : 'Não deu para gravar a mensalidade.')
    }
    void savePlayer({ ...jogadora, categoria: 'mensalista', espera_mensalista: null, pago_mes: transicao ? mes : null, pago_avulso: false })
    onToast(`${nameOf(id)} é mensalista de ${nomeDoMes(mes)}`)
    onClose()
  }

  return (
    <Modal title={`📅 ${nameOf(id)} vira mensalista`} onClose={onClose}>
      <div className="field">
        <span>Mensalista de qual mês?</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {[mesHoje, proximoMes(mesHoje)].map((m) => (
            <button key={m} className={`chip ${mes === m ? 'on' : ''}`} onClick={() => setMes(m)}>{monthLabel(m)}</button>
          ))}
        </div>
      </div>
      {transicao ? (
        <div className="banner info" style={{ marginTop: 10 }}>
          Novembro é o mês de transição: marca novembro pago no cadastro, como antes (sem Pix no app). Ela entra sozinha nas listas de novembro; a de dezembro é renovada na ficha até 05/12.
        </div>
      ) : atrasada ? (
        <div className="banner warn" style={{ marginTop: 10 }}>
          ⚠️ <strong>Renovação atrasada.</strong> A mensalidade de {nomeDoMes(mes)} tinha que ser renovada até {dm(vencimento(mes))}. Ela fica em dia em {nomeDoMes(mes)} a partir da data do Pix; os check-ins vão até {dm(prazoDosCheckins(mes))}. Plays já lançados como avulsa continuam como estão.
        </div>
      ) : mes !== mesHoje ? (
        <div className="banner info" style={{ marginTop: 10 }}>
          📅 Mensalista a partir de {nomeDoMes(mes)}: segura a vaga já, e até lá paga cada play como avulsa. A renovação de {nomeDoMes(mes)} vence em {dm(vencimento(mes))}.
        </div>
      ) : null}

      {!transicao && (
        <>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Quanto ela pagou?</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {[parcial, f.valor_cheio].map((v) => (
                <button key={v} className={`chip ${valor === v ? 'on' : ''}`} onClick={() => setValor(v)}>
                  {formatarReais(v)}{v < f.valor_cheio ? ` + ${f.max_checkins} check-ins` : ' integral'}
                </button>
              ))}
            </div>
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Data do Pix</span>
            <input className="input" type="date" value={date} max={hoje} onChange={(e) => setDate(e.target.value || hoje)} />
          </label>
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>A receita entra no mês desta data.</p>
          {(usa > 0 || divida > 0) && (
            <div className="banner" style={{ marginTop: 10 }}>
              {usa > 0 && <>💰 {formatarReais(usa)} do crédito dela entram na mensalidade.<br /></>}
              {divida > 0 && <>💸 Deve {formatarReais(divida)} da mensalidade anterior: o Pix quita isso primeiro.<br /></>}
              <strong>Cobrar {formatarReais(cobrar)} no Pix.</strong>
            </div>
          )}
        </>
      )}

      <button className="btn teal block" style={{ marginTop: 14 }} onClick={confirmar}>
        {transicao ? `Virar mensalista de ${nomeDoMes(mes)}` : cobrar > 0 ? `Recebi os ${formatarReais(cobrar)} — virar mensalista` : 'Virar mensalista com o crédito'}
      </button>
      <button className="btn ghost block sm" style={{ marginTop: 8 }} onClick={onClose}>Cancelar</button>
    </Modal>
  )
}
