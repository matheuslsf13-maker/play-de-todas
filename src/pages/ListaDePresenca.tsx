import PagamentoNaLista from '../components/PagamentoNaLista'
import { useMemo, useRef, useState } from 'react'
import CriarLista, { MensagemDoLink } from '../components/CriarLista'
import {
  AdicionarNaLista,
  ApagarLista,
  ConfirmarTroca,
  OpcoesDoNome,
  Sairam,
  useEscrita,
  useVincular,
} from '../components/GestaoDaLista'
import { Avatar, Modal, shareOrCopy } from '../components/ui'
import { avaliacaoCurta, emAvaliacao, notaDeForca } from '../lib/forca'
import {
  MENSAGEM_DO_MOTIVO,
  dividir,
  estaAberta,
  mensagemDeAtualizacao,
  ocupacao,
  paraMontar,
  podeApagar,
  posicaoDe,
  quandoComData,
  soSuplente,
  sugestaoSegura,
  textoDaPosicao,
  urlDaLista,
  validarNomeDaAtleta,
  type Lista,
  type ListaCompleta,
  type NomeNaLista,
} from '../lib/listaDePresenca'
import { ratings } from '../lib/stats'
import { useStore } from '../lib/store'
import {
  baseDoApp,
  codigoDoAparelho,
  guardarNome,
  marcarMeu,
  meuNome,
  ultimoNome,
  useLista,
} from '../lib/useLista'

/** O que a pagina entrega ao App para abrir o Novo Play. */
export type Montagem = { lista: Lista; ids: string[] }

/**
 * A PAGINA DA LISTA (o link ?lista=). Serve a atleta, sem login (ve a lista,
 * coloca o nome, tira o proprio), e a organizadora logada (vincula, mexe,
 * monta o play). Aparece dentro do app, no lugar da aba: terminar volta para a
 * tela inicial.
 */
export default function ListaDePresenca({
  codigo,
  onSair,
  onMontarPlay,
  onApagou,
  onToast,
}: {
  codigo: string
  onSair: () => void
  onMontarPlay: (m: Montagem) => void
  /** A organizadora apagou a lista (D39): sai da pagina. */
  onApagou: () => void
  onToast: (m: string) => void
}) {
  const { lista: lc, recarregar } = useLista({ codigo })
  if (lc === undefined) return <div className="card"><div className="empty">Carregando a lista…</div></div>
  if (lc === null) {
    return (
      <div className="card lista-pagina">
        <div className="empty">
          <span className="big">📋</span>
          Esta lista não existe mais.
        </div>
        <button className="btn pink block" onClick={onSair}>Ir para o app</button>
      </div>
    )
  }
  return <Pagina lc={lc} recarregar={recarregar} onSair={onSair} onMontarPlay={onMontarPlay} onApagou={onApagou} onToast={onToast} />
}

