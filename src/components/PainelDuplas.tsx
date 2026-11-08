import { useMemo, useState, type ReactNode } from 'react'
import CampoDeBusca from './CampoDeBusca'
import DetalheDupla from './DetalheDaDupla'
import { Avatar, Empty } from './ui'
import { ListaExpansivel, PosicaoComSeta, SetaPequena } from './StatsPecas'
import { PLAYS_EM_AVALIACAO, emAvaliacao, forcaDeDuplas } from '../lib/forca'
import { movimentoDasDuplas } from '../lib/movimentoDoStats'
import { duplasDoRecorte } from '../lib/duplasDoRecorte'
import type { DuoStat, playedMatches } from '../lib/stats'
import { normalizar } from '../lib/roster'
import { useStore } from '../lib/store'

type Ordem = 'jogos' | 'aproveitamento' | 'pontos' | 'forca' | 'entrosamento'

const ORDENS: [Ordem, string][] = [
  ['forca', '💪 Mais fortes'],
  ['entrosamento', '🤝 Mais entrosadas'],
  ['pontos', 'Mais pontos'],
  ['aproveitamento', 'Melhor %'],
  ['jogos', 'Mais jogos'],
]
const TITULO: Record<Ordem, string> = {
  forca: 'As duplas mais fortes',
  entrosamento: 'As duplas mais entrosadas',
  pontos: 'As duplas com mais pontos',
  aproveitamento: 'As duplas com melhor aproveitamento',
  jogos: 'As duplas com mais jogos',
}
const MEDALHAS = ['🥇', '🥈', '🥉']
const LINHAS_DE_CARA = 5

