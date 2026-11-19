import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui'
import { useStore } from '../lib/store'
import { LIGA } from '../liga'
import { contaInicial, contaNoPlay, gravadosDaDivida, idDoLancamento, pagarDividas, origemDoSaldo, saldoDepois, devidoNoModo, pagoAvulsoDaLista, diaDaLista, diaJaExiste, palpiteDaLista, prepararPagamento, retrato, tipoNaLista, valorInicial, type ContaDoCheckin, type RetratoPagamento } from '../lib/pagamentoNaLista'
import { checkinJaFeito, creditoDisponivel, creditosDeCheckin, disponibilidade, formatarReais, lerValor, livresNoLocal, nomeDoTitular, rotuloDoTipo, saldoAntesDe } from '../lib/checkins'
import { CheckinsParaPagar, problemasDosCheckins, type CheckinParaPagar } from './CheckinsParaPagar'
import { useGravarNaFicha } from './FichaDaMensalidade'
import { avisosDoBanco } from '../data/supabaseRepo'
import { monthLabel, monthOf, plural } from '../lib/types'
import { checkinsDaFicha, comecaNoMesSeguinte, dividaDaMensalidade, fichaDe, proximoMes } from '../lib/fichaDaMensalidade'
import type { Lista, NomeNaLista } from '../lib/listaDePresenca'
import type { Acerto, CheckinDia, CheckinModo, ItemDaMensalidade } from '../lib/types'

