import { useEffect, useMemo, useState } from 'react'
import { Modal, Stepper, shareOrCopy } from './ui'
import { mensagemDeErro } from './GestaoDaLista'
import {
  dataEmSaoPaulo,
  estaAberta,
  horaDoPlay,
  inicioEmSaoPaulo,
  juntarSemRepetir,
  mensagemDoLink,
  novoCodigo,
  padraoDaLista,
  preIncluidas,
  previaDosNomes,
  problemaDaLista,
  quandoComData,
  urlDaLista,
  type Lista,
} from '../lib/listaDePresenca'
import { avisosDoBanco } from '../data/supabaseRepo'
import { baseDoApp, esquecerCopiaDaApagada, lerCopiaDaApagada, TEM_LISTA } from '../lib/useLista'
import { useStore } from '../lib/store'
import { plural, todayISO, uid } from '../lib/types'

/**
 * CRIAR (OU EDITAR) A LISTA DE PRESENCA POR LINK. O play em si (quem joga,
 * formato, grupos) e montado depois, a partir da lista.
 *
 * Editando, e o mesmo formulario sem as mensalistas (elas entram so ao criar).
 * `reabrir`: a lista fechou pelo prazo, e reabrir exige um prazo novo.
 */
export default function CriarLista({
  editar,
  reabrir,
  onCancel,
  onPronta,
  onToast,
}: {
  editar?: Lista
  reabrir?: boolean
  onCancel: () => void
  onPronta: (l: Lista) => void
  onToast: (m: string) => void
}) {
  const { data, repo, playerById } = useStore()
  const padrao = padraoDaLista(todayISO())
  const [titulo, setTitulo] = useState(editar?.titulo ?? 'Play de Todas')
  const [dia, setDia] = useState(editar ? dataEmSaoPaulo(editar.play_em) : padrao.data)
  const [hora, setHora] = useState(editar ? horaDoPlay(editar.play_em) : padrao.hora)
  // reabrindo, o prazo sugerido e a hora do play (fica aberta ate comecar)
  const prazo = editar ? (reabrir ? editar.play_em : editar.fecha_em) : null
  const [fechaDia, setFechaDia] = useState(prazo ? dataEmSaoPaulo(prazo) : padrao.fechaData)
  const [fechaHora, setFechaHora] = useState(prazo ? horaDoPlay(prazo) : padrao.fechaHora)
  const [vagas, setVagas] = useState(editar?.vagas ?? padrao.vagas)
  const [texto, setTexto] = useState(editar?.texto ?? '')
  const [comMensalistas, setComMensalistas] = useState(true)
  // D41: os nomes da lista apagada ha menos de 30 min, neste celular; desmarcado (pode ter sido apagada por nomes falsos)
  const [copia] = useState(() => (editar ? null : lerCopiaDaApagada()))
  const [trazer, setTrazer] = useState(false)
  const [busy, setBusy] = useState(false)
  const mensalistas = useMemo(() => (editar ? [] : preIncluidas(data, dia)), [data, dia, editar])

  // a hora do play mudou: o prazo padrao acompanha so enquanto ninguem mexeu nele
  const [mexeuNoPrazo, setMexeuNoPrazo] = useState(!!editar)
  useEffect(() => {
    if (mexeuNoPrazo || !dia) return
    const vespera = new Date(Date.parse(`${dia}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
    setFechaDia(vespera)
  }, [dia, mexeuNoPrazo])

  async function salvar() {
    if (!dia || !hora || !fechaDia || !fechaHora) {
      onToast('Preencha a data e a hora do play e do prazo')
      return
    }
    const lista: Lista = {
      id: editar?.id ?? uid(),
      codigo: editar?.codigo ?? novoCodigo(),
      titulo: titulo.trim(),
      play_em: inicioEmSaoPaulo(dia, hora),
      fecha_em: inicioEmSaoPaulo(fechaDia, fechaHora),
      vagas,
      texto: texto.trim() || null,
      fechada: reabrir ? false : (editar?.fechada ?? false),
      session_id: editar?.session_id ?? null,
      created_at: editar?.created_at ?? new Date().toISOString(),
    }
    // editando uma lista que ja fechou (sem reabrir), o prazo pode estar no passado
    const jaFechada = !!editar && !reabrir && !estaAberta(editar, new Date())
    const problema = problemaDaLista(lista, jaFechada ? new Date(0) : new Date())
    if (problema) {
      onToast(problema)
      return
    }
    setBusy(true)
    try {
      await repo.salvarLista(lista, !editar)
    } catch (e) {
      onToast(avisosDoBanco.tabelas.has('listas') ? 'Antes, rode o script 31-lista-de-presenca.sql no Supabase' : mensagemDeErro(e))
      setBusy(false)
      return
    }
    const daMensalista = (id: string) => ({ nome: playerById(id)?.name ?? id, player_id: id, origem: 'mensalista' as const, garantida: true })
    if (!editar && trazer && copia) {
      // um por vez, esperando o banco, com a ordem da apagada (a mensalista nova entra depois da ultima garantida)
      const fila = juntarSemRepetir(copia.nomes, comMensalistas ? mensalistas.map(daMensalista) : [], copia.sairam)
      let falharam = 0
      for (const [i, n] of fila.entries()) {
        try {
          await repo.incluirNaLista([{ ...n, lista_id: lista.id, ordem: i + 1 }])
        } catch (e) {
          console.warn('nome não entrou na lista nova:', n.nome, e)
          falharam++
        }
      }
      if (falharam === 0) esquecerCopiaDaApagada()
      else onToast(`A lista foi criada, mas ${plural(falharam, 'nome')} não ${falharam === 1 ? 'entrou' : 'entraram'}. Adicione à mão.`)
    } else if (!editar && comMensalistas && mensalistas.length > 0) {
      try {
        await repo.incluirNaLista(
          mensalistas.map((id, i) => ({ ...daMensalista(id), lista_id: lista.id, ordem: i + 1 })),
        )
      } catch (e) {
        // a lista existe: a organizadora adiciona a mao
        onToast(`A lista foi criada, mas as mensalistas não entraram (${mensagemDeErro(e)}). Adicione à mão.`)
      }
    }
    setBusy(false)
    onPronta(lista)
  }

  return (
    <div className="card lista-pagina">
      <div className="row spread">
        <div className="section-title" style={{ margin: 0 }}>
          {editar ? (reabrir ? '🔓 Reabrir a lista' : '✏️ Editar a lista') : '📋 Lista de presença por link'}
        </div>
        <button className="btn ghost sm" onClick={onCancel}>Cancelar</button>
      </div>
      {!editar && (
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          Cada atleta coloca o nome pelo link e o app guarda a ordem de chegada. Depois você monta o play a partir da lista.
        </p>
      )}
      {reabrir && (
        <div className="banner warn" style={{ margin: '10px 0 12px' }}>O prazo já passou: escolha até quando a lista fica aberta.</div>
      )}
      <div className="stack">
        {copia && (
          <label className="toggle-card row" style={{ gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={trazer} onChange={(e) => setTrazer(e.target.checked)} />
            <span className="grow" style={{ minWidth: 0 }}>
              <strong>📋 Trazer {copia.nomes.length === 1 ? 'o nome' : `os ${copia.nomes.length} nomes`} da lista apagada às {horaDoPlay(copia.apagada_em)}</strong>
              <span className="small" style={{ display: 'block', overflowWrap: 'anywhere' }}>{previaDosNomes(copia.nomes.map((n) => n.nome))}</span>
              <span className="tiny muted" style={{ display: 'block' }}>
                Quem tinha colocado o nome pelo link volta, mas para sair vai precisar pedir à organização.
              </span>
            </span>
          </label>
        )}
        <label className="field">
          <span>Nome do play</span>
          <input className="input" value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <div className="lista-dupla">
          <label className="field">
            <span>Dia do play</span>
            <input className="input" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </label>
          <label className="field">
            <span>Hora</span>
            <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
        </div>
        <div className="lista-dupla">
          <label className="field">
            <span>A lista fecha em</span>
            <input className="input" type="date" value={fechaDia} onChange={(e) => { setMexeuNoPrazo(true); setFechaDia(e.target.value) }} />
          </label>
          <label className="field">
            <span>Às</span>
            <input className="input" type="time" value={fechaHora} onChange={(e) => { setMexeuNoPrazo(true); setFechaHora(e.target.value) }} />
          </label>
        </div>
        <div className="field">
          <span>Vagas</span>
          <Stepper value={vagas} min={1} max={100} onChange={setVagas} />
        </div>
        <label className="field">
          <span>Texto curto (opcional)</span>
          <textarea className="input" rows={2} maxLength={300} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: chegue 15 min antes para o aquecimento" />
        </label>
        {!editar && (
          <label className="toggle-card row" style={{ gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={comMensalistas} onChange={(e) => setComMensalistas(e.target.checked)} />
            <span className="grow">
              <strong>Já incluir as mensalistas em dia ({mensalistas.length})</strong>
              <span className="tiny muted" style={{ display: 'block' }}>
                Entram no topo, com a vaga garantida, da mais forte para a mais fraca. Quem não pagou a tempo coloca o nome pelo link.
              </span>
            </span>
          </label>
        )}
        <button className="btn pink block" disabled={busy} onClick={() => void salvar()}>
          {busy ? 'Salvando…' : editar ? 'Salvar' : '📋 Criar a lista'}
        </button>
      </div>
    </div>
  )
}

/** O link e a mensagem pronta para o grupo (ao criar, e no "🔗 Mensagem do link"). */
export function MensagemDoLink({
  lista,
  titulo = '🔗 Mensagem do link',
  onAbrir,
  onClose,
  onToast,
}: {
  lista: Lista
  titulo?: string
  onAbrir?: () => void
  onClose: () => void
  onToast: (m: string) => void
}) {
  const url = urlDaLista(baseDoApp(), lista.codigo)
  const msg = mensagemDoLink(lista, url)
  return (
    <Modal title={titulo} onClose={onClose}>
      <div className="stack lista-pagina">
        <div className="lista-msg">{msg}</div>
        <button className="btn pink block" onClick={async () => { if (await shareOrCopy(msg)) onToast('Mensagem pronta para colar no grupo 📋') }}>
          📤 Compartilhar a mensagem
        </button>
        <button className="btn ghost block" onClick={async () => { if (await shareOrCopy(url)) onToast('Link copiado') }}>
          🔗 Só o link
        </button>
        {onAbrir && <button className="btn ghost block" onClick={onAbrir}>📋 Abrir a lista</button>}
      </div>
    </Modal>
  )
}

/** As listas mais recentes, na aba Play da organizadora. */
export function ListasRecentes({ onAbrir }: { onAbrir: (codigo: string) => void }) {
  const { repo, canEdit } = useStore()
  const [listas, setListas] = useState<Lista[] | null>(null)
  useEffect(() => {
    if (!TEM_LISTA || !canEdit) return
    let vivo = true
    repo.listasRecentes(5).then(
      (l) => vivo && setListas(l),
      () => vivo && setListas([]),
    )
    return () => {
      vivo = false
    }
  }, [repo, canEdit])
  if (!listas || listas.length === 0) return null
  const agora = new Date()
  return (
    <div className="card">
      <div className="section-title">📋 Listas de presença</div>
      <div className="stack" style={{ gap: 8 }}>
        {listas.map((l) => (
          <button key={l.id} className="lista-escolha" onClick={() => onAbrir(l.codigo)}>
            <span className="grow" style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{l.titulo} · {quandoComData(l.play_em)}</strong>
              <span className="tiny muted">
                {l.session_id ? 'play montado' : estaAberta(l, agora) ? `aberta até ${quandoComData(l.fecha_em)}` : 'fechada'} · {l.vagas} vagas
              </span>
            </span>
            <span className="tiny muted nowrap">abrir →</span>
          </button>
        ))}
      </div>
    </div>
  )
}
