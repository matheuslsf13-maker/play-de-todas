import { VALOR_CHEIO_INICIAL, VALOR_COM_CHECKIN_INICIAL, idDoLancamento, naoPago } from '../lib/pagamentoNaLista'
import CampoDeBusca from '../components/CampoDeBusca'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { LIGA } from '../liga'
import { FichaDaMensalidade, mensalidadeDeHoje, resumoDaMensalidade } from '../components/FichaDaMensalidade'
import { alertaDosCheckins, alertasDosCheckins, textoDoAlerta, dividaDaMensalidade, emDiaNaData, fichaDe, MES_INICIAL, mesAnterior } from '../lib/fichaDaMensalidade'
import { AlertasDeCheckin } from '../components/ListaDeMensalistas'
import { ListaDeMensalistas } from '../components/ListaDeMensalistas'
import { EditarPlanoDaAtleta } from '../components/EditarPlanoDaAtleta'
import { VagasDeMensalista } from '../components/VagasDeMensalista'
import { checkinsNaArenaPorOrigem, contaDoAluguel } from '../lib/aluguel'
import { CATEGORIAS, categoriaDe, type Categoria } from '../lib/mensalidade'
import { Avatar, Empty, Modal, StatBox, baixarOuCompartilhar, shareOrCopy } from '../components/ui'
import { avisosDoBanco } from '../data/supabaseRepo'
import {
  CATEGORIAS_DE_CAIXA,
  COTA_MENSAL,
  TIPOS_DE_CONTA,
  appDaConta,
  arenasAfiliadas,
  aulasDaConta,
  palpiteDaConta,
  consumoDasAulas,
  cotaDoPlano,
  destinoDoExcedente,
  checkinDaAtletaNoDia,
  checkinsDoDia,
  contaDoCheckin,
  contasDaAtleta,
  diasDoMes,
  saldoAntesDe,
  disponibilidade,
  extratoDaAtleta,
  formatarReais,
  lerValor,
  livresNoLocal,
  mesesComCheckins,
  nomeDoTitular,
  pagamentoDoCheckin,
  planoDaConta,
  relatorioDasArenas,
  resumoDoCaixa,
  economiaDoAluguel,
  descontoDoAluguel,
  DESCONTO_DO_PLANO,
  entradasDosEventos,
  saidasDosEventos,
  saldoDosEventosEm,
  type EntradaDosEventos,
  rotuloDoDia,
  rotuloDoTipo,
  saldoDaAtleta,
  saldoDoCheckin,
  statusDoCheckin,
  textoDoRelatorio,
  valorDevido,
  type FiltroDoRelatorio,
  type LinhaDoResumo,
  type UsoDaConta,
  type UsoNoLocal,
  creditosDeCheckin,
  gastaCheckin,
  avisoAoApagarLancamentos,
  checkinJaFeito,
} from '../lib/checkins'
import { mesesDoFiltro, planilhasCompletas, planilhasDasArenas } from '../lib/exportarCheckins'
import { normalizar } from '../lib/roster'
import { useStore } from '../lib/store'
import {
  EXCEDENTE_EM_DINHEIRO,
  EXCEDENTE_PARA_LOCAL,
  dateLabel,
  monthLabel,
  monthOf,
  plural,
  todayISO,
  uid,
  type Acerto,
  type AppData,
  type AulaDaConta,
  type CategoriaDeCaixa,
  type LancamentoDeCaixa,
  type Checkin,
  type CheckinConta,
  type CheckinDia,
  type CheckinLocal,
  type CheckinModo,
  type Plano,
  type Player,
} from '../lib/types'
import { gerarXlsx } from '../lib/xlsx'

/**
 * ✅ CHECK-INS
 *
 * A planilha da organizadora, dentro do app: quem fez check-in em qual arena,
 * com qual conta, quanto pagou e quanto sobra da cota do mes. Tudo e derivado
 * na hora de ler (`src/lib/checkins.ts`); aqui so tem tela.
 *
 * O dinheiro (pagamentos e caixa) so aparece para quem esta logada: e a unica
 * parte do app que nao e publica, porque a chave anon e publica.
 */

type Secao = 'atletas' | 'mensalistas' | 'dias' | 'arenas' | 'caixa' | 'eventos' | 'padroes'

/** O modal da atleta abre nas contas, no extrato do saldo ou direto no acerto. */
type VisaoDasContas = 'contas' | 'extrato' | 'acerto'

/** O que o modal de lancamento recebe: um lancamento existente, ou de quem e de que dia e o novo. */
type PedidoDeLancamento = { checkin?: Checkin; playerId?: string; diaId?: string }

const CHAVE_DA_SECAO = `${LIGA.prefixo}:checkins-secao`
const SECOES: Secao[] = ['atletas', 'mensalistas', 'dias', 'arenas', 'caixa', 'eventos', 'padroes']

function secaoSalva(): Secao {
  try {
    const v = localStorage.getItem(CHAVE_DA_SECAO)
    if (v && (SECOES as string[]).includes(v)) return v as Secao
  } catch {
    /* sem localStorage */
  }
  return 'atletas'
}


/** "25" ou "25,50": o texto que vai para o campo de valor. */
function textoDoValor(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')
}

/** "setembro", para caber na linha da atleta. */
function nomeDoMes(mes: string): string {
  return monthLabel(mes).split(' de ')[0].toLowerCase()
}

export default function Checkins({ onToast }: { onToast: (m: string) => void }) {
  const { data, canEdit, online } = useStore()
  const [secao, setSecao] = useState<Secao>(secaoSalva)
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_DA_SECAO, secao)
    } catch {
      /* sem localStorage */
    }
  }, [secao])
  const [mes, setMes] = useState(() => monthOf(todayISO()))
  const [contasDe, setContasDe] = useState<{ jogadora: Player; visao: VisaoDasContas } | null>(null)
  const [lancando, setLancando] = useState<PedidoDeLancamento | null>(null)
  const [fichaDe_, setFichaDe] = useState<string | null>(null)
  const [planoDeId, setPlanoDeId] = useState<string | null>(null)
  // sempre o cadastro de agora: uma copia antiga desfaria o que outro aparelho mudou
  const planoDe = data.players.find((x) => x.id === planoDeId) ?? null
  const [editandoDia, setEditandoDia] = useState<CheckinDia | 'novo' | null>(null)

  // so quem esta logada ve dinheiro (no modo local, todo mundo e a organizadora)
  const veDinheiro = canEdit
  // as tabelas que o banco ainda nao tem: editar antes do script rodar travaria a fila
  const tabelasFaltando = online ? [...avisosDoBanco.tabelas] : []
  const podeEditar = canEdit && tabelasFaltando.length === 0

  const meses = useMemo(() => mesesComCheckins(data), [data])
  // a secao guardada pode ser o Caixa de quando estava logada: deslogada, cai em Atletas
  // a mensalidade so existe no Play de Todas e so a organizadora logada mexe nela
  const temMensalistas = LIGA.id === 'feminino' && veDinheiro
  // a caixinha de eventos e dinheiro do Play de Todas: so logada
  const temEventos = LIGA.id === 'feminino' && veDinheiro
  const secaoAtiva: Secao =
    (secao === 'caixa' && !veDinheiro) || (secao === 'mensalistas' && !temMensalistas) || (secao === 'eventos' && !temEventos) ? 'atletas' : secao
  /** O "Usar a caixinha" da aba Eventos abre o Caixa ja com a opcao marcada. */
  const [gastoDaCaixinha, setGastoDaCaixinha] = useState(0)

  const alertas = temMensalistas ? alertasDosCheckins(data) : []
  const secoes: { id: Secao; rotulo: string }[] = [
    { id: 'atletas', rotulo: '👯 Atletas' },
    ...(temMensalistas ? [{ id: 'mensalistas' as const, rotulo: `📅 Mensalistas${alertas.length ? ' ⚠️' : ''}` }] : []),
    { id: 'dias', rotulo: '📅 Dias' },
    { id: 'arenas', rotulo: '📤 Arenas' },
    ...(veDinheiro ? [{ id: 'caixa' as const, rotulo: '💰 Caixa' }] : []),
    // o ⚙️ saiu daqui para o cabecalho, ao lado do mes; no lugar dele, a caixinha (dono, 16/11)
    ...(temEventos ? [{ id: 'eventos' as const, rotulo: '🎉 Eventos' }] : []),
  ]

  return (
    <>
      {tabelasFaltando.length > 0 && (
        <div className="banner warn">
          ⚠️ <strong>O banco ainda não tem {tabelasFaltando.length === 1 ? 'esta tabela' : 'estas tabelas'}:</strong>{' '}
          {tabelasFaltando.map((t) => <code key={t}>{t}</code>).reduce((a, b) => <>{a}, {b}</>)}. Rode{' '}
          {[...new Set(tabelasFaltando.map((t) => (t === 'checkin_acertos' ? '17-acertos.sql' : t === 'checkin_planos' ? '18-planos.sql' : '15-checkins.sql')))]
            .sort()
            .map((f) => <code key={f}>supabase/{f}</code>)
            .reduce((a, b) => <>{a} e {b}</>)}{' '}
          no SQL Editor do Supabase; até lá esta aba fica só de leitura.
        </div>
      )}

      <div className="card">
        <div className="row spread" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ margin: 0 }}>💰 Financeiro</div>
          <div className="row" style={{ gap: 8 }}>
            <select className="select" style={{ width: 'auto' }} value={mes} onChange={(e) => setMes(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <button
              className={`btn ${secaoAtiva === 'padroes' ? 'pink' : 'ghost'}`}
              style={{ width: 44, height: 44, padding: 0, flex: 'none' }}
              aria-label="Ajustes do financeiro (arenas, planos e valores)"
              aria-pressed={secaoAtiva === 'padroes'}
              title="Ajustes"
              onClick={() => setSecao(secaoAtiva === 'padroes' ? 'atletas' : 'padroes')}
            >
              ⚙️
            </button>
          </div>
        </div>
        <div className="segmented quebra" style={{ '--cols': secoes.length === 4 ? 2 : Math.min(3, secoes.length) } as CSSProperties}>
          {secoes.map((s) => (
            <button key={s.id} className={secaoAtiva === s.id ? 'on' : ''} onClick={() => setSecao(s.id)}>
              {s.rotulo}
            </button>
          ))}
        </div>
      </div>

      {secaoAtiva === 'atletas' && <AlertasDeCheckin alertas={alertas} onAbrir={setFichaDe} />}
      {secaoAtiva === 'atletas' && (
        <SecaoAtletas
          mes={mes}
          veDinheiro={veDinheiro}
          podeEditar={podeEditar}
          onContas={(jogadora, visao) => setContasDe({ jogadora, visao })}
          onLancar={(playerId) => setLancando({ playerId, diaId: diasDoMes(data, mes)[0]?.id })}
          onMensalidade={setFichaDe}
          onPlano={(p) => setPlanoDeId(p.id)}
        />
      )}
      {secaoAtiva === 'mensalistas' && (
        <>
          <AlertasDeCheckin alertas={alertas} onAbrir={setFichaDe} />
          <VagasDeMensalista onToast={onToast} />
          <ListaDeMensalistas onAbrir={setFichaDe} />
        </>
      )}
      {secaoAtiva === 'dias' && (
        <SecaoDias
          mes={mes}
          veDinheiro={veDinheiro}
          podeEditar={podeEditar}
          onNovoDia={() => setEditandoDia('novo')}
          onEditarDia={setEditandoDia}
          onLancar={setLancando}
        />
      )}
      {secaoAtiva === 'arenas' && <SecaoArenas mes={mes} onToast={onToast} />}
      {secaoAtiva === 'caixa' && veDinheiro && (
        <SecaoCaixa key={gastoDaCaixinha} mes={mes} podeEditar={podeEditar} onToast={onToast} comCaixinha={gastoDaCaixinha > 0} />
      )}
      {secaoAtiva === 'eventos' && temEventos && (
        <HistoricoDosEventos
          ate={mes}
          podeEditar={podeEditar}
          onToast={onToast}
          onUsar={() => {
            setGastoDaCaixinha((n) => n + 1)
            setSecao('caixa')
          }}
        />
      )}
      {secaoAtiva === 'padroes' && <SecaoPadroes podeEditar={podeEditar} onToast={onToast} />}

      {planoDe && <EditarPlanoDaAtleta jogadora={planoDe} onClose={() => setPlanoDeId(null)} onToast={onToast} onAbrirFicha={setFichaDe} />}
      {fichaDe_ && <FichaDaMensalidade playerId={fichaDe_} onClose={() => setFichaDe(null)} onToast={onToast} />}
      {contasDe && (
        <ContasModal
          jogadora={contasDe.jogadora}
          visaoInicial={contasDe.visao}
          mes={mes}
          veDinheiro={veDinheiro}
          podeEditar={podeEditar}
          onClose={() => setContasDe(null)}
          onToast={onToast}
        />
      )}
      {editandoDia && (
        <EditarDiaModal
          dia={editandoDia === 'novo' ? null : editandoDia}
          mes={mes}
          onClose={() => setEditandoDia(null)}
          onToast={onToast}
        />
      )}
      {lancando && (
        <LancarModal
          // abrir "esse lancamento" troca o pedido no mesmo lugar da arvore: a chave remonta o modal com o estado certo
          key={lancando.checkin?.id ?? `novo:${lancando.playerId ?? ''}:${lancando.diaId ?? ''}`}
          pedido={lancando}
          onTrocar={(checkin) => setLancando({ checkin })}
          onClose={() => setLancando(null)}
          onToast={onToast}
        />
      )}
    </>
  )
}

/* ================================================================ atletas */

/** "V3 4/12 · Itaparica — · GW 12/12": o que sobra da conta em cada arena. */
function LivresPorLocal({ uso }: { uso: UsoDaConta }) {
  return (
    <span className="tiny">
      {uso.locais.map((u, i) => (
        <span key={u.local.id}>
          {i > 0 && <span className="muted"> · </span>}
          <span className="muted">{nomeCurto(u.local.nome)} </span>
          {!u.aceita ? (
            <span className="muted" title={`${uso.plano.nome} não aceita ${u.local.nome}`}>—</span>
          ) : (
            <>
              <strong className={u.disponiveis < 0 ? 'valor-neg' : u.disponiveis === 0 ? 'muted' : undefined} title={detalheDoUso(u)}>
                {u.disponiveis}/{u.cota}
              </strong>
            </>
          )}
        </span>
      ))}
    </span>
  )
}

/** "12 − 4 (aulas de outra conta) − 1 (play) = 7": de onde saiu o que sobra. */
function detalheDoUso(u: UsoNoLocal): string {
  // na ordem em que a cota e gasta: o que cobre dos outros, os plays lancados, as aulas daqui
  const partes: string[] = []
  for (const r of u.complementos) {
    partes.push(r.deLocal.id !== u.local.id ? `${r.quanto} das aulas na ${nomeCurto(r.deLocal.nome)}` : `${r.quanto} das aulas de outra conta`)
  }
  if (u.usadosEmPlays > 0) partes.push(`${u.usadosEmPlays} de play${u.usadosEmPlays === 1 ? '' : 's'}`)
  if (u.consumoAulas > 0) partes.push(`${u.consumoAulas} das aulas`)
  return partes.length === 0 ? `${u.cota} sem uso` : `${u.cota} − ${partes.join(' − ')} = ${u.disponiveis}`
}

/** "Arena V3" -> "V3", "Itaparica Beach" -> "Itaparica", "GW Líder" -> "GW". */
function nomeCurto(nome: string): string {
  const semArena = nome.replace(/^arena\s+/i, '')
  return semArena.split(/\s+/)[0]
}

/** "3× V3 (4 pela conta Matheus) · 1× Itaparica" ou "sem aulas". */
function textoDasAulas(data: AppData, conta: CheckinConta, uso?: UsoDaConta): string {
  const aulas = aulasDaConta(conta)
  if (aulas.length === 0) return 'sem aulas'
  return aulas
    .map((a) => {
      const u = uso?.locais.find((x) => x.local.id === a.local_id)
      const destino =
        u && u.excedente > 0
          ? u.excedentePara === 'dinheiro'
            ? ` (${u.excedente} em dinheiro)`
            : u.excedentePara === 'conta'
              ? ` (${u.excedente} pela conta ${data.checkinContas.find((c) => c.id === a.excedente)?.nome || 'principal'})`
              : u.excedentePara === 'local'
                ? ` (${u.excedente} pela ${nomeCurto(data.checkinLocais.find((l) => `${EXCEDENTE_PARA_LOCAL}${l.id}` === a.excedente)?.nome ?? '?')})`
                : ` (${u.excedente} sem destino)`
          : ''
      return `${a.por_semana}× ${nomeCurto(data.checkinLocais.find((l) => l.id === a.local_id)?.nome ?? '?')}${destino}`
    })
    .join(' · ')
}

function BadgeSaldo({ saldo }: { saldo: number }) {
  if (saldo > 0) return <span className="badge credito">crédito {formatarReais(saldo)}</span>
  if (saldo < 0) return <span className="badge debito">deve {formatarReais(-saldo)}</span>
  return <span className="badge zerado">em dia</span>
}

type SituacaoDaAtleta = 'alerta' | 'devendo' | 'credito' | 'checkin-credito'
const SITUACOES: { id: SituacaoDaAtleta; rotulo: string }[] = [
  { id: 'alerta', rotulo: '⚠️ Check-in apertado' },
  { id: 'devendo', rotulo: 'Devendo' },
  { id: 'credito', rotulo: '💚 Crédito em dinheiro' },
  { id: 'checkin-credito', rotulo: '🎟️ Check-in de crédito' },
]

