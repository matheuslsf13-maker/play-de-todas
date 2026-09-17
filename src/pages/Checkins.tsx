import { useEffect, useMemo, useState } from 'react'
import { Avatar, Empty, Modal, StatBox, baixarOuCompartilhar, shareOrCopy } from '../components/ui'
import { avisosDoBanco } from '../data/supabaseRepo'
import {
  CATEGORIAS_DE_CAIXA,
  COTA_MENSAL,
  OPCOES_DE_AULAS,
  TIPOS_DE_CONTA,
  checkinDaAtletaNoDia,
  checkinsDoDia,
  contaDoCheckin,
  contasDaAtleta,
  diasDoMes,
  disponibilidade,
  formatarReais,
  lerValor,
  mesesComCheckins,
  nomeDoTitular,
  pagamentoDoCheckin,
  relatorioDasArenas,
  resumoDoCaixa,
  rotuloDoDia,
  rotuloDoTipo,
  saldoDaAtleta,
  saldoDoCheckin,
  statusDoCheckin,
  textoDoRelatorio,
  valorDevido,
  type FiltroDoRelatorio,
  type LinhaDoResumo,
} from '../lib/checkins'
import { planilhasCompletas, planilhasDasArenas } from '../lib/exportarCheckins'
import { normalizar } from '../lib/roster'
import { useStore } from '../lib/store'
import {
  dateLabel,
  monthLabel,
  monthOf,
  plural,
  todayISO,
  uid,
  type CategoriaDeCaixa,
  type Checkin,
  type CheckinConta,
  type CheckinDia,
  type CheckinModo,
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

type Secao = 'atletas' | 'dias' | 'arenas' | 'caixa' | 'padroes'

/** O que o modal de lancamento recebe: um lancamento existente, ou de quem e de que dia e o novo. */
type PedidoDeLancamento = { checkin?: Checkin; playerId?: string; diaId?: string }

const VALOR_CHEIO_INICIAL = 50
const VALOR_COM_CHECKIN_INICIAL = 25

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
  const [secao, setSecao] = useState<Secao>('atletas')
  const [mes, setMes] = useState(() => monthOf(todayISO()))
  const [contasDe, setContasDe] = useState<Player | null>(null)
  const [lancando, setLancando] = useState<PedidoDeLancamento | null>(null)
  const [editandoDia, setEditandoDia] = useState<CheckinDia | 'novo' | null>(null)

  // so quem esta logada ve dinheiro (no modo local, todo mundo e a organizadora)
  const veDinheiro = canEdit
  // as tabelas que o banco ainda nao tem: editar antes do script rodar travaria a fila
  const tabelasFaltando = online ? [...avisosDoBanco.tabelas] : []
  const podeEditar = canEdit && tabelasFaltando.length === 0

  const meses = useMemo(() => mesesComCheckins(data), [data])

  const secoes: { id: Secao; rotulo: string }[] = [
    { id: 'atletas', rotulo: '👯 Atletas' },
    { id: 'dias', rotulo: '📅 Dias' },
    { id: 'arenas', rotulo: '📤 Arenas' },
    ...(veDinheiro ? [{ id: 'caixa' as const, rotulo: '💰 Caixa' }] : []),
    { id: 'padroes', rotulo: '⚙️' },
  ]

  return (
    <>
      {tabelasFaltando.length > 0 && (
        <div className="banner warn">
          ⚠️ <strong>O banco ainda não tem as tabelas dos check-ins</strong> (
          {tabelasFaltando.map((t) => <code key={t}>{t}</code>).reduce((a, b) => <>{a}, {b}</>)}). Rode{' '}
          <code>supabase/15-checkins.sql</code> no SQL Editor do Supabase; até lá esta aba fica só de leitura.
        </div>
      )}

      <div className="card">
        <div className="row spread" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ margin: 0 }}>✅ Check-ins</div>
          <select className="select" style={{ width: 'auto' }} value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
        <div className="segmented">
          {secoes.map((s) => (
            <button key={s.id} className={secao === s.id ? 'on' : ''} onClick={() => setSecao(s.id)}>
              {s.rotulo}
            </button>
          ))}
        </div>
      </div>

      {secao === 'atletas' && (
        <SecaoAtletas
          mes={mes}
          veDinheiro={veDinheiro}
          podeEditar={podeEditar}
          onContas={setContasDe}
          onLancar={(playerId) => setLancando({ playerId, diaId: diasDoMes(data, mes)[0]?.id })}
        />
      )}
      {secao === 'dias' && (
        <SecaoDias
          mes={mes}
          veDinheiro={veDinheiro}
          podeEditar={podeEditar}
          onNovoDia={() => setEditandoDia('novo')}
          onEditarDia={setEditandoDia}
          onLancar={setLancando}
        />
      )}
      {secao === 'arenas' && <SecaoArenas mes={mes} onToast={onToast} />}
      {secao === 'caixa' && veDinheiro && <SecaoCaixa mes={mes} podeEditar={podeEditar} onToast={onToast} />}
      {secao === 'padroes' && <SecaoPadroes podeEditar={podeEditar} onToast={onToast} />}

      {contasDe && <ContasModal jogadora={contasDe} mes={mes} podeEditar={podeEditar} onClose={() => setContasDe(null)} onToast={onToast} />}
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