function Pagina({
  lc,
  recarregar,
  onSair,
  onMontarPlay,
  onApagou,
  onToast,
}: {
  lc: ListaCompleta
  recarregar: () => Promise<void>
  onSair: () => void
  onMontarPlay: (m: Montagem) => void
  onApagou: () => void
  onToast: (m: string) => void
}) {
  const { canEdit } = useStore()
  const { lista } = lc
  const aberta = estaAberta(lista, new Date())
  const { titulares, suplentes } = dividir(lista, lc.nomes)
  // lotada e aberta: quem chega entra como suplente (o 16/16 parecia "nao da mais", dono 06/11)
  const suplente = soSuplente(lista, lc.nomes, new Date())
  const meu = meuNome(lista.id)
  const meuAtivo = lc.nomes.find((n) => n.id === meu && !n.saiu_em) ?? null
  const formRef = useRef<HTMLDivElement>(null)

  // organizadora
  const [opcoes, setOpcoes] = useState<NomeNaLista | null>(null)
  const [trocando, setTrocando] = useState<NomeNaLista | null>(null)
  const [troca, setTroca] = useState<[NomeNaLista, NomeNaLista] | null>(null)
  const [tirando, setTirando] = useState<NomeNaLista | null>(null)
  const [resposta, setResposta] = useState<string | null>(null)

  function tocar(n: NomeNaLista) {
    if (!canEdit) return
    if (trocando) {
      if (trocando.id !== n.id) setTroca([trocando, n])
      setTrocando(null)
      return
    }
    setOpcoes(n)
  }

  const linha = (n: NomeNaLista, i: number) => (
    <LinhaDaLista
      key={n.id}
      n={n}
      pos={i + 1}
      eu={!canEdit && meuAtivo?.id === n.id}
      lc={lc}
      gestao={canEdit}
      marcada={trocando?.id === n.id}
      podeTirar={aberta}
      onTocar={() => tocar(n)}
      onTirarMeu={() => setTirando(n)}
      recarregar={recarregar}
      onToast={onToast}
    />
  )

  return (
    <div className="lista-pagina">
      <div className="card lista-topo">
        <div className="section-title" style={{ margin: 0 }}>📋 Lista de presença</div>
        <div className="lista-titulo">{lista.titulo}</div>
        <div className="prox-info">🎾 {quandoComData(lista.play_em)}</div>
        <div className="small muted">
          {aberta
            ? `Aberta até ${quandoComData(lista.fecha_em)}`
            : lista.fechada && Date.parse(lista.fecha_em) > Date.now()
              ? 'A lista está fechada.'
              : `A lista fechou ${quandoComData(lista.fecha_em)}.`}
        </div>
        <div className="lista-ocupacao">{ocupacao(lista, lc.nomes)}</div>
        {suplente && !meuAtivo && (
          <p className="small" style={{ margin: '6px 0 0' }}>
            As vagas acabaram, mas a lista segue aberta: entre como suplente. Quando alguém sai, a primeira suplente sobe sozinha.
          </p>
        )}
        {lista.texto && <p className="small" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{lista.texto}</p>}
        {!canEdit && aberta && !meuAtivo && (
          <button
            className="btn pink block"
            style={{ marginTop: 12 }}
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            {suplente ? '✍️ Entrar como suplente' : '✍️ Colocar meu nome'}
          </button>
        )}
        {!canEdit && meuAtivo && (
          <div className="banner info" style={{ margin: '12px 0 0' }}>
            Seu nome está na lista: {textoDaPosicao(posicaoDe(lc.nomes, meuAtivo.id), lista.vagas).replace('Você', 'você')}.
          </div>
        )}
      </div>

      {canEdit && (
        <Ferramentas lc={lc} recarregar={recarregar} onToast={onToast} onMontarPlay={onMontarPlay} onApagou={onApagou} />
      )}

      {trocando && (
        <div className="banner info lista-fixa">
          <span className="grow">Toque no nome que vai trocar de lugar com <strong>{trocando.nome}</strong>.</span>
          <button className="btn ghost sm" onClick={() => setTrocando(null)}>Cancelar</button>
        </div>
      )}

      <div className="card">
        <div className="section-title">✅ Confirmadas ({titulares.length}/{lista.vagas})</div>
        {titulares.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>Ninguém ainda. Seja a primeira!</p>
        ) : (
          <div>{titulares.map((n, i) => linha(n, i))}</div>
        )}
      </div>

      {suplentes.length > 0 && (
        <div className="card">
          <div className="section-title">⏳ Suplentes ({suplentes.length})</div>
          <p className="tiny muted" style={{ margin: '-4px 0 6px' }}>Quando alguém sai, a primeira suplente sobe sozinha.</p>
          <div>{suplentes.map((n, i) => linha(n, i + lista.vagas))}</div>
        </div>
      )}

      {canEdit && <Sairam lc={lc} />}

      {!canEdit && (
        <div ref={formRef}>
          {aberta && !meuAtivo ? (
            <ColocarNome lista={lista} suplente={suplente} recarregar={recarregar} onSair={onSair} onColocou={setResposta} />
          ) : (
            <button className="btn ghost block" onClick={onSair}>Ir para o app</button>
          )}
        </div>
      )}

      {opcoes && (
        <OpcoesDoNome
          n={opcoes}
          lc={lc}
          recarregar={recarregar}
          onToast={onToast}
          onTrocar={(n) => setTrocando(n)}
          onClose={() => setOpcoes(null)}
        />
      )}
      {troca && (
        <ConfirmarTroca a={troca[0]} b={troca[1]} lc={lc} recarregar={recarregar} onToast={onToast} onClose={() => setTroca(null)} />
      )}
      {resposta && (
        <Modal title="✅ Nome na lista" onClose={onSair}>
          <div className="stack lista-pagina">
            <p className="lista-resposta">{resposta}</p>
            <p className="small muted" style={{ margin: 0 }}>
              Se não puder ir, abra o mesmo link neste celular e toque em <strong>Tirar meu nome</strong>.
            </p>
            <button className="btn pink block" onClick={onSair}>Ir para o app</button>
          </div>
        </Modal>
      )}
      {tirando && (
        <TirarMeuNome
          n={tirando}
          suplente={suplentes.some((x) => x.id === tirando.id)}
          onClose={() => setTirando(null)}
          onTirou={(msg) => {
            onToast(msg)
            onSair()
          }}
        />
      )}
    </div>
  )
}

