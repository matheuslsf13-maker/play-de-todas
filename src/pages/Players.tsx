import { AvisoDoBanco } from '../components/AvisoDoBanco'
import CampoDeBusca from '../components/CampoDeBusca'
import EscolherGenero, { precisaDeGenero, type Genero } from '../components/EscolherGenero'
import { LIGA } from '../liga'
import { useMemo, useRef, useState } from 'react'
import { Avatar, Empty, Modal } from '../components/ui'
import ImportarLista from '../components/ImportarLista'
import ForcaInicial from '../components/ForcaInicial'
import { NomeClicavel } from '../components/NomeClicavel'
import { NIVEIS_DE_FORCA, notaDeForca, rankingDeForca, textoDaQueda } from '../lib/forca'
import {
  CATEGORIAS,
  categoriaDe,
  confirmarPagamento,
  desfazerPagamento,
  situacaoDoAtleta,
  type Categoria,
} from '../lib/mensalidade'
import { squareThumb } from '../lib/image'
import { fecharPausa, mediaDaForca, pausaNaForca, playedMatches, quedaPorFalta, ratings } from '../lib/stats'
import { normalizar, semInvisiveis } from '../lib/roster'
import { useStore } from '../lib/store'
import { jogadorasDaPartida } from '../lib/pairing'
import { plural, todayISO, uid, type Player } from '../lib/types'
import { HistoricoFinanceiro } from '../components/HistoricoFinanceiro'
import { entradaComo } from '../lib/vagasDeMensalista'

