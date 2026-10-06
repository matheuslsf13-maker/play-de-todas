import { AvisoDoBanco } from '../components/AvisoDoBanco'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, Empty, Modal } from '../components/ui'
import ImportarLista from '../components/ImportarLista'
import { nivelDeForca, notaDeForca, rankingDeForca, textoDaQueda } from '../lib/forca'
import {
  CATEGORIAS,
  categoriaDe,
  confirmarPagamento,
  desfazerPagamento,
  situacaoDoAtleta,
  type Categoria,
} from '../lib/mensalidade'
import { squareThumb } from '../lib/image'
import { playedMatches } from '../lib/stats'
import { ELO_INICIAL, ratings } from '../lib/stats'
import { normalizar } from '../lib/roster'
import { useStore } from '../lib/store'
import { jogadorasDaPartida } from '../lib/pairing'
import { plural, uid, type Player } from '../lib/types'

export default function Players({ onToast }: { onToast: (m: string) => void }) {
  const { data, savePlayer, deletePlayer, mergePlayers, canEdit, repo } = useStore()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [juntando, setJuntando] = useState<Player | null>(null)
  const [importando, setImportando] = useState(false)
  /** Categoria de quem for cadastrada agora; fica escolhida para a proxima. */
  const [novaCategoria, setNovaCategoria] = useState<Categoria>('isenta')
  /** Ponto de partida do Elo de quem for cadastrada agora (escala de 1500). */
  const [novaForca, setNovaForca] = useState(ELO_INICIAL)
  const [editando, setEditando] = useState<Player | null>(null)
  /** Filtro da lista: nome, apelido ou outra grafia, sem acento. */
  const [busca, setBusca] = useState('')
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  /** Forca de cada jogadora, para o nivel aparecer na linha dela. */
  const forcaPorId = useMemo(() => {
    const m = new Map<string, ReturnType<typeof rankingDeForca>[number]>()
    for (const l of rankingDeForca(data, (id) => data.players.find((p) => p.id === id)?.name ?? id)) {
      m.set(l.player_id, l)
    }
    return m
  }, [data])

  const termo = normalizar(busca)
  const sorted = [...data.players]
    .filter(
      (p) =>
        !termo ||
        normalizar(p.name).includes(termo) ||
        normalizar(p.nickname ?? '').includes(termo) ||
        (p.aliases ?? []).some((a) => normalizar(a).includes(termo)),
    )
    .sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'),
  )

  async function add() {
    const n = name.trim()
    if (!n) return
    const p: Player = {
      id: uid(),
      name: n,
      photo_url: null,
      active: true,
      created_at: new Date().toISOString(),
      categoria: novaCategoria,
      pago_mes: null,
      pago_avulso: false,
      forca_inicial: novaForca === ELO_INICIAL ? null : novaForca,
    }
    await savePlayer(p)
    setName('')
    // a categoria fica para a proxima de proposito (costuma ser a mesma para
    // uma leva); a forca e de cada pessoa, e nao pode vazar
    setNovaForca(ELO_INICIAL)
    onToast(`${n} entrou no grupo 🎾`)
  }

  async function pickPhoto(p: Player, file: File | undefined) {
    if (!file) return
    setBusy(p.id)
    try {
      const thumb = await squareThumb(file)
      const url = await repo.uploadPhoto(p.id, thumb)
      const antiga = p.photo_url
      savePlayer({ ...p, photo_url: url })
      if (antiga) await repo.deletePhoto(antiga) // nao deixa arquivo orfao
      onToast('Foto atualizada 📸')
    } catch (e) {
      onToast('Erro ao enviar a foto')
      console.error(e)
    } finally {
      setBusy(null)
    }
  }

  async function removePhoto(p: Player) {
    if (!p.photo_url) return
    if (!confirm(`Remover a foto de ${p.name}? No lugar dela voltam as iniciais.`)) return
    setBusy(p.id)
    try {
      const antiga = p.photo_url
      savePlayer({ ...p, photo_url: null })
      await repo.deletePhoto(antiga)
      onToast('Foto removida')
    } catch (e) {
      onToast('Erro ao remover a foto')
      console.error(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {canEdit && (
        <div className="card">
          <div className="section-title">➕ Nova jogadora</div>
          <div className="row">
            <input
              className="input grow"
              placeholder="Nome da jogadora"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
            />
            <button className="btn pink" onClick={() => void add()} disabled={!name.trim()}>Add</button>
          </div>
          <div className="chips-scroll" style={{ marginTop: 8 }}>
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                className={`chip ${novaCategoria === c.valor ? 'on' : 'off'}`}
                style={{ flex: 'none' }}
                onClick={() => setNovaCategoria(c.valor)}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 6, marginBottom: 0 }}>
            {CATEGORIAS.find((c) => c.valor === novaCategoria)?.explica}
          </p>

          <ForcaInicial valor={novaForca} onChange={setNovaForca} />

          <button
            className="btn ghost block sm"
            style={{ marginTop: 12 }}
            onClick={() => setImportando(true)}
          >
            📋 Colar a lista do grupo e cadastrar várias
          </button>
        </div>
      )}

      {importando && (
        <ImportarLista
          modo="cadastro"
          onClose={() => setImportando(false)}
          onToast={onToast}
        />
      )}

      <AvisoDoBanco />


      {editando && (
        <EditarPerfil
          jogadora={editando}
          onClose={() => setEditando(null)}
          onSalvar={(p) => {
            void savePlayer(p)
            setEditando(null)
            onToast('Perfil salvo ✅')
          }}
        />
      )}

      {juntando && (
        <JuntarJogadoras
          origem={juntando}
          onClose={() => setJuntando(null)}
          onJuntar={(destinoId) => {
            mergePlayers(juntando.id, destinoId)
            setJuntando(null)
            onToast('Jogadoras juntadas 🔗')
          }}
        />
      )}

      <div className="card">
        <div className="section-title">👯 Jogadoras ({data.players.filter((p) => p.active).length} ativas)</div>
        <input
          className="input"
          type="search"
          placeholder="Buscar pelo nome, apelido ou outra grafia"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        {sorted.length === 0 ? (
          termo ? (
            <Empty icon="🔎">Nenhuma jogadora com “{busca.trim()}”.</Empty>
          ) : (
            <Empty icon="👯">Cadastre as meninas do grupo para começar.</Empty>
          )
        ) : (
          <div className="stack">
            {sorted.map((p) => (
              <div key={p.id} className="atleta-linha" style={{ opacity: p.active ? 1 : 0.5 }}>
                <div className="row">
                <button
                  className="avatar"
                  title="Trocar foto"
                  style={{ width: 44, height: 44, border: 0, padding: 0, cursor: canEdit ? 'pointer' : 'default' }}
                  onClick={() => canEdit && fileRefs.current[p.id]?.click()}
                >
                  <Avatar player={p} size={44} />
                </button>
                <input
                  ref={(el) => { fileRefs.current[p.id] = el }}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void pickPhoto(p, e.target.files?.[0])}
                />
                <div className="grow">
                  <div style={{ fontWeight: 700 }} className="ellipsis">
                    {p.nickname?.trim() || p.name}
                  </div>
                  {p.nickname?.trim() && p.nickname.trim() !== p.name && (
                    <div className="tiny muted ellipsis">{p.name}</div>
                  )}
                  <SinalDePagamento jogadora={p} />
                  {(() => {
                    const f = forcaPorId.get(p.id)
                    if (!f) return null
                    return (
                      <div className="tiny nowrap" style={{ marginTop: 2 }}>
                        <span style={{ color: f.nivel.cor, fontWeight: 800 }}>
                          {f.nivel.emoji} {f.nivel.titulo}
                        </span>
                        <span className="muted"> · força {f.nota}</span>
                        {f.provisoria && <span className="muted"> (provisória)</span>}
                        {f.queda && <span className="muted"> · {textoDaQueda(f.queda)}</span>}
                      </div>
                    )
                  })()}
                  <div className="tiny muted acoes-atleta">
                    {busy === p.id ? (
                      'salvando foto…'
                    ) : (
                      <>
                        {!p.active && <span className="pausada">pausada</span>}
                        {canEdit && (
                          <>
                            <button className="linkish" onClick={() => setEditando(p)}>
                              editar perfil
                            </button>
                            <button className="linkish" onClick={() => fileRefs.current[p.id]?.click()}>
                              {p.photo_url ? 'trocar foto' : 'pôr foto'}
                            </button>
                            {p.photo_url && (
                              <>
                                <button className="linkish" onClick={() => void removePhoto(p)}>
                                  remover foto
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                </div>

                {canEdit && (
                  <div className="row spread atleta-acoes">
                    <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => void savePlayer({ ...p, active: !p.active })}>
                      {p.active ? 'Pausar' : 'Ativar'}
                    </button>
                    <button className="btn ghost sm" title="juntar com outra jogadora" onClick={() => setJuntando(p)}>
                      🔗
                    </button>
                    <button
                      className="btn danger sm"
                      onClick={() => {
                        if (confirm(`Remover ${p.name}? O histórico de partidas dela continua salvo.`)) {
                          void deletePlayer(p.id)
                        }
                      }}
                    >
                      🗑
                    </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Criou a mesma atleta duas vezes? Toque em <strong>🔗</strong> para juntar as duas:
          partidas, pontos e sequência das duas passam para a que ficar.{' '}
          A foto aparece no pódio do ranking mensal. Toque na foto (ou em <em>pôr/trocar foto</em>) para escolher,
          e em <em>remover foto</em> para voltar às iniciais.
          Quem está <strong>pausada</strong> não aparece na hora de montar o play, mas mantém o histórico.
        </p>
      </div>
    </>
  )
}

/** Junta uma jogadora duplicada em outra, preservando o historico das duas. */
function JuntarJogadoras({
  origem,
  onClose,
  onJuntar,
}: {
  origem: Player
  onClose: () => void
  onJuntar: (destinoId: string) => void
}) {
  const { data } = useStore()
  const [destino, setDestino] = useState('')
  const outras = [...data.players]
    .filter((p) => p.id !== origem.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const alvo = outras.find((p) => p.id === destino)
  const jogos = data.matches.filter((m) => [...m.team_a, ...m.team_b].includes(origem.id)).length

  return (
    <Modal title={`Juntar ${origem.name}`} onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>
        Use quando a mesma atleta foi criada duas vezes com nomes diferentes.
        As <strong>{plural(jogos, 'partida')}</strong> de {origem.name} passam para a jogadora escolhida,
        somando pontos e mantendo a sequência dela. Depois disso, <strong>{origem.name}</strong> deixa de existir.
      </p>
      <label className="field">
        <span>{origem.name} é a mesma pessoa que…</span>
        <select className="select" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">escolha a jogadora que fica</option>
          {outras.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <button
        className="btn pink block"
        style={{ marginTop: 12 }}
        disabled={!alvo}
        onClick={() => {
          if (!alvo) return
          if (
            confirm(
              `Juntar "${origem.name}" em "${alvo.name}"?\n\n` +
                `As partidas de ${origem.name} passam para ${alvo.name} e o nome "${origem.name}" some da lista.\n\n` +
                `Essa ação não tem volta.`,
            )
          ) {
            onJuntar(alvo.id)
          }
        }}
      >
        🔗 Juntar em {alvo?.name ?? '…'}
      </button>
    </Modal>
  )
}

/**
 * Editar o perfil da jogadora.
 *
 * O nome e so um ROTULO: cada jogadora tem um id proprio e as partidas guardam
 * esse id, nunca o nome. Renomear nao mexe em partida, ponto nem sequencia --
 * e o modal mostra o tamanho do historico dela justamente para deixar isso
 * visivel na hora de trocar.
 *
 * Os apelidos sao as outras grafias que a lista do grupo ja usou para ela. Sao
 * eles que fazem a importacao do WhatsApp cair na pessoa certa em vez de criar
 * uma segunda cadastrada com o nome escrito de outro jeito.
 */
function EditarPerfil({
  jogadora,
  onClose,
  onSalvar,
}: {
  jogadora: Player
  onClose: () => void
  onSalvar: (p: Player) => void
}) {
  const { data } = useStore()
  const [nome, setNome] = useState(jogadora.name)
  const [apelido, setApelido] = useState(jogadora.nickname ?? '')
  const [categoria, setCategoria] = useState<Categoria>(categoriaDe(jogadora))
  const [apelidos, setApelidos] = useState((jogadora.aliases ?? []).join('\n'))
  const [forcaInicial, setForcaInicial] = useState(jogadora.forca_inicial ?? ELO_INICIAL)
  /** A nota de hoje, ja com as partidas -- para mostrar ao lado do ponto de partida. */
  const notaAtual = useMemo(() => notaDeForca(ratings(data).get(jogadora.id) ?? 2), [data, jogadora.id])

  const historico = useMemo(() => {
    const jogadas = playedMatches(data).filter((m) => jogadorasDaPartida(m).includes(jogadora.id))
    const dias = new Set(jogadas.map((m) => m.session_id)).size
    return { partidas: jogadas.length, dias }
  }, [data, jogadora.id])

  const limpo = nome.trim()
  const repetido = data.players.some(
    (p) => p.id !== jogadora.id && p.name.trim().toLowerCase() === limpo.toLowerCase(),
  )

  function salvar() {
    const lista = apelidos
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
    // trocar de categoria zera o pagamento: uma mensalista que virou avulsa nao
    // herda o mes pago, e vice-versa -- senao alguem ficaria verde sem ter pago
    const mudou = categoria !== categoriaDe(jogadora)
    onSalvar({
      ...jogadora,
      name: limpo,
      nickname: apelido.trim() || null,
      aliases: [...new Set(lista)],
      categoria,
      pago_mes: mudou ? null : jogadora.pago_mes,
      pago_avulso: mudou ? false : jogadora.pago_avulso,
      forca_inicial: forcaInicial === ELO_INICIAL ? null : forcaInicial,
    })
  }

  return (
    <Modal title={`Perfil de ${jogadora.name}`} onClose={onClose}>
      <label className="field">
        <span>Nome de cadastro</span>
        <input className="input" value={nome} autoFocus onChange={(e) => setNome(e.target.value)} />
      </label>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        O nome completo, para conferir a lista sem confundir duas Anas. Só aparece aqui.
      </p>

      <label className="field" style={{ marginTop: 12 }}>
        <span>Apelido — como aparece na quadra</span>
        <input
          className="input"
          value={apelido}
          placeholder={nome.split(' ')[0] || 'como o grupo chama'}
          onChange={(e) => setApelido(e.target.value)}
        />
      </label>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        É este que vai para o ranking, as partidas, o texto do WhatsApp e as artes. Deixe vazio
        para usar o nome de cadastro.
      </p>
      {repetido && (
        <div className="banner warn" style={{ marginTop: 8 }}>
          Já existe outra jogadora com esse nome. Se for a mesma pessoa cadastrada duas vezes,
          feche aqui e use o <strong>🔗</strong> para juntar as duas.
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <span>Como ela paga</span>
        <div className="chips-scroll">
          {CATEGORIAS.map((c) => (
            <button
              key={c.valor}
              className={`chip ${categoria === c.valor ? 'on' : 'off'}`}
              style={{ flex: 'none' }}
              onClick={() => setCategoria(c.valor)}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
        <em className="hint" style={{ marginTop: 6 }}>
          {CATEGORIAS.find((c) => c.valor === categoria)?.explica}
          {categoria !== categoriaDe(jogadora) && ' — trocar de categoria zera o pagamento atual.'}
        </em>
      </div>

      <ForcaInicial
        valor={forcaInicial}
        onChange={setForcaInicial}
        atual={historico.partidas > 0 ? notaAtual : undefined}
        partidas={historico.partidas}
      />

      <label className="field" style={{ marginTop: 12 }}>
        <span>Outras grafias do nome (uma por linha)</span>
        <textarea
          className="input"
          rows={3}
          value={apelidos}
          placeholder={'Ana\nAninha\nAna Cristina'}
          onChange={(e) => setApelidos(e.target.value)}
        />
      </label>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        É por aqui que a importação da lista do grupo acerta a pessoa. Se ela aparece na lista às
        vezes como <em>Ana</em> e às vezes como <em>Aninha</em>, escreva as duas — assim o app não
        cadastra uma segunda.
      </p>

      <div className="banner info" style={{ marginTop: 12 }}>
        📚 <strong>{plural(historico.partidas, 'partida')}</strong> em{' '}
        <strong>{plural(historico.dias, 'play')}</strong> no histórico dela. Trocar o nome{' '}
        <strong>não mexe em nada disso</strong>: as partidas ficam ligadas ao cadastro, não ao nome
        escrito.
      </div>

      <button
        className="btn pink block"
        style={{ marginTop: 12 }}
        disabled={!limpo}
        onClick={salvar}
      >
        Salvar
      </button>
      <button className="btn ghost block sm" style={{ marginTop: 8 }} onClick={onClose}>
        Cancelar
      </button>
    </Modal>
  )
}


/**
 * O semaforo do pagamento, na linha da jogadora.
 *
 * Verde nao quer dizer "pagou alguma vez": quer dizer "pode entrar no proximo
 * play". Por isso a mensalista fica vermelha sozinha na virada do mes e a
 * avulsa volta ao vermelho depois de jogar -- a regra e derivada, ninguem
 * precisa lembrar de zerar nada.
 */
function SinalDePagamento({ jogadora }: { jogadora: Player }) {
  const { data, savePlayer, canEdit } = useStore()
  const categoria = categoriaDe(jogadora)
  const sit = situacaoDoAtleta(jogadora, data)
  const cor =
    sit.cor === 'ok' ? 'var(--verde)' : sit.cor === 'atencao' ? 'var(--ouro)' : 'var(--danger)'

  // isenta nao tem o que confirmar, e num grupo que nao cobra todo mundo e
  // isenta -- mostrar um selo verde em cada linha so faria ruido
  if (categoria === 'isenta') return null

  return (
    <div className="tiny" style={{ marginTop: 2 }}>
      <span className="nowrap" style={{ color: cor, fontWeight: 800 }}>
        ● {sit.rotulo}
      </span>
      {canEdit && categoria !== 'convidada' && (
        <>
          {' · '}
          <button
            className="linkish"
            onClick={() =>
              void savePlayer(
                sit.liberado ? desfazerPagamento(jogadora) : confirmarPagamento(jogadora),
              )
            }
          >
            {sit.liberado ? 'desfazer' : 'confirmar pagamento'}
          </button>
        </>
      )}
      {sit.alerta && (
        <div className="tiny" style={{ color: 'var(--ouro)', marginTop: 2 }}>⚠️ {sit.alerta}</div>
      )}
    </div>
  )
}


/**
 * O ponto de partida do Elo, escolhido por quem organiza.
 *
 * O padrao e 1500 -- o MEIO da escala, nao a media de quem esta cadastrado. O
 * Elo e soma zero, entao a media do grupo fica em 1500 sozinha enquanto todo
 * mundo partir dali. Dar um ponto de partida diferente e dizer ao app o que ele
 * ainda nao sabe: que a estreante ja joga bem (ou ainda nao). Depois disso as
 * partidas mandam do mesmo jeito, e o historico inteiro e recalculado a partir
 * do novo ponto -- por isso o campo continua editavel depois.
 */
function ForcaInicial({
  valor,
  onChange,
  atual,
  partidas = 0,
}: {
  valor: number
  onChange: (v: number) => void
  /** A nota de hoje, quando ja ha partidas. */
  atual?: number
  partidas?: number
}) {
  const nivel = nivelDeForca(valor)
  const PASSO = 25
  const MIN = 1200
  const MAX = 1800
  // o que esta sendo digitado e um rascunho: limitar a cada tecla tornava
  // impossivel digitar "1600" (o "1" virava 1200 antes do resto chegar)
  const [texto, setTexto] = useState(String(valor))
  useEffect(() => setTexto(String(valor)), [valor])
  const confirmarTexto = () => {
    const n = Math.round(Number(texto))
    if (texto.trim() === '' || !Number.isFinite(n)) {
      setTexto(String(valor))
      return
    }
    onChange(Math.min(MAX, Math.max(MIN, n)))
    setTexto(String(Math.min(MAX, Math.max(MIN, n))))
  }
  return (
    <div className="field" style={{ marginTop: 12 }}>
      <span>Força inicial</span>
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => onChange(Math.max(MIN, valor - PASSO))}
          disabled={valor <= MIN}
        >
          −
        </button>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={MIN}
          max={MAX}
          step={PASSO}
          value={texto}
          style={{ textAlign: 'center', fontWeight: 800 }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmarTexto}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => onChange(Math.min(MAX, valor + PASSO))}
          disabled={valor >= MAX}
        >
          +
        </button>
        <span className="nowrap tiny" style={{ color: nivel.cor, fontWeight: 800 }}>
          {nivel.emoji} {nivel.titulo}
        </span>
      </div>
      <em className="hint" style={{ marginTop: 6 }}>
        {valor === ELO_INICIAL
          ? '1500 é o meio da escala: o app ainda não sabe o nível e vai aprender com as partidas.'
          : valor > ELO_INICIAL
            ? `Começa ${valor - ELO_INICIAL} acima do meio — o app já a trata como mais forte ao montar os grupos e as duplas.`
            : `Começa ${ELO_INICIAL - valor} abaixo do meio — o app já a trata como mais fraca ao montar os grupos e as duplas.`}
        {atual !== undefined &&
          ` Hoje, depois de ${partidas} ${partidas === 1 ? 'partida' : 'partidas'}, a nota dela é ${atual}; mudar o ponto de partida recalcula tudo a partir dele.`}
      </em>
    </div>
  )
}