function BadgeSaldo({ saldo }: { saldo: number }) {
  if (saldo > 0) return <span className="badge credito">crédito {formatarReais(saldo)}</span>
  if (saldo < 0) return <span className="badge debito">deve {formatarReais(-saldo)}</span>
  return <span className="badge zerado">em dia</span>
}

function SecaoAtletas({
  mes,
  veDinheiro,
  podeEditar,
  onContas,
  onLancar,
}: {
  mes: string
  veDinheiro: boolean
  podeEditar: boolean
  onContas: (p: Player) => void
  onLancar: (playerId: string) => void
}) {
  const { data, nameOf } = useStore()
  const [busca, setBusca] = useState('')
  const termo = normalizar(busca)

  const lista = [...data.players]
    .filter(
      (p) =>
        !termo ||
        normalizar(p.name).includes(termo) ||
        normalizar(p.nickname ?? '').includes(termo) ||
        (p.aliases ?? []).some((a) => normalizar(a).includes(termo)),
    )
    .sort((a, b) => Number(b.active) - Number(a.active) || nameOf(a.id).localeCompare(nameOf(b.id), 'pt-BR'))

  // o mes em numeros: dias, check-ins e integrais
  const dias = diasDoMes(data, mes)
  const idsDosDias = new Set(dias.map((d) => d.id))
  const doMes = data.checkins.filter((c) => idsDosDias.has(c.dia_id) && c.compareceu)
  const comCheckin = doMes.filter((c) => c.modo === 'checkin').length
  const integrais = doMes.length - comCheckin

  return (
    <div className="card">
      <div className="grid3" style={{ marginBottom: 12 }}>
        <StatBox k="dias" v={dias.length} />
        <StatBox k="check-ins" v={comCheckin} />
        <StatBox k="integrais" v={integrais} />
      </div>
      <input
        className="input"
        type="search"
        placeholder="Buscar pelo nome ou apelido"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        style={{ marginBottom: 10 }}
      />
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
            const estourou = disp.contas.some((c) => c.disponiveis < 0)
            const pct = Math.min(100, Math.round((disp.usados / Math.max(1, disp.cota)) * 100))
            return (
              <div key={p.id} className="atleta-linha" style={{ opacity: p.active ? 1 : 0.55 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <Avatar player={p} size={40} />
                  <div className="grow">
                    <div className="row spread" style={{ gap: 6 }}>
                      <div style={{ fontWeight: 700 }} className="ellipsis">
                        {nameOf(p.id)}
                        {!p.active && <span className="tiny muted"> · pausada</span>}
                      </div>
                      {veDinheiro && saldo.lancamentos > 0 && <BadgeSaldo saldo={saldo.saldo} />}
                    </div>
                    <div className="tiny" style={{ marginTop: 2 }}>
                      🎟️ <strong>{disp.disponiveis}</strong> de {disp.cota} livres em {nomeDoMes(mes)}
                      {disp.contas.length > 1 && <span className="muted"> · {plural(disp.contas.length, 'conta')}</span>}
                    </div>
                    <span className="mini-barra"><i className={estourou ? 'estourou' : ''} style={{ width: `${pct}%` }} /></span>
                    {disp.contas.filter((u) => disp.contas.length > 1 || u.consumoAulas > 0).map((u) => (
                      <div key={u.conta.id} className="tiny muted">
                        {nomeDoTitular(u.conta, nameOf(p.id))} · {rotuloDoTipo(u.conta.tipo)}
                        {u.consumoAulas > 0 && ` · aulas usam ${u.consumoAulas}`}
                        {u.usadosEmPlays > 0 && ` · ${plural(u.usadosEmPlays, 'play')}`}
                        {' · '}
                        <span className={u.disponiveis < 0 ? 'valor-neg' : undefined}>
                          {u.disponiveis < 0 ? `passou ${-u.disponiveis}` : `${u.disponiveis} livres`}
                        </span>
                      </div>
                    ))}
                    <div className="tiny muted acoes-atleta">
                      {saldo.lancamentos > 0 && <span>{plural(saldo.lancamentos, 'lançamento')}</span>}
                      <button className="linkish" onClick={() => onContas(p)}>
                        {podeEditar ? 'contas' : 'ver contas'}
                      </button>
                      {podeEditar && (
                        <button className="linkish" onClick={() => onLancar(p.id)}>
                          lançar
                        </button>
                      )}
                    </div>
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

function BadgeStatus({ status }: { status: 'regularizado' | 'verificar' }) {
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
}: {
  checkin: Checkin
  dia: CheckinDia
  veDinheiro: boolean
  podeEditar: boolean
  onEditar: () => void
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
        <span className="tiny muted">
          {!checkin.compareceu
            ? 'pagou e não veio: o valor vira crédito'
            : checkin.modo === 'checkin'
              ? `${titular !== nome ? `conta de ${titular} · ` : ''}${rotuloDoTipo(conta.tipo)} · ${local}` +
                (checkin.checkin_confirmado ? '' : ' · check-in a confirmar')
              : 'integral, sem check-in'}
        </span>
        {veDinheiro && (
          <span className="tiny">
            pagou {formatarReais(pag?.valor_pago ?? 0)}
            {devido > 0 && ` de ${formatarReais(devido)}`}
            {saldo !== 0 && (
              <>
                {' · '}
                <span className={saldo > 0 ? 'valor-pos' : 'valor-neg'}>
                  {saldo > 0 ? `crédito ${formatarReais(saldo)}` : `falta ${formatarReais(-saldo)}`}
                </span>
              </>
            )}
            {pag && !pag.pagamento_confirmado && <span className="muted"> · pgto a confirmar</span>}
          </span>
        )}
        {pag?.observacao && <span className="tiny muted">📝 {pag.observacao}</span>}
      </div>
      <BadgeStatus status={status} />
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
  const dias = diasDoMes(data, mes)

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
            const lanc = checkinsDoDia(data, d.id).sort((a, b) => nameOf(a.player_id).localeCompare(nameOf(b.player_id), 'pt-BR'))
            const vieram = lanc.filter((c) => c.compareceu)
            const comCheckin = vieram.filter((c) => c.modo === 'checkin').length
            const recebido = lanc.reduce((t, c) => t + (pagamentoDoCheckin(data, c.id)?.valor_pago ?? 0), 0)
            const aVerificar = lanc.filter((c) => statusDoCheckin(c, pagamentoDoCheckin(data, c.id), veDinheiro) === 'verificar').length
            const estaAberto = aberto === d.id
            return (
              <div key={d.id}>
                <button className={`duo-row dia-linha ${estaAberto ? 'on' : ''}`} onClick={() => setAberto(estaAberto ? null : d.id)}>
                  <span className="row spread" style={{ gap: 8 }}>
                    <span className="duo-nomes">{dateLabel(d.date)} · {rotuloDoDia(d, data.sessions)}</span>
                    {aVerificar > 0 && <span className="badge verificar">{aVerificar}</span>}
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
                    {lanc.length === 0 ? (
                      <div className="tiny muted" style={{ textAlign: 'center' }}>Ninguém lançada ainda.</div>
                    ) : (
                      lanc.map((c) => (
                        <LinhaDeLancamento
                          key={c.id}
                          checkin={c}
                          dia={d}
                          veDinheiro={veDinheiro}
                          podeEditar={podeEditar}
                          onEditar={() => onLancar({ checkin: c })}
                        />
                      ))
                    )}
                    {podeEditar && (
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        <button className="btn pink sm" onClick={() => onLancar({ diaId: d.id })}>➕ Lançar</button>
                        <button className="btn ghost sm" onClick={() => onEditarDia(d)}>✏️ Editar o dia</button>
                      </div>
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
  const rel = relatorioDasArenas(data, filtro, nameOf)
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
        O que cada arena recebe no fim do mês: data, o <strong>titular da conta</strong> (o nome que a arena tem), o app e a
        menina. Sem valores — isso é da organização.
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
      <div className="chips-scroll" style={{ marginBottom: 12 }}>
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
                const arquivo = new File([gerarXlsx(planilhasDasArenas(rel))], `checkins-arenas-${sufixo}.xlsx`, {
                  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                })
                const r = await baixarOuCompartilhar(arquivo, `Check-ins — ${rel.periodo}`)
                onToast(r === 'baixou' ? 'Planilha salva 📄' : 'Planilha enviada 📄')
              }}
            >
              📄 Excel
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

function SecaoCaixa({ mes, podeEditar, onToast }: { mes: string; podeEditar: boolean; onToast: (m: string) => void }) {
  const { data, nameOf, saveCaixa, deleteCaixa } = useStore()
  const [categoria, setCategoria] = useState<CategoriaDeCaixa>('brinde')
  const [date, setDate] = useState(todayISO())
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [tudo, setTudo] = useState(false)

  const resumo = useMemo(() => resumoDoCaixa(data), [data])
  const doMes = data.caixa.filter((l) => monthOf(l.date) === mes).sort((a, b) => b.date.localeCompare(a.date))
  const linhaDoMes: LinhaDoResumo = resumo.find((r) => r.mes === mes) ?? {
    mes, receitasPlay: 0, receitasExtras: 0, receitaTotal: 0, aluguel: 0, brindes: 0, confraternizacao: 0, outras: 0,
    despesaTotal: 0, saldoDoMes: 0,
    // sem movimento no mes, o acumulado e o do ultimo mes anterior
    saldoAcumulado: resumo.filter((r) => r.mes < mes).slice(-1)[0]?.saldoAcumulado ?? 0,
  }
  const tipo = CATEGORIAS_DE_CAIXA.find((c) => c.valor === categoria)?.tipo ?? 'saida'
  const valorLido = lerValor(valor)

  function lancar() {
    if (valorLido === null || valorLido <= 0 || !date) return
    saveCaixa({ id: uid(), date, descricao: descricao.trim(), categoria, tipo, valor: valorLido, created_at: new Date().toISOString() })
    setDescricao('')
    setValor('')
    onToast(tipo === 'entrada' ? 'Receita lançada' : 'Saída lançada')
  }

  const totais = resumo.reduce(
    (t, r) => ({
      receitasPlay: t.receitasPlay + r.receitasPlay, receitasExtras: t.receitasExtras + r.receitasExtras,
      receitaTotal: t.receitaTotal + r.receitaTotal, aluguel: t.aluguel + r.aluguel, brindes: t.brindes + r.brindes,
      confraternizacao: t.confraternizacao + r.confraternizacao, outras: t.outras + r.outras,
      despesaTotal: t.despesaTotal + r.despesaTotal, saldoDoMes: t.saldoDoMes + r.saldoDoMes,
    }),
    { receitasPlay: 0, receitasExtras: 0, receitaTotal: 0, aluguel: 0, brindes: 0, confraternizacao: 0, outras: 0, despesaTotal: 0, saldoDoMes: 0 },
  )

  return (
    <>
      <div className="card">
        <div className="row spread" style={{ marginBottom: 10 }}>
          <div className="section-title" style={{ margin: 0 }}>📊 Resumo</div>
          <div className="segmented" style={{ width: 'auto' }}>
            <button className={!tudo ? 'on' : ''} onClick={() => setTudo(false)}>{nomeDoMes(mes)}</button>
            <button className={tudo ? 'on' : ''} onClick={() => setTudo(true)}>Tudo</button>
          </div>
        </div>
        {!tudo ? (
          <table className="table">
            <tbody>
              <tr><td>Receita dos plays</td><td><Reais n={linhaDoMes.receitasPlay} /></td></tr>
              <tr><td>Receitas extras</td><td><Reais n={linhaDoMes.receitasExtras} /></td></tr>
              <tr><td><strong>Receita total</strong></td><td><strong><Reais n={linhaDoMes.receitaTotal} /></strong></td></tr>
              <tr><td>Aluguel</td><td><Reais n={linhaDoMes.aluguel} /></td></tr>
              <tr><td>Brindes</td><td><Reais n={linhaDoMes.brindes} /></td></tr>
              <tr><td>Confraternização</td><td><Reais n={linhaDoMes.confraternizacao} /></td></tr>
              <tr><td>Outras despesas</td><td><Reais n={linhaDoMes.outras} /></td></tr>
              <tr><td><strong>Despesa total</strong></td><td><strong><Reais n={linhaDoMes.despesaTotal} /></strong></td></tr>
              <tr><td><strong>Saldo do mês</strong></td><td><strong><Reais n={linhaDoMes.saldoDoMes} sinal /></strong></td></tr>
              <tr><td><strong>Saldo acumulado</strong></td><td><strong><Reais n={linhaDoMes.saldoAcumulado} sinal /></strong></td></tr>
            </tbody>
          </table>
        ) : resumo.length === 0 ? (
          <Empty icon="💰">Nenhum movimento ainda.</Empty>
        ) : (
          <div className="tabela-rolavel">
            <table className="table">
              <thead>
                <tr>
                  <th>Mês</th><th>Plays</th><th>Extras</th><th>Receita</th><th>Aluguel</th><th>Brindes</th>
                  <th>Confrat.</th><th>Outras</th><th>Despesa</th><th>Saldo</th><th>Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {resumo.map((r) => (
                  <tr key={r.mes}>
                    <td>{monthLabel(r.mes).slice(0, 3)}/{r.mes.slice(2, 4)}</td>
                    <td><Reais n={r.receitasPlay} /></td><td><Reais n={r.receitasExtras} /></td><td><Reais n={r.receitaTotal} /></td>
                    <td><Reais n={r.aluguel} /></td><td><Reais n={r.brindes} /></td><td><Reais n={r.confraternizacao} /></td>
                    <td><Reais n={r.outras} /></td><td><Reais n={r.despesaTotal} /></td>
                    <td><Reais n={r.saldoDoMes} sinal /></td><td><Reais n={r.saldoAcumulado} sinal /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td><Reais n={totais.receitasPlay} /></td><td><Reais n={totais.receitasExtras} /></td><td><Reais n={totais.receitaTotal} /></td>
                  <td><Reais n={totais.aluguel} /></td><td><Reais n={totais.brindes} /></td><td><Reais n={totais.confraternizacao} /></td>
                  <td><Reais n={totais.outras} /></td><td><Reais n={totais.despesaTotal} /></td>
                  <td><Reais n={totais.saldoDoMes} sinal /></td><td><Reais n={resumo[resumo.length - 1]?.saldoAcumulado ?? 0} sinal /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          A receita dos plays é a soma do que foi pago nos lançamentos dos dias. Aqui entram só as receitas extras e as saídas.
        </p>
        <button
          className="btn teal block"
          style={{ marginTop: 10 }}
          onClick={async () => {
            const planilhas = planilhasCompletas(data, nameOf, tudo ? null : mes)
            const arquivo = new File([gerarXlsx(planilhas)], `controle-play-de-todas-${tudo ? 'tudo' : mes}.xlsx`, {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            })
            const r = await baixarOuCompartilhar(arquivo, `Controle Play de Todas — ${tudo ? 'tudo' : monthLabel(mes)}`)
            onToast(r === 'baixou' ? 'Planilha salva 📊' : 'Planilha enviada 📊')
          }}
        >
          📊 Excel completo ({tudo ? 'tudo' : nomeDoMes(mes)})
        </button>
      </div>

      <div className="card">
        <div className="section-title">💰 Caixa de {nomeDoMes(mes)}</div>
        {podeEditar && (
          <div className="stack" style={{ marginBottom: 12 }}>
            <div className="chips-scroll">
              {CATEGORIAS_DE_CAIXA.map((c) => (
                <button key={c.valor} className={`chip ${categoria === c.valor ? 'on' : ''}`} onClick={() => setCategoria(c.valor)}>
                  {c.tipo === 'entrada' ? '➕ ' : '➖ '}{c.rotulo}
                </button>
              ))}
            </div>
            <div className="grid2">
              <label className="field">
                <span>Data</span>
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Valor (R$)</span>
                <input className="input valor" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>Descrição</span>
              <input
                className="input"
                placeholder={tipo === 'entrada' ? 'Valor avulso do play de sexta' : 'Brindes Shopee'}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lancar()}
              />
            </label>
            <button className={`btn block ${tipo === 'entrada' ? 'teal' : 'pink'}`} disabled={valorLido === null || valorLido <= 0} onClick={lancar}>
              {tipo === 'entrada' ? '➕ Lançar receita' : '➖ Lançar saída'}
            </button>
          </div>
        )}
        {doMes.length === 0 ? (
          <div className="tiny muted" style={{ textAlign: 'center' }}>Nenhuma receita extra nem saída em {nomeDoMes(mes)}.</div>
        ) : (
          <div className="stack">
            {doMes.map((l) => (
              <div key={l.id} className="fila-linha">
                <span className="fila-num">{dateLabel(l.date).slice(0, 5)}</span>
                <div className="grow">
                  <span className="fila-time"><b>{l.descricao || CATEGORIAS_DE_CAIXA.find((c) => c.valor === l.categoria)?.rotulo}</b></span>
                  <span className="tiny muted">{CATEGORIAS_DE_CAIXA.find((c) => c.valor === l.categoria)?.rotulo ?? l.categoria}</span>
                </div>
                <span className={l.tipo === 'entrada' ? 'valor-pos' : 'valor-neg'}>
                  {l.tipo === 'entrada' ? '+' : '−'} {formatarReais(l.valor)}
                </span>
                {podeEditar && (
                  <button
                    className="btn danger sm"
                    onClick={() => {
                      if (!confirm(`Apagar "${l.descricao || 'este lançamento'}" (${formatarReais(l.valor)})?`)) return
                      deleteCaixa(l.id)
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ================================================================ padroes */

function SecaoPadroes({ podeEditar, onToast }: { podeEditar: boolean; onToast: (m: string) => void }) {
  const { data, saveCheckinLocal, deleteCheckinLocal } = useStore()
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
          As arenas onde as meninas fazem check-in. Cada conta tem a sua arena padrão (em Atletas › contas), então
          lançar é só confirmar.
        </p>
        <div className="stack">
          {locais.map((l) => (
            <div key={l.id} className="fila-linha" style={{ opacity: l.ativo ? 1 : 0.55 }}>
              <div className="grow">
                {renomeando?.id === l.id ? (
                  <input
                    className="input"
                    autoFocus
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
                    <span className="tiny muted">{plural(usoDoLocal(l.id), 'uso')}</span>
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
        <div className="section-title">💵 Valores do dia</div>
        <p className="tiny muted" style={{ margin: 0 }}>
          Um dia novo nasce com os valores do último dia criado
          {ultimo
            ? <>: <strong>{formatarReais(ultimo.valor_cheio)}</strong> integral e <strong>{formatarReais(ultimo.valor_com_checkin)}</strong> com check-in.</>
            : <>: {formatarReais(VALOR_CHEIO_INICIAL)} integral e {formatarReais(VALOR_COM_CHECKIN_INICIAL)} com check-in.</>}
          {' '}Quando o preço mudar, mude no próximo dia e os seguintes já vêm com ele. Quem paga diferente do combinado
          tem o preço dela no próprio lançamento.
        </p>
      </div>

      <div className="card">
        <div className="section-title">🎟️ Como a cota é contada</div>
        <p className="tiny muted" style={{ margin: 0 }}>
          Cada conta dá <strong>{COTA_MENSAL} check-ins por mês</strong>. As aulas na arena gastam parte deles:
          1x por semana usa 8, 2x usa os 12. O que sobra é o que a menina tem para os plays — e quem esgota a conta
          lança o play na conta de outra pessoa (a secundária, em Atletas › contas).
        </p>
      </div>
    </>
  )
}

/* ========================================================= modal: contas */

function ContasModal({
  jogadora,
  mes,
  podeEditar,
  onClose,
  onToast,
}: {
  jogadora: Player
  mes: string
  podeEditar: boolean
  onClose: () => void
  onToast: (m: string) => void
}) {
  const { data, nameOf, saveCheckinConta, deleteCheckinConta } = useStore()
  const [editando, setEditando] = useState<CheckinConta | null>(null)
  const nome = nameOf(jogadora.id)
  const contas = contasDaAtleta(data, jogadora.id, { incluirInativas: true })
  const disp = disponibilidade(data, jogadora.id, mes)
  const locais = data.checkinLocais.filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem)

  function usoDaConta(id: string): number {
    return data.checkins.filter((c) => c.conta_id === id).length
  }

  function salvar(c: CheckinConta) {
    // a principal virtual nasce sem created_at; o banco nao aceita '' num timestamptz
    saveCheckinConta({ ...c, nome: c.principal ? '' : c.nome.trim(), created_at: c.created_at || new Date().toISOString() })
    setEditando(null)
    onToast('Conta salva')
  }

  if (editando) {
    const c = editando
    const uso = c.principal ? 0 : usoDaConta(c.id)
    const eNova = !c.principal && !data.checkinContas.some((x) => x.id === c.id)
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
            <span>App</span>
            <div className="chips-scroll">
              {TIPOS_DE_CONTA.map((t) => (
                <button key={t.valor} className={`chip ${c.tipo === t.valor ? 'on' : ''}`} onClick={() => setEditando({ ...c, tipo: t.valor })}>
                  {t.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Aulas na arena com esta conta</span>
            <div className="stack" style={{ gap: 6 }}>
              {OPCOES_DE_AULAS.map((o) => (
                <button key={String(o.valor)} className={`opcao ${c.aulas_semana === o.valor ? 'on' : ''}`} onClick={() => setEditando({ ...c, aulas_semana: o.valor })}>
                  <span className="opcao-marca">{c.aulas_semana === o.valor ? '●' : '○'}</span>
                  <span><strong>{o.rotulo}</strong><span className="tiny muted">{o.explica}</span></span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Arena padrão</span>
            <div className="chips-scroll">
              <button className={`chip ${c.local_padrao_id === null ? 'on' : ''}`} onClick={() => setEditando({ ...c, local_padrao_id: null })}>Nenhuma</button>
              {locais.map((l) => (
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
        <div className="tiny muted">
          🎟️ <strong>{disp.disponiveis}</strong> de {disp.cota} check-ins livres em {nomeDoMes(mes)}, somando as contas.
        </div>
        {contas.map((c) => {
          const u = disp.contas.find((x) => x.conta.id === c.id)
          const aulas = OPCOES_DE_AULAS.find((o) => o.valor === c.aulas_semana)?.rotulo ?? 'Não informou'
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
                  {rotuloDoTipo(c.tipo)} · {aulas}{arena ? ` · ${arena}` : ''}
                </span>
                {u && (
                  <span className="tiny">
                    {u.disponiveis < 0
                      ? <span className="valor-neg">passou {-u.disponiveis} em {nomeDoMes(mes)}</span>
                      : <>{u.disponiveis} livres em {nomeDoMes(mes)}</>}
                    {u.usadosEmPlays > 0 && <span className="muted"> · {plural(u.usadosEmPlays, 'play')}</span>}
                  </span>
                )}
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
                id: uid(), player_id: jogadora.id, nome: '', principal: false, tipo: 'wellhub', aulas_semana: null,
                local_padrao_id: null, ativo: true, created_at: new Date().toISOString(),
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
      id: dia?.id ?? uid(),
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
              const aviso = lancamentos > 0 ? `\n\nSomem também ${plural(lancamentos, 'lançamento')} e os pagamentos deles.` : ''
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
  const [modo, setModo] = useState<CheckinModo>(existente?.modo ?? 'checkin')
  const [compareceu, setCompareceu] = useState(existente?.compareceu ?? true)
  const [checkinConfirmado, setCheckinConfirmado] = useState(existente?.checkin_confirmado ?? false)
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState(pagExistente?.pagamento_confirmado ?? false)
  const [valorPago, setValorPago] = useState(pagExistente ? textoDoValor(pagExistente.valor_pago) : '')
  const [pagoEditado, setPagoEditado] = useState(Boolean(pagExistente))
  const [precoDiferente, setPrecoDiferente] = useState(
    pagExistente?.valor_devido !== null && pagExistente?.valor_devido !== undefined ? textoDoValor(pagExistente.valor_devido) : '',
  )
  const [observacao, setObservacao] = useState(pagExistente?.observacao ?? '')
  const [prefeito, setPrefeito] = useState(Boolean(existente))

  const dias = [...data.checkinDias].sort((a, b) => b.date.localeCompare(a.date))
  const dia = dias.find((d) => d.id === diaId)
  const mes = dia ? monthOf(dia.date) : monthOf(todayISO())
  const jogadoras = [...data.players].sort((a, b) => Number(b.active) - Number(a.active) || nameOf(a.id).localeCompare(nameOf(b.id), 'pt-BR'))
  const contas = playerId ? contasDaAtleta(data, playerId) : []
  const disp = playerId ? disponibilidade(data, playerId, mes) : null
  const locais = data.checkinLocais.filter((l) => l.ativo || l.id === localId).sort((a, b) => a.ordem - b.ordem)
  const duplicado = !existente && playerId && diaId ? checkinDaAtletaNoDia(data, diaId, playerId) : undefined

  /** A conta escolhida (nulo = principal) e quantos check-ins ela ainda tem. */
  const contaEscolhida = contas.find((c) => (contaId === null ? c.principal : c.id === contaId)) ?? contas[0]
  const usoDaEscolhida = disp?.contas.find((u) => u.conta.id === contaEscolhida?.id)
  // ao editar, o proprio lancamento ja esta descontado: devolve ele e tira o de agora
  const jaContado = Boolean(
    existente && existente.modo === 'checkin' && existente.compareceu && contaDoCheckin(data, existente).id === contaEscolhida?.id,
  )
  const contaAgora = modo === 'checkin' && compareceu
  const livresDepois = usoDaEscolhida ? usoDaEscolhida.disponiveis + (jaContado ? 1 : 0) - (contaAgora ? 1 : 0) : null

  // o palpite: a conta com check-ins livres, a arena padrao dela, e o modo
  // que a cota permite. So no lancamento novo, e so uma vez por atleta/dia.
  useEffect(() => {
    if (prefeito || !playerId || !dia || !disp) return
    const comLivre = disp.contas.find((u) => u.disponiveis > 0) ?? disp.contas[0]
    const conta = comLivre.conta
    setContaId(conta.principal ? null : conta.id)
    const maisUsada = (() => {
      const cont = new Map<string, number>()
      for (const c of checkinsDoDia(data, dia.id)) if (c.local_id) cont.set(c.local_id, (cont.get(c.local_id) ?? 0) + 1)
      return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    })()
    setLocalId(conta.local_padrao_id ?? maisUsada ?? locais[0]?.id ?? null)
    setModo(comLivre.disponiveis > 0 ? 'checkin' : 'integral')
    setPrefeito(true)
  }, [prefeito, playerId, dia, disp, data, locais])

  // trocar de conta leva a arena padrao dela junto
  function escolherConta(c: CheckinConta) {
    setContaId(c.principal ? null : c.id)
    if (c.local_padrao_id) setLocalId(c.local_padrao_id)
  }

  const vPreco = precoDiferente.trim() ? lerValor(precoDiferente) : null
  const devido = !dia ? 0 : !compareceu ? 0 : vPreco !== null ? vPreco : modo === 'checkin' ? dia.valor_com_checkin : dia.valor_cheio
  // o valor pago acompanha o devido ate a organizadora digitar algo
  useEffect(() => {
    if (!pagoEditado) setValorPago(textoDoValor(devido))
  }, [devido, pagoEditado])
  const vPago = valorPago.trim() ? lerValor(valorPago) : 0
  const saldo = vPago === null ? null : Math.round((vPago - devido) * 100) / 100

  function salvar() {
    if (!playerId || !dia || vPago === null || (precoDiferente.trim() && vPreco === null)) return
    const id = existente?.id ?? uid()
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

  const titulo = existente ? `${nameOf(existente.player_id)} · ${dia ? dateLabel(dia.date) : ''}` : 'Lançar check-in'

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
                  <option key={p.id} value={p.id}>{nameOf(p.id)}{!p.active ? ' (pausada)' : ''}</option>
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

            {modo === 'checkin' && (
              <>
                <div className="field">
                  <span>Conta usada</span>
                  <div className="chips-scroll">
                    {contas.map((c) => {
                      const u = disp?.contas.find((x) => x.conta.id === c.id)
                      const on = contaEscolhida?.id === c.id
                      return (
                        <button key={c.id} className={`chip ${on ? 'on' : ''}`} onClick={() => escolherConta(c)}>
                          {nomeDoTitular(c, nameOf(playerId))} · {rotuloDoTipo(c.tipo)}
                          {u && <span className="tiny" style={{ opacity: 0.8 }}>{u.disponiveis} livres</span>}
                        </button>
                      )
                    })}
                  </div>
                  {livresDepois !== null && livresDepois < 0 && (
                    <span className="hint aviso">
                      Esta conta já usou os {COTA_MENSAL} de {nomeDoMes(mes)}: fica {-livresDepois} além. Confira se o check-in foi
                      noutra conta.
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

            <label className="toggle-card row" style={compareceu ? { borderColor: 'var(--line)', background: 'var(--card-2)' } : undefined}>
              <input type="checkbox" checked={!compareceu} onChange={(e) => setCompareceu(!e.target.checked)} />
              <span className="grow"><strong>Não compareceu</strong><span className="tiny muted" style={{ display: 'block' }}>não deve nada; o que pagou vira crédito</span></span>
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
            {saldo !== null && (
              <span className={`hint ${saldo < 0 ? 'aviso' : ''}`} style={{ marginTop: -4 }}>
                {saldo === 0
                  ? `Em dia: ${formatarReais(devido)} devidos, ${formatarReais(vPago ?? 0)} pagos.`
                  : saldo > 0
                    ? `Sobram ${formatarReais(saldo)}: viram crédito para o próximo play.`
                    : `Faltam ${formatarReais(-saldo)}: fica devendo.`}
              </span>
            )}
            <label className="toggle-card row">
              <input type="checkbox" checked={pagamentoConfirmado} onChange={(e) => setPagamentoConfirmado(e.target.checked)} />
              <span className="grow"><strong>Pagamento confirmado</strong><span className="tiny muted" style={{ display: 'block' }}>o dinheiro (ou o Pix) chegou</span></span>
            </label>
            <label className="field">
              <span>Observação</span>
              <input className="input" placeholder="pagou junto com a Bia" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>

            <button className="btn pink block" disabled={vPago === null || (precoDiferente.trim() !== '' && vPreco === null)} onClick={salvar}>
              {existente ? 'Salvar' : 'Lançar'}
            </button>
            {existente && (
              <button
                className="btn danger block"
                onClick={() => {
                  if (!confirm(`Apagar o lançamento de ${nameOf(existente.player_id)}?`)) return
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