export default function Players({ onToast }: { onToast: (m: string) => void }) {
  const { data, savePlayer, deletePlayer, mergePlayers, canEdit, repo } = useStore()
  const [name, setName] = useState('')
  /** So no misto: de qual campeonato e a pessoa nova (fica para a proxima, como a categoria). */
  const [generoDaNova, setGeneroDaNova] = useState<Genero | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [juntando, setJuntando] = useState<Player | null>(null)
  const [importando, setImportando] = useState(false)
  /** Categoria de quem for cadastrada agora; fica escolhida para a proxima. */
  const [novaCategoria, setNovaCategoria] = useState<Categoria>('isenta')
  /** Ponto de partida do Elo de quem for cadastrada agora (escala de 1500). */
  const mediaHoje = useMemo(() => mediaDaForca(data), [data])
  const [novaForca, setNovaForca] = useState<number | null>(null)
  const forcaDaNova = novaForca ?? mediaHoje
  const [editando, setEditando] = useState<Player | null>(null)
  /** Filtro da lista: nome, apelido ou outra grafia, sem acento. */
  const [busca, setBusca] = useState('')
  // o formulario de cadastro fica fechado: a lista e o que se usa toda hora
  const [novaAberta, setNovaAberta] = useState(false)
  /** Os filtros por chip ficam guardados no aparelho, como a aba aberta. */
  const [filtro, setFiltro] = useState<Filtro>(lerFiltro)
  const mudarFiltro = (f: Partial<Filtro>) => {
    const novo = { ...filtro, ...f }
    setFiltro(novo)
    try {
      localStorage.setItem(CHAVE_DO_FILTRO, JSON.stringify(novo))
    } catch {
      /* sem armazenamento: o filtro so nao fica guardado */
    }
  }
  /** A atleta com a folha de acoes aberta (tocou na linha). */
  const [aberta, setAberta] = useState<string | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)

  /** Forca de cada jogadora, para o nivel aparecer na linha dela. */
  const forcaPorId = useMemo(() => {
    const m = new Map<string, ReturnType<typeof rankingDeForca>[number]>()
    for (const l of rankingDeForca(data, (id) => data.players.find((p) => p.id === id)?.name ?? id)) {
      m.set(l.player_id, l)
    }
    return m
  }, [data])

  // pausada (na mao ou pelas faltas) e quem esta faltando: as duas coisas que tiram
  // do ranking da forca. Quem nunca jogou tambem pode estar pausada.
  const pausas = useMemo(() => pausaNaForca(data), [data])
  const faltas = useMemo(() => quedaPorFalta(data), [data])
  const situacoes = useMemo(() => new Map(data.players.map((p) => [p.id, situacaoDoAtleta(p, data)])), [data])

  const passa: Record<FiltroDeSituacao, (p: Player) => boolean> = {
    todas: () => true,
    ativas: (p) => p.active,
    inativas: (p) => !p.active,
    // pausada na mao OU pelas faltas: as duas estao fora do ranking da forca
    pausadas: (p) => pausas.has(p.id),
    faltando: (p) => (faltas.get(p.id)?.faltas ?? 0) >= 2,
    devendo: (p) => situacoes.get(p.id)?.cor === 'devendo',
    novas: (p) => !forcaPorId.has(p.id),
    semfoto: (p) => !p.photo_url,
  }
  const contagem = (sit: FiltroDeSituacao) => data.players.filter(passa[sit]).length
  // a categoria e o nivel so aparecem quando ha mais de um em uso
  const categoriasEmUso = CATEGORIAS.filter((c) => data.players.some((p) => categoriaDe(p) === c.valor))
  const niveisEmUso = NIVEIS_DE_FORCA.filter((n) => [...forcaPorId.values()].some((f) => f.nivel.titulo === n.titulo))

  const termo = normalizar(busca)
  const filtrando = filtro.situacao !== 'todas' || filtro.categoria !== null || filtro.nivel !== null
  /** O nome de cada filtro ligado, para a linha embaixo do botao "Filtros". */
  const ativos = [
    filtro.situacao !== 'todas' ? SITUACOES.find((x) => x.valor === filtro.situacao)?.rotulo : null,
    filtro.categoria ? CATEGORIAS.find((c) => c.valor === filtro.categoria)?.rotulo : null,
    filtro.nivel,
  ].filter((x): x is string => !!x)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const notaDe = (p: Player) => forcaPorId.get(p.id)?.nota ?? -Infinity
  const sorted = [...data.players]
    .filter(
      (p) =>
        !termo ||
        normalizar(p.name).includes(termo) ||
        normalizar(p.nickname ?? '').includes(termo) ||
        (p.aliases ?? []).some((a) => normalizar(a).includes(termo)),
    )
    .filter(passa[filtro.situacao])
    .filter((p) => filtro.categoria === null || categoriaDe(p) === filtro.categoria)
    .filter((p) => filtro.nivel === null || forcaPorId.get(p.id)?.nivel.titulo === filtro.nivel)
    .sort(
      (a, b) =>
        (filtro.ordem === 'forca' ? notaDe(b) - notaDe(a) : 0) ||
        (filtro.ordem === 'faltas' ? (faltas.get(b.id)?.faltas ?? 0) - (faltas.get(a.id)?.faltas ?? 0) : 0) ||
        Number(b.active) - Number(a.active) ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )

  async function add() {
    const n = name.trim()
    if (!n) return
    if (precisaDeGenero && !generoDaNova) {
      onToast('Escolha se é do feminino ou do masculino')
      return
    }
    const p: Player = {
      id: uid(),
      ...(generoDaNova ? { genero: generoDaNova } : {}),
      name: n,
      photo_url: null,
      active: true,
      created_at: new Date().toISOString(),
      categoria: novaCategoria,
      pago_mes: null,
      pago_avulso: false,
      forca_inicial: forcaDaNova === mediaHoje ? null : forcaDaNova,
    }
    // mensalistas lotadas (dono, 07/11): entra como avulsa e vai para a lista de espera
    const { lotado, ...entrada } = entradaComo(data, novaCategoria, { feminino: LIGA.id === 'feminino' })
    if (lotado) Object.assign(p, entrada)
    await savePlayer(p)
    if (lotado) onToast(`Mensalistas lotadas: ${n} entrou como avulsa e está na lista de espera`)
    setName('')
    // a categoria fica para a proxima de proposito (costuma ser a mesma para
    // uma leva); a forca e de cada pessoa, e nao pode vazar
    setNovaForca(null)
    setNovaAberta(false)
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
      {canEdit && novaAberta && (
        <div className="card">
          <div className="row spread">
            <div className="section-title">➕ Nova atleta</div>
            <button
              className="btn ghost sm"
              onClick={() => {
                setName('')
                setNovaForca(null)
                setNovaAberta(false)
              }}
            >
              Cancelar
            </button>
          </div>
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
          <div style={{ marginTop: 8 }}>
            <EscolherGenero valor={generoDaNova} onChange={setGeneroDaNova} />
          </div>
          <div className="chips-scroll" style={{ marginTop: 3 }}>
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

          <ForcaInicial valor={forcaDaNova} onChange={setNovaForca} media={mediaHoje} />

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

      {aberta && (() => {
        const p = data.players.find((x) => x.id === aberta)
        if (!p) return null
        const nome = p.nickname?.trim() || p.name
        const pausa = pausas.get(p.id)
        const hoje = todayISO()
        const fechar = () => setAberta(null)
        return (
          <Modal title={nome} onClose={fechar}>
            <div className="row" style={{ marginBottom: 14 }}>
              <Avatar player={p} size={56} />
              <div className="grow" style={{ minWidth: 0 }}>
                {p.nickname?.trim() && p.nickname.trim() !== p.name && <div className="small muted ellipsis">{p.name}</div>}
                <SinalDePagamento jogadora={p} />
                {!p.active && <div className="tiny"><span className="pausada">inativa</span></div>}
              </div>
            </div>
            <input
              ref={fotoRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickPhoto(p, e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <div className="folha-acoes">
              <button onClick={() => { fechar(); setEditando(p) }}>✏️ Editar perfil</button>
              <button disabled={busy === p.id} onClick={() => fotoRef.current?.click()}>
                📷 {busy === p.id ? 'Salvando a foto…' : p.photo_url ? 'Trocar foto' : 'Pôr foto'}
              </button>
              {p.photo_url && <button disabled={busy === p.id} onClick={() => void removePhoto(p)}>🖼️ Remover foto</button>}
              {/* no misto, inativar e pausar sao do misto (misto.atletas): o campeonato nao muda */}
              {pausa === 'manual' ? (
                <button onClick={() => void savePlayer(fecharPausa(data, p, hoje))}>▶️ Despausar<small>Volta ao ranking da força</small></button>
              ) : pausa === 'faltas' ? (
                <button onClick={() => void savePlayer({ ...p, reativada_em: hoje })}>
                  ▶️ Despausar<small>Pausada por 2 faltas seguidas: volta ao ranking agora (ou sozinha ao jogar)</small>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!confirm(`Pausar ${nome}? Sai do ranking da força até despausar ou jogar de novo (as faltas continuam baixando a força).`)) return
                    void savePlayer({ ...p, pausas: [...(p.pausas ?? []), { de: hoje, ate: null }] })
                  }}
                >
                  ⏸️ Pausar<small>Só sai do ranking da força</small>
                </button>
              )}
              <button onClick={() => void savePlayer({ ...p, active: !p.active })}>
                {p.active ? '🚫 Inativar' : '✅ Ativar'}
                <small>{p.active ? 'Some da hora de montar o play; o histórico fica' : 'Volta para a hora de montar o play'}</small>
              </button>
              {/* juntar e apagar sao do campeonato da pessoa: o misto so le */}
              {!precisaDeGenero && (
                <button onClick={() => { fechar(); setJuntando(p) }}>🔗 Juntar com outra atleta<small>Quando a mesma pessoa foi cadastrada duas vezes</small></button>
              )}
            </div>
            {!precisaDeGenero && (
              <div className="folha-acoes perigo">
                <button
                  onClick={() => {
                    if (confirm(`Remover ${p.name}? O histórico de partidas dela continua salvo.`)) {
                      void deletePlayer(p.id)
                      fechar()
                    }
                  }}
                >
                  🗑 Remover atleta
                </button>
              </div>
            )}
          </Modal>
        )
      })()}

      <div className="card">
        <div className="row spread">
          <div className="section-title">👯 Jogadoras ({data.players.filter((p) => p.active).length} ativas)</div>
          {canEdit && !novaAberta && (
            <button className="btn pink sm" style={{ flex: 'none', whiteSpace: 'nowrap' }} onClick={() => setNovaAberta(true)}>➕ Nova atleta</button>
          )}
        </div>
        <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Nome, apelido ou outra grafia" style={{ marginBottom: 8 }} />
        {/* filtros numa folha (dono, 08/11): eram 3 fileiras de chips rolando para o lado em cima da lista */}
        <div className="row spread filtros-rodape">
          <button className={`chip ${filtrando ? 'on' : 'off'}`} onClick={() => setFiltrosAbertos(true)}>
            ⚙️ Filtros{filtrando && <span className="filtro-n">{ativos.length}</span>}
          </button>
          <div className="row" style={{ gap: 4 }} role="group" aria-label="Ordenar">
            {ORDENS.map((o) => (
              <button
                key={o.valor}
                className={`chip ${filtro.ordem === o.valor ? 'on' : 'off'}`}
                onClick={() => mudarFiltro({ ordem: o.valor })}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>
        <p className="tiny muted" style={{ margin: '6px 2px 0' }}>
          {filtrando || termo ? `${sorted.length} de ${data.players.length}` : plural(data.players.length, 'jogadora')}
          {ativos.length > 0 && ` · ${ativos.join(' · ')}`}
          {filtrando && (
            <>
              {' · '}
              <button className="linkish" onClick={() => mudarFiltro({ situacao: 'todas', categoria: null, nivel: null })}>
                limpar
              </button>
            </>
          )}
        </p>
        {filtrosAbertos && (
          <Modal title="Filtros" onClose={() => setFiltrosAbertos(false)}>
            <div className="filtros-meninas">
          <div className="filtro-rotulo">Situação</div>
          <div className="chips-folha">
            {SITUACOES.map((x) => {
              const n = contagem(x.valor)
              // filtro vazio nao aparece (menos o escolhido, para dar para sair dele)
              if (n === 0 && x.valor !== 'todas' && filtro.situacao !== x.valor) return null
              return (
                <button
                  key={x.valor}
                  className={`chip ${filtro.situacao === x.valor ? 'on' : 'off'}`}
                  onClick={() => mudarFiltro({ situacao: x.valor })}
                  title={x.explica}
                >
                  {x.rotulo} <span className="filtro-n">{n}</span>
                </button>
              )
            })}
          </div>
          {categoriasEmUso.length > 1 && (
            <>
            <div className="filtro-rotulo">Como paga</div>
            <div className="chips-folha">
              <button className={`chip ${filtro.categoria === null ? 'on' : 'off'}`} onClick={() => mudarFiltro({ categoria: null })}>
                Todos
              </button>
              {categoriasEmUso.map((c) => (
                <button
                  key={c.valor}
                  className={`chip ${filtro.categoria === c.valor ? 'on' : 'off'}`}
                  onClick={() => mudarFiltro({ categoria: filtro.categoria === c.valor ? null : c.valor })}
                >
                  {c.rotulo}
                </button>
              ))}
            </div>
            </>
          )}
          {niveisEmUso.length > 1 && (
            <>
            <div className="filtro-rotulo">Nível de força</div>
            <div className="chips-folha">
              <button className={`chip ${filtro.nivel === null ? 'on' : 'off'}`} onClick={() => mudarFiltro({ nivel: null })}>
                Todos
              </button>
              {niveisEmUso.map((n) => (
                <button
                  key={n.titulo}
                  className={`chip ${filtro.nivel === n.titulo ? 'on' : 'off'}`}
                  onClick={() => mudarFiltro({ nivel: filtro.nivel === n.titulo ? null : n.titulo })}
                >
                  {n.emoji} {n.titulo}
                </button>
              ))}
            </div>
            </>
          )}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              {filtrando && (
                <button className="btn ghost" onClick={() => mudarFiltro({ situacao: 'todas', categoria: null, nivel: null })}>
                  Limpar
                </button>
              )}
              <button className="btn pink grow" onClick={() => setFiltrosAbertos(false)}>
                Ver {plural(sorted.length, 'jogadora')}
              </button>
            </div>
          </Modal>
        )}
        {sorted.length === 0 ? (
          termo || filtrando ? (
            <Empty icon="🔎">
              Nenhuma jogadora{termo ? ` com “${busca.trim()}”` : ''}
              {filtrando ? ' nesse filtro' : ''}.
            </Empty>
          ) : (
            <Empty icon="👯">Cadastre as meninas do grupo para começar.</Empty>
          )
        ) : (
          <div className="stack">
            {sorted.map((p) => {
              const f = forcaPorId.get(p.id)
              return (
                // a linha inteira abre a folha com as acoes (dono, 08/11): antes eram 4 botoes e 3 links em cada linha
                <div
                  key={p.id}
                  className={canEdit ? 'atleta-linha tocavel' : 'atleta-linha'}
                  style={{ opacity: p.active ? 1 : 0.5 }}
                  {...(canEdit && {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `Opções de ${p.nickname?.trim() || p.name}`,
                    onClick: () => setAberta(p.id),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setAberta(p.id)
                      }
                    },
                  })}
                >
                  <div className="row">
                    <Avatar player={p} size={44} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }} className="ellipsis">
                        <NomeClicavel id={p.id}>{p.nickname?.trim() || p.name}</NomeClicavel>
                        {/* so no misto: de qual campeonato a pessoa e */}
                        {p.genero && <span className="tiny muted"> {p.genero === 'F' ? '♀' : '♂'}</span>}
                      </div>
                      {p.nickname?.trim() && p.nickname.trim() !== p.name && (
                        <div className="tiny muted ellipsis">{p.name}</div>
                      )}
                      <SinalDePagamento jogadora={p} semAcao />
                      {f ? (
                        // quebra a linha: com "provisória" e "pausada (2+ faltas)" ela passava da tela e a pagina inteira andava de lado
                        <div className="tiny" style={{ marginTop: 2 }}>
                          <span className="nowrap" style={{ color: f.nivel.cor, fontWeight: 800 }}>
                            {f.nivel.emoji} {f.nivel.titulo}
                          </span>
                          <span className="muted"> · força {f.nota}</span>
                          {f.provisoria && <span className="muted"> (provisória)</span>}
                          {f.pausada && <span className="muted"> · ⏸️ {f.pausada === 'manual' ? 'pausada' : 'pausada (2+ faltas)'}</span>}
                          {/* em linha propria: junto do nivel passava da tela no celular */}
                          {f.queda && (
                            <span className="muted" style={{ display: 'block', whiteSpace: 'normal' }}>
                              📉 {textoDaQueda(f.queda)}
                            </span>
                          )}
                        </div>
                      ) : (
                        // sem jogos nao ha linha de forca, mas a pausa aparece igual
                        pausas.get(p.id) === 'manual' && <div className="tiny muted">⏸️ pausada</div>
                      )}
                      {busy === p.id ? (
                        <div className="tiny muted">salvando foto…</div>
                      ) : (
                        !p.active && <div className="tiny"><span className="pausada">inativa</span></div>
                      )}
                    </div>
                    {canEdit && <span className="atleta-seta" aria-hidden="true">›</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Toque numa atleta para editar, trocar a foto, pausar, inativar, juntar ou remover.
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
                (categoriaDe(origem) !== categoriaDe(alvo)
                  ? `⚠️ ${origem.name} é ${categoriaDe(origem)} e ${alvo.name} é ${categoriaDe(alvo)}: fica a de ${alvo.name}.\n\n`
                  : '') +
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
  const [apelidos, setApelidos] = useState((jogadora.aliases ?? []).join('\n'))
  const mediaHoje = useMemo(() => mediaDaForca(data), [data])
  const [forcaInicial, setForcaInicial] = useState(jogadora.forca_inicial ?? mediaHoje)
  /** A nota de hoje, ja com as partidas -- para mostrar ao lado do ponto de partida. */
  const notaAtual = useMemo(() => notaDeForca(ratings(data).get(jogadora.id) ?? 2), [data, jogadora.id])

  const historico = useMemo(() => {
    const jogadas = playedMatches(data).filter((m) => jogadorasDaPartida(m).includes(jogadora.id))
    const dias = new Set(jogadas.map((m) => m.session_id)).size
    return { partidas: jogadas.length, dias }
  }, [data, jogadora.id])

  const limpo = semInvisiveis(nome).trim()
  const repetido = data.players.some(
    (p) => p.id !== jogadora.id && semInvisiveis(p.name).trim().toLowerCase() === limpo.toLowerCase(),
  )

  function salvar() {
    const lista = apelidos
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
    onSalvar({
      ...jogadora,
      name: limpo,
      nickname: apelido.trim() || null,
      aliases: [...new Set(lista)],
      // no misto, a forca inicial e a do misto (misto.atletas): mudar aqui nao
      // mexe no campeonato
      forca_inicial: forcaInicial === mediaHoje && jogadora.forca_inicial == null ? null : forcaInicial,
    })
  }

  const [verFinanceiro, setVerFinanceiro] = useState(false)

  return (
    <Modal title={`Perfil de ${jogadora.name}`} onClose={onClose}>
      {LIGA.id === 'feminino' && (
        <button className="btn ghost sm block" style={{ marginBottom: 12 }} onClick={() => setVerFinanceiro(true)}>📜 Histórico financeiro</button>
      )}
      {verFinanceiro && <HistoricoFinanceiro playerId={jogadora.id} onClose={() => setVerFinanceiro(false)} />}
      <label className="field">
        <span>Nome de cadastro</span>
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
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

      <p className="tiny muted" style={{ marginTop: 12 }}>
        💳 Como ela paga ({CATEGORIAS.find((c) => c.valor === categoriaDe(jogadora))?.rotulo}):{' '}
        {LIGA.id === 'misto'
          ? <>edite no <strong>Play de Todas</strong> ou no <strong>Play de Terça</strong>, de onde ela veio.</>
          : <>edite em <strong>Financeiro › Atletas</strong>.</>}
      </p>

      <ForcaInicial
        valor={forcaInicial}
        onChange={setForcaInicial}
        media={mediaHoje}
        atual={historico.partidas > 0 ? notaAtual : undefined}
      />
      {precisaDeGenero && (
        <p className="tiny muted" style={{ marginTop: 6 }}>
          👫 No misto, a força inicial é a que a pessoa tinha no campeonato
          {jogadora.misto_desde ? ` em ${new Date(jogadora.misto_desde).toLocaleDateString('pt-BR')}` : ' hoje'}. Mudar
          aqui vale só para o misto.
        </p>
      )}

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
        Os outros nomes dela na lista do grupo (<em>Ana</em>, <em>Aninha</em>): a importação acha a mesma pessoa.
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
function SinalDePagamento({ jogadora, semAcao }: { jogadora: Player; /** na linha da lista: a acao fica na folha */ semAcao?: boolean }) {
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
      {canEdit && !semAcao && categoria !== 'convidada' && (
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



type FiltroDeSituacao = 'todas' | 'ativas' | 'inativas' | 'pausadas' | 'faltando' | 'devendo' | 'novas' | 'semfoto'
type Filtro = {
  situacao: FiltroDeSituacao
  categoria: Categoria | null
  /** Titulo do nivel de forca (`NIVEIS_DE_FORCA`). */
  nivel: string | null
  ordem: 'nome' | 'forca' | 'faltas'
}

const CHAVE_DO_FILTRO = `${LIGA.prefixo}:meninas-filtro`
const FILTRO_PADRAO: Filtro = { situacao: 'todas', categoria: null, nivel: null, ordem: 'nome' }

const SITUACOES: { valor: FiltroDeSituacao; rotulo: string; explica: string }[] = [
  { valor: 'todas', rotulo: 'Todas', explica: 'Todo o cadastro' },
  { valor: 'ativas', rotulo: 'Ativas', explica: 'Aparecem na hora de montar o play' },
  { valor: 'inativas', rotulo: 'Inativas', explica: 'Fora do cadastro ativo; o histórico continua' },
  { valor: 'pausadas', rotulo: '⏸️ Pausadas', explica: 'Fora do ranking da força: pausadas na mão ou por 2 faltas seguidas' },
  { valor: 'faltando', rotulo: '📉 Faltando', explica: '2 ou mais faltas seguidas: perdendo força e fora do ranking' },
  { valor: 'devendo', rotulo: '💸 Devendo', explica: 'Bloqueadas pelo pagamento' },
  { valor: 'novas', rotulo: '🆕 Sem jogos', explica: 'Ainda não jogaram nenhuma partida' },
  { valor: 'semfoto', rotulo: '📷 Sem foto', explica: 'Sem foto no cadastro' },
]

const ORDENS: { valor: Filtro['ordem']; rotulo: string }[] = [
  { valor: 'nome', rotulo: 'A-Z' },
  { valor: 'forca', rotulo: '💪 Força' },
  { valor: 'faltas', rotulo: 'Faltas' },
]

function lerFiltro(): Filtro {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_DO_FILTRO) ?? 'null') as Partial<Filtro> | null
    if (!salvo) return FILTRO_PADRAO
    return {
      situacao: SITUACOES.some((x) => x.valor === salvo.situacao) ? (salvo.situacao as FiltroDeSituacao) : 'todas',
      categoria: CATEGORIAS.some((c) => c.valor === salvo.categoria) ? (salvo.categoria as Categoria) : null,
      nivel: NIVEIS_DE_FORCA.some((n) => n.titulo === salvo.nivel) ? (salvo.nivel as string) : null,
      ordem: ORDENS.some((o) => o.valor === salvo.ordem) ? (salvo.ordem as Filtro['ordem']) : 'nome',
    }
  } catch {
    return FILTRO_PADRAO
  }
}