/** Uma linha: vinculada = foto e forca (ou 🔍 n/3); sem vinculo = so o texto digitado. */
function LinhaDaLista({
  n,
  pos,
  eu,
  lc,
  gestao,
  marcada,
  podeTirar,
  onTocar,
  onTirarMeu,
  recarregar,
  onToast,
}: {
  n: NomeNaLista
  pos: number
  eu: boolean
  lc: ListaCompleta
  gestao: boolean
  marcada: boolean
  podeTirar: boolean
  onTocar: () => void
  onTirarMeu: () => void
  recarregar: () => Promise<void>
  onToast: (m: string) => void
}) {
  const { data, playerById, nameOf } = useStore()
  const forca = useMemo(() => ratings(data), [data])
  const avaliacao = emAvaliacao(data)
  const player = n.player_id ? playerById(n.player_id) : undefined
  const sugestao = useMemo(
    () => (gestao && !n.player_id ? sugestaoSegura(n.nome, data.players.filter((p) => p.active)) : undefined),
    [gestao, n.player_id, n.nome, data.players],
  )
  const { vincular, ocupada, avisoDeDuplicada } = useVincular(lc, recarregar, onToast)

  let detalhe: string | null = null
  if (player) {
    const plays = avaliacao.get(player.id)
    const nota = notaDeForca(forca.get(player.id) ?? 2)
    // a forca de quem esta em avaliacao so a organizadora ve (com a 🔍)
    detalhe = plays === undefined ? `💪 ${nota}` : gestao ? `💪 ${nota} 🔍` : avaliacaoCurta(plays)
  }

  return (
    <div
      className={`lista-linha${eu ? ' eu' : ''}${gestao ? ' tocavel' : ''}${marcada ? ' marcada' : ''}`}
      role={gestao ? 'button' : undefined}
      tabIndex={gestao ? 0 : undefined}
      onClick={gestao ? onTocar : undefined}
      onKeyDown={gestao ? (e) => { if (e.key === 'Enter') onTocar() } : undefined}
    >
      <span className="lista-pos">{pos}</span>
      {player ? <Avatar player={player} size={34} /> : <span className="lista-sem-foto" aria-hidden />}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="lista-nome">
          {player ? nameOf(player.id) : n.nome}
          {n.origem === 'mensalista' && <span title="mensalista"> 📅</span>}
          {n.garantida && n.origem === 'organizadora' && <span title="vaga garantida pela organização"> ⭐</span>}
          {eu && <span className="badge open" style={{ marginLeft: 6 }}>você</span>}
        </span>
        {detalhe && <span className="lista-forca">{detalhe}</span>}
        {gestao && !player && <span className="tiny muted" style={{ display: 'block' }}>sem cadastro vinculado</span>}
      </span>
      {gestao && <PagamentoNaLista lista={lc.lista} nome={n} onVincular={onTocar} />}
      {gestao && sugestao && (
        <button
          className="btn teal sm lista-sugestao"
          disabled={ocupada}
          onClick={(e) => {
            e.stopPropagation()
            void vincular(n, sugestao.player)
          }}
        >
          É a {nameOf(sugestao.player.id)}? ✓
        </button>
      )}
      {eu && podeTirar && (
        <button className="btn danger sm" onClick={onTirarMeu}>Tirar meu nome</button>
      )}
      {avisoDeDuplicada}
    </div>
  )
}

