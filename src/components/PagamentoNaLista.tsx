import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui'
import { useStore } from '../lib/store'
import { LIGA } from '../liga'
import { contaInicial, contaNoPlay, origemDoSaldo, saldoDepois, devidoNoModo, pagoAvulsoDaLista, diaDaLista, diaJaExiste, palpiteDaLista, prepararPagamento, retrato, tipoNaLista, valorInicial, type ContaDoCheckin, type RetratoPagamento } from '../lib/pagamentoNaLista'
import { creditoDisponivel, disponibilidade, formatarReais, lerValor, livresNoLocal, nomeDoTitular, rotuloDoTipo, saldoAntesDe } from '../lib/checkins'
import { monthLabel, monthOf, plural } from '../lib/types'
import { comecaNoMesSeguinte, proximoMes } from '../lib/fichaDaMensalidade'
import type { Lista, NomeNaLista } from '../lib/listaDePresenca'
import type { CheckinDia, CheckinModo } from '../lib/types'

type Edicao = { dia: CheckinDia; modo: CheckinModo; conta: ContaDoCheckin; valor: string; confirmar: boolean }
const diaCurto = (date: string) => date.slice(8, 10) + '/' + date.slice(5, 7)
const textoValor = (n: number) => n.toFixed(2).replace('.', ',')

/**
 * 💰 da avulsa na lista (só a organização). Grava pelas mesmas ações da aba
 * Check-ins (fila otimista): dia (se for novo), lançamento e pagamento.
 */
