import { useMemo, useState } from 'react'
import { CATEGORIAS, type Categoria } from '../lib/mensalidade'
import { conciliar, parseRoster, precisaConferir, type ItemDaLista } from '../lib/roster'
import { useStore } from '../lib/store'
import { uid, type Player } from '../lib/types'
import { Avatar, Modal } from './ui'

type Resultado = { criados: string[]; apelidos: { playerId: string; alias: string }[] }

/**
 * Cola a lista de confirmacao do grupo e transforma em presenca no play:
 * casa os nomes com a base, deixa a organizadora conferir os duvidosos e
 * cria quem ainda nao existe.
 */
export default function ImportarLista({
  onAplicar,
  modo = 'play',
  onClose,
  onToast,
}: {
  onAplicar?: (playerIds: string[]) => void
  /** `play` marca presenca; `cadastro` so cria quem falta, na aba Meninas. */
  modo?: 'play' | 'cadastro'
  onClose: () => void
  onToast: (m: string) => void
}) {
  const { data, savePlayer, deletePlayer } = useStore()
  const [texto, setTexto] = useState('')
  const [itens, setItens] = useState<ItemDaLista[] | null>(null)
  const [feito, setFeito] = useState<Resultado | null>(null)

  const ordenadas = useMemo(
    () => [...data.players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [data.players],
  )

  function conferir() {
    const nomes = parseRoster(texto)
    if (nomes.length === 0) {
      onToast('Não encontrei nomes nessa lista')
      return
    }
    setItens(conciliar(nomes, data.players))
  }

  /** Categoria de quem a lista criar. Quem ja existe mantem a dela. */
  const [categoriaNovas, setCategoriaNovas] = useState<Categoria>('isenta')

  function trocar(idx: number, valor: string) {
    setItens((atual) =>
      (atual ?? []).map((it, i) => (i === idx ? { ...it, vincularA: valor === 'nova' ? null : valor } : it)),
    )
  }

  function aplicar() {
    if (!itens) return
    const escolhidas: string[] = []
    const criados: string[] = []
    const apelidos: { playerId: string; alias: string }[] = []

    for (const it of itens) {
      if (it.vincularA) {
        escolhidas.push(it.vincularA)
        // guarda a grafia da lista, para a proxima importacao reconhecer sozinho
        const p = data.players.find((x) => x.id === it.vincularA)
        if (p && p.name.toLowerCase() !== it.texto.toLowerCase() && !(p.aliases ?? []).includes(it.texto)) {
          savePlayer({ ...p, aliases: [...(p.aliases ?? []), it.texto] })
          apelidos.push({ playerId: p.id, alias: it.texto })
        }
      } else {
        const nova: Player = {
          id: uid(),
          name: it.texto,
          photo_url: null,
          active: true,
          created_at: new Date().toISOString(),
          categoria: categoriaNovas,
          pago_mes: null,
          pago_avulso: false,
          aliases: [],
        }
        savePlayer(nova)
        escolhidas.push(nova.id)
        criados.push(nova.id)
      }
    }
    onAplicar?.(escolhidas)
    setFeito({ criados, apelidos })
  }

  function desfazer() {
    if (!feito) return
    for (const id of feito.criados) deletePlayer(id)
    for (const { playerId, alias } of feito.apelidos) {
      const p = data.players.find((x) => x.id === playerId)
      if (p) savePlayer({ ...p, aliases: (p.aliases ?? []).filter((a) => a !== alias) })
    }
    onAplicar?.([])
    setFeito(null)
    setItens(null)
    onToast('Importação desfeita')
  }

  /* ---------------------------------------------------- depois de aplicar */
  if (feito) {
    return (
      <Modal title="Lista importada" onClose={onClose}>
        <div className="banner info" style={{ marginTop: 0 }}>
          {modo === 'play' ? (
            <>✅ <strong>{(itens ?? []).length} jogadoras</strong> marcadas para este play.</>
          ) : (
            <>✅ Conferi <strong>{(itens ?? []).length} nomes</strong> da lista.</>
          )}
          {feito.criados.length > 0 && <> {feito.criados.length} foram criadas agora.</>}
          {feito.apelidos.length > 0 && <> {feito.apelidos.length} grafia(s) guardada(s) para a próxima vez.</>}
        </div>
        {feito.criados.length > 0 && (
          <>
            <div className="section-title">➕ Criadas nesta importação</div>
            <div className="stack">
              {feito.criados.map((id) => {
                const p = data.players.find((x) => x.id === id)
                return (
                  <div className="row" key={id}>
                    <Avatar player={p} size={30} />
                    <span className="grow ellipsis">{p?.name ?? '—'}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
        <button className="btn ghost block" style={{ marginTop: 12 }} onClick={desfazer}>
          ↩️ Desfazer esta importação
        </button>
        <button className="btn pink block" style={{ marginTop: 8 }} onClick={onClose}>
          Pronto
        </button>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Criou uma repetida? Junte as duas no 🔗 da aba <strong>Meninas</strong>.
        </p>
      </Modal>
    )
  }

  /* ------------------------------------------------------- conferir nomes */
  if (itens) {
    const conferir = itens.filter(precisaConferir).length
    const novas = itens.filter((i) => !i.vincularA).length
    return (
      <Modal title="Confira a lista" onClose={onClose}>
        <div className={`banner ${conferir ? 'warn' : 'info'}`} style={{ marginTop: 0 }}>
          {conferir === 0 ? (
            <>Reconheci todas as {itens.length} jogadoras. Confira e aplique.</>
          ) : (
            <>
              Reconheci <strong>{itens.length - conferir}</strong> de {itens.length}.
              As <strong>{conferir}</strong> destacadas abaixo eu não tenho certeza — diga se é alguém
              que já joga ou se é atleta nova.
            </>
          )}
        </div>

        <div className="stack">
          {itens.map((it, idx) => {
            const atencao = precisaConferir(it)
            const resto = ordenadas.filter((p) => !it.sugestoes.some((s) => s.player.id === p.id))
            return (
              <div key={idx} className={`import-row${atencao ? ' atencao' : ''}`}>
                <div className="row" style={{ gap: 8 }}>
                  <strong className="grow ellipsis">{it.texto}</strong>
                  <span className="tiny nowrap" style={{ fontWeight: 800, color: atencao ? 'var(--orange)' : 'var(--teal)' }}>
                    {it.origem === 'exata' && 'já cadastrada'}
                    {it.origem === 'apelido' && 'apelido conhecido'}
                    {it.origem === 'parecida' && !atencao && 'reconhecida'}
                    {atencao && (it.vincularA ? 'confira' : 'nova?')}
                  </span>
                </div>
                <select
                  className="select"
                  style={{ marginTop: 6 }}
                  value={it.vincularA ?? 'nova'}
                  onChange={(e) => trocar(idx, e.target.value)}
                >
                  <option value="nova">➕ Criar "{it.texto}" como atleta nova</option>
                  {it.sugestoes.length > 0 && (
                    <optgroup label="Parece com">
                      {it.sugestoes.map((s) => (
                        <option key={s.player.id} value={s.player.id}>
                          É a {s.player.name} ({Math.round(s.score * 100)}%)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Outras jogadoras">
                    {resto.map((p) => (
                      <option key={p.id} value={p.id}>É a {p.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )
          })}
        </div>

        {novas > 0 && (
          <div className="card" style={{ marginTop: 14, marginBottom: 0 }}>
            <div className="section-title" style={{ fontSize: 13 }}>
              Como {novas === 1 ? 'a nova jogadora paga' : 'as novas jogadoras pagam'}
            </div>
            <div className="chips-scroll">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.valor}
                  className={`chip ${categoriaNovas === c.valor ? 'on' : 'off'}`}
                  style={{ flex: 'none' }}
                  onClick={() => setCategoriaNovas(c.valor)}
                >
                  {c.rotulo}
                </button>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 6, marginBottom: 0 }}>
              {CATEGORIAS.find((c) => c.valor === categoriaNovas)?.explica}. Vale só para quem for
              criada agora — quem já está cadastrada mantém a categoria dela.
            </p>
          </div>
        )}

        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn ghost grow" onClick={() => setItens(null)}>← Voltar</button>
          <button className="btn pink grow" onClick={aplicar}>
            Confirmar {itens.length} {novas > 0 ? `(${novas} nova${novas > 1 ? 's' : ''})` : ''}
          </button>
        </div>
      </Modal>
    )
  }

  /* --------------------------------------------------------- colar a lista */
  return (
    <Modal
      title={modo === 'play' ? 'Colar lista do grupo' : 'Cadastrar várias de uma vez'}
      onClose={onClose}
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        Cole aqui a lista de confirmação do WhatsApp, do jeito que veio. Eu tiro a numeração e
        procuro cada nome na base de jogadoras.
      </p>
      <textarea
        className="input"
        rows={9}
        placeholder={'1- Ingryd\n2- Pamella\n3- Ana Christo\n4- Tete\n…'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        style={{ resize: 'vertical', fontFamily: 'inherit' }}
      />
      <button className="btn pink block" style={{ marginTop: 12 }} disabled={!texto.trim()} onClick={conferir}>
        🔎 Conferir nomes
      </button>
    </Modal>
  )
}