/** O formulario da atleta: so o nome completo, sem sugestao de cadastro. */
function ColocarNome({
  lista,
  suplente,
  recarregar,
  onSair,
  onColocou,
}: {
  lista: Lista
  /** Lotada: o mesmo formulario, com o texto de suplente. */
  suplente: boolean
  recarregar: () => Promise<void>
  onSair: () => void
  /** A resposta do banco ("Voce e a 15a — confirmada"); o aviso fica na pagina, que sobrevive a releitura. */
  onColocou: (resposta: string) => void
}) {
  const { repo } = useStore()
  const [texto, setTexto] = useState(ultimoNome)
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function colocar() {
    const v = validarNomeDaAtleta(texto)
    if ('erro' in v) {
      setErro(v.erro)
      return
    }
    setErro(null)
    setBusy(true)
    try {
      const r = await repo.colocarNaLista(lista.codigo, v.nome, codigoDoAparelho())
      if (r.ok) {
        guardarNome(v.nome)
        if (r.id) marcarMeu(lista.id, r.id)
        onColocou(r.posicao ? textoDaPosicao(r.posicao, r.vagas ?? lista.vagas) : 'Seu nome está na lista')
        void recarregar()
      } else {
        setErro(MENSAGEM_DO_MOTIVO[r.motivo] ?? 'Não deu certo. Tente de novo.')
      }
    } catch {
      setErro('Sem conexão agora. Tente de novo em instantes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="section-title">{suplente ? '✍️ Entrar como suplente' : '✍️ Colocar meu nome'}</div>
      <div className="stack">
        <label className="field">
          <span>Seu nome e sobrenome</span>
          <input
            className="input"
            value={texto}
            maxLength={60}
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="send"
            onChange={(e) => { setTexto(e.target.value); setErro(null) }}
            onKeyDown={(e) => e.key === 'Enter' && void colocar()}
          />
        </label>
        <p className="tiny muted" style={{ margin: '-4px 0 0' }}>Nome e sobrenome, como a organização conhece você.</p>
        {erro && <div className="banner err" style={{ margin: 0 }}>{erro}</div>}
        <button className="btn pink block" disabled={busy || !texto.trim()} onClick={() => void colocar()}>
          {busy ? 'Colocando…' : suplente ? 'Entrar como suplente' : 'Colocar meu nome'}
        </button>
        <button className="btn ghost block" onClick={onSair}>Agora não</button>
      </div>
    </div>
  )
}

/** O aviso antes de tirar (texto do desenho): a vaga vai para a proxima suplente. */
function TirarMeuNome({
  n,
  suplente,
  onClose,
  onTirou,
}: {
  n: NomeNaLista
  suplente: boolean
  onClose: () => void
  onTirou: (mensagem: string) => void
}) {
  const { repo } = useStore()
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function tirar() {
    setBusy(true)
    try {
      const r = await repo.tirarDaLista(n.id, codigoDoAparelho())
      if (r.ok || r.motivo === 'nao_esta') {
        marcarMeu(n.lista_id, null)
        // nao_esta tambem vem da lista apagada pela organizadora (D39)
        const sumiu = !r.ok && !(await repo.carregarLista({ id: n.lista_id }).catch(() => true))
        onTirou(sumiu ? MENSAGEM_DO_MOTIVO.nao_existe : 'Seu nome saiu da lista')
      } else {
        setErro(MENSAGEM_DO_MOTIVO[r.motivo])
      }
    } catch {
      setErro('Sem conexão agora. Tente de novo em instantes.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Tirar seu nome?" onClose={onClose}>
      <div className="stack lista-pagina">
        <p style={{ margin: 0 }}>
          {suplente
            ? 'Você sai da fila de suplentes. Se mudar de ideia, volta para o fim da fila.'
            : 'Sua vaga vai para a próxima suplente. Se mudar de ideia, você volta para o fim da fila.'}
        </p>
        {erro && <div className="banner err" style={{ margin: 0 }}>{erro}</div>}
        <button className="btn danger block" disabled={busy} onClick={() => void tirar()}>
          {busy ? 'Tirando…' : 'Tirar meu nome'}
        </button>
        <button className="btn ghost block" onClick={onClose}>Continuar na lista</button>
      </div>
    </Modal>
  )
}

/** A barra da organizadora: atualizacao, link, adicionar, editar, fechar/reabrir, montar o play. */
function Ferramentas({
  lc,
  recarregar,
  onToast,
  onMontarPlay,
  onApagou,
}: {
  lc: ListaCompleta
  recarregar: () => Promise<void>
  onToast: (m: string) => void
  onMontarPlay: (m: Montagem) => void
  onApagou: () => void
}) {
  const { repo, nameOf } = useStore()
  const { lista } = lc
  const { ocupada, escrever } = useEscrita(recarregar, onToast)
  const [modal, setModal] = useState<null | 'link' | 'adicionar' | 'editar' | 'reabrir' | 'montar' | 'vincular-antes' | 'apagar'>(null)
  const aberta = estaAberta(lista, new Date())
  const { ids, semVinculo } = paraMontar(lista, lc.nomes)

  async function atualizacao() {
    const msg = mensagemDeAtualizacao(lista, lc.nomes, nameOf, urlDaLista(baseDoApp(), lista.codigo), new Date())
    if (await shareOrCopy(msg)) onToast('Lista atualizada pronta para colar no grupo 📋')
  }

  function pedirMontar() {
    if (semVinculo.length > 0) setModal('vincular-antes')
    else if (aberta) setModal('montar')
    else void montar()
  }

  async function montar() {
    // montar fecha a lista: ninguem entra enquanto ela monta o play
    const ok = lista.fechada || (await escrever(() => repo.salvarLista({ ...lista, fechada: true })))
    if (ok) onMontarPlay({ lista: { ...lista, fechada: true }, ids })
  }

  if (modal === 'editar' || modal === 'reabrir') {
    return (
      <CriarLista
        editar={lista}
        reabrir={modal === 'reabrir'}
        onCancel={() => setModal(null)}
        onPronta={() => {
          setModal(null)
          onToast(modal === 'reabrir' ? 'Lista reaberta 🔓' : 'Lista salva')
          void recarregar()
        }}
        onToast={onToast}
      />
    )
  }

  return (
    <div className="card">
      <div className="section-title">⚙️ Organização</div>
      <div className="lista-acoes">
        <button className="btn purple" onClick={() => void atualizacao()}>📤 Copiar atualização</button>
        <button className="btn ghost" onClick={() => setModal('link')}>🔗 Mensagem do link</button>
        <button className="btn ghost" onClick={() => setModal('adicionar')}>➕ Adicionar</button>
        <button className="btn ghost" onClick={() => setModal('editar')}>✏️ Editar</button>
        {aberta ? (
          <button
            className="btn ghost lista-larga"
            disabled={ocupada}
            onClick={() => void escrever(() => repo.salvarLista({ ...lista, fechada: true }), 'Lista fechada 🔒')}
          >
            🔒 Fechar a lista agora
          </button>
        ) : (
          <button
            className="btn ghost lista-larga"
            disabled={ocupada}
            onClick={() =>
              Date.parse(lista.fecha_em) > Date.now()
                ? void escrever(() => repo.salvarLista({ ...lista, fechada: false }), 'Lista reaberta 🔓')
                : setModal('reabrir')
            }
          >
            🔓 Reabrir a lista
          </button>
        )}
        {podeApagar(lista) && (
          <button className="btn danger lista-larga" style={{ minHeight: 44 }} disabled={ocupada} onClick={() => setModal('apagar')}>
            🗑️ Apagar lista
          </button>
        )}
        <span className="tiny muted lista-dica">Toque num nome para vincular, trocar de lugar ou tirar.</span>
      </div>
      <button className="btn pink block" style={{ marginTop: 10 }} disabled={ocupada} onClick={pedirMontar}>
        🎾 Montar play com a lista
      </button>
      {lista.session_id && <p className="tiny muted" style={{ margin: '6px 0 0' }}>O play desta lista já foi montado.</p>}

      {modal === 'link' && <MensagemDoLink lista={lista} onClose={() => setModal(null)} onToast={onToast} />}
      {modal === 'apagar' && <ApagarLista lc={lc} onApagou={onApagou} onClose={() => setModal(null)} />}
      {modal === 'adicionar' && <AdicionarNaLista lc={lc} recarregar={recarregar} onToast={onToast} onClose={() => setModal(null)} />}
      {modal === 'vincular-antes' && (
        <Modal title="Antes de montar" onClose={() => setModal(null)}>
          <div className="stack lista-pagina">
            <p style={{ margin: 0 }}>
              Vincule ao cadastro (ou cadastre) as confirmadas sem cadastro: o play precisa saber quem é quem.
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {semVinculo.map((n) => <li key={n.id}>{n.nome}</li>)}
            </ul>
            <button className="btn ghost block" onClick={() => setModal(null)}>Entendi</button>
          </div>
        </Modal>
      )}
      {modal === 'montar' && (
        <Modal title="Montar o play agora?" onClose={() => setModal(null)}>
          <div className="stack lista-pagina">
            <p style={{ margin: 0 }}>
              Montar o play agora fecha a lista. Quem ainda não colocou o nome vai precisar falar com você.
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              As {ids.length} confirmadas já entram marcadas em “Quem joga”; você ainda pode tirar e colocar à mão.
            </p>
            <button className="btn pink block" disabled={ocupada} onClick={() => { setModal(null); void montar() }}>
              Fechar a lista e montar
            </button>
            <button className="btn ghost block" onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