type Dividas = { itens: ItemDaMensalidade[]; acertos: Acerto[] }
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
  const { data, repo, canEdit, nameOf, savePlayer, saveCheckinDia, saveCheckin, saveCheckinPagamento, deleteCheckin, deleteCheckinPagamento, saveAcerto, deleteAcerto, deleteItemDaMensalidade } = useStore()
  const gravarNaFicha = useGravarNaFicha()
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [erro, setErro] = useState('')
  /** "Entrou no lugar de": a mensalista escolhida no 💰 (quem entrou depois da saida dela). */
  const [substituta, setSubstituta] = useState<string | null>(null)
  const [semVinculo, setSemVinculo] = useState(false)
  /** Conta as aberturas: com divida, o valor pago abre preenchido com o total (play + atrasado). */
  const [aberturas, setAberturas] = useState(0)
  /** Check-ins que pagam a divida (dono, 18/11): cada um com dia, conta e arena, ou um check-in de credito. */
  const [dividaCheckins, setDividaCheckins] = useState<CheckinParaPagar[]>([])
  const [aviso, setAviso] = useState<{ texto: string; diaId: string; playerId: string; antes: RetratoPagamento | null; marcou: boolean; dividas: Dividas } | null>(null)
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
      const saldo = saldoAntesDe(data, player.id, r?.checkin.id)
      // so o sinal: o valor ela ve ao tocar no 💰 (dono, 18/11)
      if (saldo > 0) previa = { texto: 'Crédito', classe: 'pos' }
      else if (saldo < 0 || dividaDaMensalidade(data, player.id, dia.date).total > 0) previa = { texto: 'Dívida', classe: 'neg' }
    }
  } catch { /* explica ao abrir */ }

  function abrir() {
    setErro(''); setAviso(null); setSubstituta(null); setDividaCheckins([]); setAberturas((n) => n + 1)
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

  /** Troca as dividas pagas por este lancamento (check-ins e Pix da mensalidade, acertos) pelas novas. */
  function trocarDividas(id: string, novas: Dividas) {
    const velhas = gravadosDaDivida(data, id)
    for (const i of velhas.itens) if (!novas.itens.some((x) => x.id === i.id)) deleteItemDaMensalidade(i.id)
    for (const a of velhas.acertos) if (!novas.acertos.some((x) => x.id === a.id)) deleteAcerto(a.id)
    for (const i of novas.itens) gravarNaFicha(i)
    for (const a of novas.acertos) saveAcerto(a)
  }

  /** Volta o lançamento ao retrato de antes (nulo = apaga). O dia criado fica, vazio. */
  function restaurar(playerId: string, diaId: string, antes: RetratoPagamento | null, dividas: Dividas = { itens: [], acertos: [] }) {
    const atual = retrato(data, diaId, playerId)
    trocarDividas(atual?.checkin.id ?? idDoLancamento(diaId, playerId), dividas)
    if (!antes) { if (atual) deleteCheckin(atual.checkin.id); return }
    saveCheckin(antes.checkin)
    if (antes.pagamento) saveCheckinPagamento(antes.pagamento)
    else deleteCheckinPagamento(antes.checkin.id)
  }

  function lancar() {
    if (!edicao || !player) return
    const valor = pagoNoPlay
    if (valor === null || problemas.some(Boolean) || jaFeitoNoPlay) return
    const novo = !diaJaExiste(data, edicao.dia)
    let jaConfirmou = false
    try { jaConfirmou = localStorage.getItem(chave) === '1' } catch { /* pede confirmação */ }
    if ((novo || !jaConfirmou || foraDoCobrado !== 0) && !edicao.confirmar) { setEdicao({ ...edicao, confirmar: true }); return }
    try {
      const antes = retrato(data, edicao.dia.id, player.id)
      const dividasAntes = gravadosDaDivida(data, checkinId)
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
      trocarDividas(depois.checkin.id, plano)
      try { localStorage.setItem(chave, '1') } catch { /* confirma de novo da próxima vez */ }
      setEdicao(null)
      setDividaCheckins([])
      const marcou = marcarPago(true)
      setAviso({ texto: `💰 ${quem} lançada`, diaId: edicao.dia.id, playerId: player.id, antes, marcou, dividas: dividasAntes })
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)) }
  }

  const fechar = () => { setEdicao(null); setErro(''); setDividaCheckins([]) }
  const devido = edicao && player ? devidoNoModo(data, edicao.dia, player.id, edicao.modo) : 0
  const existente = edicao && player ? retrato(data, edicao.dia.id, player.id) : null
  // o que este lancamento ja gravou para pagar dividas nao conta como pago (corrigir refaz)
  const checkinId = edicao && player ? existente?.checkin.id ?? idDoLancamento(edicao.dia.id, player.id) : ''
  const antigos = checkinId ? gravadosDaDivida(data, checkinId) : { itens: [], acertos: [] }
  const ids = new Set([...antigos.itens, ...antigos.acertos].map((x) => x.id))
  const base = ids.size ? { ...data, mensalidadeItens: data.mensalidadeItens.filter((i) => !ids.has(i.id)), checkinAcertos: data.checkinAcertos.filter((a) => !ids.has(a.id)) } : data
  const credito = player ? creditoDisponivel(base, player.id, existente?.checkin.id) : 0
  const divida = player ? Math.max(0, -saldoAntesDe(base, player.id, existente?.checkin.id)) : 0
  // a divida da mensalidade (nao fechou os check-ins no prazo): so depois do prazo, como em toda a mensalidade (dono, 18/11)
  const dividaMens = edicao && player ? dividaDaMensalidade(base, player.id, edicao.dia.date) : { total: 0, porMes: [] }
  const vPago = edicao ? lerValor(edicao.valor) : null
  // cada check-in que paga divida vale a diferenca do dia (integral - com check-in)
  const valorDoCheckin = edicao ? Math.max(0, edicao.dia.valor_cheio - edicao.dia.valor_com_checkin) : 0
  const semColuna41 = repo.kind === 'supabase' && avisosDoBanco.colunas.has('checkin_acertos.local_id')
  const vagasNaMensalidade = player ? dividaMens.porMes.reduce((t, d) => {
    const f = fichaDe(base, player.id, d.mes, edicao?.dia.date)
    return t + Math.min(Math.ceil(d.falta / f.valor_checkin), Math.max(0, f.max_checkins - checkinsDaFicha(f)))
  }, 0) : 0
  // sem o script 41 a arena do check-in da divida de play nao seria gravada: so a mensalidade aceita check-in
  const maxCheckins = valorDoCheckin > 0 ? vagasNaMensalidade + (semColuna41 ? 0 : Math.ceil(divida / valorDoCheckin)) : 0
  const creditoDoPlay = edicao?.conta.creditoDe !== undefined ? edicao.conta.creditoDe : existente?.checkin.credito_de ?? null
  const creditosLivres = edicao && player && edicao.modo === 'checkin' ? creditosDeCheckin(base, player.id, existente?.checkin.id).filter((c) => !dividaCheckins.some((x) => x.credito === c.checkin.id)) : []
  // a mesma conta do Lançar da aba Financeiro: o crédito cobre o que faltar; o resto é sobra ou dívida
  // as contas dela (principal, secundárias como a do marido) com os livres na arena escolhida
  const contas = edicao && player && edicao.modo === 'checkin' && !creditoDoPlay ? disponibilidade(data, player.id, monthOf(edicao.dia.date)).contas : []
  const arenas = data.checkinLocais.filter((l) => l.ativo || l.id === edicao?.conta.localId).sort((a, b) => a.ordem - b.ordem)
  const usoEscolhido = contas.find((u) => (edicao?.conta.contaId === null ? u.conta.principal : u.conta.id === edicao?.conta.contaId))
  const naArena = usoEscolhido ? livresNoLocal(usoEscolhido, edicao?.conta.localId ?? null) : undefined
  const confirmado = edicao?.modo === 'checkin' ? 'com o pagamento e o check-in já CONFIRMADOS' : 'com o pagamento já CONFIRMADO'
  const conta = contaNoPlay(devido, credito, divida)
  const origem = player && (credito > 0 || divida > 0) ? origemDoSaldo(base, player.id, existente?.checkin.id) : []
  const temAtrasado = divida > 0 || dividaMens.total > 0
  // com divida o 💰 cobra o play com o atrasado (dono, 18/11: os botoes "so o play" × "play + atrasado" confundiam);
  // pagar menos e so digitar menos: a tela avisa que nao quita
  const comAtrasado = temAtrasado
  // o total antes dos check-ins: o play de hoje, a divida dos plays e a da mensalidade
  const valorTotal = Math.round((conta.comAtrasado + dividaMens.total) * 100) / 100
  // com o atrasado: o play, a divida dos plays e a da mensalidade, menos o que os check-ins pagam
  const comTudo = Math.max(0, Math.round((conta.comAtrasado + dividaMens.total - valorDoCheckin * dividaCheckins.length) * 100) / 100)
  // o dinheiro acima do play paga primeiro a mensalidade (um Pix na ficha); o resto fica no lancamento do play
  const plano = edicao && player && temAtrasado
    ? pagarDividas(base, player.id, checkinId, edicao.dia.date, dividaCheckins, valorDoCheckin, comAtrasado && vPago !== null ? Math.max(0, vPago - conta.soPlay) : 0)
    : { itens: [], acertos: [] }
  const pixDaMensalidade = plano.itens.filter((i) => i.tipo === 'dinheiro').reduce((t, i) => t + (i.valor ?? 0), 0)
  const pagoNoPlay = vPago === null ? null : Math.round((vPago - pixDaMensalidade) * 100) / 100
  const pagoComCheckin = plano.acertos.reduce((t, a) => t + a.valor, 0)
  const depois = pagoNoPlay === null ? 0 : saldoDepois(credito, divida, devido, pagoNoPlay + pagoComCheckin)
  const soCredito = conta.soPlay === 0 && devido > 0
  // o que a tela mandou cobrar (com divida, o botao escolhido); lancar mais ou menos que isso gera credito ou divida
  const cobrado = temAtrasado ? comTudo : conta.soPlay
  // abriu com divida e sem lancamento antigo: o valor pago ja vem com o total. Se ela tem check-in de credito,
  // ele ja entra pagando a divida (dono, 18/11): quantos precisar, nunca mais do que a divida dos plays pede
  useEffect(() => {
    if (!aberturas || !edicao || !player || !temAtrasado || existente?.pagamento) return
    const creditos = !semColuna41 && divida > 0 && valorDoCheckin > 0
      ? creditosDeCheckin(base, player.id, existente?.checkin.id).filter((c) => c.dia && c.checkin.id !== creditoDoPlay)
      : []
    const n = Math.min(creditos.length, Math.ceil(divida / (valorDoCheckin || 1)), maxCheckins)
    const linhas: CheckinParaPagar[] = creditos.slice(0, n).map((c) => ({ date: c.dia!.date, contaId: null, localId: null, credito: c.checkin.id }))
    setDividaCheckins(linhas)
    setEdicao({ ...edicao, valor: textoValor(Math.max(0, Math.round((conta.comAtrasado + dividaMens.total - valorDoCheckin * n) * 100) / 100)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberturas, temAtrasado])
  const problemas = edicao && player ? problemasDosCheckins(base, player.id, dividaCheckins,
    edicao.modo === 'checkin' && !creditoDoPlay ? [{ date: edicao.dia.date, contaId: edicao.conta.contaId }] : [], [checkinId]) : []
  // o check-in do proprio play tambem: um por conta por dia, em todos os tipos
  const jaFeitoNoPlay = edicao && player && edicao.modo === 'checkin' && !creditoDoPlay ? checkinJaFeito(base, player.id, edicao.conta.contaId, edicao.dia.date, [checkinId]) : null
  const foraDoCobrado = vPago === null ? 0 : Math.round((vPago - cobrado) * 100) / 100
  const ficaComo = depois > 0 ? `fica com ${formatarReais(depois)} de crédito` : depois < 0 ? `fica devendo ${formatarReais(-depois)}` : 'fica sem crédito e sem dívida'

  return <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    {previa && <span className={`saldo-selo ${previa.classe}`}>{previa.texto}</span>}
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
                setEdicao({ ...edicao, modo, valor: existente?.pagamento ? edicao.valor : textoValor(comAtrasado ? Math.max(0, c.comAtrasado + dividaMens.total - valorDoCheckin * dividaCheckins.length) : valorInicial(data, edicao.dia, player.id, modo)) })
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
              {jaFeitoNoPlay && <span className="hint aviso" role="alert">⚠️ O check-in desta conta em {diaCurto(edicao.dia.date)} {jaFeitoNoPlay.texto}. Escolha outra conta{jaFeitoNoPlay.credito ? ' ou use o check-in de crédito' : ''}.</span>}
            </div>
          </>}
          {/* o play de hoje pago com um check-in de credito: vale para o play OU para a divida, nunca os dois (dono, 18/11) */}
          {edicao.modo === 'checkin' && (creditoDoPlay || creditosLivres.length > 0) && (
            <div className="field">
              <span>Check-in de crédito</span>
              {creditoDoPlay ? (
                <div className="row spread" style={{ gap: 8 }}>
                  <span className="small valor-pos">Usa o check-in de crédito de {(() => { const c = data.checkins.find((x) => x.id === creditoDoPlay); const d = c && data.checkinDias.find((x) => x.id === c.dia_id); return d ? diaCurto(d.date) : '?' })()} (não gasta cota)</span>
                  <button className="btn ghost sm" onClick={() => setEdicao({ ...edicao, conta: { ...contaInicial(data, edicao.dia, player.id), creditoDe: null } })}>Não usar</button>
                </div>
              ) : (
                <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="tiny muted">Usar o de</span>
                  {creditosLivres.map((c) => (
                    <button key={c.checkin.id} className="chip" onClick={() => setEdicao({ ...edicao, conta: { ...edicao.conta, creditoDe: c.checkin.id } })}>
                      {c.dia ? diaCurto(c.dia.date) : '?'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
            {/* a divida da mensalidade de quem nao fechou os check-ins (so depois do prazo) */}
            {dividaMens.porMes.map((d) => (
              <div key={d.mes} className="conta-linha conta-total"><span>Deve da mensalidade de {monthLabel(d.mes).split(' ')[0].toLowerCase()}</span><strong className="valor-neg">−{formatarReais(d.falta)}</strong></div>
            ))}
            {temAtrasado && <div className="conta-linha"><span>Play de hoje</span><strong>{formatarReais(conta.soPlay)}</strong></div>}
            {temAtrasado && <div className="conta-linha conta-total"><span>Valor total (play + atrasado)</span><strong>{formatarReais(valorTotal)}</strong></div>}
            {dividaCheckins.length > 0 && <div className="conta-linha"><span>Check-ins para a dívida</span><strong className="valor-pos">−{formatarReais(valorDoCheckin * dividaCheckins.length)}</strong></div>}
          </div>
          {/* PAGAR A DIVIDA COM CHECK-INS (dono, 18/11): quantos, e cada um com dia, conta e arena */}
          {temAtrasado && maxCheckins > 0 && (
            <details className="divida-checkins" open={dividaCheckins.length > 0}>
              <summary className="small"><strong>Pagar a dívida com check-ins</strong></summary>
              <CheckinsParaPagar playerId={player.id} linhas={dividaCheckins} max={maxCheckins} valorDeCada={valorDoCheckin}
                aceitaCredito={!semColuna41 && divida > 0} creditoOcupado={creditoDoPlay}
                outros={edicao.modo === 'checkin' && !creditoDoPlay ? [{ date: edicao.dia.date, contaId: edicao.conta.contaId }] : []}
                ignorar={[checkinId]}
                onMudar={(l) => {
                  setDividaCheckins(l)
                  setEdicao({ ...edicao, valor: textoValor(Math.max(0, Math.round((conta.comAtrasado + dividaMens.total - valorDoCheckin * l.length) * 100) / 100)) })
                }} />
            </details>
          )}
          {soCredito && <p className="banner saldo-credito" role="status" style={{ margin: 0 }}>O crédito dela cobre o play inteiro: não precisa cobrar nada, é só confirmar.</p>}
          <label className="field"><span>Valor pago em dinheiro (R$)</span><input className="input valor" inputMode="decimal" value={edicao.valor} onChange={(e) => setEdicao({ ...edicao, valor: e.target.value })} /></label>
          {(temAtrasado || credito > 0) && (
            <div className="conta-linha small a-cobrar" style={{ marginTop: -4 }}>
              <span>Valor a ser cobrado em dinheiro{dividaCheckins.length > 0 ? ' (já deduzidos os check-ins)' : ''}</span>
              <strong>{formatarReais(cobrado)}</strong>
            </div>
          )}
          {vPago !== null && depois > 0 && <p className="banner saldo-credito" role="status">Fica com <strong>{formatarReais(depois)}</strong> de crédito para o próximo play</p>}
          {vPago !== null && depois < 0 && <p className="banner saldo-divida" role="status">Fica devendo <strong>{formatarReais(-depois)}</strong>{divida > 0 && -depois === divida ? ' (é o que já devia)' : divida > 0 && -depois > divida ? ` (${formatarReais(divida)} de antes)` : ''}</p>}
          {vPago !== null && depois === 0 && (credito > 0 || divida > 0) && <p className="banner saldo-credito" role="status">Fica sem crédito e sem dívida</p>}
          <p className="tiny muted" style={{ margin: 0 }}>✅ Lança já {edicao.modo === 'checkin' ? 'com pagamento e check-in confirmados' : 'com o pagamento confirmado'}.</p>
          <button className="btn pink block" disabled={vPago === null || problemas.some(Boolean) || !!jaFeitoNoPlay} onClick={lancar}>{existente ? 'Salvar correção' : soCredito && vPago === 0 ? 'Confirmar com o crédito' : 'Lançar'}</button>
          {existente && <button className="btn danger block" onClick={() => { restaurar(player.id, edicao.dia.id, null); marcarPago(false); setEdicao(null) }}>Desfazer lançamento</button>}
        </>}
        {erro && <p className="small" role="alert">{erro}</p>}
      </div>
    </Modal>}
    {aviso && createPortal(<div className="toast" role="status" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', padding: '0 8px 0 16px' }} onClick={(e) => e.stopPropagation()}>{aviso.texto} <button className="linkish" style={{ minHeight: 44 }} onClick={() => { restaurar(aviso.playerId, aviso.diaId, aviso.antes, aviso.dividas); if (aviso.marcou) marcarPago(false); setAviso(null) }}>desfazer</button><button className="linkish" style={{ minWidth: 44, minHeight: 44 }} aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button></div>, document.body)}
  </span>
}