export default function PagamentoNaLista({ lista, nome, onVincular, semSubstituta = [] }: {
  lista: Lista
  nome: NomeNaLista
  onVincular: () => void
  /** Mensalistas que sairam com aviso sem ninguem no lugar (so para quem esta nas confirmadas). */
  semSubstituta?: string[]
}) {
  const { data, repo, canEdit, nameOf, savePlayer, saveCheckinDia, saveCheckin, saveCheckinPagamento, deleteCheckin, deleteCheckinPagamento } = useStore()
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [erro, setErro] = useState('')
  /** "Entrou no lugar de": a mensalista escolhida no 💰 (quem entrou depois da saida dela). */
  const [substituta, setSubstituta] = useState<string | null>(null)
  const [semVinculo, setSemVinculo] = useState(false)
  /** Com divida de antes: cobrar o play com o atrasado (senao, so o play). */
  const [comAtrasado, setComAtrasado] = useState(false)
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
  // a previa da linha: credito ou divida dela, antes de abrir o 💰 (dono, 18/11)
  let previa: { texto: string; classe: string } | null = null
  try {
    const dia = player ? diaDaLista(data, lista) : null
    const r = player && dia ? retrato(data, dia.id, player.id) : null
    pago = !!r?.pagamento?.pagamento_confirmado
    if (player && dia && !pago) {
      const dev = devidoNoModo(data, dia, player.id, r?.checkin.modo ?? palpiteDaLista(data, player.id))
      const saldo = saldoAntesDe(data, player.id, r?.checkin.id)
      if (saldo > 0) previa = saldo >= dev ? { texto: 'crédito cobre', classe: 'valor-pos' } : { texto: `crédito ${formatarReais(saldo)}`, classe: 'valor-pos' }
      else if (saldo < 0) previa = { texto: `deve ${formatarReais(-saldo)}`, classe: 'valor-neg' }
    }
  } catch { /* explica ao abrir */ }

  function abrir() {
    setErro(''); setAviso(null); setSubstituta(null); setComAtrasado(false)
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
    if ((novo || !jaConfirmou || foraDoCobrado !== 0) && !edicao.confirmar) { setEdicao({ ...edicao, confirmar: true }); return }
    try {
      const antes = retrato(data, edicao.dia.id, player.id)
      const depois = prepararPagamento(data, edicao.dia, player.id, edicao.modo, valor, edicao.conta)
      // entrou no lugar de uma mensalista (troca ou tirada com aviso de 24h): o lancamento ja sai como substituta
      if (nome.substitui && !depois.checkin.substitui) depois.checkin.substitui = nome.substitui
      // marcada agora no 💰: o lancamento sai como substituta e a lista guarda a ligacao (sem o script 36: so nao liga)
      if (substituta && !depois.checkin.substitui) {
        depois.checkin.substitui = substituta
        void repo.mexerNoNome(nome.id, { substitui: substituta }).catch(() => {})
      }
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
  // a mesma conta do Lançar da aba Financeiro: o crédito cobre o que faltar; o resto é sobra ou dívida
  // as contas dela (principal, secundárias como a do marido) com os livres na arena escolhida
  const contas = edicao && player && edicao.modo === 'checkin' && !existente?.checkin.credito_de ? disponibilidade(data, player.id, monthOf(edicao.dia.date)).contas : []
  const arenas = data.checkinLocais.filter((l) => l.ativo || l.id === edicao?.conta.localId).sort((a, b) => a.ordem - b.ordem)
  const usoEscolhido = contas.find((u) => (edicao?.conta.contaId === null ? u.conta.principal : u.conta.id === edicao?.conta.contaId))
  const naArena = usoEscolhido ? livresNoLocal(usoEscolhido, edicao?.conta.localId ?? null) : undefined
  const confirmado = edicao?.modo === 'checkin' ? 'com o pagamento e o check-in já CONFIRMADOS' : 'com o pagamento já CONFIRMADO'
  const conta = contaNoPlay(devido, credito, divida)
  const origem = player && (credito > 0 || divida > 0) ? origemDoSaldo(data, player.id, existente?.checkin.id) : []
  const depois = vPago === null ? 0 : saldoDepois(credito, divida, devido, vPago)
  const soCredito = conta.soPlay === 0 && devido > 0
  // o que a tela mandou cobrar (com divida, o botao escolhido); lancar mais ou menos que isso gera credito ou divida
  const cobrado = divida > 0 && comAtrasado ? conta.comAtrasado : conta.soPlay
  const foraDoCobrado = vPago === null ? 0 : Math.round((vPago - cobrado) * 100) / 100
  const ficaComo = depois > 0 ? `fica com ${formatarReais(depois)} de crédito` : depois < 0 ? `fica devendo ${formatarReais(-depois)}` : 'fica sem crédito e sem dívida'

  return <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    {previa && <span className={`tiny nowrap ${previa.classe}`} style={{ marginRight: 4 }}>{previa.texto}</span>}
    <button className="btn ghost sm" style={{ minWidth: 44, minHeight: 44 }} aria-label={`Pagamento de ${quem}${pago ? ' (lançado)' : ''}${previa ? ` (${previa.texto})` : ''}`} onClick={abrir}>{pago ? '✅' : '💰'}</button>
    {erro && !edicao && <Modal title="Não foi possível lançar" onClose={() => setErro('')}><p role="alert">{erro}</p></Modal>}
    {semVinculo && <Modal title="Ligue o nome a uma atleta" onClose={() => setSemVinculo(false)}>
      <p>Antes de lançar o pagamento, ligue “{nome.nome}” ao cadastro de uma atleta.</p>
      <button className="btn pink block" onClick={() => { setSemVinculo(false); onVincular() }}>Vincular atleta</button>
    </Modal>}
    {edicao && player && <Modal title={edicao.confirmar ? 'Lançar na aba Financeiro?' : `💰 ${quem}`} onClose={fechar}>
      <div className="stack">
        {edicao.confirmar ? <>
          <p style={{ margin: 0 }}>Isso vai preencher a aba <strong>Financeiro</strong>, no dia {diaCurto(edicao.dia.date)}: {quem}, {edicao.modo === 'checkin' ? `check-in${usoEscolhido ? ` pela conta ${nomeDoTitular(usoEscolhido.conta, quem)}` : ''}${naArena ? ` na ${naArena.local.nome}` : ''}` : 'integral'}, {vPago === 0 && soCredito ? 'pago com o crédito dela' : `pagou ${formatarReais(vPago ?? 0)}`}.</p>
          {foraDoCobrado > 0 && <p className="banner saldo-credito" role="alert" style={{ margin: 0 }}>Isso vai gerar crédito: você está lançando <strong>{formatarReais(foraDoCobrado)} a mais</strong> do que o cobrado ({formatarReais(cobrado)}). Ela {ficaComo}.</p>}
          {foraDoCobrado < 0 && <p className="banner saldo-divida" role="alert" style={{ margin: 0 }}>{-depois > divida ? 'Isso vai gerar dívida' : 'Isso não quita a dívida'}: você está lançando <strong>{formatarReais(-foraDoCobrado)} a menos</strong> do que o cobrado ({formatarReais(cobrado)}). Ela {ficaComo}.</p>}
          <p className="banner info" style={{ margin: 0 }}>✅ Vai {confirmado}. Na aba Financeiro isso costuma ser um passo à parte; aqui já fica feito.</p>
          {!diaJaExiste(data, edicao.dia) && <p className="banner warn" style={{ margin: 0 }}>O dia {diaCurto(edicao.dia.date)} ainda não existe na parte 📅 Dias e vai ser criado, ligado a este play{lista.session_id ? '' : ' (a ligação é feita quando o play for montado)'}.</p>}
          <button className="btn pink block" onClick={lancar}>Confirmar lançamento</button>
          <button className="btn ghost block" onClick={() => setEdicao({ ...edicao, confirmar: false })}>Voltar</button>
        </> : <>
          <div className="segmented" role="group" aria-label="Forma de pagamento">
            {(['integral', 'checkin'] as const).map((modo) => <button key={modo} className={edicao.modo === modo ? 'on' : ''} aria-pressed={edicao.modo === modo} style={{ minHeight: 44 }}
              onClick={() => {
                const c = contaNoPlay(devidoNoModo(data, edicao.dia, player.id, modo), credito, divida)
                setEdicao({ ...edicao, modo, valor: existente?.pagamento ? edicao.valor : textoValor(comAtrasado ? c.comAtrasado : valorInicial(data, edicao.dia, player.id, modo)) })
              }}>
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
          {categoria === 'mensalista-atrasada' && (comecaNoMesSeguinte(data, player, edicao.dia.date)
            ? <p className="banner info" style={{ margin: 0 }}>📅 Mensalista a partir de {monthLabel(proximoMes(monthOf(edicao.dia.date))).split(' ')[0].toLowerCase()}: neste mês ela paga cada play como avulsa.</p>
            : <p className="banner warn" style={{ margin: 0 }}>📅 Mensalidade atrasada: neste play ela paga como avulsa.</p>)}
          {!nome.substitui && !existente?.checkin.substitui && semSubstituta.length > 0 && (
            <div>
              <label className="toggle-card row">
                <input type="checkbox" checked={substituta !== null} onChange={(e) => setSubstituta(e.target.checked ? semSubstituta[0] : null)} />
                <span className="grow">
                  <strong>🔁 Entrou no lugar de {semSubstituta.length === 1 ? nameOf(semSubstituta[0]) : 'uma mensalista'}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>saiu com aviso de 24h e ficou sem substituta: metade do que ela pagar vai para o 🎉 caixa de eventos</span>
                </span>
              </label>
              {substituta !== null && semSubstituta.length > 1 && (
                <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  {semSubstituta.map((id) => (
                    <button key={id} className={`chip ${substituta === id ? 'on' : ''}`} aria-pressed={substituta === id} onClick={() => setSubstituta(id)}>{nameOf(id)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* a conta inteira, de cima para baixo: play, credito, atrasado e o que cobrar (dono, 18/11) */}
          <div className="conta-aluguel small">
            {/* de onde veio o saldo: o play antigo e quanto ela pagou, verde se a mais, vermelho se a menos (dono, 18/11) */}
            {origem.length > 3 && <div className="tiny muted">… e mais {plural(origem.length - 3, 'lançamento', 'lançamentos')} antes</div>}
            {origem.slice(-3).map((o, i) => {
              // o que ainda vale deste lancamento (as linhas somam o total embaixo)
              const vale = <span className={`nowrap ${o.resta > 0 ? 'valor-pos' : 'valor-neg'}`}>{o.resta < 0 ? '−' : ''}{formatarReais(Math.abs(o.resta))}</span>
              return (
                <div key={i} className="conta-linha">
                  {'acerto' in o
                    ? <span>Acerto {diaCurto(o.date)}</span>
                    : <span>Play {diaCurto(o.date)}: pago <strong className={o.pago > o.devido ? 'valor-pos' : 'valor-neg'}>{formatarReais(o.pago)}</strong> de {formatarReais(o.devido)}</span>}
                  {vale}
                </div>
              )
            })}
            {credito > 0 && <div className="conta-linha conta-total"><span>Total de crédito</span><strong className="valor-pos">{formatarReais(credito)}</strong></div>}
            {divida > 0 && <div className="conta-linha conta-total"><span>Total devido</span><strong className="valor-neg">−{formatarReais(divida)}</strong></div>}
            {/* com divida, os dois botoes embaixo ja dizem quanto cobrar */}
            {credito > 0 && <div className="conta-linha"><span>Cobrar</span><strong>{formatarReais(conta.soPlay)}</strong></div>}
          </div>
          {divida > 0 && (
            <div className="segmented" role="group" aria-label="O que cobrar">
              {([false, true] as const).map((com) => (
                <button key={String(com)} className={comAtrasado === com ? 'on' : ''} aria-pressed={comAtrasado === com} style={{ minHeight: 44 }}
                  onClick={() => { setComAtrasado(com); setEdicao({ ...edicao, valor: textoValor(com ? conta.comAtrasado : conta.soPlay) }) }}>
                  {com ? `Play + atrasado ${formatarReais(conta.comAtrasado)}` : `Só o play ${formatarReais(conta.soPlay)}`}
                </button>
              ))}
            </div>
          )}
          {soCredito && <p className="banner saldo-credito" role="status" style={{ margin: 0 }}>O crédito dela cobre o play inteiro: não precisa cobrar nada, é só confirmar.</p>}
          <label className="field"><span>Valor pago (R$)</span><input className="input valor" inputMode="decimal" value={edicao.valor} onChange={(e) => setEdicao({ ...edicao, valor: e.target.value })} /></label>
          {vPago !== null && depois > 0 && <p className="banner saldo-credito" role="status">Fica com <strong>{formatarReais(depois)}</strong> de crédito para o próximo play</p>}
          {vPago !== null && depois < 0 && <p className="banner saldo-divida" role="status">Fica devendo <strong>{formatarReais(-depois)}</strong>{divida > 0 && -depois === divida ? ' (é o que já devia)' : divida > 0 && -depois > divida ? ` (${formatarReais(divida)} de antes)` : ''}</p>}
          {vPago !== null && depois === 0 && (credito > 0 || divida > 0) && <p className="banner saldo-credito" role="status">Fica sem crédito e sem dívida</p>}
          <p className="tiny muted" style={{ margin: 0 }}>✅ Lança já {edicao.modo === 'checkin' ? 'com pagamento e check-in confirmados' : 'com o pagamento confirmado'}.</p>
          <button className="btn pink block" disabled={vPago === null} onClick={lancar}>{existente ? 'Salvar correção' : soCredito && vPago === 0 ? 'Confirmar com o crédito' : 'Lançar'}</button>
          {existente && <button className="btn danger block" onClick={() => { restaurar(player.id, edicao.dia.id, null); marcarPago(false); setEdicao(null) }}>Desfazer lançamento</button>}
        </>}
        {erro && <p className="small" role="alert">{erro}</p>}
      </div>
    </Modal>}
    {aviso && createPortal(<div className="toast" role="status" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', padding: '0 8px 0 16px' }} onClick={(e) => e.stopPropagation()}>{aviso.texto} <button className="linkish" style={{ minHeight: 44 }} onClick={() => { restaurar(aviso.playerId, aviso.diaId, aviso.antes); if (aviso.marcou) marcarPago(false); setAviso(null) }}>desfazer</button><button className="linkish" style={{ minWidth: 44, minHeight: 44 }} aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button></div>, document.body)}
  </span>
}
