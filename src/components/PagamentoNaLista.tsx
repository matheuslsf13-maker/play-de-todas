import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui'
import { useStore } from '../lib/store'
import { LIGA } from '../liga'
import { contaInicial, devidoNoModo, pagoAvulsoDaLista, diaDaLista, diaJaExiste, palpiteDaLista, prepararPagamento, retrato, tipoNaLista, valorInicial, type ContaDoCheckin, type RetratoPagamento } from '../lib/pagamentoNaLista'
import { creditoDisponivel, disponibilidade, formatarReais, lerValor, livresNoLocal, nomeDoTitular, rotuloDoTipo, saldoAntesDe } from '../lib/checkins'
import { monthOf } from '../lib/types'
import type { Lista, NomeNaLista } from '../lib/listaDePresenca'
import type { CheckinDia, CheckinModo } from '../lib/types'

type Edicao = { dia: CheckinDia; modo: CheckinModo; conta: ContaDoCheckin; valor: string; confirmar: boolean }
const diaCurto = (date: string) => date.slice(8, 10) + '/' + date.slice(5, 7)
const textoValor = (n: number) => n.toFixed(2).replace('.', ',')

/**
 * 💰 da avulsa na lista (só a organização). Grava pelas mesmas ações da aba
 * Check-ins (fila otimista): dia (se for novo), lançamento e pagamento.
 */
