import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui'
import { mensagemDeErro } from './GestaoDaLista'
import { useStore } from '../lib/store'
import { LIGA } from '../liga'
import { diaDaLista, palpiteDaLista, prepararPagamento, retrato, tipoNaLista, valorInicial, type PedidoPagamento } from '../lib/pagamentoNaLista'
import { formatarReais, lerValor, valorDevido } from '../lib/checkins'
import type { Lista, NomeNaLista } from '../lib/listaDePresenca'
import type { AppData, CheckinModo } from '../lib/types'

type Edicao = { dados: AppData; pedido: PedidoPagamento; modo: CheckinModo; valor: string }
const diaCurto = (date: string) => date.slice(8, 10) + '/' + date.slice(5, 7)
const textoValor = (n: number) => n.toFixed(2).replace('.', ',')

/** Financeiro so na organizacao; nenhum estado financeiro vai para lista_nomes. */
export default function PagamentoNaLista({ lista, nome, onVincular }: { lista: Lista; nome: NomeNaLista; onVincular: () => void }) {
  const { data, canEdit, repo, reload, pendingCount, nameOf } = useStore()
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [erro, setErro] = useState('')
  const [ocupada, setOcupada] = useState(false)
  const [semVinculo, setSemVinculo] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; desfazer: PedidoPagamento } | null>(null)
  const chave = `${LIGA.prefixo}:pagamento-lista:${lista.id}`
  if (!canEdit || LIGA.id !== 'feminino') return null
  const player = data.players.find((p) => p.id === nome.player_id)
  const categoria = tipoNaLista(player)
  if (categoria === 'mensalista') return <span className="tiny muted">📅 mensalista</span>
  if (categoria === 'convidada' || categoria === 'isenta') return null
  let pago = false
  try { pago = !!(nome.player_id && retrato(data, diaDaLista(data, lista).id, nome.player_id)?.pagamento?.pagamento_confirmado) } catch { /* explica ao abrir */ }

  async function abrir() {
    setErro(''); setAviso(null)
    if (!nome.player_id) { setSemVinculo(true); return }
    if (pendingCount) { setErro('Aguarde o envio dos lançamentos pendentes antes de continuar.'); return }
    setOcupada(true)
    try {
      const dados = await repo.load()
      const dia = diaDaLista(dados, lista)
      const antes = retrato(dados, dia.id, nome.player_id)
      const modo = antes?.checkin.modo ?? palpiteDaLista(dados, nome.player_id)
      setEdicao({ dados, pedido: { dia, antes, depois: null, listaId: lista.id, nomeId: nome.id }, modo,
        valor: textoValor(valorInicial(dados, dia, nome.player_id, modo)) })
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupada(false) }
  }
  async function gravar(pedido: PedidoPagamento, desfazer = false) {
    if (ocupada) return
    setOcupada(true); setErro('')
    try {
      await repo.gravarPagamento(pedido)
      await reload()
      setEdicao(null); setConfirmar(false)
      if (desfazer) setAviso(null)
      else {
        try { localStorage.setItem(chave, '1') } catch { /* confirma novamente se nao puder guardar */ }
        setAviso({ texto: `💰 ${nome.player_id ? nameOf(nome.player_id) : nome.nome} lançada`,
          desfazer: { ...pedido, antes: pedido.depois, depois: pedido.antes } })
      }
    } catch (e) { setErro(mensagemDeErro(e)); await reload() } finally { setOcupada(false) }
  }
  function lancar() {
    if (!edicao || !nome.player_id) return
    const valor = lerValor(edicao.valor)
    if (valor === null) return
    const pedido = { ...edicao.pedido, depois: prepararPagamento(edicao.dados, edicao.pedido.dia, nome.player_id, edicao.modo, valor) }
    let jaConfirmou = false
    try { jaConfirmou = localStorage.getItem(chave) === '1' } catch { /* pede confirmacao */ }
    if (!jaConfirmou && !confirmar) { setEdicao({ ...edicao, pedido }); setConfirmar(true); return }
    void gravar(pedido)
  }
  const fechar = () => { if (!ocupada) { setEdicao(null); setConfirmar(false); setErro('') } }
  return <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button className="btn ghost sm" style={{ minWidth: 44, minHeight: 44 }} disabled={ocupada} aria-label={`Pagamento de ${player ? nameOf(player.id) : nome.nome}`} onClick={() => void abrir()}>{pago ? '✅' : '💰'}</button>
    {erro && !edicao && <Modal title="Não foi possível lançar" onClose={() => setErro('')}><p role="alert">{erro}</p></Modal>}
    {semVinculo && <Modal title="Ligue o nome a uma atleta" onClose={() => setSemVinculo(false)}>
      <p>Antes de lançar o pagamento, ligue “{nome.nome}” ao cadastro de uma atleta.</p>
      <button className="btn pink block" onClick={() => { setSemVinculo(false); onVincular() }}>Vincular atleta</button>
    </Modal>}
    {edicao && <Modal title={confirmar ? 'Lançar na aba Check-ins?' : `💰 ${player ? nameOf(player.id) : nome.nome}`} onClose={fechar}>
      <div className="stack">
        {confirmar ? <>
          <p style={{ margin: 0 }}>Isso vai lançar na aba Check-ins, no dia {diaCurto(edicao.pedido.dia.date)}.</p>
          {!edicao.dados.checkinDias.some((d) => d.id === edicao.pedido.dia.id) && <p style={{ margin: 0 }}>O dia {diaCurto(edicao.pedido.dia.date)} ainda não existe e vai ser criado, ligado a este play.{!lista.session_id && ' A ligação será feita quando o play for criado.'}</p>}
          <button className="btn pink block" disabled={ocupada} onClick={lancar}>Confirmar lançamento</button>
          <button className="btn ghost block" disabled={ocupada} onClick={() => setConfirmar(false)}>Voltar</button>
        </> : <>
          <div className="segmented" role="group" aria-label="Forma de pagamento">
            {(['integral', 'checkin'] as const).map((modo) => <button key={modo} className={edicao.modo === modo ? 'active' : ''} style={{ minHeight: 44 }} onClick={() => {
              const c = prepararPagamento(edicao.dados, edicao.pedido.dia, nome.player_id!, modo, 0)
              setEdicao({ ...edicao, modo, valor: textoValor(valorDevido(c.checkin, edicao.pedido.dia, c.pagamento)) })
            }}>{modo === 'integral' ? 'Integral' : 'Check-in'}</button>)}
          </div>
          <label className="field"><span>Valor pago (R$)</span><input className="input valor" inputMode="decimal" value={edicao.valor} onChange={(e) => setEdicao({ ...edicao, valor: e.target.value })} /></label>
          <p className="small muted" style={{ margin: 0 }}>Dia {diaCurto(edicao.pedido.dia.date)} · {edicao.modo === 'checkin' ? 'Check-in' : 'Integral'}: {formatarReais(valorDevido(prepararPagamento(edicao.dados, edicao.pedido.dia, nome.player_id!, edicao.modo, 0).checkin, edicao.pedido.dia, edicao.pedido.antes?.pagamento ?? undefined))}. A diferença entra no saldo dos Check-ins.</p>
          <button className="btn pink block" disabled={ocupada || lerValor(edicao.valor) === null} onClick={lancar}>{ocupada ? 'Lançando…' : 'Lançar'}</button>
          {edicao.pedido.antes && <button className="btn danger block" disabled={ocupada} onClick={() => void gravar({ ...edicao.pedido, depois: null }, true)}>Desfazer lançamento</button>}
        </>}
        {erro && <p className="small" role="alert">{erro}</p>}
      </div>
    </Modal>}
    {aviso && createPortal(<div className="toast" role="status" onClick={(e) => e.stopPropagation()}>{aviso.texto} · <button className="linkish" style={{ minHeight: 44 }} disabled={ocupada} onClick={() => void gravar(aviso.desfazer, true)}>desfazer</button><button className="linkish" style={{ minWidth: 44, minHeight: 44 }} aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button></div>, document.body)}
  </span>
}