function SecaoAtletas({
  mes,
  veDinheiro,
  podeEditar,
  onContas,
  onLancar,
  onMensalidade,
  onPlano,
}: {
  mes: string
  veDinheiro: boolean
  podeEditar: boolean
  onContas: (p: Player, visao: VisaoDasContas) => void
  onLancar: (playerId: string) => void
  /** 📅 a ficha da mensalidade (so mensalista, so o Play de Todas). */
  onMensalidade: (playerId: string) => void
  /** 💳 muda como ela paga (mensalista, avulsa...). */
  onPlano: (p: Player) => void
}) {
  const { data, nameOf } = useStore()
  const hoje = todayISO()
  const mesDaMensalidade = mensalidadeDeHoje(hoje)
  const temMensalidade = (p: Player) => LIGA.id === 'feminino' && veDinheiro && categoriaDe(p) === 'mensalista'
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState<Categoria | null>(null)
  /** A situacao do dinheiro (dono, 18/11): ver de cara quem deve, quem tem credito e quem esta com alerta. */
  const [situacao, setSituacao] = useState<SituacaoDaAtleta | null>(null)
  /** A atleta com a folha de acoes aberta (tocou na linha), como na aba Meninas. */
  const [aberta, setAberta] = useState<string | null>(null)
  const termo = normalizar(busca)
  const mensalidadeDe = (id: string) =>
    resumoDaMensalidade(
      fichaDe(data, id, mesDaMensalidade),
      hoje,
      dividaDaMensalidade(data, id, hoje).porMes.filter((x) => x.mes < mesDaMensalidade).reduce((t, x) => t + x.falta, 0),
    )

  const situacoes = new Map(data.players.map((p) => [p.id, situacoesDaAtleta(p)]))
  const lista = [...data.players]
    .filter(
      (p) =>
        // por categoria so as ativas, como conta a vaga de mensalista; as inativas ficam em "Todas"
        (cat === null || (p.active && categoriaDe(p) === cat)) &&
        (situacao === null || situacoes.get(p.id)!.includes(situacao)) &&
        (!termo ||
        normalizar(p.name).includes(termo) ||
        normalizar(p.nickname ?? '').includes(termo) ||
        (p.aliases ?? []).some((a) => normalizar(a).includes(termo))),
    )
    // quem tem alerta vem em cima (dono, 18/11): a lista e comprida e o aviso embaixo ninguem ve
    .sort((a, b) => Number(situacoes.get(b.id)!.includes('alerta')) - Number(situacoes.get(a.id)!.includes('alerta')) ||
      Number(b.active) - Number(a.active) || nameOf(a.id).localeCompare(nameOf(b.id), 'pt-BR'))

  function situacoesDaAtleta(p: Player): SituacaoDaAtleta[] {
    if (!veDinheiro) return []
    const out: SituacaoDaAtleta[] = []
    const saldo = saldoDaAtleta(data, p.id).saldo
    if (temMensalidade(p) && p.active && alertaDosCheckins(data, p.id, hoje)) out.push('alerta')
    if (saldo < 0 || (LIGA.id === 'feminino' && dividaDaMensalidade(data, p.id, hoje).total > 0)) out.push('devendo')
    if (saldo > 0) out.push('credito')
    if (creditosDeCheckin(data, p.id).length > 0) out.push('checkin-credito')
    return out
  }

  // o mes em numeros: dias, check-ins e integrais
  const dias = diasDoMes(data, mes)
  const idsDosDias = new Set(dias.map((d) => d.id))
  const doMes = data.checkins.filter((c) => idsDosDias.has(c.dia_id) && c.compareceu)
  const comCheckin = doMes.filter((c) => c.modo === 'checkin').length
  const integrais = doMes.length - comCheckin

  const folha = (() => {
    const p = aberta ? data.players.find((x) => x.id === aberta) : undefined
    if (!p) return null
    const saldo = saldoDaAtleta(data, p.id)
    const temExtrato = veDinheiro && (saldo.lancamentos > 0 || saldo.acertos !== 0)
    const rotulo = CATEGORIAS.find((c) => c.valor === categoriaDe(p))?.rotulo
    // fecha a folha antes de abrir a janela seguinte: uma janela por vez, como em Meninas
    const ir = (f: () => void) => () => {
      setAberta(null)
      f()
    }
    return (
      <Modal title={nameOf(p.id)} onClose={() => setAberta(null)}>
        <div className="row" style={{ marginBottom: 14 }}>
          <Avatar player={p} size={56} />
          <div className="grow" style={{ minWidth: 0 }}>
            {p.nickname?.trim() && p.nickname.trim() !== p.name && <div className="small muted ellipsis">{p.name}</div>}
            <div className="small">{rotulo}</div>
            {temExtrato && <BadgeSaldo saldo={saldo.saldo} />}
            {!p.active && <div className="tiny"><span className="pausada">inativa</span></div>}
          </div>
        </div>
        <div className="folha-acoes">
          {podeEditar && <button onClick={ir(() => onLancar(p.id))}>➕ Lançar um play<small>Pagamento e check-in de um dia</small></button>}
          {temMensalidade(p) && (
            <button onClick={ir(() => onMensalidade(p.id))}>
              📅 Mensalidade de {nomeDoMes(mesDaMensalidade)}<small>{mensalidadeDe(p.id).texto}</small>
            </button>
          )}
          {temExtrato && <button onClick={ir(() => onContas(p, 'extrato'))}>📒 Extrato<small>Tudo o que foi pago e jogado, com o saldo</small></button>}
          {podeEditar && saldo.saldo !== 0 && (
            <button onClick={ir(() => onContas(p, 'acerto'))}>⚖️ Acertar o saldo<small>Receber, devolver ou perdoar fora de um play</small></button>
          )}
        </div>
        <div className="folha-acoes" style={{ marginTop: 12 }}>
          {podeEditar && (
            <button onClick={ir(() => onPlano(p))}>💳 Forma de pagamento<small>Hoje: {rotulo}</small></button>
          )}
          <button onClick={ir(() => onContas(p, 'contas'))}>
            🏟️ {podeEditar ? 'Contas de check-in' : 'Ver contas de check-in'}<small>Wellhub, TotalPass, planos e aulas</small>
          </button>
        </div>
      </Modal>
    )
  })()

  return (
    <div className="card">
      {folha}
      <div className="grid3" style={{ marginBottom: 12 }}>
        <StatBox k="dias" v={dias.length} />
        <StatBox k="check-ins" v={comCheckin} />
        <StatBox k="integrais" v={integrais} />
      </div>
      <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Buscar pelo nome ou apelido" style={{ marginBottom: 10 }} />
      {podeEditar && (
        <div className="chips-scroll" style={{ paddingInline: 0, marginBottom: 10 }}>
          <button className={`chip ${cat === null ? 'on' : ''}`} onClick={() => setCat(null)}>Todas <strong>{data.players.length}</strong></button>
          {CATEGORIAS.map((c) => (
            <button key={c.valor} className={`chip ${cat === c.valor ? 'on' : ''}`} onClick={() => setCat(cat === c.valor ? null : c.valor)}>
              {c.rotulo} <strong>{data.players.filter((p) => p.active && categoriaDe(p) === c.valor).length}</strong>
            </button>
          ))}
        </div>
      )}
      {veDinheiro && (
        <div className="chips-scroll" style={{ paddingInline: 0, marginBottom: 10 }}>
          {SITUACOES.map((s) => {
            const n = data.players.filter((p) => situacoes.get(p.id)!.includes(s.id)).length
            // a contagem fica sempre na tela (dono, 18/11), so o alerta some quando nao tem ninguem
            if (s.id === 'alerta' && n === 0 && situacao !== s.id) return null
            return (
              <button key={s.id} className={`chip sit-${s.id} ${situacao === s.id ? 'on' : ''}`} onClick={() => setSituacao(situacao === s.id ? null : s.id)}>
                {s.rotulo} <strong>{n}</strong>
              </button>
            )
          })}
        </div>
      )}
      {lista.length === 0 ? (
        termo ? (
          <Empty icon="🔎">Nenhuma jogadora com “{busca.trim()}”.</Empty>
        ) : (
          <Empty icon="👯">As meninas cadastradas em Meninas aparecem aqui sozinhas.</Empty>
        )
      ) : (
        <div className="stack">
          {lista.map((p) => {
            const disp = disponibilidade(data, p.id, mes)
            const saldo = saldoDaAtleta(data, p.id)
            // a menina ve so o que interessa a ela: onde ainda tem check-in e quais ja fez.
            // A logistica (contas, planos, aulas, quem cobre quem) fica em "contas", para quem organiza
            const arenas = disp.porLocal.filter((l) => l.aceita)
            const feitos = data.checkins
              .filter((c) => c.player_id === p.id && (gastaCheckin(c) || (c.compareceu && c.credito_de)) && idsDosDias.has(c.dia_id))
              .map((c) => ({ c, dia: dias.find((d) => d.id === c.dia_id)! }))
              .sort((a, b) => a.dia.date.localeCompare(b.dia.date))
            return (
              // a linha inteira abre a folha com as acoes, igual a aba Meninas (dono, 12/11): antes eram links e chips soltos no cartao
              <div
                key={p.id}
                className="atleta-linha tocavel"
                style={{ opacity: p.active ? 1 : 0.55 }}
                role="button"
                tabIndex={0}
                aria-label={`Opções de ${nameOf(p.id)}`}
                onClick={() => setAberta(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setAberta(p.id)
                  }
                }}
              >
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <Avatar player={p} size={40} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row spread" style={{ gap: 6 }}>
                      <div style={{ fontWeight: 700 }} className="ellipsis">
                        {nameOf(p.id)}
                        {!p.active && <span className="tiny muted"> · inativa</span>}
                      </div>
                      {veDinheiro && (saldo.lancamentos > 0 || saldo.acertos !== 0) && <BadgeSaldo saldo={saldo.saldo} />}
                    </div>
                    <div className="tiny muted">{CATEGORIAS.find((c) => c.valor === categoriaDe(p))?.rotulo}</div>
                    {/* check-ins do mes (dono, 18/11): rotulo claro; sem conta preenchida nao inventa os 12 de cada arena */}
                    <div className="atleta-checkins">
                      <span className="atleta-rotulo">Check-ins livres em {nomeDoMes(mes)}</span>
                      {!data.checkinContas.some((c) => c.player_id === p.id) ? (
                        <span className="tiny muted">conta de check-in não preenchida</span>
                      ) : arenas.length === 0 ? (
                        <span className="tiny muted">o plano não aceita nenhuma arena</span>
                      ) : (
                        <div className="row wrap" style={{ gap: 6 }}>
                          {arenas.map((l) => (
                            <span key={l.local.id} className={`chip disponivel ${l.disponiveis <= 0 ? 'zerado' : ''}`} title={`check-ins livres para o play em ${l.local.nome}`}>
                              <strong>{Math.max(0, l.disponiveis)}</strong> {nomeCurto(l.local.nome)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      {feitos.length === 0
                        ? `Nenhum check-in usado nos plays de ${nomeDoMes(mes)}`
                        : <>✅ Check-ins usados nos plays: {feitos.map((f) => `${dateLabel(f.dia.date).slice(0, 5)} ${nomeCurto(data.checkinLocais.find((l) => l.id === f.c.local_id)?.nome ?? '')}${!f.c.compareceu ? ' (não veio)' : f.c.credito_de ? ' (crédito)' : ''}`).join(' · ')}</>}
                    </div>
                    {(() => {
                      // os check-ins que pagaram divida (script 41) tambem gastam a cota: sem esta linha os livres caiam sem explicacao
                      const daDivida = data.checkinAcertos.filter((a) => a.player_id === p.id && (a.local_id || a.credito_de) && monthOf(a.date) === mes)
                      if (!daDivida.length) return null
                      return (
                        <div className="tiny muted" style={{ marginTop: 4 }}>
                          💸 Check-ins que pagaram dívida: {daDivida.sort((a, b) => a.date.localeCompare(b.date)).map((a) => `${dateLabel(a.date).slice(0, 5)} ${a.credito_de ? '(crédito)' : nomeCurto(data.checkinLocais.find((l) => l.id === a.local_id)?.nome ?? '')}`).join(' · ')}
                        </div>
                      )
                    })()}
                    {(() => {
                      const cred = creditosDeCheckin(data, p.id)
                      if (cred.length === 0) return null
                      return (
                        <div className="tiny" style={{ marginTop: 2, color: 'var(--verde)', fontWeight: 700 }}>
                          🎟️ {plural(cred.length, 'check-in de crédito', 'check-ins de crédito')}:{' '}
                          {cred.map((c) => `${c.quando ? dateLabel(c.quando).slice(0, 5) : '?'} ${nomeCurto(data.checkinLocais.find((l) => l.id === c.checkin.local_id)?.nome ?? '')}`).join(' · ')}
                        </div>
                      )
                    })()}
                    {temMensalidade(p) && p.active && (() => {
                      const a = alertaDosCheckins(data, p.id, hoje)
                      return a ? <div className="tiny alerta-checkin" style={{ marginTop: 2 }}><span className="alerta-vivo" aria-hidden>⚠️</span> {textoDoAlerta(a)} ({nomeDoMes(a.mes)})</div> : null
                    })()}
                    {temMensalidade(p) && (() => {
                      const r = mensalidadeDe(p.id)
                      return (
                        <div className="tiny" style={{ marginTop: 2, color: r.cor, fontWeight: 700 }}>
                          📅 Mensalidade de {nomeDoMes(mesDaMensalidade)}: {r.texto}
                        </div>
                      )
                    })()}
                    {podeEditar && disp.avisos.map((a) => (
                      <div key={a} className="aviso-conta"><span className="alerta-vivo laranja" aria-hidden>⚠️</span> {a}</div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* =================================================================== dias */

function BadgeStatus({ status }: { status: 'regularizado' | 'verificar' | 'nao-pago' }) {
  if (status === 'nao-pago') return <span className="badge nao-pago">não pago</span>
  return status === 'regularizado'
    ? <span className="badge regularizado">✓ ok</span>
    : <span className="badge verificar">verificar</span>
}

/** Uma menina num dia. A linha inteira abre o lancamento: no celular nao sobra lugar para botoes. */
function LinhaDeLancamento({
  checkin,
  dia,
  veDinheiro,
  podeEditar,
  onEditar,
  substituiNaLista,
  origem,
}: {
  checkin: Checkin
  dia: CheckinDia
  veDinheiro: boolean
  podeEditar: boolean
  onEditar: () => void
  /** A troca que a lista do play deste dia fez para ela (undefined = sem lista lida; null = a lista nao trocou ninguem por ela). */
  substituiNaLista?: string | null
  origem?: string
}) {
  const { data, nameOf, playerById } = useStore()
  const nome = nameOf(checkin.player_id)
  const conta = contaDoCheckin(data, checkin)
  const titular = nomeDoTitular(conta, nome)
  const local = data.checkinLocais.find((l) => l.id === checkin.local_id)?.nome ?? 'sem arena'
  const pag = pagamentoDoCheckin(data, checkin.id)
  const devido = valorDevido(checkin, dia, pag)
  const saldo = saldoDoCheckin(checkin, dia, pag)
  const status = statusDoCheckin(checkin, pag, veDinheiro)
  // o credito que ela tinha antes deste play cobre o que faltou: vem do extrato
  const mov = veDinheiro
    ? extratoDaAtleta(data, checkin.player_id).find((m) => m.tipo === 'lancamento' && m.checkin.id === checkin.id)
    : undefined
  const creditoUsado = mov?.tipo === 'lancamento' ? mov.creditoUsado : 0
  const falta = mov?.tipo === 'lancamento' ? mov.falta : Math.max(0, -saldo)
  const quitou = mov?.tipo === 'lancamento' ? mov.dividaQuitada : 0
  const sobra = mov?.tipo === 'lancamento' ? mov.sobra : Math.max(0, saldo)

  return (
    <div
      className="fila-linha"
      role={podeEditar ? 'button' : undefined}
      style={podeEditar ? { cursor: 'pointer' } : undefined}
      onClick={podeEditar ? onEditar : undefined}
    >
      <Avatar player={playerById(checkin.player_id)} size={34} />
      <div className="grow">
        <span className="fila-time">
          <b>{nome === '—' ? '(atleta removida)' : nome}</b>
        </span>
        {checkin.substitui && checkin.compareceu && (
          // de onde veio a troca (dono, 18/11): da lista do play (o 💰 ou o Lançar puxaram de la) ou posta na mao
          <span className="selo-substituta">
            🔁 entrou no lugar de {nameOf(checkin.substitui)} (mensalista)
            {substituiNaLista === checkin.substitui ? `, pela lista do play de ${dateLabel(dia.date).slice(0, 5)}` : substituiNaLista !== undefined ? ', inserido manualmente' : ''}
          </span>
        )}
        <span className="tiny muted">
          {!checkin.compareceu
            ? checkin.credito_checkin
              ? `não veio, mas fez o check-in em ${local}: vira 1 check-in de crédito`
              : 'pagou e não veio: o valor vira crédito'
            : checkin.credito_de
              ? `veio pelo check-in de crédito · ${local}` + (checkin.checkin_confirmado ? '' : ' · a confirmar com a arena')
            : checkin.modo === 'checkin'
              ? `${titular !== nome ? `conta de ${titular} · ` : ''}${rotuloDoTipo(appDaConta(data, conta))} · ${local}` +
                (checkin.checkin_confirmado ? '' : ' · check-in a confirmar')
              : 'integral, sem check-in'}
        </span>
        {veDinheiro && (
          <span className="tiny">
            pagou {formatarReais(pag?.valor_pago ?? 0)}
            {devido > 0 && ` de ${formatarReais(devido)}`}
            {creditoUsado > 0 && <span className="valor-pos"> · {formatarReais(creditoUsado)} do crédito</span>}
            {quitou > 0 && <span className="valor-pos"> · quitou {formatarReais(quitou)} de antes</span>}
            {falta > 0 && <span className="valor-neg"> · falta {formatarReais(falta)}</span>}
            {sobra > 0 && <span className="valor-pos"> · vira crédito {formatarReais(sobra)}</span>}
            {pag && !pag.pagamento_confirmado && <span className="muted"> · pgto a confirmar</span>}
          </span>
        )}
        {pag?.observacao && <span className="tiny muted">📝 {pag.observacao}</span>}
        {origem && <span className="tiny muted">{origem}</span>}
      </div>
      {/* sem pagamento nenhum (a pendente da lista ou do play): vermelho; lancado sem confirmar: verificar */}
      <BadgeStatus status={veDinheiro && naoPago(data, checkin) ? 'nao-pago' : status} />
    </div>
  )
}

function SecaoDias({
  mes,
  veDinheiro,
  podeEditar,
  onNovoDia,
  onEditarDia,
  onLancar,
}: {
  mes: string
  veDinheiro: boolean
  podeEditar: boolean
  onNovoDia: () => void
  onEditarDia: (d: CheckinDia) => void
  onLancar: (pedido: PedidoDeLancamento) => void
}) {
  const { data, nameOf } = useStore()
  const [aberto, setAberto] = useState<string | null>(null)
  /** Dentro do dia: so quem falta verificar, e a busca pelo nome (dono, 18/11). */
  const [soVerificar, setSoVerificar] = useState<false | 'verificar' | 'nao-pago'>(false)
  const [busca, setBusca] = useState('')
  const dias = diasDoMes(data, mes)
  // a lista do play do dia aberto: diz se a substituta veio dela ou foi posta na mao
  const { repo } = useStore()
  const [trocasDaLista, setTrocasDaLista] = useState<{ diaId: string; porAtleta: Map<string, string>; naLista: Set<string> } | null>(null)
  const sessaoDoAberto = dias.find((d) => d.id === aberto)?.session_id ?? null
  useEffect(() => {
    if (!aberto || !sessaoDoAberto || LIGA.id !== 'feminino') return
    let vivo = true
    repo.carregarLista({ sessionId: sessaoDoAberto }).then((l) => {
      if (!vivo) return
      const porAtleta = new Map((l?.nomes ?? []).filter((n) => n.player_id && n.substitui && !n.saiu_em).map((n) => [n.player_id!, n.substitui!]))
      const naLista = new Set((l?.nomes ?? []).filter((n) => n.player_id && !n.saiu_em).map((n) => n.player_id!))
      setTrocasDaLista({ diaId: aberto, porAtleta, naLista })
    }).catch(() => {})
    return () => { vivo = false }
  }, [aberto, sessaoDoAberto, repo])

  /** De onde ela veio para o dia do play (dono, 19/11): lista, Entra / sai ou na mao. Sem play ou lista ainda lendo: nada. */
  function origemDoLancamento(d: CheckinDia, c: Checkin): string | undefined {
    if (!d.session_id) return undefined
    const s = data.sessions.find((x) => x.id === d.session_id)
    if (s?.eventos?.some((e) => e.tipo === 'entra-sai' && e.entra === c.player_id)) return 'adicionada pelo Entra / sai, dentro do play'
    if (trocasDaLista?.diaId !== d.id) return undefined
    return trocasDaLista.naLista.has(c.player_id) ? 'adicionada pela lista de presença' : 'adicionada manualmente'
  }

  return (
    <div className="card">
      <div className="row spread" style={{ marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>📅 {monthLabel(mes)}</div>
        {podeEditar && <button className="btn pink sm" onClick={onNovoDia}>➕ Novo dia</button>}
      </div>
      {dias.length === 0 ? (
        <Empty icon="📅">
          Nenhum dia de check-in em {nomeDoMes(mes)}.
          {podeEditar && <> Crie o dia do play e lance quem fez check-in.</>}
        </Empty>
      ) : (
        <div className="stack">
          {dias.map((d) => {
            // tres estados (dono, 19/11): ok, verificar (lancado sem confirmar) e nao pago (nada lancado)
            const semPagar = (c: Checkin) => veDinheiro && naoPago(data, c)
            const verificar = (c: Checkin) => !semPagar(c) && statusDoCheckin(c, pagamentoDoCheckin(data, c.id), veDinheiro) === 'verificar'
            // quem falta verificar vem em cima; as ja confirmadas embaixo
            const lanc = checkinsDoDia(data, d.id).sort((a, b) => Number(semPagar(b)) - Number(semPagar(a)) || Number(verificar(b)) - Number(verificar(a)) || nameOf(a.player_id).localeCompare(nameOf(b.player_id), 'pt-BR'))
            const vieram = lanc.filter((c) => c.compareceu)
            const comCheckin = vieram.filter((c) => c.modo === 'checkin').length
            const recebido = lanc.reduce((t, c) => t + (pagamentoDoCheckin(data, c.id)?.valor_pago ?? 0), 0)
            const aVerificar = lanc.filter(verificar).length
            const naoPagos = lanc.filter(semPagar).length
            const estaAberto = aberto === d.id
            return (
              <div key={d.id}>
                <button className={`duo-row dia-linha ${estaAberto ? 'on' : ''}`} onClick={() => { setAberto(estaAberto ? null : d.id); setBusca(''); setSoVerificar(false) }}>
                  <span className="row spread" style={{ gap: 8 }}>
                    <span className="duo-nomes">{dateLabel(d.date)} · {rotuloDoDia(d, data.sessions)}</span>
                    <span className="row" style={{ gap: 4 }}>
                      {aVerificar > 0 && <span className="badge verificar" aria-label={`${aVerificar} para verificar`}>{aVerificar}</span>}
                      {naoPagos > 0 && <span className="badge nao-pago" aria-label={`${naoPagos} sem pagamento`}>{naoPagos}</span>}
                    </span>
                  </span>
                  <span className="tiny muted" style={{ display: 'block', marginTop: 2 }}>
                    {plural(lanc.length, 'lançamento')} · {comCheckin} com check-in · {plural(vieram.length - comCheckin, 'integral', 'integrais')}
                    {veDinheiro && ` · ${formatarReais(recebido)} recebidos`}
                  </span>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {formatarReais(d.valor_cheio)} integral · {formatarReais(d.valor_com_checkin)} com check-in
                  </span>
                </button>
                {estaAberto && (
                  <div className="stack" style={{ padding: '10px 4px 4px' }}>
                    {(() => {
                      // 📅 as mensalistas em dia que jogaram o play deste dia: nada a cobrar (dono, 07/11);
                      // derivado, nada gravado. Se fez check-in, ele vai na ficha da mensalidade dela.
                      const play = d.session_id ? data.sessions.find((x) => x.id === d.session_id) : undefined
                      const lancadas = new Set(lanc.map((c) => c.player_id))
                      const mensalistas = LIGA.id !== 'feminino' || !play || monthOf(d.date) < MES_INICIAL ? [] : play.player_ids
                        .map((id) => data.players.find((p) => p.id === id))
                        .filter((p): p is Player => !!p && !lancadas.has(p.id) && emDiaNaData(data, p, d.date))
                      if (mensalistas.length === 0) return null
                      return (
                        <div className="tiny muted" style={{ padding: '0 4px' }}>
                          📅 Mensalistas em dia, sem cobrança: {mensalistas.map((p) => nameOf(p.id)).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')}
                        </div>
                      )
                    })()}
                    {lanc.length > 4 && (
                      <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Buscar pelo nome" />
                    )}
                    {/* filtros e acoes do dia no topo (dono, 18/11): no fim da lista grande era preciso descer tudo para lancar */}
                    {((aVerificar + naoPagos > 0 && aVerificar + naoPagos < lanc.length) || podeEditar) && (
                      <div className="dia-topo">
                        <span className="dia-filtros">
                          {aVerificar + naoPagos > 0 && aVerificar + naoPagos < lanc.length && (
                            <>
                              <button className={`chip ${!soVerificar ? 'on' : ''}`} onClick={() => setSoVerificar(false)}>Todas <strong>{lanc.length}</strong></button>
                              {aVerificar > 0 && <button className={`chip ${soVerificar === 'verificar' ? 'on' : ''}`} onClick={() => setSoVerificar('verificar')}>Verificar <strong>{aVerificar}</strong></button>}
                              {naoPagos > 0 && <button className={`chip ${soVerificar === 'nao-pago' ? 'on' : ''}`} onClick={() => setSoVerificar('nao-pago')}>Não pago <strong>{naoPagos}</strong></button>}
                            </>
                          )}
                        </span>
                        {podeEditar && (
                          <span className="dia-acoes">
                            <button className="btn pink sm" onClick={() => onLancar({ diaId: d.id })}>➕ Lançar</button>
                            <button className="btn ghost sm" onClick={() => onEditarDia(d)} aria-label="Editar o dia">✏️</button>
                          </span>
                        )}
                      </div>
                    )}
                    {lanc.length === 0 ? (
                      <div className="tiny muted" style={{ textAlign: 'center' }}>Ninguém lançada ainda.</div>
                    ) : (
                      lanc.filter((c) => (!soVerificar || (soVerificar === 'verificar' ? verificar(c) : semPagar(c))) && (!busca.trim() || normalizar(nameOf(c.player_id)).includes(normalizar(busca)))).map((c) => (
                        <LinhaDeLancamento
                          key={c.id}
                          checkin={c}
                          dia={d}
                          veDinheiro={veDinheiro}
                          podeEditar={podeEditar}
                          onEditar={() => onLancar({ checkin: c })}
                          substituiNaLista={trocasDaLista?.diaId === d.id ? trocasDaLista.porAtleta.get(c.player_id) ?? null : undefined}
                          origem={origemDoLancamento(d, c)}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ================================================================= arenas */

function SecaoArenas({ mes, onToast }: { mes: string; onToast: (m: string) => void }) {
  const { data, nameOf } = useStore()
  const [porPeriodo, setPorPeriodo] = useState(false)
  const [de, setDe] = useState(`${mes}-01`)
  const [ate, setAte] = useState(todayISO())
  const [locais, setLocais] = useState<string[] | null>(null)

  const filtro: FiltroDoRelatorio = porPeriodo ? { mes: null, de, ate, locais } : { mes, de: null, ate: null, locais }
  // o relatorio vai para a arena, que confere pelo NOME DO CADASTRO (o da conta
  // no app), nao pelo apelido do grupo
  const rel = relatorioDasArenas(data, filtro, (id) => nomeDoCadastro(data, id, nameOf))
  const ativos = data.checkinLocais.filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem)

  function alternar(id: string) {
    if (!locais) {
      setLocais([id])
      return
    }
    const novo = locais.includes(id) ? locais.filter((x) => x !== id) : [...locais, id]
    setLocais(novo.length === 0 ? null : novo)
  }

  return (
    <div className="card">
      <div className="section-title">📤 Check-ins para as arenas</div>
      <p className="tiny muted" style={{ margin: '0 0 10px' }}>
        O que cada arena recebe no fim do mês, com o <strong>titular da conta</strong>. Escolha uma ou mais arenas: o Excel
        sai num arquivo só, uma aba por arena, com os check-ins (confirmados e pendentes) e, na V3, os aluguéis com os
        check-ins que cada um abateu. <strong>Nada do seu financeiro</strong> (quem pagou, quem deve): esse fica no
        Excel completo, no Caixa.
      </p>
      <div className="segmented" style={{ marginBottom: 10 }}>
        <button className={!porPeriodo ? 'on' : ''} onClick={() => setPorPeriodo(false)}>{monthLabel(mes)}</button>
        <button className={porPeriodo ? 'on' : ''} onClick={() => setPorPeriodo(true)}>Período</button>
      </div>
      {porPeriodo && (
        <div className="grid2" style={{ marginBottom: 10 }}>
          <label className="field">
            <span>De</span>
            <input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="field">
            <span>Até</span>
            <input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
        </div>
      )}
      <div className="chips-scroll" style={{ marginBottom: 7 }}>
        <button className={`chip ${locais === null ? 'on' : ''}`} onClick={() => setLocais(null)}>Todas</button>
        {ativos.map((l) => (
          <button key={l.id} className={`chip ${locais?.includes(l.id) ? 'on' : ''}`} onClick={() => alternar(l.id)}>
            {l.nome}
          </button>
        ))}
      </div>

      {rel.total === 0 ? (
        <Empty icon="📭">Nenhum check-in {porPeriodo ? 'no período' : `em ${nomeDoMes(mes)}`}.</Empty>
      ) : (
        <div className="stack">
          <div className="grid3">
            {rel.blocos.map((b) => (
              <StatBox key={b.local?.id ?? 'sem'} k={b.local?.nome ?? 'sem arena'} v={b.linhas.length} />
            ))}
          </div>
          {rel.blocos.map((b) => (
            <div key={b.local?.id ?? 'sem'}>
              <div className="tiny" style={{ fontWeight: 800, marginBottom: 4 }}>
                📍 {b.local?.nome ?? 'Sem arena'} · {plural(b.linhas.length, 'check-in')}
              </div>
              {b.linhas.map((l, i) => (
                <div key={i} className="tiny muted" style={{ paddingLeft: 6 }}>
                  {dateLabel(l.date).slice(0, 5)} · <strong style={{ color: 'var(--text)' }}>{l.titular}</strong>
                  {l.titular !== l.atleta && ` (${l.atleta})`} · {l.app}
                  {!l.confirmado && ' · a confirmar'}
                </div>
              ))}
            </div>
          ))}
          <div className="grid2">
            <button
              className="btn purple"
              onClick={async () => {
                const ok = await shareOrCopy(textoDoRelatorio(rel))
                onToast(ok ? 'Texto pronto para mandar 💬' : 'Não consegui copiar')
              }}
            >
              💬 Texto
            </button>
            <button
              className="btn teal"
              onClick={async () => {
                const sufixo = porPeriodo ? `${de}_a_${ate}` : mes
                const arquivo = new File([gerarXlsx(planilhasDasArenas(rel, data, mesesDoFiltro(filtro)))], `checkins-arenas-${sufixo}.xlsx`, {
                  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                })
                const r = await baixarOuCompartilhar(arquivo, `Check-ins — ${rel.periodo}`)
                onToast(r === 'baixou' ? 'Planilha salva 📄' : 'Planilha enviada 📄')
              }}
            >
              📄 Excel da arena
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== caixa */

function Reais({ n, sinal }: { n: number; sinal?: boolean }) {
  const cls = n < 0 ? 'valor-neg' : sinal && n > 0 ? 'valor-pos' : undefined
  return <span className={cls}>{formatarReais(n)}</span>
}

/** 🎉 De onde veio cada real do caixa de eventos, ate o fim do mes aberto (o total bate com o do resumo). */
function HistoricoDosEventos({
  ate,
  podeEditar,
  onClose,
  onToast,
  onUsar,
}: {
  ate: string
  podeEditar: boolean
  /** Com ele, abre numa janela (do Caixa); sem ele, e a aba 🎉 Eventos. */
  onClose?: () => void
  onToast: (m: string) => void
  /** "Usar a caixinha": vai para o Caixa com a opcao marcada. */
  onUsar?: () => void
}) {
  const { data, nameOf, saveCheckin, saveCaixa, deleteCaixa, repo } = useStore()
  const [movimentar, setMovimentar] = useState(false)
  /** Transferencia, entrada externa e devolucao sao lancamentos feitos na mao: tirar = apagar o lancamento. */
  function apagarMovimento(caixaId: string, texto: string) {
    if (!confirm(texto)) return
    deleteCaixa(caixaId)
    onToast('Movimento desfeito')
  }
  /** Tira a entrada desfazendo o que a gerou: a substituta deixa de ser "no lugar de" (o pagamento dela fica);
   * o desconto do aluguel vai a zero (o valor pago fica). Nada e apagado. */
  function tirar(e: EntradaDosEventos) {
    if (e.origem === 'transferencia' || e.origem === 'externa') {
      const qual = e.origem === 'transferencia' ? 'a transferência' : 'a entrada externa'
      const efeito = e.origem === 'transferencia' ? 'O valor volta a ficar livre no caixa geral.' : 'O valor sai da caixinha e da receita extra do mês.'
      apagarMovimento(e.caixa_id ?? '', `Desfazer ${qual} de ${formatarReais(e.valor)} de ${dateLabel(e.date)}?\n\n${efeito}`)
      return
    }
    if (e.origem === 'substituta') {
      const c = data.checkins.find((x) => x.id === e.checkin_id)
      if (!c || !confirm(`Tirar ${formatarReais(e.valor)} do caixa de eventos?

${nameOf(c.player_id)} deixa de contar como substituta de ${c.substitui ? nameOf(c.substitui) : '?'} em ${dateLabel(e.date)}. O que ela pagou continua lançado.`)) return
      saveCheckin({ ...c, substitui: null })
    } else {
      const l = data.caixa.find((x) => x.id === e.caixa_id)
      if (!l || !confirm(`Tirar ${formatarReais(e.valor)} do caixa de eventos?

O desconto do aluguel de ${dateLabel(e.date)} vai a zero. O valor pago continua lançado.`)) return
      saveCaixa({ ...l, desconto: 0 })
    }
    onToast('Tirado do caixa de eventos')
  }
  const entradas = useMemo(() => entradasDosEventos(data).filter((e) => monthOf(e.date) <= ate), [data, ate])
  // de onde veio cada substituta (dono, 18/11): da lista de presenca do play ou posta na mao.
  // Chave "atleta|mensalista" por sessao; undefined = ainda lendo (a linha fica sem a origem)
  const sessoesDasSubstitutas = useMemo(() => {
    const dias = new Map(data.checkinDias.map((d) => [d.id, d.session_id]))
    const porCheckin = new Map(data.checkins.map((c) => [c.id, dias.get(c.dia_id) ?? null]))
    return porCheckin
  }, [data.checkinDias, data.checkins])
  const chaveSessoes = [...new Set(entradas.filter((e) => e.origem === 'substituta').map((e) => sessoesDasSubstitutas.get(e.checkin_id ?? '')).filter(Boolean) as string[])].sort().join(',')
  const [trocasNasListas, setTrocasNasListas] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (LIGA.id !== 'feminino') return
    let vivo = true
    const ids = chaveSessoes ? chaveSessoes.split(',') : []
    Promise.all(ids.map((id) => repo.carregarLista({ sessionId: id }).catch(() => null))).then((listas) => {
      if (!vivo) return
      const set = new Set<string>()
      listas.forEach((l, i) => (l?.nomes ?? []).forEach((n) => { if (n.player_id && n.substitui && !n.saiu_em) set.add(`${ids[i]}|${n.player_id}|${n.substitui}`) }))
      setTrocasNasListas(set)
    })
    return () => { vivo = false }
  }, [chaveSessoes, repo])
  function origemDaSubstituta(e: EntradaDosEventos) {
    if (!trocasNasListas || LIGA.id !== 'feminino') return ''
    const sessao = sessoesDasSubstitutas.get(e.checkin_id ?? '')
    return sessao && trocasNasListas.has(`${sessao}|${e.player_id}|${e.substitui}`) ? ' · inserido pela lista de presença' : ' · inserido manualmente'
  }
  const saidas = useMemo(() => saidasDosEventos(data).filter((x) => monthOf(x.date) <= ate && x.coberto > 0), [data, ate])
  const total = entradas.reduce((t, e) => t + e.valor, 0) - saidas.reduce((t, x) => t + x.coberto, 0)
  // entradas e gastos juntos, do mais recente ao mais antigo
  const linhas = [
    ...entradas.map((e) => ({ date: e.date, entrada: e, saida: null })),
    ...saidas.map((x) => ({ date: x.date, entrada: null, saida: x })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const rotuloDe = (id: string) => {
    const l = data.caixa.find((c) => c.id === id)
    return CATEGORIAS_DE_CAIXA.find((c) => c.valor === l?.categoria)?.rotulo ?? 'despesa'
  }
  return (
    <Moldura onClose={onClose}>
      <div className="stack">
        {onClose ? (
          <div className="row spread">
            <span className="muted small">Saldo até {nomeDoMes(ate)}</span>
            <strong style={{ fontSize: 20 }}><Reais n={total} /></strong>
          </div>
        ) : (
          <>
            <div className="caixinha-saldo">
              <span className="muted small">Tem na caixinha{ate < monthOf(todayISO()) ? ` (fim de ${nomeDoMes(ate)})` : ''}</span>
              <strong><Reais n={total} /></strong>
              <span className="tiny muted">reservado dentro do saldo do caixa, para presentes e confraternizações</span>
            </div>
            {podeEditar && onUsar && (
              <button className="btn pink block" onClick={onUsar} disabled={total <= 0}>
                🎁 Usar a caixinha num gasto
              </button>
            )}
            {podeEditar && (
              <button className="btn ghost block" onClick={() => setMovimentar(true)}>
                Movimentar a caixinha
              </button>
            )}
            <div className="tiny muted">
              Entra metade do que a substituta paga, a economia do aluguel no plano mensal e o que for colocado na mão
              (do caixa ou de fora). Sai quando um gasto de
              Brindes e presentes ou Confraternização usa a caixinha; o que passar do saldo sai do caixa geral.
            </div>
            <div className="section-title" style={{ margin: '6px 0 0' }}>📜 Entradas e gastos</div>
          </>
        )}
        {linhas.length === 0 ? (
          <Empty icon="🎉">Nada entrou no caixa de eventos ainda.</Empty>
        ) : (
          <table className="table">
            <tbody>
              {linhas.map(({ entrada: e, saida: x }, i) => x?.devolucao ? (
                <tr key={i}>
                  <td>
                    <b>Devolvido ao caixa</b>
                    <div className="tiny muted">{dateLabel(x.date)}{x.descricao ? ` · ${x.descricao}` : ''} · volta a ficar livre no caixa geral</div>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="valor-neg">−{formatarReais(x.coberto)}</span>
                    {podeEditar && (
                      <button className="btn ghost sm" style={{ display: 'block', marginTop: 6, marginLeft: 'auto' }} aria-label="Desfazer a devolução"
                        onClick={() => apagarMovimento(x.caixa_id, `Desfazer a devolução de ${formatarReais(x.valor)} de ${dateLabel(x.date)}?\n\nO valor volta para a caixinha.`)}>🗑️ Tirar</button>
                    )}
                  </td>
                </tr>
              ) : x ? (
                <tr key={i}>
                  <td>
                    <b>🎁 {x.descricao || 'Gasto pago com o caixa de eventos'}</b>
                    <div className="tiny muted">
                      {dateLabel(x.date)} · {formatarReais(x.valor)} no total
                      {x.resto > 0 ? `: ${formatarReais(x.coberto)} do caixa de eventos e ${formatarReais(x.resto)} do caixa geral (${rotuloDe(x.caixa_id)})` : ''}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="valor-neg">−{formatarReais(x.coberto)}</span>
                  </td>
                </tr>
              ) : e && (
                <tr key={i}>
                  <td>
                    {e.origem === 'substituta' ? (
                      <>
                        <b>🔁 {nameOf(e.player_id ?? '')}</b> no lugar de <b>{e.substitui ? nameOf(e.substitui) : '?'}</b>
                        <div className="tiny muted">
                          {dateLabel(e.date)} · metade de {formatarReais((e.pix ?? 0) + (e.doCheckin ?? 0))}
                          {e.doCheckin ? ` (${formatarReais(e.pix ?? 0)} pagos + ${formatarReais(e.doCheckin)} do check-in)` : ' pagos'}
                          {origemDaSubstituta(e)}
                        </div>
                      </>
                    ) : e.origem === 'transferencia' || e.origem === 'externa' ? (
                      <>
                        <b>{e.origem === 'transferencia' ? 'Transferido do caixa' : 'Entrada externa'}</b>
                        <div className="tiny muted">
                          {dateLabel(e.date)}{e.descricao ? ` · ${e.descricao}` : ''} · {e.origem === 'transferencia' ? 'dinheiro que já estava no caixa' : 'recebido de terceiros ou aporte pessoal'}
                        </div>
                      </>
                    ) : (
                      <>
                        <b>🏟️ Aluguel da V3 no plano mensal</b>
                        <div className="tiny muted">{dateLabel(e.date)} · a V3 cobrou {formatarReais(e.valor_cobrado ?? 0)}, 5% a menos que sem o plano</div>
                      </>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="valor-pos">+{formatarReais(e.valor)}</span>
                    {podeEditar && (
                      <button className="btn ghost sm" style={{ display: 'block', marginTop: 6, marginLeft: 'auto' }} aria-label="Tirar do caixa de eventos" onClick={() => tirar(e)}>🗑️ Tirar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {movimentar && <MovimentarCaixinha onClose={() => setMovimentar(false)} onToast={onToast} />}
    </Moldura>
  )
}

type Movimento = 'transferir' | 'externa' | 'devolver'
const MOVIMENTOS: { id: Movimento; titulo: string; explica: string }[] = [
  { id: 'transferir', titulo: 'Transferir do caixa', explica: 'Separa parte do dinheiro que já está no caixa para a caixinha de eventos.' },
  { id: 'externa', titulo: 'Entrada externa', explica: 'Recebidos de terceiros ou aporte pessoal: entra como receita extra, direto na caixinha.' },
  { id: 'devolver', titulo: 'Devolver ao caixa', explica: 'A caixinha libera esse valor para o caixa geral.' },
]

/**
 * O que esta livre no caixa (o saldo menos a caixinha) ao fim do mes de `date`.
 * shortcut: por mes, nao por dia (o resumo do caixa e mensal); se precisar do dia exato, somar os movimentos ate a data.
 */
function livreNoCaixa(data: AppData, date: string): number {
  const linha = resumoDoCaixa(data).filter((r) => r.mes <= monthOf(date)).slice(-1)[0]
  return linha ? Math.round((linha.saldoAcumulado - linha.eventosAcumulado) * 100) / 100 : 0
}

/** Colocar ou tirar dinheiro da caixinha na mao (dono, 17/11): do caixa, de fora, ou de volta ao caixa. */
function MovimentarCaixinha({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const { data, saveCaixa, deleteCaixa, repo } = useStore()
  const semColuna = repo.kind === 'supabase' && avisosDoBanco.colunas.has('caixa.transferencia')
  const [mov, setMov] = useState<Movimento>(semColuna ? 'externa' : 'transferir')
  const [date, setDate] = useState(todayISO())
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  /** O que acabou de ser gravado: a janela mostra e deixa desfazer. */
  const [feito, setFeito] = useState<{ id: string; texto: string } | null>(null)
  const lido = lerValor(valor)
  const livre = date ? livreNoCaixa(data, date) : 0
  const naCaixinha = date ? saldoDosEventosEm(data, date) : 0
  const limite = mov === 'transferir' ? Math.max(0, livre) : mov === 'devolver' ? Math.max(0, naCaixinha) : Infinity
  const passou = lido !== null && lido > limite
  const bloqueado = semColuna && mov !== 'externa'

  function salvar() {
    if (lido === null || lido <= 0 || !date || passou || bloqueado) return
    const id = uid()
    saveCaixa({
      id, date, descricao: descricao.trim(), created_at: new Date().toISOString(), valor: lido,
      ...(mov === 'externa'
        ? { categoria: 'extra' as const, tipo: 'entrada' as const, do_eventos: true }
        : { categoria: 'outra' as const, tipo: mov === 'transferir' ? 'saida' as const : 'entrada' as const, transferencia: true }),
    })
    const texto = mov === 'transferir' ? 'Transferido para a caixinha' : mov === 'externa' ? 'Entrada externa na caixinha' : 'Devolvido ao caixa'
    setFeito({ id, texto: `${texto}: ${formatarReais(lido)}` })
    setValor('')
    setDescricao('')
  }

  if (feito) {
    return (
      <Modal title="Movimentar a caixinha" onClose={onClose}>
        <div className="stack">
          <div className="banner info">✅ {feito.texto}</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost grow" onClick={() => { deleteCaixa(feito.id); setFeito(null); onToast('Movimento desfeito') }}>Desfazer</button>
            <button className="btn pink grow" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Movimentar a caixinha" onClose={onClose}>
      <div className="stack">
        <div className="row spread tiny muted">
          <span>Livre no caixa: <strong>{formatarReais(livre)}</strong></span>
          <span>Na caixinha: <strong>{formatarReais(naCaixinha)}</strong></span>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {MOVIMENTOS.map((m) => (
            <button key={m.id} type="button" className={`opcao-mov${mov === m.id ? ' on' : ''}`} aria-pressed={mov === m.id} onClick={() => setMov(m.id)}>
              <b>{m.titulo}</b>
              <span>{m.explica}</span>
            </button>
          ))}
        </div>
        {bloqueado && <div className="banner warn">Transferir e devolver precisam do script 38 no banco (supabase/38-caixinha-transferencia.sql).</div>}
        <label className="field"><span>Data</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field">
          <span>Valor</span>
          <input inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
        {passou && (
          <div className="tiny valor-neg">
            {mov === 'transferir' ? `O caixa só tem ${formatarReais(Math.max(0, livre))} livre nessa data.` : `A caixinha só tem ${formatarReais(Math.max(0, naCaixinha))} nessa data.`}
          </div>
        )}
        <label className="field">
          <span>Descrição (opcional)</span>
          <input placeholder={mov === 'externa' ? 'ex.: rifa, doação, Ingryd colocou' : 'ex.: reserva para a festa'} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        <button className="btn pink block" disabled={lido === null || lido <= 0 || !date || passou || bloqueado} onClick={salvar}>
          {MOVIMENTOS.find((m) => m.id === mov)?.titulo}{lido ? ` · ${formatarReais(lido)}` : ''}
        </button>
      </div>
    </Modal>
  )
}

/** A caixinha numa janela (aberta do Caixa) ou num cartao (a aba 🎉 Eventos). */
function Moldura({ onClose, children }: { onClose?: () => void; children: React.ReactNode }) {
  if (onClose) return <Modal title="🎉 Caixinha de eventos" onClose={onClose}>{children}</Modal>
  return (
    <div className="card">
      <div className="section-title">🎉 Caixinha de eventos</div>
      {children}
    </div>
  )
}

function SecaoCaixa({ mes, podeEditar, onToast, comCaixinha = false }: { mes: string; podeEditar: boolean; onToast: (m: string) => void; comCaixinha?: boolean }) {
  const { data, nameOf, saveCaixa, deleteCaixa } = useStore()
  const [categoria, setCategoria] = useState<CategoriaDeCaixa>('brinde')
  const formulario = useRef<HTMLDivElement>(null)
  // vindo do "Usar a caixinha": o formulario aparece na tela
  useEffect(() => {
    if (comCaixinha) formulario.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [comCaixinha])
  const [date, setDate] = useState(todayISO())
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [tudo, setTudo] = useState(false)
  /** Aluguel da V3 pago no plano mensal: ja vem marcado (dono, 07/11). */
  const [planoMensal, setPlanoMensal] = useState(true)
  // o desconto do mensal vem do ultimo aluguel mensal lancado (ela troca uma vez e fica); o avulso comeca em 0 (dono, 18/11)
  const descontoDoMensal = useMemo(() => {
    const ultimo = data.caixa.filter((l) => l.categoria === 'aluguel' && l.plano_mensal).sort((a, b) => b.date.localeCompare(a.date))[0]
    return ultimo ? descontoDoAluguel(ultimo) : DESCONTO_DO_PLANO
  }, [data.caixa])
  const [descontoTxt, setDescontoTxt] = useState<string | null>(null) // null = o padrao do tipo
  function escolherAluguel(mensal: boolean) {
    setPlanoMensal(mensal)
    setDescontoTxt(null)
  }
  /** Gasto pago com o 🎉 caixa de eventos (dono, 16/11). */
  const [doEventos, setDoEventos] = useState(comCaixinha)
  // lancamento aberto na janela: apagar so la dentro, nunca direto na lista
  const [aberto, setAberto] = useState<(typeof data.caixa)[number] | null>(null)
  const [verEventos, setVerEventos] = useState(false)
  const [movimentar, setMovimentar] = useState(false)

  const resumo = useMemo(() => resumoDoCaixa(data), [data])
  const doMes = data.caixa.filter((l) => monthOf(l.date) === mes).sort((a, b) => b.date.localeCompare(a.date))
  const linhaDoMes: LinhaDoResumo = resumo.find((r) => r.mes === mes) ?? {
    mes, receitasPlay: 0, mensalidades: 0, receitasExtras: 0, receitaTotal: 0, aluguel: 0, brindes: 0, confraternizacao: 0, outras: 0,
    despesaTotal: 0, saldoDoMes: 0, transferido: 0, eventos: 0,
    eventosAcumulado: resumo.filter((r) => r.mes < mes).slice(-1)[0]?.eventosAcumulado ?? 0,
    // sem movimento no mes, o acumulado e o do ultimo mes anterior
    saldoAcumulado: resumo.filter((r) => r.mes < mes).slice(-1)[0]?.saldoAcumulado ?? 0,
  }
  const tipo = CATEGORIAS_DE_CAIXA.find((c) => c.valor === categoria)?.tipo ?? 'saida'
  const valorLido = lerValor(valor)
  // ALUGUEL DA V3 (D47): o valor digitado e o que a V3 cobrou; ela abate R$ 25 por check-in feito la no mes
  // anterior, e o que sai de verdade (o lancamento) e o Pix. No plano mensal a economia vai para o caixa de eventos.
  const v3 = data.checkinLocais.find((l) => /v3/i.test(l.nome))
  const ehAluguel = categoria === 'aluguel' && LIGA.id === 'feminino'
  const mesDosCheckins = date ? mesAnterior(monthOf(date)) : ''
  // o aluguel avulso e pago em dinheiro: os check-ins so abatem o do plano mensal (dono, 18/11)
  const origemDosCheckins = ehAluguel && planoMensal && v3 && date ? checkinsNaArenaPorOrigem(data, v3.id, mesDosCheckins) : null
  const checkinsAbatidos = origemDosCheckins ? origemDosCheckins.dePlay + origemDosCheckins.daMensalidade : 0
  const descontoPadrao = planoMensal ? descontoDoMensal : 0
  const descontoLido = descontoTxt === null ? descontoPadrao : (lerValor(descontoTxt) ?? 0) / 100
  const descontoOk = descontoLido >= 0 && descontoLido < 1
  const aluguel = ehAluguel && descontoOk && valorLido !== null && valorLido > 0
    ? contaDoAluguel({ valorNoPlano: valorLido, desconto: descontoLido, checkinsMesAnterior: checkinsAbatidos })
    : null

  // o caixa de eventos paga gastos comuns (presentes, confraternizacao...); o aluguel tem a conta dele
  // so nos gastos de evento: presentes, confraternizacao e outras despesas (dono, 16/11 e 18/11)
  const podeEventos = LIGA.id === 'feminino' && (categoria === 'brinde' || categoria === 'confraternizacao' || categoria === 'outra')
  const temEventos = useMemo(() => entradasDosEventos(data).length > 0, [data])
  const noEventos = podeEventos && date ? saldoDosEventosEm(data, date) : 0
  const cobre = podeEventos && doEventos && valorLido ? Math.min(valorLido, Math.max(0, noEventos)) : 0

  function lancar() {
    if (valorLido === null || valorLido <= 0 || !date || (ehAluguel && !aluguel)) return
    saveCaixa({
      id: uid(), date, descricao: descricao.trim(), categoria, tipo, created_at: new Date().toISOString(),
      ...(podeEventos && doEventos ? { do_eventos: true } : {}),
      ...(aluguel
        ? { valor: aluguel.pagarNoPix, plano_mensal: planoMensal, valor_cobrado: valorLido, checkins_abatidos: checkinsAbatidos, desconto: descontoLido }
        : { valor: valorLido }),
    })
    setDescricao('')
    setValor('')
    setDescontoTxt(null)
    setDoEventos(false)
    onToast(tipo === 'entrada' ? 'Receita lançada' : podeEventos && doEventos ? 'Gasto lançado com a caixinha 🎉' : 'Saída lançada')
  }

  const totais = resumo.reduce(
    (t, r) => ({
      receitasPlay: t.receitasPlay + r.receitasPlay, mensalidades: t.mensalidades + r.mensalidades, receitasExtras: t.receitasExtras + r.receitasExtras,
      receitaTotal: t.receitaTotal + r.receitaTotal, aluguel: t.aluguel + r.aluguel, brindes: t.brindes + r.brindes,
      confraternizacao: t.confraternizacao + r.confraternizacao, outras: t.outras + r.outras,
      despesaTotal: t.despesaTotal + r.despesaTotal, saldoDoMes: t.saldoDoMes + r.saldoDoMes,
    }),
    { receitasPlay: 0, mensalidades: 0, receitasExtras: 0, receitaTotal: 0, aluguel: 0, brindes: 0, confraternizacao: 0, outras: 0, despesaTotal: 0, saldoDoMes: 0 },
  )

  const rotuloDa = (c: string) => CATEGORIAS_DE_CAIXA.find((x) => x.valor === c)?.rotulo ?? c
  const rotuloDoLancamento = (l: LancamentoDeCaixa) =>
    l.transferencia ? (l.tipo === 'saida' ? 'Transferência para a caixinha' : 'Devolução da caixinha')
      : l.do_eventos && l.tipo === 'entrada' ? 'Entrada externa na caixinha' : rotuloDa(l.categoria)
  const doEventosPorId = useMemo(() => new Map(saidasDosEventos(data).map((x) => [x.caixa_id, x])), [data])
  const excel = async () => {
    const planilhas = planilhasCompletas(data, (id) => nomeDoCadastro(data, id, nameOf), tudo ? null : mes)
    const arquivo = new File([gerarXlsx(planilhas)], `controle-${LIGA.prefixo}-${tudo ? 'tudo' : mes}.xlsx`, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const r = await baixarOuCompartilhar(arquivo, `Controle Play de Todas — ${tudo ? 'tudo' : monthLabel(mes)}`)
    onToast(r === 'baixou' ? 'Planilha salva 📊' : 'Planilha enviada 📊')
  }
  const linhaDoExcel = (
    <button className="ini-linha ini-chev" onClick={excel}>
      <span className="ini-ic verde" aria-hidden="true">📊</span>
      <span className="g"><b>Excel completo (o seu controle)</b><span className="sub">{tudo ? 'todos os meses' : nomeDoMes(mes)}, com plays, mensalidades e caixa · o da arena fica em Arenas</span></span>
    </button>
  )
  const passa = doEventos && valorLido ? Math.max(0, valorLido - cobre) : 0

  return (
    <>
      <div className="ini-sec" style={{ marginTop: 6 }}>
        <h2>💰 Caixa</h2>
        <div className="segmented" style={{ width: 'auto' }}>
          <button className={!tudo ? 'on' : ''} onClick={() => setTudo(false)}>{nomeDoMes(mes)}</button>
          <button className={tudo ? 'on' : ''} onClick={() => setTudo(true)}>Tudo</button>
        </div>
      </div>
      {!tudo ? (
        <div className="ini-grupo">
          <div className="caixa-saldo-mes">
            <span>Saldo de {nomeDoMes(mes)}</span>
            <strong className={linhaDoMes.saldoDoMes < 0 ? 'valor-neg' : 'valor-pos'}>
              <Reais n={linhaDoMes.saldoDoMes} sinal />
            </strong>
          </div>
          <div className="ini-met" style={{ marginTop: 0, borderTop: '.5px solid var(--sep)' }}>
            <div><strong className="caixa-num valor-pos"><Reais n={linhaDoMes.receitaTotal} /></strong><span>entrou</span></div>
            <div><strong className="caixa-num valor-neg"><Reais n={linhaDoMes.despesaTotal} /></strong><span>saiu</span></div>
            <div><strong className={`caixa-num ${linhaDoMes.saldoAcumulado < 0 ? 'valor-neg' : 'valor-pos'}`}><Reais n={linhaDoMes.saldoAcumulado} sinal /></strong><span>no caixa</span></div>
          </div>
          {(linhaDoMes.eventosAcumulado !== 0 || temEventos || podeEditar) && LIGA.id === 'feminino' && (
            <div className="caixinha-linha">
              <button className="ini-linha ini-chev" onClick={() => setVerEventos(true)}>
                <span className="ini-ic rosa" aria-hidden="true">🎉</span>
                <span className="g">
                  <b>Caixinha de eventos</b>
                  <span className="sub">livre no caixa: {formatarReais(Math.round((linhaDoMes.saldoAcumulado - linhaDoMes.eventosAcumulado) * 100) / 100)}</span>
                </span>
                <span className="ini-pts" style={{ fontSize: 17 }}><Reais n={linhaDoMes.eventosAcumulado} /></span>
              </button>
              {podeEditar && (
                <button className="btn ghost sm caixinha-mov" onClick={() => setMovimentar(true)}>Movimentar</button>
              )}
            </div>
          )}
          <details className="ini-detalhe">
            <summary className="ini-linha">
              <span className="ini-ic roxo" aria-hidden="true">🧾</span>
              <span className="g"><b>De onde veio e para onde foi</b><span className="sub">receitas e despesas por tipo</span></span>
            </summary>
            <div className="ini-corpo">
              <table className="table">
                <tbody>
                  <tr><td>Receita dos plays</td><td className="valor-pos"><Reais n={linhaDoMes.receitasPlay} /></td></tr>
                  {LIGA.id === 'feminino' && <tr><td>Mensalidades</td><td className="valor-pos"><Reais n={linhaDoMes.mensalidades} /></td></tr>}
                  <tr><td>Receitas extras</td><td className="valor-pos"><Reais n={linhaDoMes.receitasExtras} /></td></tr>
                  <tr><td><strong>Receita total</strong></td><td className="valor-pos"><strong><Reais n={linhaDoMes.receitaTotal} /></strong></td></tr>
                  <tr><td>Aluguel</td><td className="valor-neg"><Reais n={linhaDoMes.aluguel} /></td></tr>
                  <tr><td>Brindes e presentes</td><td className="valor-neg"><Reais n={linhaDoMes.brindes} /></td></tr>
                  <tr><td>Confraternização</td><td className="valor-neg"><Reais n={linhaDoMes.confraternizacao} /></td></tr>
                  <tr><td>Outras despesas</td><td className="valor-neg"><Reais n={linhaDoMes.outras} /></td></tr>
                  <tr><td><strong>Despesa total</strong></td><td className="valor-neg"><strong><Reais n={linhaDoMes.despesaTotal} /></strong></td></tr>
                  {linhaDoMes.transferido !== 0 && (
                    <tr>
                      <td>{linhaDoMes.transferido > 0 ? 'Transferido para a caixinha' : 'Devolvido da caixinha'} <span className="tiny muted">(fora da despesa)</span></td>
                      <td className={linhaDoMes.transferido > 0 ? 'valor-neg' : 'valor-pos'}>
                        {linhaDoMes.transferido > 0 ? '−' : '+'}<Reais n={Math.abs(linhaDoMes.transferido)} />
                      </td>
                    </tr>
                  )}
                  <tr className="linha-total">
                    <td><strong>Saldo de {nomeDoMes(mes)}</strong></td>
                    <td className={linhaDoMes.saldoDoMes < 0 ? 'valor-neg' : 'valor-pos'}><strong><Reais n={linhaDoMes.saldoDoMes} sinal /></strong></td>
                  </tr>
                  <tr>
                    <td><strong>Caixa total</strong> <span className="tiny muted">(todos os meses)</span></td>
                    <td className={linhaDoMes.saldoAcumulado < 0 ? 'valor-neg' : 'valor-pos'}><strong><Reais n={linhaDoMes.saldoAcumulado} sinal /></strong></td>
                  </tr>
                </tbody>
              </table>
              <p className="tiny muted" style={{ margin: '8px 0 0' }}>
                A receita dos plays e das mensalidades vem dos lançamentos; aqui embaixo entram só as receitas extras e as saídas.
                Gasto pago pela caixinha conta inteiro na despesa: a caixinha é uma reserva dentro do caixa. Por isso a
                transferência entre o caixa e a caixinha fica fora da receita e da despesa: o dinheiro não sai do caixa.
              </p>
            </div>
          </details>
          {linhaDoExcel}
        </div>
      ) : resumo.length === 0 ? (
        <div className="card"><Empty icon="💰">Nenhum movimento ainda.</Empty></div>
      ) : (
        <div className="ini-grupo">
          <div className="tabela-rolavel" style={{ padding: '4px 8px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Mês</th><th>Plays</th><th>Mens.</th><th>Extras</th><th>Receita</th><th>Aluguel</th><th>Brindes</th>
                  <th>Confrat.</th><th>Outras</th><th>Despesa</th><th>Saldo</th><th>Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {resumo.map((r) => (
                  <tr key={r.mes}>
                    <td>{monthLabel(r.mes).slice(0, 3)}/{r.mes.slice(2, 4)}</td>
                    <td className="valor-pos"><Reais n={r.receitasPlay} /></td><td className="valor-pos"><Reais n={r.mensalidades} /></td><td className="valor-pos"><Reais n={r.receitasExtras} /></td><td className="valor-pos"><Reais n={r.receitaTotal} /></td>
                    <td className="valor-neg"><Reais n={r.aluguel} /></td><td className="valor-neg"><Reais n={r.brindes} /></td><td className="valor-neg"><Reais n={r.confraternizacao} /></td>
                    <td className="valor-neg"><Reais n={r.outras} /></td><td className="valor-neg"><Reais n={r.despesaTotal} /></td>
                    <td className={r.saldoDoMes < 0 ? 'valor-neg' : 'valor-pos'}><Reais n={r.saldoDoMes} sinal /></td><td className={r.saldoAcumulado < 0 ? 'valor-neg' : 'valor-pos'}><Reais n={r.saldoAcumulado} sinal /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="valor-pos"><Reais n={totais.receitasPlay} /></td><td className="valor-pos"><Reais n={totais.mensalidades} /></td><td className="valor-pos"><Reais n={totais.receitasExtras} /></td><td className="valor-pos"><Reais n={totais.receitaTotal} /></td>
                  <td className="valor-neg"><Reais n={totais.aluguel} /></td><td className="valor-neg"><Reais n={totais.brindes} /></td><td className="valor-neg"><Reais n={totais.confraternizacao} /></td>
                  <td className="valor-neg"><Reais n={totais.outras} /></td><td className="valor-neg"><Reais n={totais.despesaTotal} /></td>
                  <td className={totais.saldoDoMes < 0 ? 'valor-neg' : 'valor-pos'}><Reais n={totais.saldoDoMes} sinal /></td><td className={(resumo[resumo.length - 1]?.saldoAcumulado ?? 0) < 0 ? 'valor-neg' : 'valor-pos'}><Reais n={resumo[resumo.length - 1]?.saldoAcumulado ?? 0} sinal /></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {linhaDoExcel}
        </div>
      )}

      {podeEditar && (
        <>
          <div className="ini-sec"><h2>Novo lançamento</h2></div>
          <div className="card" ref={formulario}>
            <div className="stack">
              <div className="segmented">
                <button className={tipo === 'saida' ? 'on' : ''} onClick={() => tipo !== 'saida' && setCategoria('brinde')}>➖ Saída</button>
                <button className={tipo === 'entrada' ? 'on' : ''} onClick={() => setCategoria('extra')}>➕ Receita extra</button>
              </div>
              {tipo === 'saida' && (
                <div className="chips-scroll">
                  {CATEGORIAS_DE_CAIXA.filter((c) => c.tipo === 'saida').map((c) => (
                    <button key={c.valor} className={`chip ${categoria === c.valor ? 'on' : ''}`} onClick={() => setCategoria(c.valor)}>
                      {ICONE_DO_CAIXA[c.valor]} {c.rotulo}
                    </button>
                  ))}
                </div>
              )}
              {ehAluguel && (
                <div className="field">
                  <span>Qual aluguel?</span>
                  <div className="segmented">
                    <button className={planoMensal ? 'on' : ''} onClick={() => escolherAluguel(true)}>📅 Mensal</button>
                    <button className={!planoMensal ? 'on' : ''} onClick={() => escolherAluguel(false)}>🎾 Avulso</button>
                  </div>
                  <div className="tiny muted">
                    {planoMensal
                      ? 'O contratado, das quadras garantidas: os check-ins feitos na V3 no mês anterior abatem sozinhos.'
                      : 'Um play a mais, fora do contrato: pago em dinheiro, sem check-in.'}
                  </div>
                </div>
              )}
              <div className="grid2">
                <label className="field">
                  <span>Data</span>
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="field">
                  <span>{ehAluguel ? 'Valor que a V3 cobrou' : 'Valor (R$)'}</span>
                  <input className="input valor" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
                </label>
              </div>
              {ehAluguel && (
                <>
                  <label className="desconto-aluguel">
                    <span className="desconto-campo">
                      <input
                        className="input"
                        inputMode="decimal"
                        aria-label="Desconto em porcentagem"
                        value={descontoTxt ?? String(Math.round(descontoPadrao * 10000) / 100).replace('.', ',')}
                        onChange={(e) => setDescontoTxt(e.target.value)}
                      />
                      <b>%</b>
                    </span>
                    <span className="tiny muted">
                      de desconto. {descontoLido > 0 ? 'O que ele economiza vai direto para a 🎉 caixinha de eventos.' : 'Zerado, nada vai para a caixinha.'}
                    </span>
                  </label>
                  {!descontoOk && <span className="hint aviso">O desconto vai de 0 a 99%.</span>}
                  {aluguel && (
                    <div className="conta-aluguel tiny">
                      {aluguel.economia > 0 && (
                        <div>Sem o desconto seria {formatarReais(aluguel.semPlano)} → <strong>{formatarReais(aluguel.economia)} para a 🎉 caixinha de eventos</strong></div>
                      )}
                      {planoMensal ? (
                        <div>
                          Crédito: {plural(checkinsAbatidos, 'check-in', 'check-ins')} na {v3?.nome ?? 'V3'} em {nomeDoMes(mesDosCheckins)}
                          {origemDosCheckins && checkinsAbatidos > 0 && ` (${origemDosCheckins.dePlay} dos plays + ${origemDosCheckins.daMensalidade} das mensalidades)`} × {formatarReais(25)} ={' '}
                          {formatarReais(aluguel.credito)}
                        </div>
                      ) : (
                        <div>Aluguel avulso: os check-ins não abatem.</div>
                      )}
                      <div className="pagar">Pagar no Pix: <strong>{formatarReais(aluguel.pagarNoPix)}</strong></div>
                      {aluguel.sobraDeCredito ? <div>Sobram {formatarReais(aluguel.sobraDeCredito)} de crédito com a V3.</div> : null}
                    </div>
                  )}
                  {!aluguel && <div className="conta-aluguel vazio tiny">Digite o valor que a V3 cobrou para ver a conta.</div>}
                  {!v3 && planoMensal && <span className="hint aviso">Nenhuma arena com “V3” no nome: o crédito dos check-ins fica zero.</span>}
                </>
              )}
              {podeEventos && (
                <div className={`caixinha-uso${doEventos ? ' on' : ''}`}>
                  <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={doEventos} onChange={(e) => setDoEventos(e.target.checked)} />
                    <span className="grow">
                      <strong>🎉 Usar o valor da caixinha de eventos?</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        Tem {formatarReais(Math.max(0, noEventos))} na caixinha em {dateLabel(date)}.
                      </span>
                    </span>
                  </label>
                  {doEventos && valorLido ? (
                    <>
                      <div className="caixinha-barra" role="img" aria-label={`${formatarReais(cobre)} da caixinha e ${formatarReais(passa)} do caixa geral`}>
                        {cobre > 0 && <span className="da-caixinha" style={{ flexGrow: cobre }} />}
                        {passa > 0 && <span className="do-caixa" style={{ flexGrow: passa }} />}
                      </div>
                      <div className="caixinha-legenda">
                        <span><i className="da-caixinha" /> {formatarReais(cobre)} da caixinha</span>
                        {passa > 0 && <span><i className="do-caixa" /> {formatarReais(passa)} do caixa geral</span>}
                      </div>
                      <div className="tiny muted">
                        {passa > 0
                          ? noEventos > 0
                            ? `A caixinha só tem ${formatarReais(noEventos)}: ela paga isso e fica zerada. Os ${formatarReais(passa)} que passam saem do caixa geral, como ${rotuloDa(categoria)}. Pode lançar o valor inteiro: o app divide sozinho e guarda a divisão no histórico.`
                            : `A caixinha está vazia nessa data: sai tudo do caixa geral, como ${rotuloDa(categoria)}.`
                          : `Sai tudo da caixinha; sobram ${formatarReais(noEventos - cobre)} nela.`}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
              <label className="field">
                <span>Descrição</span>
                <input
                  className="input"
                  placeholder={tipo === 'entrada' ? 'Valor avulso do play de sexta' : ehAluguel ? 'Aluguel de dezembro' : 'Brindes Shopee'}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lancar()}
                />
              </label>
              <button className={`btn block ${tipo === 'entrada' ? 'teal' : 'pink'}`} disabled={valorLido === null || valorLido <= 0 || (ehAluguel && !aluguel)} onClick={lancar}>
                {tipo === 'entrada' ? '➕ Lançar receita' : `➖ Lançar ${valorLido ? formatarReais(ehAluguel && aluguel ? aluguel.pagarNoPix : valorLido) : 'saída'}`}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="ini-sec">
        <h2>Lançamentos</h2>
        <span className="muted small">{doMes.length > 0 ? plural(doMes.length, 'lançamento', 'lançamentos') : ''}</span>
      </div>
      {doMes.length === 0 ? (
        <div className="card"><div className="tiny muted" style={{ textAlign: 'center' }}>Nenhuma receita extra nem saída em {nomeDoMes(mes)}.</div></div>
      ) : (
        <div className="ini-grupo">
          {doMes.map((l) => {
            const ev = l.do_eventos ? doEventosPorId.get(l.id) : undefined
            const conteudo = (
              <>
                <span className={`ini-ic ${l.tipo === 'entrada' ? 'verde' : l.do_eventos ? 'rosa' : ''}`} aria-hidden="true">{ICONE_DO_CAIXA[l.categoria] ?? '💸'}</span>
                <span className="g">
                  <b>{l.descricao || rotuloDoLancamento(l)}</b>
                  <span className="sub">
                    {dateLabel(l.date).slice(0, 5)} · {rotuloDoLancamento(l)}
                    {ev ? ` · 🎉 ${formatarReais(ev.coberto)} da caixinha${ev.resto > 0 ? ` + ${formatarReais(ev.resto)} do caixa` : ''}` : ''}
                  </span>
                </span>
                <span className={l.tipo === 'entrada' ? 'valor-pos' : 'valor-neg'} style={{ flex: 'none' }}>
                  {l.tipo === 'entrada' ? '+' : '−'} {formatarReais(l.valor)}
                </span>
              </>
            )
            return podeEditar ? (
              <button key={l.id} className="ini-linha" onClick={() => setAberto(l)}>{conteudo}</button>
            ) : (
              <div key={l.id} className="ini-linha">{conteudo}</div>
            )
          })}
        </div>
      )}
      {verEventos && <HistoricoDosEventos ate={mes} podeEditar={podeEditar} onToast={onToast} onClose={() => setVerEventos(false)} />}
      {movimentar && <MovimentarCaixinha onClose={() => setMovimentar(false)} onToast={onToast} />}
      {aberto && (
        <Modal title="Lançamento do caixa" onClose={() => setAberto(null)}>
          <div className="stack">
            <div>
              <b>{aberto.descricao || CATEGORIAS_DE_CAIXA.find((c) => c.valor === aberto.categoria)?.rotulo}</b>
              <div className="tiny muted">{CATEGORIAS_DE_CAIXA.find((c) => c.valor === aberto.categoria)?.rotulo ?? aberto.categoria}</div>
            </div>
            <div className="tiny muted">{dateLabel(aberto.date)}</div>
            <div className={aberto.tipo === 'entrada' ? 'valor-pos' : 'valor-neg'} style={{ fontSize: 22, fontWeight: 800 }}>
              {aberto.tipo === 'entrada' ? '+' : '−'} {formatarReais(aberto.valor)}
            </div>
            {aberto.valor_cobrado ? (
              <div className="conta-aluguel tiny">
                <div>A V3 cobrou {formatarReais(aberto.valor_cobrado)}{aberto.plano_mensal ? ' no plano mensal' : ' · 🎾 aluguel avulso'}</div>
                {economiaDoAluguel(aberto) > 0 && (
                  <div>{Math.round(descontoDoAluguel(aberto) * 10000) / 100}% de desconto → 🎉 {formatarReais(economiaDoAluguel(aberto))} para o caixa de eventos</div>
                )}
                {(aberto.plano_mensal || !!aberto.checkins_abatidos) && (
                  <div>{plural(aberto.checkins_abatidos ?? 0, 'check-in abatido', 'check-ins abatidos')} do mês anterior</div>
                )}
              </div>
            ) : null}
            {LIGA.id === 'feminino' && (aberto.do_eventos || aberto.categoria === 'brinde' || aberto.categoria === 'confraternizacao' || aberto.categoria === 'outra') && (() => {
              const x = aberto.do_eventos ? saidasDosEventos(data).find((y) => y.caixa_id === aberto.id) : undefined
              return (
                <>
                  {x && (
                    <div className="conta-aluguel tiny">
                      <div>🎉 {formatarReais(x.coberto)} saíram do caixa de eventos</div>
                      {x.resto > 0 && <div>{formatarReais(x.resto)} saíram do caixa geral (o caixa de eventos não tinha mais)</div>}
                    </div>
                  )}
                  <button
                    className="btn ghost block"
                    onClick={() => {
                      const novo = { ...aberto, do_eventos: !aberto.do_eventos }
                      saveCaixa(novo)
                      setAberto(novo)
                      onToast(novo.do_eventos ? 'Pago com o caixa de eventos 🎉' : 'Volta a sair do caixa geral')
                    }}
                  >
                    {aberto.do_eventos ? '↩️ Tirar do caixa de eventos (sai do caixa geral)' : '🎉 Pagar com o caixa de eventos'}
                  </button>
                </>
              )
            })()}
            <button
              className="btn danger block"
              onClick={() => {
                if (!confirm(`Apagar "${aberto.descricao || 'este lançamento'}" (${formatarReais(aberto.valor)})?`)) return
                deleteCaixa(aberto.id)
                setAberto(null)
                onToast('Lançamento apagado')
              }}
            >
              🗑 Apagar lançamento
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

/** Um icone por tipo de lancamento do caixa (lista e chips). */
const ICONE_DO_CAIXA: Record<string, string> = { extra: '💵', aluguel: '🏟️', brinde: '🎁', confraternizacao: '🥂', outra: '🧾' }

/* ================================================================ padroes */

function SecaoPadroes({ podeEditar, onToast }: { podeEditar: boolean; onToast: (m: string) => void }) {
  const { data, saveCheckinLocal, deleteCheckinLocal, savePlano, deletePlano } = useStore()
  const [planoEditado, setPlanoEditado] = useState<Plano | null>(null)
  const planos = [...data.checkinPlanos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
  const locaisAtivos = data.checkinLocais.filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem)
  const contasNoPlano = (id: string) => data.checkinContas.filter((c) => c.plano_id === id).length
  const [novo, setNovo] = useState('')
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null)
  const locais = [...data.checkinLocais].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
  const ultimo = [...data.checkinDias].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))[0]

  function usoDoLocal(id: string): number {
    return data.checkins.filter((c) => c.local_id === id).length + data.checkinContas.filter((c) => c.local_padrao_id === id).length
  }

  function adicionar() {
    const nome = novo.trim()
    if (!nome) return
    const ordem = Math.max(0, ...locais.map((l) => l.ordem)) + 1
    saveCheckinLocal({ id: uid(), nome, ativo: true, ordem })
    setNovo('')
    onToast(`${nome} cadastrada`)
  }

  return (
    <>
      <div className="card">
        <div className="section-title">📍 Arenas de check-in</div>
        <p className="tiny muted" style={{ margin: '0 0 10px' }}>
          Arenas que <strong>dividem check-in</strong> (V3 e Itaparica) cobrem uma o que passa da cota da outra; a GW não divide.
        </p>
        <div className="stack">
          {locais.map((l) => (
            <div key={l.id} className="fila-linha" style={{ opacity: l.ativo ? 1 : 0.55 }}>
              <div className="grow">
                {renomeando?.id === l.id ? (
                  <input
                    className="input"
                    value={renomeando.nome}
                    onChange={(e) => setRenomeando({ id: l.id, nome: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && renomeando.nome.trim()) {
                        saveCheckinLocal({ ...l, nome: renomeando.nome.trim() })
                        setRenomeando(null)
                      }
                      if (e.key === 'Escape') setRenomeando(null)
                    }}
                  />
                ) : (
                  <>
                    <span className="fila-time"><b>{l.nome}</b>{!l.ativo && <span className="muted"> · inativa</span>}</span>
                    <span className="tiny muted">
                      {plural(usoDoLocal(l.id), 'uso')}
                      {' · '}
                      {arenasAfiliadas(l, locais).length > 0
                        ? `divide check-in com ${arenasAfiliadas(l, locais).map((a) => a.nome).join(' e ')}`
                        : 'não divide check-in com outra arena'}
                    </span>
                    {podeEditar && (
                      <span className="tiny">
                        <span className="muted">Divide com: </span>
                        <select
                          className="select"
                          style={{ width: 'auto', padding: '4px 8px', fontSize: 12, display: 'inline-block' }}
                          value={arenasAfiliadas(l, locais)[0]?.id ?? ''}
                          onChange={(e) => {
                            const outra = locais.find((x) => x.id === e.target.value)
                            if (!outra) {
                              saveCheckinLocal({ ...l, afiliacao: null })
                              return
                            }
                            // a afiliacao e um grupo: entra no da outra (ou cria um com as duas)
                            const grupo = outra.afiliacao || `afiliacao-${outra.id}`
                            if (!outra.afiliacao) saveCheckinLocal({ ...outra, afiliacao: grupo })
                            saveCheckinLocal({ ...l, afiliacao: grupo })
                          }}
                        >
                          <option value="">ninguém</option>
                          {locais.filter((x) => x.id !== l.id).map((x) => (
                            <option key={x.id} value={x.id}>{x.nome}</option>
                          ))}
                        </select>
                      </span>
                    )}
                  </>
                )}
              </div>
              {podeEditar && (
                <div className="row" style={{ gap: 4 }}>
                  {renomeando?.id === l.id ? (
                    <>
                      <button
                        className="btn pink sm"
                        disabled={!renomeando.nome.trim()}
                        onClick={() => {
                          saveCheckinLocal({ ...l, nome: renomeando.nome.trim() })
                          setRenomeando(null)
                        }}
                      >
                        Salvar
                      </button>
                      <button className="btn ghost sm" onClick={() => setRenomeando(null)}>Voltar</button>
                    </>
                  ) : (
                    <>
                      <button className="btn ghost sm" onClick={() => setRenomeando({ id: l.id, nome: l.nome })}>✏️</button>
                      <button className="btn ghost sm" onClick={() => saveCheckinLocal({ ...l, ativo: !l.ativo })}>
                        {l.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      {usoDoLocal(l.id) === 0 && (
                        <button
                          className="btn danger sm"
                          onClick={() => {
                            if (confirm(`Apagar ${l.nome}?`)) deleteCheckinLocal(l.id)
                          }}
                        >
                          🗑
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {podeEditar && (
          <div className="row" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Nova arena"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && adicionar()}
            />
            <button className="btn pink sm nowrap" disabled={!novo.trim()} onClick={adicionar}>➕ Cadastrar</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">🎫 Planos de passe</div>
        <p className="tiny muted" style={{ margin: '0 0 10px' }}>
          Check-ins por mês <strong>em cada arena</strong> (vazio = não aceita).
        </p>
        <div className="stack">
          {planos.map((p) =>
            planoEditado?.id === p.id ? (
              <EditorDePlano
                key={p.id}
                plano={planoEditado}
                locais={locaisAtivos}
                onChange={setPlanoEditado}
                onSalvar={() => {
                  savePlano({ ...planoEditado, nome: planoEditado.nome.trim() })
                  setPlanoEditado(null)
                  onToast('Plano salvo')
                }}
                onVoltar={() => setPlanoEditado(null)}
              />
            ) : (
              <div key={p.id} className="fila-linha" style={{ opacity: p.ativo ? 1 : 0.55 }}>
                <div className="grow">
                  <span className="fila-time">
                    <b>{p.nome}</b>
                    <span className="muted"> · {rotuloDoTipo(p.app)}</span>
                    {!p.ativo && <span className="muted"> · inativo</span>}
                  </span>
                  <span className="tiny muted">
                    {locaisAtivos.map((l) => `${nomeCurto(l.nome)} ${cotaDoPlano(p, l.id) || '—'}`).join(' · ')}
                    {' · '}{plural(contasNoPlano(p.id), 'conta')}
                  </span>
                </div>
                {podeEditar && (
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn ghost sm" onClick={() => setPlanoEditado({ ...p, cotas: { ...p.cotas } })}>✏️</button>
                    <button className="btn ghost sm" onClick={() => savePlano({ ...p, ativo: !p.ativo })}>{p.ativo ? 'Desativar' : 'Ativar'}</button>
                    {contasNoPlano(p.id) === 0 && (
                      <button
                        className="btn danger sm"
                        onClick={() => {
                          if (confirm(`Apagar o plano ${p.nome}?`)) deletePlano(p.id)
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                )}
              </div>
            ),
          )}
          {planoEditado && !planos.some((p) => p.id === planoEditado.id) && (
            <EditorDePlano
              plano={planoEditado}
              locais={locaisAtivos}
              onChange={setPlanoEditado}
              onSalvar={() => {
                savePlano({ ...planoEditado, nome: planoEditado.nome.trim() })
                setPlanoEditado(null)
                onToast(`${planoEditado.nome.trim()} cadastrado`)
              }}
              onVoltar={() => setPlanoEditado(null)}
            />
          )}
        </div>
        {podeEditar && !planoEditado && (
          <button
            className="btn ghost block"
            style={{ marginTop: 12 }}
            onClick={() =>
              setPlanoEditado({
                id: uid(), nome: '', app: 'wellhub', ativo: true,
                ordem: Math.max(0, ...planos.map((p) => p.ordem)) + 1,
                cotas: Object.fromEntries(locaisAtivos.map((l) => [l.id, COTA_MENSAL])),
              })
            }
          >
            ➕ Novo plano
          </button>
        )}
      </div>

      <div className="card">
        <div className="section-title">💵 Valores do dia</div>
        <p className="tiny muted" style={{ margin: 0 }}>
          Um dia novo nasce com os valores do último dia criado
          {ultimo
            ? <>: <strong>{formatarReais(ultimo.valor_cheio)}</strong> integral e <strong>{formatarReais(ultimo.valor_com_checkin)}</strong> com check-in.</>
            : <>: {formatarReais(VALOR_CHEIO_INICIAL)} integral e {formatarReais(VALOR_COM_CHECKIN_INICIAL)} com check-in.</>}
          {' '}Mudou o preço? Mude no próximo dia.
        </p>
      </div>

      <div className="card">
        <div className="section-title">🎟️ Como a cota é contada</div>
        <p className="tiny muted" style={{ margin: 0 }}>
          Por arena, pelo plano ({COTA_MENSAL} por mês nos de hoje). Aulas cobram 8, 12 ou 16 (1, 2 ou 3 por semana);
          o que sobra é do play. No máximo <strong>um check-in por dia</strong> somando as arenas.
        </p>
      </div>
    </>
  )
}

/** Nome, app e a cota por arena de um plano, dentro do cartao de planos. */
function EditorDePlano({
  plano,
  locais,
  onChange,
  onSalvar,
  onVoltar,
}: {
  plano: Plano
  locais: CheckinLocal[]
  onChange: (p: Plano) => void
  onSalvar: () => void
  onVoltar: () => void
}) {
  return (
    <div className="stack" style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 14, background: 'var(--card-2)' }}>
      <label className="field">
        <span>Nome do plano</span>
        <input className="input" placeholder="Wellhub Gold" value={plano.nome} onChange={(e) => onChange({ ...plano, nome: e.target.value })} />
      </label>
      <div className="field">
        <span>App (o que a arena vê)</span>
        <div className="chips-scroll">
          {TIPOS_DE_CONTA.map((t) => (
            <button key={t.valor} className={`chip ${plano.app === t.valor ? 'on' : ''}`} onClick={() => onChange({ ...plano, app: t.valor })}>
              {t.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Check-ins por mês em cada arena</span>
        <div className="stack" style={{ gap: 6 }}>
          {locais.map((l) => (
            <label key={l.id} className="row spread" style={{ gap: 8 }}>
              <span className="grow" style={{ fontSize: 13, fontWeight: 700 }}>{l.nome}</span>
              <input
                className="input valor"
                style={{ width: 90 }}
                inputMode="numeric"
                placeholder="não aceita"
                value={plano.cotas[l.id] ? String(plano.cotas[l.id]) : ''}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ''))
                  const cotas = { ...plano.cotas }
                  if (n > 0) cotas[l.id] = n
                  else delete cotas[l.id]
                  onChange({ ...plano, cotas })
                }}
              />
            </label>
          ))}
        </div>
        <span className="hint">Vazio = o plano não aceita check-in nessa arena.</span>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn pink grow" disabled={!plano.nome.trim()} onClick={onSalvar}>Salvar</button>
        <button className="btn ghost" onClick={onVoltar}>Voltar</button>
      </div>
    </div>
  )
}

/* ========================================================= modal: contas */

function ContasModal({
  jogadora,
  visaoInicial,
  mes,
  veDinheiro,
  podeEditar,
  onClose,
  onToast,
}: {
  jogadora: Player
  visaoInicial: VisaoDasContas
  mes: string
  veDinheiro: boolean
  podeEditar: boolean
  onClose: () => void
  onToast: (m: string) => void
}) {
  const { data, nameOf, saveCheckinConta, deleteCheckinConta, saveAcerto, deleteAcerto } = useStore()
  const [editando, setEditando] = useState<CheckinConta | null>(null)
  const [visao, setVisao] = useState<VisaoDasContas>(visaoInicial)
  const nome = nameOf(jogadora.id)
  const saldo = saldoDaAtleta(data, jogadora.id)
  const contas = contasDaAtleta(data, jogadora.id, { incluirInativas: true })
  const disp = disponibilidade(data, jogadora.id, mes)
  const locais = data.checkinLocais.filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem)
  const planos = data.checkinPlanos.filter((p) => p.ativo).sort((a, b) => a.ordem - b.ordem)

  function usoDaConta(id: string): number {
    return data.checkins.filter((c) => c.conta_id === id).length
  }

  function salvar(c: CheckinConta) {
    const plano = c.plano_id ? data.checkinPlanos.find((p) => p.id === c.plano_id) : undefined
    saveCheckinConta({
      ...c,
      nome: c.principal ? '' : c.nome.trim(),
      // o app vem do plano (o relatorio da arena usa); as aulas por local substituem o campo antigo
      tipo: plano?.app ?? c.tipo,
      aulas: c.aulas.filter((a) => a.por_semana > 0),
      aulas_semana: null,
      // a principal virtual nasce sem created_at; o banco nao aceita '' num timestamptz
      created_at: c.created_at || new Date().toISOString(),
    })
    setEditando(null)
    onToast('Conta salva')
  }

  if (visao === 'extrato' && veDinheiro) {
    const extrato = extratoDaAtleta(data, jogadora.id).reverse()
    return (
      <Modal title={`Extrato de ${nome}`} onClose={onClose}>
        <div className="stack">
          <div className="row spread">
            <BadgeSaldo saldo={saldo.saldo} />
            <div className="row" style={{ gap: 6 }}>
              {podeEditar && <button className="btn pink sm" onClick={() => setVisao('acerto')}>💰 Acertar</button>}
              <button className="btn ghost sm" onClick={() => setVisao('contas')}>Contas</button>
            </div>
          </div>
          {extrato.length === 0 ? (
            <div className="tiny muted" style={{ textAlign: 'center' }}>Nenhum lançamento ainda.</div>
          ) : (
            extrato.map((m) => (
              <div key={m.tipo === 'acerto' ? m.acerto.id : m.checkin.id} className="fila-linha">
                <span className="fila-num">{dateLabel(m.date).slice(0, 5)}</span>
                <div className="grow">
                  {m.tipo === 'acerto' ? (
                    <>
                      <span className="fila-time"><b>{m.acerto.descricao || 'Acerto'}</b></span>
                      <span className="tiny muted">{m.acerto.dinheiro ? 'com dinheiro' : 'sem dinheiro'} · acerto</span>
                    </>
                  ) : (
                    <>
                      <span className="fila-time">
                        <b>{rotuloDoDia(m.dia, data.sessions)}</b>
                        {!m.checkin.compareceu && <span className="muted"> · não veio{m.checkin.credito_checkin ? ' (check-in vira crédito)' : ''}</span>}
                        {m.checkin.compareceu && m.checkin.credito_de && <span className="muted"> · check-in de crédito</span>}
                      </span>
                      <span className="tiny muted">
                        {m.checkin.modo === 'checkin' ? 'check-in' : 'integral'} · devia {formatarReais(m.devido)} · pagou {formatarReais(m.pago)}
                        {m.creditoUsado > 0 && ` · ${formatarReais(m.creditoUsado)} do crédito`}
                      </span>
                    </>
                  )}
                  <span className="tiny">
                    saldo depois:{' '}
                    <span className={m.saldoDepois > 0 ? 'valor-pos' : m.saldoDepois < 0 ? 'valor-neg' : undefined}>
                      {formatarReais(m.saldoDepois)}
                    </span>
                  </span>
                </div>
                <span className={m.tipo === 'acerto' ? (m.acerto.valor >= 0 ? 'valor-pos' : 'valor-neg') : m.pago - m.devido >= 0 ? 'valor-pos' : 'valor-neg'}>
                  {m.tipo === 'acerto'
                    ? `${m.acerto.valor >= 0 ? '+' : '−'} ${formatarReais(Math.abs(m.acerto.valor))}`
                    : `${m.pago - m.devido >= 0 ? '+' : '−'} ${formatarReais(Math.abs(m.pago - m.devido))}`}
                </span>
                {m.tipo === 'acerto' && podeEditar && (
                  <button
                    className="btn danger sm"
                    onClick={() => {
                      if (!confirm(`Apagar o acerto "${m.acerto.descricao || formatarReais(m.acerto.valor)}"?`)) return
                      deleteAcerto(m.acerto.id)
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>
            ))
          )}
          <span className="hint">
            O saldo é a soma de tudo: o que ela pagou menos o que cada play custou, mais os acertos. O crédito de um play
            cobre o seguinte sozinho; apagar um dia devolve o que ele tinha consumido.
          </span>
        </div>
      </Modal>
    )
  }

  if (visao === 'acerto' && podeEditar) {
    return (
      <AcertoForm
        jogadora={jogadora}
        saldo={saldo.saldo}
        onClose={onClose}
        onVoltar={() => setVisao('extrato')}
        onSalvar={(a) => {
          saveAcerto(a)
          onToast('Acerto lançado')
          setVisao('extrato')
        }}
      />
    )
  }

  if (editando) {
    const c = editando
    const uso = c.principal ? 0 : usoDaConta(c.id)
    const eNova = !c.principal && !data.checkinContas.some((x) => x.id === c.id)
    const planoEditado = planoDaConta(data, c)
    const locaisAceitos = locais.filter((l) => cotaDoPlano(planoEditado, l.id) > 0)
    const aulasEditadas = aulasDaConta(c)
    // uma arena que o plano nao aceita mas tem aula (mudou de plano) continua na lista, para zerar ou dar destino
    const locaisComAulas = locais.filter((l) => cotaDoPlano(planoEditado, l.id) > 0 || aulasEditadas.some((a) => a.local_id === l.id))
    const outrasContas = contas.filter((o) => o.id !== c.id && o.ativo)
    const usoAtual = disp.contas.find((x) => x.conta.id === c.id)
    const avisosDoEditor: string[] = []
    /** O que sobra na arena para as aulas desta conta, tirando o que ela ja cobre das outras (e de si mesma, vindo de outra arena). */
    const sobraParaAulas = (localId: string) => {
      const cota = cotaDoPlano(planoEditado, localId)
      const ja = usoAtual?.locais.find((x) => x.local.id === localId)
      return Math.max(0, cota - (ja?.complemento ?? 0) - (ja?.usadosEmPlays ?? 0))
    }
    const destinoValido = (a: AulaDaConta) => {
      const d = destinoDoExcedente(a.excedente, c, contas.filter((o) => o.ativo), locais)
      const origem = locais.find((l) => l.id === a.local_id)
      if (
        d?.tipo === 'local' &&
        (!origem || cotaDoPlano(planoEditado, d.local.id) === 0 || !arenasAfiliadas(origem, locais).some((x) => x.id === d.local.id))
      )
        return null
      return d
    }
    for (const a of aulasEditadas) {
      const local = data.checkinLocais.find((l) => l.id === a.local_id)
      if (!local) continue
      const cota = cotaDoPlano(planoEditado, local.id)
      const excesso = Math.max(0, consumoDasAulas(a.por_semana) - sobraParaAulas(local.id))
      if (excesso === 0 || destinoValido(a)) continue
      avisosDoEditor.push(
        cota === 0
          ? `${planoEditado.nome} não aceita ${local.nome}: os ${excesso} das aulas de lá precisam de outra conta${arenasAfiliadas(local, locais).length > 0 ? ', de outra arena' : ''} ou ficam em dinheiro.`
          : `${a.por_semana} aulas em ${local.nome} cobram ${consumoDasAulas(a.por_semana)} e sobravam ${sobraParaAulas(local.id)}: escolha quem cobre os ${excesso} que passam.`,
      )
    }
    return (
      <Modal title={c.principal ? `Conta de ${nome}` : eNova ? 'Nova conta secundária' : `Conta de ${c.nome || '(sem nome)'}`} onClose={onClose}>
        <div className="stack">
          {!c.principal && (
            <label className="field">
              <span>Titular da conta</span>
              <input className="input" placeholder="Brayan" value={c.nome} onChange={(e) => setEditando({ ...c, nome: e.target.value })} />
              <span className="hint">O nome que a arena vê no check-in. A menina continua sendo {nome}.</span>
            </label>
          )}
          <div className="field">
            <span>Plano</span>
            <div className="chips-scroll">
              {planos.map((p) => (
                <button key={p.id} className={`chip ${c.plano_id === p.id ? 'on' : ''}`} onClick={() => setEditando({ ...c, plano_id: p.id, tipo: p.app })}>
                  {p.nome}
                </button>
              ))}
              <button className={`chip ${c.plano_id === null ? 'on' : ''}`} onClick={() => setEditando({ ...c, plano_id: null })}>Sem plano</button>
            </div>
            <span className="hint">
              {planoEditado.id
                ? `${planoEditado.nome}: ${locais.map((l) => `${nomeCurto(l.nome)} ${cotaDoPlano(planoEditado, l.id) || '—'}`).join(' · ')} por mês`
                : 'Sem plano conta como 12 em qualquer arena. Os planos e as cotas ficam em ⚙️.'}
            </span>
          </div>
          {c.plano_id === null && (
            <div className="field">
              <span>App</span>
              <div className="chips-scroll">
                {TIPOS_DE_CONTA.map((t) => (
                  <button key={t.valor} className={`chip ${c.tipo === t.valor ? 'on' : ''}`} onClick={() => setEditando({ ...c, tipo: t.valor })}>
                    {t.rotulo}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <span>Aulas por semana com esta conta</span>
            <div className="stack" style={{ gap: 6 }}>
              {locaisComAulas.map((l) => {
                const cota = cotaDoPlano(planoEditado, l.id)
                const aceita = cota > 0
                const aula = aulasEditadas.find((a) => a.local_id === l.id)
                const atual = aula?.por_semana ?? 0
                const consumo = consumoDasAulas(atual)
                // o que a conta ja gastou aqui fora destas aulas: cobrindo aulas de outra conta
                // (ou dela mesma, vindas de outra arena), e plays lancados
                const jaUsado = usoAtual?.locais.find((x) => x.local.id === l.id)
                const excesso = Math.max(0, consumo - sobraParaAulas(l.id))
                const outros = (jaUsado?.complemento ?? 0) + (jaUsado?.usadosEmPlays ?? 0)
                const sobra = sobraParaAulas(l.id) - Math.min(consumo, sobraParaAulas(l.id))
                const detalhe = jaUsado && outros > 0
                  ? ` (${[
                      ...jaUsado.complementos.map((r) => (r.deLocal.id !== l.id ? `${r.quanto} das aulas na ${nomeCurto(r.deLocal.nome)}` : `${r.quanto} cobrem aulas de outra conta`)),
                      jaUsado.usadosEmPlays > 0 ? `${jaUsado.usadosEmPlays} de play` : '',
                    ].filter(Boolean).join(', ')})`
                  : ''
                const outrasArenas = arenasAfiliadas(l, locaisAceitos)
                const mudar = (k: number) =>
                  setEditando({ ...c, aulas: [...aulasEditadas.filter((a) => a.local_id !== l.id), { local_id: l.id, por_semana: k, excedente: aula?.excedente ?? null }] })
                const destinar = (para: string | null) =>
                  setEditando({ ...c, aulas: aulasEditadas.map((a) => (a.local_id === l.id ? { ...a, excedente: para } : a)) })
                return (
                  <div key={l.id} className="stack" style={{ gap: 4 }}>
                    <div className="row spread" style={{ gap: 8 }}>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: 13 }}>{l.nome}</strong>
                        <span className="tiny muted" style={{ display: 'block' }}>
                          {!aceita
                            ? `o ${planoEditado.nome} não aceita esta arena`
                            : atual === 0
                              ? `${sobra} livres para o play${detalhe}`
                              : consumo > cota
                                ? `as aulas cobram ${consumo}, o plano dá ${cota}${detalhe}`
                                : `aulas cobram ${consumo} · ${sobra} para o play${detalhe}`}
                        </span>
                      </span>
                      <span className="row" style={{ gap: 4 }}>
                        {[0, 1, 2, 3].map((k) => (
                          <button key={k} className={`chip ${atual === k ? 'on' : ''}`} style={{ padding: '5px 9px' }} onClick={() => mudar(k)}>
                            {k}
                          </button>
                        ))}
                      </span>
                    </div>
                    {excesso > 0 && (
                      <div className="tiny" style={{ paddingLeft: 8 }}>
                        <span className="muted">Os {excesso} que passam: </span>
                        <span className="chips-scroll" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
                          {outrasContas.map((o) => (
                            <button
                              key={o.id}
                              className={`chip ${aula?.excedente === o.id ? 'on' : ''}`}
                              style={{ padding: '4px 9px', fontSize: 12 }}
                              onClick={() => destinar(aula?.excedente === o.id ? null : o.id)}
                            >
                              conta {nomeDoTitular(o, nome)}
                            </button>
                          ))}
                          {outrasArenas.map((o) => {
                            const id = `${EXCEDENTE_PARA_LOCAL}${o.id}`
                            return (
                              <button
                                key={o.id}
                                className={`chip ${aula?.excedente === id ? 'on' : ''}`}
                                style={{ padding: '4px 9px', fontSize: 12 }}
                                onClick={() => destinar(aula?.excedente === id ? null : id)}
                              >
                                {nomeCurto(o.nome)} (mesma conta)
                              </button>
                            )
                          })}
                          <button
                            className={`chip ${aula?.excedente === EXCEDENTE_EM_DINHEIRO ? 'on' : ''}`}
                            style={{ padding: '4px 9px', fontSize: 12 }}
                            onClick={() => destinar(aula?.excedente === EXCEDENTE_EM_DINHEIRO ? null : EXCEDENTE_EM_DINHEIRO)}
                          >
                            💵 Em dinheiro
                          </button>
                        </span>
                        {outrasContas.length === 0 && outrasArenas.length === 0 && <span className="muted"> (ou cadastre uma conta secundária)</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              {locaisComAulas.length === 0 && <span className="tiny muted">Este plano não aceita nenhuma arena cadastrada.</span>}
            </div>
            <span className="hint">1 aula por semana cobra 8 check-ins do local; 2 cobram 12; 3 cobram 16.</span>
            {avisosDoEditor.map((a) => (
              <span key={a} className="hint aviso">⚠️ {a}</span>
            ))}
          </div>
          <div className="field">
            <span>Arena padrão do play</span>
            <div className="chips-scroll">
              <button className={`chip ${c.local_padrao_id === null ? 'on' : ''}`} onClick={() => setEditando({ ...c, local_padrao_id: null })}>Nenhuma</button>
              {locaisAceitos.map((l) => (
                <button key={l.id} className={`chip ${c.local_padrao_id === l.id ? 'on' : ''}`} onClick={() => setEditando({ ...c, local_padrao_id: l.id })}>
                  {l.nome}
                </button>
              ))}
            </div>
            <span className="hint">Vem escolhida ao lançar; dá para trocar na hora.</span>
          </div>
          {!c.principal && !eNova && (
            <label className="toggle-card row">
              <input type="checkbox" checked={c.ativo} onChange={(e) => setEditando({ ...c, ativo: e.target.checked })} />
              <span className="grow"><strong>Conta ativa</strong><span className="tiny muted" style={{ display: 'block' }}>Inativa some da hora de lançar; o histórico fica.</span></span>
            </label>
          )}
          <div className="row" style={{ gap: 6 }}>
            <button className="btn pink grow" disabled={!c.principal && !c.nome.trim()} onClick={() => salvar(c)}>Salvar</button>
            <button className="btn ghost" onClick={() => setEditando(null)}>Voltar</button>
            {!c.principal && !eNova && uso === 0 && (
              <button
                className="btn danger"
                onClick={() => {
                  if (!confirm(`Apagar a conta de ${c.nome || '(sem nome)'}?`)) return
                  deleteCheckinConta(c.id)
                  setEditando(null)
                }}
              >
                🗑
              </button>
            )}
          </div>
          {!c.principal && uso > 0 && (
            <span className="hint">Tem {plural(uso, 'lançamento')}: para tirar da lista, desative em vez de apagar.</span>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Contas de ${nome}`} onClose={onClose}>
      <div className="stack">
        {veDinheiro && (
          <div className="row spread">
            <BadgeSaldo saldo={saldo.saldo} />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost sm" onClick={() => setVisao('extrato')}>Extrato</button>
              {podeEditar && <button className="btn pink sm" onClick={() => setVisao('acerto')}>💰 Acertar</button>}
            </div>
          </div>
        )}
        <div className="tiny muted">
          🎟️ livres para o play em {nomeDoMes(mes)}, somando as contas:{' '}
          {disp.porLocal.map((l, i) => (
            <span key={l.local.id}>
              {i > 0 && ' · '}
              {nomeCurto(l.local.nome)} <strong style={{ color: 'var(--text)' }}>{l.aceita ? l.disponiveis : '—'}</strong>
            </span>
          ))}
        </div>
        {disp.avisos.map((a) => (
          <span key={a} className="hint aviso" style={{ marginTop: 0 }}>⚠️ {a}</span>
        ))}
        {contas.map((c) => {
          const u = disp.contas.find((x) => x.conta.id === c.id)
          const arena = data.checkinLocais.find((l) => l.id === c.local_padrao_id)?.nome
          return (
            <div key={c.id} className="fila-linha" style={{ opacity: c.ativo ? 1 : 0.55 }}>
              <div className="grow">
                <span className="fila-time">
                  <b>{nomeDoTitular(c, nome)}</b>
                  {c.principal && <span className="muted"> · principal</span>}
                  {!c.ativo && <span className="muted"> · inativa</span>}
                </span>
                <span className="tiny muted">
                  {planoDaConta(data, c).nome} · {aulasDaConta(c).length > 0 ? `aulas ${textoDasAulas(data, c, u)}` : 'sem aulas'}{arena ? ` · play em ${arena}` : ''}
                  {u?.notas.map((t) => <span key={t}> · {t}</span>)}
                </span>
                {u && (
                  <span className="tiny">
                    <LivresPorLocal uso={u} />
                    <span className="muted"> · mês {u.usadosNoMes}/{u.tetoDoMes}</span>
                  </span>
                )}
                {u?.locais
                  .filter((x) => x.aceita && (x.consumoAulas > 0 || x.complemento > 0 || x.usadosEmPlays > 0))
                  .map((x) => (
                    <span key={x.local.id} className="tiny muted">
                      {nomeCurto(x.local.nome)}: {detalheDoUso(x)}
                    </span>
                  ))}
              </div>
              {podeEditar && <button className="btn ghost sm" onClick={() => setEditando(c)}>✏️</button>}
            </div>
          )
        })}
        {podeEditar && (
          <button
            className="btn ghost block"
            onClick={() =>
              setEditando({
                id: uid(), player_id: jogadora.id, nome: '', principal: false, tipo: planos[0]?.app ?? 'wellhub', aulas_semana: null,
                plano_id: planos[0]?.id ?? null, aulas: [], local_padrao_id: null, ativo: true, created_at: new Date().toISOString(),
              })
            }
          >
            ➕ Conta de outra pessoa
          </button>
        )}
        <span className="hint">
          Quando a conta dela acaba, o check-in é feito na conta de outra pessoa (o marido, por exemplo). A arena vê o nome
          dessa pessoa; o play continua sendo de {nome}.
        </span>
      </div>
    </Modal>
  )
}

/* ========================================================= modal: acerto */

const TIPOS_DE_ACERTO: { id: string; rotulo: string; sinal: 1 | -1; dinheiro: boolean; descricao: string; explica: string }[] = [
  { id: 'pagou', rotulo: '💰 Ela pagou', sinal: 1, dinheiro: true, descricao: 'Pagou o que faltava', explica: 'entrou dinheiro: tira a dívida e conta na receita' },
  { id: 'devolvi', rotulo: '↩️ Devolvi a ela', sinal: -1, dinheiro: true, descricao: 'Crédito devolvido', explica: 'saiu dinheiro: tira o crédito e desconta da receita' },
  { id: 'perdao', rotulo: '🤝 Perdoar / dar crédito', sinal: 1, dinheiro: false, descricao: 'Dívida perdoada', explica: 'sem dinheiro: só zera a dívida (ou dá crédito)' },
  { id: 'tirar', rotulo: '✖️ Tirar crédito', sinal: -1, dinheiro: false, descricao: 'Crédito retirado', explica: 'sem dinheiro: só tira o crédito (usou noutra coisa, por exemplo)' },
]

/** Muda o saldo da menina fora de um play: pagou depois, devolveram, perdoaram. */
function AcertoForm({
  jogadora,
  saldo,
  onClose,
  onVoltar,
  onSalvar,
}: {
  jogadora: Player
  saldo: number
  onClose: () => void
  onVoltar: () => void
  onSalvar: (a: Acerto) => void
}) {
  const { nameOf } = useStore()
  const nome = nameOf(jogadora.id)
  // o palpite segue o saldo: quem deve costuma pagar; quem tem credito costuma receber de volta
  const [tipoId, setTipoId] = useState(saldo < 0 ? 'pagou' : saldo > 0 ? 'devolvi' : 'perdao')
  const [valor, setValor] = useState(saldo !== 0 ? textoDoValor(Math.abs(saldo)) : '')
  const [date, setDate] = useState(todayISO())
  const [descricao, setDescricao] = useState('')
  const tipo = TIPOS_DE_ACERTO.find((t) => t.id === tipoId) ?? TIPOS_DE_ACERTO[0]
  const v = lerValor(valor)
  const efeito = v === null ? null : tipo.sinal * v
  const saldoDepois = efeito === null ? null : Math.round((saldo + efeito) * 100) / 100

  return (
    <Modal title={`Acertar o saldo de ${nome}`} onClose={onClose}>
      <div className="stack">
        <div className="row spread">
          <span className="tiny muted">saldo de hoje</span>
          <BadgeSaldo saldo={saldo} />
        </div>
        <div className="field">
          <span>O que aconteceu</span>
          <div className="stack" style={{ gap: 6 }}>
            {TIPOS_DE_ACERTO.map((t) => (
              <button key={t.id} className={`opcao ${tipoId === t.id ? 'on' : ''}`} onClick={() => setTipoId(t.id)}>
                <span className="opcao-marca">{tipoId === t.id ? '●' : '○'}</span>
                <span><strong>{t.rotulo}</strong><span className="tiny muted">{t.explica}</span></span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Valor (R$)</span>
            <input className="input valor" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
          </label>
          <label className="field">
            <span>Data</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Descrição</span>
          <input className="input" placeholder={tipo.descricao} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        {saldoDepois !== null && (
          <span className="hint">
            Saldo depois: <strong>{saldoDepois > 0 ? `crédito ${formatarReais(saldoDepois)}` : saldoDepois < 0 ? `deve ${formatarReais(-saldoDepois)}` : 'em dia'}</strong>
            {tipo.dinheiro && ` · ${tipo.sinal > 0 ? 'entra' : 'sai'} ${formatarReais(v ?? 0)} no caixa de ${nomeDoMes(monthOf(date || todayISO()))}`}
          </span>
        )}
        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn pink grow"
            disabled={v === null || v <= 0 || !date}
            onClick={() =>
              onSalvar({
                id: uid(),
                player_id: jogadora.id,
                date,
                valor: tipo.sinal * (v ?? 0),
                dinheiro: tipo.dinheiro,
                descricao: descricao.trim() || tipo.descricao,
                created_at: new Date().toISOString(),
              })
            }
          >
            Lançar acerto
          </button>
          <button className="btn ghost" onClick={onVoltar}>Voltar</button>
        </div>
      </div>
    </Modal>
  )
}

/* ============================================================ modal: dia */

function EditarDiaModal({
  dia,
  mes,
  onClose,
  onToast,
}: {
  dia: CheckinDia | null
  mes: string
  onClose: () => void
  onToast: (m: string) => void
}) {
  const { data, saveCheckinDia, deleteCheckinDia } = useStore()
  // o dia novo copia os valores do ultimo dia criado: o preco raramente muda
  const ultimo = [...data.checkinDias].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))[0]
  const hoje = todayISO()
  const [date, setDate] = useState(dia?.date ?? (monthOf(hoje) === mes ? hoje : `${mes}-01`))
  const [sessionId, setSessionId] = useState(dia?.session_id ?? '')
  const [titulo, setTitulo] = useState(dia?.titulo ?? '')
  const [cheio, setCheio] = useState(textoDoValor(dia?.valor_cheio ?? ultimo?.valor_cheio ?? VALOR_CHEIO_INICIAL))
  const [comCheckin, setComCheckin] = useState(textoDoValor(dia?.valor_com_checkin ?? ultimo?.valor_com_checkin ?? VALOR_COM_CHECKIN_INICIAL))

  const plays = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60)
  const doDia = data.sessions.filter((s) => s.date === date)

  // o play da mesma data ja vem ligado quando ha um so
  useEffect(() => {
    if (dia) return
    setSessionId(doDia.length === 1 ? doDia[0].id : '')
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  const vCheio = lerValor(cheio)
  const vCom = lerValor(comCheckin)
  const lancamentos = dia ? checkinsDoDia(data, dia.id).length : 0
  const jaExiste = !dia && data.checkinDias.some((d) => d.date === date)

  function salvar() {
    if (!date || vCheio === null || vCom === null) return
    saveCheckinDia({
      // `:manual`: o apagar da lista so leva o dia que o 💰 criou (`dia:<data>`), nunca este
      id: dia?.id ?? (jaExiste ? uid() : `dia:${date}:manual`),
      date,
      session_id: sessionId || null,
      titulo: titulo.trim() || null,
      valor_cheio: vCheio,
      valor_com_checkin: vCom,
      created_at: dia?.created_at ?? new Date().toISOString(),
    })
    onToast(dia ? 'Dia salvo' : 'Dia criado')
    onClose()
  }

  return (
    <Modal title={dia ? `Dia ${dateLabel(dia.date)}` : 'Novo dia de check-in'} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Data</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {jaExiste && <span className="hint aviso">Já existe um dia nesta data. Pode ser outro (um treino, por exemplo), mas confira.</span>}
        </label>
        <label className="field">
          <span>Play</span>
          <select className="select" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">Sem play (treino, avulso…)</option>
            {plays.map((s) => (
              <option key={s.id} value={s.id}>{dateLabel(s.date)} · {s.title}</option>
            ))}
          </select>
          <span className="hint">Só para o nome do dia; os lançamentos não dependem do play.</span>
        </label>
        <label className="field">
          <span>Título (opcional)</span>
          <input className="input" placeholder="Play de segunda" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Integral (R$)</span>
            <input className="input valor" inputMode="decimal" value={cheio} onChange={(e) => setCheio(e.target.value)} />
            <span className="hint">sem check-in</span>
          </label>
          <label className="field">
            <span>Com check-in (R$)</span>
            <input className="input valor" inputMode="decimal" value={comCheckin} onChange={(e) => setComCheckin(e.target.value)} />
            <span className="hint">a parte em dinheiro</span>
          </label>
        </div>
        <button className="btn pink block" disabled={!date || vCheio === null || vCom === null} onClick={salvar}>
          {dia ? 'Salvar' : 'Criar o dia'}
        </button>
        {dia && (
          <button
            className="btn danger block"
            onClick={() => {
              const pendurado = avisoAoApagarLancamentos(data, checkinsDoDia(data, dia.id).map((c) => c.id))
              const aviso = (lancamentos > 0 ? `\n\nSomem também ${plural(lancamentos, 'lançamento')} e os pagamentos deles.` : '') + (pendurado ? `\n\n${pendurado}` : '')
              if (!confirm(`Apagar o dia ${dateLabel(dia.date)}?${aviso}`)) return
              deleteCheckinDia(dia.id)
              onToast('Dia apagado')
              onClose()
            }}
          >
            🗑 Apagar o dia{lancamentos > 0 && ` (${plural(lancamentos, 'lançamento')})`}
          </button>
        )}
      </div>
    </Modal>
  )
}

/* ========================================================= modal: lancar */

function LancarModal({
  pedido,
  onTrocar,
  onClose,
  onToast,
}: {
  pedido: PedidoDeLancamento
  /** Ja existe lancamento dela naquele dia: abre ele em vez de duplicar. */
  onTrocar: (c: Checkin) => void
  onClose: () => void
  onToast: (m: string) => void
}) {
  const { data, nameOf, saveCheckin, saveCheckinPagamento, deleteCheckin } = useStore()
  const existente = pedido.checkin ?? null
  const pagExistente = existente ? pagamentoDoCheckin(data, existente.id) : undefined

  const [playerId, setPlayerId] = useState(existente?.player_id ?? pedido.playerId ?? '')
  const [diaId, setDiaId] = useState(existente?.dia_id ?? pedido.diaId ?? '')
  const [contaId, setContaId] = useState<string | null>(existente?.conta_id ?? null)
  const [localId, setLocalId] = useState<string | null>(existente?.local_id ?? null)
  // check-in sem vir e sem o credito (antes do dono juntar as duas, 19/11) = nao veio e nao fez nada: abre como integral
  const [modo, setModo] = useState<CheckinModo>(existente?.modo === 'checkin' && !existente.compareceu && !existente.credito_checkin ? 'integral' : existente?.modo ?? 'checkin')
  const [compareceu, setCompareceu] = useState(existente?.compareceu ?? true)
  const [checkinConfirmado, setCheckinConfirmado] = useState(existente?.checkin_confirmado ?? false)
  /** Veio pelo check-in de credito deste lancamento. */
  const [creditoDe, setCreditoDe] = useState<string | null>(existente?.credito_de ?? null)
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState(pagExistente?.pagamento_confirmado ?? false)
  const [valorPago, setValorPago] = useState(pagExistente ? textoDoValor(pagExistente.valor_pago) : '')
  const [pagoEditado, setPagoEditado] = useState(Boolean(pagExistente))
  const [precoDiferente, setPrecoDiferente] = useState(
    pagExistente?.valor_devido !== null && pagExistente?.valor_devido !== undefined ? textoDoValor(pagExistente.valor_devido) : '',
  )
  const [observacao, setObservacao] = useState(pagExistente?.observacao ?? '')
  /** A mensalista que ela substituiu (a avulsa que entrou no lugar de quem avisou com 24h). */
  const [substitui, setSubstitui] = useState<string | null>(existente?.substitui ?? null)
  const [prefeito, setPrefeito] = useState(Boolean(existente))
  /** O dia em que ela fez o check-in no app (script 42): vazio = o dia do play. */
  const [dataCheckin, setDataCheckin] = useState(existente?.data_checkin ?? '')

  const dias = [...data.checkinDias].sort((a, b) => b.date.localeCompare(a.date))
  const dia = dias.find((d) => d.id === diaId)
  // entrou no lugar de uma mensalista na lista de presenca do play: o lancamento ja vem marcado (dono, 18/11)
  const { repo } = useStore()
  useEffect(() => {
    if (existente || !playerId || !dia?.session_id || LIGA.id !== 'feminino') return
    let vivo = true
    repo.carregarLista({ sessionId: dia.session_id }).then((l) => {
      const n = l?.nomes.find((x) => x.player_id === playerId && !x.saiu_em && x.substitui)
      if (vivo && n?.substitui) setSubstitui((atual) => atual ?? n.substitui!)
    }).catch(() => {})
    return () => { vivo = false }
  }, [existente, playerId, dia?.session_id, repo])
  const dataDoCk = dataCheckin || dia?.date || ''
  // a cota e a do mes em que o check-in foi feito
  const mes = dia ? monthOf(dataDoCk) : monthOf(todayISO())
  const jogadoras = [...data.players].sort((a, b) => Number(b.active) - Number(a.active) || nameOf(a.id).localeCompare(nameOf(b.id), 'pt-BR'))
  const contas = playerId ? contasDaAtleta(data, playerId) : []
  const disp = playerId ? disponibilidade(data, playerId, mes) : null
  const locais = data.checkinLocais.filter((l) => l.ativo || l.id === localId).sort((a, b) => a.ordem - b.ordem)
  const duplicado = !existente && playerId && diaId ? checkinDaAtletaNoDia(data, diaId, playerId) : undefined

  /** A conta escolhida (nulo = principal) e quantos check-ins ela ainda tem. */
  const contaEscolhida = contas.find((c) => (contaId === null ? c.principal : c.id === contaId)) ?? contas[0]
  const usoDaEscolhida = disp?.contas.find((u) => u.conta.id === contaEscolhida?.id)
  // os livres que importam sao os da arena escolhida: a cota e por local
  const noLocal = usoDaEscolhida ? livresNoLocal(usoDaEscolhida, localId) : undefined
  // ao editar, o proprio lancamento ja esta descontado: devolve ele e tira o de agora
  const jaContado = Boolean(existente && gastaCheckin(existente) && contaDoCheckin(data, existente).id === contaEscolhida?.id)
  // os check-ins de credito dela (o que este lancamento usa conta como dele)
  const creditos = playerId ? creditosDeCheckin(data, playerId, existente?.id) : []
  const usandoCredito = modo === 'checkin' && compareceu && creditoDe !== null
  const creditoUsado = creditos.find((c) => c.checkin.id === creditoDe)
  // check-in + nao compareceu = fez o check-in e nao veio: gasta a cota e vira check-in de credito
  const contaAgora = modo === 'checkin' && (compareceu ? !usandoCredito : true)
  const livresDepois = noLocal ? noLocal.disponiveis + (jaContado ? 1 : 0) - (contaAgora ? 1 : 0) : null
  // um check-in por conta por dia, em qualquer data (passada ou futura)
  const jaFeito = contaAgora && playerId && dataDoCk ? checkinJaFeito(data, playerId, contaId, dataDoCk, existente ? [existente.id] : []) : null

  // o palpite: a conta com check-ins livres, a arena padrao dela, e o modo
  // que a cota permite. So no lancamento novo, e so uma vez por atleta/dia.
  useEffect(() => {
    if (prefeito || !playerId || !dia || !disp) return
    const p = palpiteDaConta(data, playerId, dia)
    setContaId(p.contaId)
    setLocalId(p.localId)
    setModo(p.livre ? 'checkin' : 'integral')
    setPrefeito(true)
  }, [prefeito, playerId, dia, disp, data, locais])

  function usarCredito(id: string | null) {
    setCreditoDe(id)
    const c = creditos.find((x) => x.checkin.id === id)?.checkin
    if (c) {
      setContaId(c.conta_id)
      setLocalId(c.local_id)
    }
  }

  // trocar de conta leva a arena padrao dela junto
  function escolherConta(c: CheckinConta) {
    setContaId(c.principal ? null : c.id)
    const plano = planoDaConta(data, c)
    if (c.local_padrao_id && cotaDoPlano(plano, c.local_padrao_id) > 0) setLocalId(c.local_padrao_id)
    else if (localId && cotaDoPlano(plano, localId) === 0) {
      const primeira = locais.find((l) => cotaDoPlano(plano, l.id) > 0)
      if (primeira) setLocalId(primeira.id)
    }
  }

  const vPreco = precoDiferente.trim() ? lerValor(precoDiferente) : null
  const devido = !dia ? 0 : !compareceu ? 0 : vPreco !== null ? vPreco : modo === 'checkin' ? dia.valor_com_checkin : dia.valor_cheio
  // o credito que ela trouxe de plays anteriores cobre este primeiro: o que
  // sobrar e o que ela paga agora (o campo ja vem com essa conta feita)
  const saldoAntes = playerId ? saldoAntesDe(data, playerId, existente?.id) : 0
  const credito = Math.max(0, saldoAntes)
  const dividaAntes = Math.max(0, -saldoAntes)
  const cobertoPeloCredito = Math.min(credito, devido)
  useEffect(() => {
    if (pagoEditado) return
    setValorPago(textoDoValor(Math.max(0, Math.round((devido - cobertoPeloCredito) * 100) / 100)))
    // credito cobrindo tudo = nada pendente: o pagamento ja nasce confirmado
    if (!existente && devido > 0 && cobertoPeloCredito >= devido) setPagamentoConfirmado(true)
  }, [devido, cobertoPeloCredito, pagoEditado, existente])
  const vPago = valorPago.trim() ? lerValor(valorPago) : 0
  const usaDoCredito = vPago === null ? 0 : Math.min(credito, Math.max(0, Math.round((devido - vPago) * 100) / 100))
  const totalComDivida = Math.round((dividaAntes + devido) * 100) / 100
  const pagouTudo = dividaAntes > 0 && vPago === totalComDivida
  // o saldo deste play; o que passar do devido quita a divida de antes primeiro
  const saldo = vPago === null ? null : Math.round((vPago + usaDoCredito - devido) * 100) / 100
  const quitaDeAntes = Math.min(dividaAntes, Math.max(0, saldo ?? 0))
  const sobraDoPlay = Math.round((Math.max(0, saldo ?? 0) - quitaDeAntes) * 100) / 100
  const dividaDepois = Math.round((dividaAntes - quitaDeAntes + Math.max(0, -(saldo ?? 0))) * 100) / 100
  const creditoDepois = Math.round((credito - usaDoCredito + sobraDoPlay) * 100) / 100

  function salvar() {
    if (!playerId || !dia || vPago === null || (precoDiferente.trim() && vPreco === null)) return
    const id = existente?.id ?? idDoLancamento(dia.id, playerId)
    saveCheckin({
      id,
      dia_id: dia.id,
      player_id: playerId,
      conta_id: contaId,
      // integral nao tem arena: o relatorio da arena so lista check-ins
      local_id: modo === 'checkin' ? localId : null,
      modo,
      compareceu,
      checkin_confirmado: modo === 'checkin' ? checkinConfirmado : false,
      credito_checkin: modo === 'checkin' && !compareceu,
      credito_de: usandoCredito ? creditoDe : null,
      data_checkin: contaAgora && dataCheckin && dataCheckin !== dia.date ? dataCheckin : null,
      substitui: compareceu ? substitui : null,
      created_at: existente?.created_at ?? new Date().toISOString(),
    })
    saveCheckinPagamento({
      checkin_id: id,
      valor_pago: vPago,
      valor_devido: precoDiferente.trim() ? vPreco : null,
      pagamento_confirmado: pagamentoConfirmado,
      observacao: observacao.trim() || null,
    })
    onToast(existente ? 'Lançamento salvo' : `${nameOf(playerId)} lançada`)
    onClose()
  }

  const titulo = existente ? `${nameOf(existente.player_id)} · ${dia ? dateLabel(dia.date) : ''}` : 'Lançar pagamento'

  return (
    <Modal title={titulo} onClose={onClose}>
      <div className="stack">
        {!existente && (
          <>
            <label className="field">
              <span>Atleta</span>
              <select className="select" value={playerId} onChange={(e) => { setPlayerId(e.target.value); setPrefeito(false) }}>
                <option value="">Escolha…</option>
                {jogadoras.map((p) => (
                  <option key={p.id} value={p.id}>{nameOf(p.id)}{!p.active ? ' (inativa)' : ''}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Dia</span>
              <select className="select" value={diaId} onChange={(e) => { setDiaId(e.target.value); setPrefeito(false); setPagoEditado(false) }}>
                <option value="">Escolha…</option>
                {dias.map((d) => (
                  <option key={d.id} value={d.id}>{dateLabel(d.date)} · {rotuloDoDia(d, data.sessions)}</option>
                ))}
              </select>
              {dias.length === 0 && <span className="hint aviso">Crie um dia de check-in primeiro, na parte 📅 Dias.</span>}
            </label>
          </>
        )}

        {duplicado && (
          <div className="banner warn" style={{ margin: 0 }}>
            {nameOf(playerId)} já tem lançamento em {dia ? dateLabel(dia.date) : 'neste dia'}.{' '}
            <button className="linkish" onClick={() => onTrocar(duplicado)}>Abrir esse lançamento</button>
          </div>
        )}

        {/* mensalista em dia nao paga o play: lancar aqui criaria uma divida falsa (dono, 07/11) */}
        {!existente && playerId && dia && LIGA.id === 'feminino' && monthOf(dia.date) >= MES_INICIAL && (() => {
          const p = data.players.find((x) => x.id === playerId)
          return p && emDiaNaData(data, p, dia.date) ? (
            <div className="banner warn" style={{ margin: 0 }}>
              📅 {nameOf(playerId)} é mensalista em dia: este play não tem cobrança. Se ela fez check-in para a
              mensalidade, registre na ficha dela (aba Mensalistas).
            </div>
          ) : null
        })()}
        {playerId && dia && !duplicado && (
          <>
            <div className="field">
              <span>Como pagou</span>
              <div className="stack" style={{ gap: 6 }}>
                <button
                  className={`opcao ${modo === 'checkin' ? 'on' : ''}`}
                  onClick={() => {
                    setModo('checkin')
                    if (!localId) setLocalId(contaEscolhida?.local_padrao_id ?? locais[0]?.id ?? null)
                  }}
                >
                  <span className="opcao-marca">{modo === 'checkin' ? '●' : '○'}</span>
                  <span>
                    <strong>Check-in + {formatarReais(dia.valor_com_checkin)}</strong>
                    <span className="tiny muted">um check-in do app e a parte em dinheiro</span>
                  </span>
                </button>
                <button className={`opcao ${modo === 'integral' ? 'on' : ''}`} onClick={() => setModo('integral')}>
                  <span className="opcao-marca">{modo === 'integral' ? '●' : '○'}</span>
                  <span>
                    <strong>Integral {formatarReais(dia.valor_cheio)}</strong>
                    <span className="tiny muted">sem check-in</span>
                  </span>
                </button>
              </div>
            </div>

            {modo === 'checkin' && compareceu && (creditos.length > 0 || creditoDe) && (
              <div className="field">
                <span>🎟️ Check-in de crédito</span>
                <div className="chips-scroll">
                  <button className={`chip ${creditoDe === null ? 'on' : ''}`} onClick={() => usarCredito(null)}>
                    Check-in novo
                  </button>
                  {creditos.map((c) => (
                    <button
                      key={c.checkin.id}
                      className={`chip ${creditoDe === c.checkin.id ? 'on' : ''}`}
                      onClick={() => usarCredito(c.checkin.id)}
                    >
                      Usar o check-in do dia {c.quando ? dateLabel(c.quando).slice(0, 5) : '?'} ·{' '}
                      {nomeCurto(data.checkinLocais.find((l) => l.id === c.checkin.local_id)?.nome ?? '')}
                    </button>
                  ))}
                </div>
                <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                  {usandoCredito
                    ? `Ela fez o check-in em ${creditoUsado?.quando ? dateLabel(creditoUsado.quando) : 'outro dia'} e não foi: hoje vem por ele, sem check-in novo (não gasta cota). A parte em dinheiro continua.`
                    : `Ela tem ${plural(creditos.length, 'check-in de crédito', 'check-ins de crédito')} (fez o check-in e não foi). Toque para usar e não gastar um novo.`}
                </p>
              </div>
            )}

            {modo === 'checkin' && !usandoCredito && (
              <>
                <label className="field">
                  <span>Dia do check-in</span>
                  <input className="input" type="date" value={dataDoCk} onChange={(e) => setDataCheckin(e.target.value === dia.date ? '' : e.target.value)} />
                  {jaFeito
                    ? <span className="hint aviso" role="alert">⚠️ O check-in desta conta em {dateLabel(dataDoCk).slice(0, 5)} {jaFeito.texto}. Escolha outro dia ou outra conta.</span>
                    : <span className="hint">só se ela fez em outro dia</span>}
                </label>
                <div className="field">
                  <span>Conta usada</span>
                  {/* quebra em vez de rolar: a faixa sem barra escondia a 2a/3a conta e no PC nao rolava (dono, 06/11) */}
                  <div className="row wrap" style={{ gap: 6 }}>
                    {contas.map((c) => {
                      const u = disp?.contas.find((x) => x.conta.id === c.id)
                      const aqui = u ? livresNoLocal(u, localId) : undefined
                      const on = contaEscolhida?.id === c.id
                      return (
                        <button key={c.id} className={`chip ${on ? 'on' : ''} ${aqui && !aqui.aceita ? 'off' : ''}`} style={{ textAlign: 'left', borderRadius: 14 }} onClick={() => escolherConta(c)}>
                          {nomeDoTitular(c, nameOf(playerId))} · {u?.plano.nome ?? rotuloDoTipo(c.tipo)}
                          {aqui && (
                            <span className="tiny" style={{ opacity: 0.8 }}>
                              {aqui.aceita ? `${aqui.disponiveis} livres ${nomeCurto(aqui.local.nome)}` : `não aceita ${nomeCurto(aqui.local.nome)}`}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {noLocal && !noLocal.aceita && (
                    <span className="hint aviso">
                      O {usoDaEscolhida?.plano.nome} desta conta não aceita {noLocal.local.nome}. Confira a arena ou use outra conta.
                    </span>
                  )}
                  {noLocal && noLocal.aceita && livresDepois !== null && livresDepois < 0 && (
                    <span className="hint aviso">
                      Esta conta já usou os {noLocal.cota} de {noLocal.local.nome} em {nomeDoMes(mes)}: fica {-livresDepois} além.
                      Confira se o check-in foi noutra conta.
                    </span>
                  )}
                </div>
                <div className="field">
                  <span>Arena do check-in</span>
                  <div className="chips-scroll">
                    {locais.map((l) => (
                      <button key={l.id} className={`chip ${localId === l.id ? 'on' : ''}`} onClick={() => setLocalId(l.id)}>
                        {l.nome}
                      </button>
                    ))}
                  </div>
                  {locais.length === 0 && <span className="hint aviso">Cadastre uma arena em ⚙️.</span>}
                </div>
                <label className="toggle-card row">
                  <input type="checkbox" checked={checkinConfirmado} onChange={(e) => setCheckinConfirmado(e.target.checked)} />
                  <span className="grow"><strong>Check-in confirmado</strong><span className="tiny muted" style={{ display: 'block' }}>a arena viu o check-in no app</span></span>
                </label>
              </>
            )}

            {usandoCredito && (
              <label className="toggle-card row">
                <input type="checkbox" checked={checkinConfirmado} onChange={(e) => setCheckinConfirmado(e.target.checked)} />
                <span className="grow"><strong>Arena confirmou</strong><span className="tiny muted" style={{ display: 'block' }}>a arena aceitou o check-in de crédito</span></span>
              </label>
            )}

            <label className="toggle-card row" style={compareceu ? { borderColor: 'var(--line)', background: 'var(--card-2)' } : undefined}>
              <input type="checkbox" checked={!compareceu} onChange={(e) => setCompareceu(!e.target.checked)} />
              <span className="grow"><strong>Não compareceu</strong><span className="tiny muted" style={{ display: 'block' }}>
                {modo === 'checkin'
                  ? 'mas fez o check-in: vira 1 check-in de crédito (no próximo 💰 paga a dívida ou um play); o que pagou vira crédito'
                  : 'não deve nada; o que pagou vira crédito'}
              </span></span>
            </label>

            <div className="grid2">
              <label className="field">
                <span>Pagou (R$)</span>
                <input
                  className="input valor"
                  inputMode="decimal"
                  value={valorPago}
                  onChange={(e) => { setValorPago(e.target.value); setPagoEditado(true) }}
                />
              </label>
              <label className="field">
                <span>Preço combinado</span>
                <input
                  className="input valor"
                  inputMode="decimal"
                  placeholder={textoDoValor(compareceu ? (modo === 'checkin' ? dia.valor_com_checkin : dia.valor_cheio) : 0)}
                  value={precoDiferente}
                  onChange={(e) => setPrecoDiferente(e.target.value)}
                  disabled={!compareceu}
                />
                <span className="hint">só se for diferente do dia</span>
              </label>
            </div>
            {dividaAntes > 0 && (
              <div className="banner warn" style={{ margin: 0 }}>
                ⚠️ {nameOf(playerId)} <strong>deve {formatarReais(dividaAntes)}</strong> de antes.
                {devido > 0 && <> Para quitar tudo hoje: <strong>{formatarReais(dividaAntes + devido)}</strong> ({formatarReais(devido)} deste play + {formatarReais(dividaAntes)}).</>}
                {' '}
                {/* marcavel (dono, 19/11): como link parecia so informacao; marcado, o campo Pagou vem com o total */}
                <button
                  className={`chip chip-marca ${pagouTudo ? 'on' : ''}`}
                  aria-pressed={pagouTudo}
                  onClick={() => {
                    if (pagouTudo) { setPagoEditado(false); return }
                    setValorPago(textoDoValor(totalComDivida)); setPagoEditado(true)
                  }}
                >
                  {pagouTudo ? '☑' : '☐'} Pagou tudo
                </button>
              </div>
            )}
            {saldo !== null && (
              <span className={`hint ${saldo < 0 || dividaDepois > 0 ? 'aviso' : ''}`} style={{ marginTop: -4 }}>
                {credito > 0 && `Ela tinha ${formatarReais(credito)} de crédito`}
                {credito > 0 && usaDoCredito > 0 && `: ${formatarReais(usaDoCredito)} cobrem este play`}
                {credito > 0 && '. '}
                {saldo === 0
                  ? `Este play em dia: ${formatarReais(devido)} devidos, ${formatarReais(vPago ?? 0)} pagos${usaDoCredito > 0 ? ` + ${formatarReais(usaDoCredito)} do crédito` : ''}.`
                  : saldo > 0
                    ? `Pagou ${formatarReais(saldo)} a mais${quitaDeAntes > 0 ? `: ${formatarReais(quitaDeAntes)} quitam o que devia` : ''}${sobraDoPlay > 0 ? `${quitaDeAntes > 0 ? ' e ' : ': '}${formatarReais(sobraDoPlay)} viram crédito` : ''}.`
                    : `Faltam ${formatarReais(-saldo)} deste play.`}
                {dividaDepois > 0 && ` Fica devendo ${formatarReais(dividaDepois)} no total.`}
                {creditoDepois > 0 && ` Fica com ${formatarReais(creditoDepois)} de crédito.`}
              </span>
            )}
            <label className="toggle-card row">
              <input type="checkbox" checked={pagamentoConfirmado} onChange={(e) => setPagamentoConfirmado(e.target.checked)} />
              <span className="grow"><strong>Pagamento confirmado</strong><span className="tiny muted" style={{ display: 'block' }}>o dinheiro (ou o Pix) chegou</span></span>
            </label>
            {LIGA.id === 'feminino' && compareceu && (() => {
              // SUBSTITUTA (dono, 07/11): so quem nao e mensalista em dia neste dia entra no lugar de uma
              const p = data.players.find((x) => x.id === playerId)
              if (!p || (categoriaDe(p) === 'mensalista' && emDiaNaData(data, p, dia.date))) return null
              const mensalistas = data.players
                .filter((x) => x.active && x.id !== playerId && categoriaDe(x) === 'mensalista')
                .sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), 'pt-BR'))
              return (
                <div className="field">
                  <label className="toggle-card row">
                    <input type="checkbox" checked={substitui !== null} onChange={(e) => setSubstitui(e.target.checked ? '' : null)} />
                    <span className="grow">
                      <strong>🔁 Entrou no lugar de uma mensalista</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        metade do que ela pagar vai para o 🎉 caixa de eventos; a outra cobre o crédito dela
                      </span>
                    </span>
                  </label>
                  {substitui !== null && (
                    <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                      {mensalistas.map((m) => (
                        <button key={m.id} className={`chip ${substitui === m.id ? 'on' : ''}`} onClick={() => setSubstitui(m.id)}>{nameOf(m.id)}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
            <label className="field">
              <span>Observação</span>
              <input className="input" placeholder="pagou junto com a Bia" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>

            <button className="btn pink block" disabled={vPago === null || (precoDiferente.trim() !== '' && vPreco === null) || substitui === '' || !!jaFeito || (contaAgora && !dataDoCk)} onClick={salvar}>
              {existente ? 'Salvar' : 'Lançar'}
            </button>
            {existente && (
              <button
                className="btn danger block"
                onClick={() => {
                  const pendurado = avisoAoApagarLancamentos(data, [existente.id])
                  if (!confirm(`Apagar o lançamento de ${nameOf(existente.player_id)}?${pendurado ? `\n\n${pendurado}` : ''}`)) return
                  deleteCheckin(existente.id)
                  onToast('Lançamento apagado')
                  onClose()
                }}
              >
                🗑 Apagar
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/** O nome completo do cadastro (nao o apelido): e o que as arenas e a planilha usam. */
function nomeDoCadastro(data: AppData, id: string, nameOf: (id: string) => string): string {
  return data.players.find((p) => p.id === id)?.name.trim() || nameOf(id)
}