export default function PagamentoNaLista({ lista, nome, onVincular }: { lista: Lista; nome: NomeNaLista; onVincular: () => void }) {
  const { data, canEdit, nameOf, savePlayer, saveCheckinDia, saveCheckin, saveCheckinPagamento, deleteCheckin, deleteCheckinPagamento } = useStore()
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [erro, setErro] = useState('')
  const [semVinculo, setSemVinculo] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; diaId: string; playerId: string; antes: RetratoPagamento | null; marcou: boolean } | null>(null)
  // o desfazer fica uns segundos, como os outros avisos; senão cobriria a janela da próxima atleta
  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), 6000)
    return () => window.clearTimeout(t)
  }, [aviso])
  const chave = `${LIGA.prefixo}:pagamento-lista:${lista.id}`
  if (!canEdit || LIGA.id !== 'feminino') return null
  const player = data.players.find((p) => p.id === nome.player_id)
  const categoria = tipoNaLista(data, player, lista)
  // mensalista paga o mês, convidada e isenta não pagam: nada a cobrar aqui
  if (categoria === 'mensalista') return <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>📅 mensalista</span>
  if (categoria === 'convidada' || categoria === 'isenta') return null
  const quem = player ? nameOf(player.id) : nome.nome
  let pago = false
  try { pago = !!(player && retrato(data, diaDaLista(data, lista).id, player.id)?.pagamento?.pagamento_confirmado) } catch { /* explica ao abrir */ }

  function abrir() {
    setErro(''); setAviso(null)
    if (!player) { setSemVinculo(true); return }
    try {
      const dia = diaDaLista(data, lista)
      const modo = retrato(data, dia.id, player.id)?.checkin.modo ?? palpiteDaLista(data, player.id)
      setEdicao({ dia, modo, conta: contaInicial(data, dia, player.id), valor: textoValor(valorInicial(data, dia, player.id, modo)), confirmar: false })
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }

  /** Marca/desmarca o "pago" da avulsa em Meninas; devolve se mudou algo. */
  function marcarPago(pago: boolean): boolean {
    const novo = player ? pagoAvulsoDaLista(data, lista, player, pago) : null
    if (novo) savePlayer(novo)
    return Boolean(novo)
  }

  /** Volta o lançamento ao retrato de antes (nulo = apaga). O dia criado fica, vazio. */
  function restaurar(playerId: string, diaId: string, antes: RetratoPagamento | null) {
    const atual = retrato(data, diaId, playerId)
    if (!antes) { if (atual) deleteCheckin(atual.checkin.id); return }
    saveCheckin(antes.checkin)
    if (antes.pagamento) saveCheckinPagamento(antes.pagamento)
    else deleteCheckinPagamento(antes.checkin.id)
  }

  function lancar() {
    if (!edicao || !player) return
    const valor = lerValor(edicao.valor)
    if (valor === null) return
    const novo = !diaJaExiste(data, edicao.dia)
    let jaConfirmou = false
    try { jaConfirmou = localStorage.getItem(chave) === '1' } catch { /* pede confirmação */ }
    if ((novo || !jaConfirmou) && !edicao.confirmar) { setEdicao({ ...edicao, confirmar: true }); return }
    try {
      const antes = retrato(data, edicao.dia.id, player.id)
      const depois = prepararPagamento(data, edicao.dia, player.id, edicao.modo, valor, edicao.conta)
      if (novo) saveCheckinDia(edicao.dia)
      saveCheckin(depois.checkin)
      saveCheckinPagamento(depois.pagamento)
      try { localStorage.setItem(chave, '1') } catch { /* confirma de novo da próxima vez */ }
      setEdicao(null)
      const marcou = marcarPago(true)
      setAviso({ texto: `💰 ${quem} lançada`, diaId: edicao.dia.id, playerId: player.id, antes, marcou })
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }

  const fechar = () => { setEdicao(null); setErro('') }
  const devido = edicao && player ? devidoNoModo(data, edicao.dia, player.id, edicao.modo) : 0
  const existente = edicao && player ? retrato(data, edicao.dia.id, player.id) : null
  const credito = player ? creditoDisponivel(data, player.id, existente?.checkin.id) : 0
  const divida = player ? Math.max(0, -saldoAntesDe(data, player.id, existente?.checkin.id)) : 0
  const vPago = edicao ? lerValor(edicao.valor) : null
  // a mesma conta do Lançar da aba Check-ins: o crédito cobre o que faltar; o resto é sobra ou dívida
  // as contas dela (principal, secundárias como a do marido) com os livres na arena escolhida
  const contas = edicao && player && edicao.modo === 'checkin' && !existente?.checkin.credito_de ? disponibilidade(data, player.id, monthOf(edicao.dia.date)).contas : []
  const arenas = data.checkinLocais.filter((l) => l.ativo || l.id === edicao?.conta.localId).sort((a, b) => a.ordem - b.ordem)
  const usoEscolhido = contas.find((u) => (edicao?.conta.contaId === null ? u.conta.principal : u.conta.id === edicao?.conta.contaId))
  const naArena = usoEscolhido ? livresNoLocal(usoEscolhido, edicao?.conta.localId ?? null) : undefined
  const confirmado = edicao?.modo === 'checkin' ? 'com o pagamento e o check-in já CONFIRMADOS' : 'com o pagamento já CONFIRMADO'
  const diferenca = vPago === null ? 0 : Math.round((vPago + Math.min(credito, Math.max(0, devido - vPago)) - devido) * 100) / 100

  return <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button className="btn ghost sm" style={{ minWidth: 44, minHeight: 44 }} aria-label={`Pagamento de ${quem}${pago ? ' (lançado)' : ''}`} onClick={abrir}>{pago ? '✅' : '💰'}</button>
    {erro && !edicao && <Modal title="Não foi possível lançar" onClose={() => setErro('')}><p role="alert">{erro}</p></Modal>}
    {semVinculo && <Modal title="Ligue o nome a uma atleta" onClose={() => setSemVinculo(false)}>
      <p>Antes de lançar o pagamento, ligue “{nome.nome}” ao cadastro de uma atleta.</p>
      <button className="btn pink block" onClick={() => { setSemVinculo(false); onVincular() }}>Vincular atleta</button>
    </Modal>}
    {edicao && player && <Modal title={edicao.confirmar ? 'Lançar na aba Check-ins?' : `💰 ${quem}`} onClose={fechar}>
      <div className="stack">
        {edicao.confirmar ? <>
          <p style={{ margin: 0 }}>Isso vai preencher a aba <strong>Check-ins</strong>, no dia {diaCurto(edicao.dia.date)}: {quem}, {edicao.modo === 'checkin' ? `check-in${usoEscolhido ? ` pela conta ${nomeDoTitular(usoEscolhido.conta, quem)}` : ''}${naArena ? ` na ${naArena.local.nome}` : ''}` : 'integral'}, pagou {formatarReais(vPago ?? 0)}.</p>
          <p className="banner info" style={{ margin: 0 }}>✅ Vai {confirmado}. Na aba Check-ins isso costuma ser um passo à parte; aqui já fica feito.</p>
          {!diaJaExiste(data, edicao.dia) && <p className="banner warn" style={{ margin: 0 }}>O dia {diaCurto(edicao.dia.date)} ainda não existe na parte 📅 Dias e vai ser criado, ligado a este play{lista.session_id ? '' : ' (a ligação é feita quando o play for montado)'}.</p>}
          <button className="btn pink block" onClick={lancar}>Confirmar lançamento</button>
          <button className="btn ghost block" onClick={() => setEdicao({ ...edicao, confirmar: false })}>Voltar</button>
        </> : <>
          <div className="segmented" role="group" aria-label="Forma de pagamento">
            {(['integral', 'checkin'] as const).map((modo) => <button key={modo} className={edicao.modo === modo ? 'on' : ''} aria-pressed={edicao.modo === modo} style={{ minHeight: 44 }}
              onClick={() => setEdicao({ ...edicao, modo, valor: existente?.pagamento ? edicao.valor : textoValor(valorInicial(data, edicao.dia, player.id, modo)) })}>
              {modo === 'integral' ? `Integral ${formatarReais(edicao.dia.valor_cheio)}` : `Check-in + ${formatarReais(edicao.dia.valor_com_checkin)}`}
            </button>)}
          </div>
          {contas.length > 0 && <>
            <div className="field">
              <span>Conta do check-in</span>
              <div className="stack" style={{ gap: 6 }}>
                {contas.map((u) => {
                  const on = usoEscolhido?.conta.id === u.conta.id
                  const aqui = livresNoLocal(u, edicao.conta.localId)
                  return <button key={u.conta.id} className={`opcao ${on ? 'on' : ''}`} aria-pressed={on}
                    onClick={() => setEdicao({ ...edicao, conta: { contaId: u.conta.principal ? null : u.conta.id, localId: u.conta.local_padrao_id ?? edicao.conta.localId } })}>
                    <span className="opcao-marca">{on ? '●' : '○'}</span>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      <strong>{nomeDoTitular(u.conta, quem)}</strong>
                      <span className="tiny muted">{u.plano.nome || rotuloDoTipo(u.conta.tipo)}{aqui && (aqui.aceita ? ` · ${aqui.disponiveis} livres em ${aqui.local.nome}` : ` · não aceita ${aqui.local.nome}`)}</span>
                    </span>
                  </button>
                })}
              </div>
            </div>
            <div className="field">
              <span>Arena do check-in</span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {arenas.map((l) => <button key={l.id} className={`chip ${edicao.conta.localId === l.id ? 'on' : ''}`} aria-pressed={edicao.conta.localId === l.id}
                  onClick={() => setEdicao({ ...edicao, conta: { ...edicao.conta, localId: l.id } })}>{l.nome}</button>)}
              </div>
              {naArena && !naArena.aceita && <span className="hint aviso">O plano desta conta não aceita {naArena.local.nome}. Confira a arena ou a conta.</span>}
            </div>
          </>}
          {categoria === 'mensalista-atrasada' && <p className="banner warn" style={{ margin: 0 }}>📅 Mensalidade atrasada: neste play ela paga como avulsa.</p>}
          <label className="field"><span>Valor pago (R$)</span><input className="input valor" inputMode="decimal" value={edicao.valor} onChange={(e) => setEdicao({ ...edicao, valor: e.target.value })} /></label>
          <p className="small muted" style={{ margin: 0 }}>
            Dia {diaCurto(edicao.dia.date)} · deve {formatarReais(devido)}
            {credito > 0 && <> · {formatarReais(Math.min(credito, devido))} saem do crédito dela</>}
            {divida > 0 && <> · já devia {formatarReais(divida)}</>}
          </p>
          {diferenca > 0 && <p className="banner saldo-credito" role="status">💚 Sobra <strong>{formatarReais(diferenca)}</strong> de crédito para o próximo play</p>}
          {diferenca < 0 && <p className="banner saldo-divida" role="status">⚠️ Fica devendo <strong>{formatarReais(-diferenca)}</strong></p>}
          <p className="tiny muted" style={{ margin: 0 }}>✅ Lança já {edicao.modo === 'checkin' ? 'com pagamento e check-in confirmados' : 'com o pagamento confirmado'}.</p>
          <button className="btn pink block" disabled={vPago === null} onClick={lancar}>{existente ? 'Salvar correção' : 'Lançar'}</button>
          {existente && <button className="btn danger block" onClick={() => { restaurar(player.id, edicao.dia.id, null); marcarPago(false); setEdicao(null) }}>Desfazer lançamento</button>}
        </>}
        {erro && <p className="small" role="alert">{erro}</p>}
      </div>
    </Modal>}
    {aviso && createPortal(<div className="toast" role="status" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', padding: '0 8px 0 16px' }} onClick={(e) => e.stopPropagation()}>{aviso.texto} <button className="linkish" style={{ minHeight: 44 }} onClick={() => { restaurar(aviso.playerId, aviso.diaId, aviso.antes); if (aviso.marcou) marcarPago(false); setAviso(null) }}>desfazer</button><button className="linkish" style={{ minWidth: 44, minHeight: 44 }} aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button></div>, document.body)}
  </span>
}