const sinal = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/** O Stats › Duplas novo (08/11/2026): podio das tres, lista com seta de posicao, chips de ordem, lupa e "Ver todas". */
export default function PainelDuplas({ matches }: { matches: ReturnType<typeof playedMatches> }) {
  const { data, nameOf, playerById, canEdit } = useStore()
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [ordem, setOrdem] = useState<Ordem>('forca')
  const [aberta, setAberta] = useState<DuoStat | null>(null)

  const duplas = useMemo(() => duplasDoRecorte(data.sessions, matches), [matches, data.sessions])
  // a forca sai do historico INTEIRO da dupla, e nao do periodo filtrado: e o que as duas renderam juntas desde sempre
  const forcas = useMemo(() => forcaDeDuplas(data), [data])
  const mov = useMemo(() => movimentoDasDuplas(data, nameOf, canEdit), [data, nameOf, canEdit])
  // a forca da dupla parte da media das duas: com uma em avaliacao, entregaria a dela
  const avaliacao = useMemo(() => emAvaliacao(data), [data])
  const oculta = (d: { a: string; b: string }) => !canEdit && (avaliacao.has(d.a) || avaliacao.has(d.b))
  const forcaDe = (d: DuoStat) => (oculta(d) ? 0 : forcas.get(d.key)?.nota ?? 1500)
  // a oculta e a que ainda nao tem forca vao para o fim
  const entrosamentoDe = (d: DuoStat) => {
    const f = forcas.get(d.key)
    return oculta(d) || !f ? -Infinity : f.entrosamento
  }
  const pctDe = (d: DuoStat) => (d.matches === 0 ? 0 : d.wins / d.matches)

  const ordenadas = useMemo(
    () =>
      [...duplas].sort((a, b) => {
        if (ordem === 'forca') return forcaDe(b) - forcaDe(a) || b.matches - a.matches
        if (ordem === 'entrosamento') return entrosamentoDe(b) - entrosamentoDe(a) || b.matches - a.matches
        if (ordem === 'pontos') return b.points - a.points || b.matches - a.matches
        if (ordem === 'aproveitamento') return pctDe(b) - pctDe(a) || b.matches - a.matches
        return b.matches - a.matches || b.wins - a.wins
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duplas, ordem, forcas, avaliacao, canEdit],
  )

  if (duplas.length === 0) {
    return (
      <div className="st-card">
        <Empty icon="🤝">Nenhuma dupla se formou neste período ainda.</Empty>
      </div>
    )
  }

  // as setas so valem na ordem da forca (a lista das setas e a da forca)
  const temAnterior = ordem === 'forca' && mov.temAnterior
  const posicao = new Map(ordenadas.map((d, i) => [d.key, i + 1]))

  /** O numero grande da ordem escolhida. */
  const principal = (d: DuoStat): ReactNode => {
    if ((ordem === 'forca' || ordem === 'entrosamento') && oculta(d)) return '🔍'
    if (ordem === 'forca') return forcas.get(d.key)?.nota ?? '—'
    if (ordem === 'entrosamento') return forcas.get(d.key) ? sinal(forcas.get(d.key)!.entrosamento) : '—'
    if (ordem === 'pontos') return d.points
    if (ordem === 'aproveitamento') return `${Math.round(pctDe(d) * 100)}%`
    return d.matches
  }

  const linha = (d: DuoStat): ReactNode => {
    const f = forcas.get(d.key)
    const ent = f && !oculta(d) ? f.entrosamento : null
    return (
      <button key={d.key} type="button" className="st-linha" onClick={() => setAberta(d)}>
        <PosicaoComSeta pos={posicao.get(d.key) as number} v={mov.porId.get(d.key)} temAnterior={temAnterior} />
        <span className="st-par">
          <Avatar player={playerById(d.a)} size={36} />
          <Avatar player={playerById(d.b)} size={36} />
        </span>
        <span className="st-nome">
          <b>{nameOf(d.a)} + {nameOf(d.b)}</b>
          <span>
            {oculta(d)
              ? `🔍 ${[d.a, d.b].filter((id) => avaliacao.has(id)).map((id) => `${nameOf(id)} ${avaliacao.get(id)}/${PLAYS_EM_AVALIACAO}`).join(', ')}`
              : `${d.wins}V ${d.losses}D · ${Math.round(pctDe(d) * 100)}%${d.matches === 1 ? ' · 1 jogo' : ''}`}
          </span>
        </span>
        <span className="st-valor">
          <b>{principal(d)}</b>
          {ent !== null && (ordem === 'forca' || ordem === 'entrosamento') && (
            <span className={`st-chip-ent ${ent > 0 ? '' : ent < 0 ? 'neg' : 'zero'}`}>{sinal(ent)}</span>
          )}
        </span>
      </button>
    )
  }

  const termo = normalizar(busca.trim())
  const achadas = termo ? ordenadas.filter((d) => normalizar(`${nameOf(d.a)} ${nameOf(d.b)}`).includes(termo)) : []
  const podio = ordenadas.slice(0, 3)
  const ordemDoPodio = [1, 0, 2] // 2º, 1º, 3º na tela
  const resto = ordenadas.slice(3).map(linha)

  return (
    <>
      <div className="st-chips-linha">
        <div className="chips-scroll">
          {ORDENS.map(([id, txt]) => (
            <button key={id} type="button" className={`chip ${ordem === id ? 'on' : 'off'}`} style={{ flex: 'none' }} onClick={() => setOrdem(id)}>
              {txt}
            </button>
          ))}
        </div>
        <button type="button" className="st-lupa-redonda" aria-label="Buscar dupla" aria-pressed={buscando} onClick={() => setBuscando(!buscando)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
          </svg>
        </button>
      </div>
      {buscando && (
        <div className="st-busca-linha">
          <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome" />
        </div>
      )}

      {termo ? (
        <div className="st-card">
          {achadas.length === 0 ? <Empty icon="🔎">Nenhuma dupla com esse nome.</Empty> : <div className="st-lista">{achadas.map(linha)}</div>}
        </div>
      ) : (
        <>
          <div className="st-rotulo">{TITULO[ordem]} · {duplas.length} já jogaram juntas</div>
          <div className="st-podio">
            {ordemDoPodio.map((idx) => {
              const d = podio[idx]
              if (!d) return <div key={idx} />
              const lugar = idx + 1
              return (
                <button key={d.key} type="button" className={`st-lugar l${lugar}`} onClick={() => setAberta(d)}>
                  <span className="med" aria-hidden="true">{MEDALHAS[idx]}</span>
                  <span className="st-par">
                    <Avatar player={playerById(d.a)} size={lugar === 1 ? 42 : 36} />
                    <Avatar player={playerById(d.b)} size={lugar === 1 ? 42 : 36} />
                  </span>
                  <b className="nome">{nameOf(d.a)}<small>+ {nameOf(d.b)}</small></b>
                  <span className="n">{principal(d)}{ordem === 'forca' && <SetaPequena v={mov.porId.get(d.key)} />}</span>
                  {(ordem === 'forca' || ordem === 'entrosamento') && forcas.get(d.key) && !oculta(d) && (
                    <span className={`st-chip-ent ${forcas.get(d.key)!.entrosamento > 0 ? '' : forcas.get(d.key)!.entrosamento < 0 ? 'neg' : 'zero'}`}>
                      {sinal(forcas.get(d.key)!.entrosamento)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {resto.length > 0 && (
            <div className="st-card">
              <ListaExpansivel itens={resto} visiveis={LINHAS_DE_CARA} rotulo="as duplas" total={ordenadas.length} />
            </div>
          )}
          <div className="st-legenda">
            {ordem === 'forca' && <div><span className="st-sobe">▲</span><span className="st-desce">▼</span> posição em relação ao último play</div>}
            <div>
              <span className="st-chip-ent">+17</span><span className="st-chip-ent neg">−8</span> entrosamento: quanto rendem juntas além da média das duas
            </div>
            <div>com menos de 6 jogos juntas a força é provisória (marcada no perfil)</div>
          </div>
        </>
      )}

      {aberta && <DetalheDupla duo={aberta} matches={matches} onClose={() => setAberta(null)} />}
    </>
  )
}
