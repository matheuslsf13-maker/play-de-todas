import { useMemo, useState } from 'react'
import GraficoDaDupla from './GraficoDaDupla'
import HistoricoDePartidas from './HistoricoDePartidas'
import { Avatar, Modal } from './ui'
import { JOGOS_PARA_ENTROSAMENTO, PLAYS_EM_AVALIACAO, emAvaliacao, forcaDeDuplas, nivelDeForca } from '../lib/forca'
import { duoMatches, mediaDaForca, type DuoStat, type playedMatches } from '../lib/stats'
import { useStore } from '../lib/store'
import { plural } from '../lib/types'

type Aba = 'resumo' | 'rivais' | 'partidas'
type OrdemDeRival = 'jogos' | 'pct' | 'dificeis'
type Rival = { key: string; a: string; b: string; v: number; d: number }

/** Quantas rivais a aba Rivais mostra antes do "Ver todas". */
const RIVAIS_DE_CARA = 5

/**
 * O PERFIL DA DUPLA (modelo B aprovado em 08/11/2026): cabecalho curto (fotos, nome, jogos e a forca) e tres abas --
 * Resumo (entrosamento antes e depois, numeros e o grafico), Rivais e Partidas. Para quem nao e admin, a forca da
 * dupla com alguem em avaliacao fica oculta (a media das duas entregaria a nota dela).
 */
export default function DetalheDaDupla({
  duo,
  matches,
  onClose,
}: {
  duo: DuoStat
  matches: ReturnType<typeof playedMatches>
  onClose: () => void
}) {
  const { data, nameOf, playerById, canEdit } = useStore()
  const forca = useMemo(() => forcaDeDuplas(data).get(duo.key), [data, duo.key])
  const avaliacao = useMemo(() => emAvaliacao(data), [data])
  const oculta = !canEdit && (avaliacao.has(duo.a) || avaliacao.has(duo.b))
  const jogos = useMemo(() => duoMatches(matches, duo.a, duo.b), [matches, duo])
  const pct = duo.matches === 0 ? 0 : Math.round((duo.wins / duo.matches) * 100)
  const [aba, setAba] = useState<Aba>('resumo')
  const media = mediaDaForca(data)
  const nivel = forca ? nivelDeForca(forca.nota, media) : null

  const rivais = useMemo(() => {
    const m = new Map<string, Rival>()
    for (const j of jogos) {
      const somosA = j.team_a.includes(duo.a) && j.team_a.includes(duo.b)
      const outros = (somosA ? j.team_b : j.team_a) as [string, string]
      const key = [...outros].sort().join('|')
      const e = m.get(key) ?? { key, a: outros[0], b: outros[1], v: 0, d: 0 }
      const venceu = somosA ? (j.score_a as number) > (j.score_b as number) : (j.score_b as number) > (j.score_a as number)
      if (venceu) e.v++
      else e.d++
      m.set(key, e)
    }
    return [...m.values()]
  }, [jogos, duo])

  return (
    <Modal title="Perfil da dupla" onClose={onClose}>
      <div className="pd-cabecalho">
        <span className="pd-par">
          <Avatar player={playerById(duo.a)} size={56} />
          <Avatar player={playerById(duo.b)} size={56} />
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="pd-nome">
            {nameOf(duo.a)} + {nameOf(duo.b)}
          </div>
          <div className="pd-sub">
            {plural(duo.matches, 'jogo')} · {duo.wins}–{duo.losses} · {pct}%
          </div>
        </div>
        {forca && !oculta && (
          <div className="pd-forca" style={{ color: nivel?.cor }}>
            <small>Força</small>
            <b>{forca.nota}</b>
          </div>
        )}
      </div>

      <div className="pd-abas" role="tablist">
        {(['resumo', 'rivais', 'partidas'] as Aba[]).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}>
            {id === 'resumo' ? 'Resumo' : id === 'rivais' ? 'Rivais' : 'Partidas'}
          </button>
        ))}
      </div>

      {aba === 'resumo' && (
        <>
          {forca && oculta && (
            <div className="pd-cartao">
              <div className="pd-rotulo">Força em avaliação</div>
              <p className="tiny muted" style={{ margin: 0 }}>
                🔍{' '}
                {[duo.a, duo.b]
                  .filter((id) => avaliacao.has(id))
                  .map((id) => `${nameOf(id)} jogou ${avaliacao.get(id)} de ${PLAYS_EM_AVALIACAO} plays`)
                  .join(', ')}
                . A força da dupla aparece depois disso.
              </p>
            </div>
          )}
          {forca && !oculta && <Entrosamento base={forca.base} nota={forca.nota} entrosamento={forca.entrosamento} jogos={forca.jogos} provisoria={forca.provisoria} />}
          <div className="pd-kpis">
            <div><b>{duo.wins}–{duo.losses}</b><small>V–D</small></div>
            <div><b>{pct}%</b><small>Aproveit.</small></div>
            <div><b>{duo.points}</b><small>Pontos</small></div>
          </div>
          {!oculta && (
            <div className="pd-cartao">
              <GraficoDaDupla data={data} a={duo.a} b={duo.b} />
            </div>
          )}
        </>
      )}

      {aba === 'rivais' && <AbaRivais rivais={rivais} />}

      {aba === 'partidas' && <HistoricoDePartidas partidas={jogos} dupla={[duo.a, duo.b]} semForca={oculta} />}
    </Modal>
  )
}

/** Antes e depois: a media das duas, quanto a dupla rende a mais (ou a menos) e a forca de verdade. */
function Entrosamento({
  base,
  nota,
  entrosamento,
  jogos,
  provisoria,
}: {
  base: number
  nota: number
  entrosamento: number
  jogos: number
  provisoria: boolean
}) {
  const sinal = entrosamento > 0 ? '▲' : entrosamento < 0 ? '▼' : '±'
  const cor = entrosamento > 0 ? 'pos' : entrosamento < 0 ? 'neg' : 'zero'
  const frase =
    entrosamento > 0
      ? 'Rendem mais juntas do que a força de cada uma prevê.'
      : entrosamento < 0
        ? 'Rendem menos juntas do que a força de cada uma prevê.'
        : 'Rendem juntas o que a força de cada uma prevê.'
  return (
    <div className="pd-cartao">
      <div className="pd-rotulo">Entrosamento</div>
      <div className="pd-antes-depois">
        <div className="pd-numero">
          <small>Média das duas</small>
          <b>{base}</b>
        </div>
        <div className={`pd-seta ${cor}`}>
          <span aria-hidden="true">→</span>
          <b>
            <small>{sinal}</small>
            {Math.abs(entrosamento)}
          </b>
        </div>
        <div className={`pd-numero juntas ${cor}`}>
          <small>Juntas</small>
          <b>{nota}</b>
        </div>
      </div>
      <p className="pd-nota">
        {frase}
        {provisoria && ` Com ${JOGOS_PARA_ENTROSAMENTO} jogos juntas o número deixa de ser provisório.`}
      </p>
      {provisoria && (
        <span className="pd-pilula">
          Provisória · {jogos} de {JOGOS_PARA_ENTROSAMENTO} jogos
        </span>
      )}
    </div>
  )
}

function AbaRivais({ rivais }: { rivais: Rival[] }) {
  const { nameOf, playerById } = useStore()
  const [ordem, setOrdem] = useState<OrdemDeRival>('jogos')
  const [todas, setTodas] = useState(false)
  if (rivais.length === 0) return <p className="tiny muted">Ainda sem partidas contra outras duplas.</p>

  const taxa = (r: Rival) => r.v / (r.v + r.d)
  const lista = [...rivais].sort((x, y) =>
    ordem === 'pct'
      ? taxa(y) - taxa(x) || y.v + y.d - (x.v + x.d)
      : ordem === 'dificeis'
        ? y.d - x.d || taxa(x) - taxa(y)
        : y.v + y.d - (x.v + x.d) || y.v - x.v,
  )
  const maisEnfrentada = [...rivais].sort((x, y) => y.v + y.d - (x.v + x.d) || y.v - x.v)[0]
  const maisDificil = [...rivais].filter((r) => r.d > 0).sort((x, y) => y.d - x.d || taxa(x) - taxa(y))[0]
  const vistas = todas ? lista : lista.slice(0, RIVAIS_DE_CARA)

  const nomes = (r: Rival) => `${nameOf(r.a)} + ${nameOf(r.b)}`
  return (
    <>
      <div className="chips-scroll" style={{ marginBottom: 10 }}>
        {([['jogos', 'Mais jogos'], ['pct', 'Melhor %'], ['dificeis', 'Mais difíceis']] as [OrdemDeRival, string][]).map(([id, txt]) => (
          <button key={id} type="button" className={`chip ${ordem === id ? 'on' : 'off'}`} style={{ flex: 'none' }} onClick={() => setOrdem(id)}>
            {txt}
          </button>
        ))}
      </div>
      <div className="pd-destaques">
        <div>
          <small>Mais enfrentada</small>
          <b>{nomes(maisEnfrentada)}</b>
          <em>{plural(maisEnfrentada.v + maisEnfrentada.d, 'jogo')} · {maisEnfrentada.v}–{maisEnfrentada.d}</em>
        </div>
        <div>
          <small>Rival mais difícil</small>
          <b>{maisDificil ? nomes(maisDificil) : 'nenhuma ainda'}</b>
          <em>{maisDificil ? `${maisDificil.v}–${maisDificil.d}` : 'sem derrotas'}</em>
        </div>
      </div>
      <div className="pd-cartao">
        <div className="pd-rotulo">Contra quem jogaram · {rivais.length}</div>
        {vistas.map((r) => {
          const pct = Math.round(taxa(r) * 100)
          return (
            <div key={r.key} className="pd-rival">
              <span className="pd-par mini">
                <Avatar player={playerById(r.a)} size={30} />
                <Avatar player={playerById(r.b)} size={30} />
              </span>
              <span className="pd-rival-nome">
                <b>{nomes(r)}</b>
                <i><u style={{ width: `${pct}%` }} /></i>
              </span>
              <span className={`pd-rival-placar ${r.v > r.d ? 'pos' : r.v < r.d ? 'neg' : 'zero'}`}>
                {r.v}–{r.d}
                <small>{pct}%</small>
              </span>
            </div>
          )
        })}
        {lista.length > RIVAIS_DE_CARA && (
          <button type="button" className="pd-ver-mais" aria-expanded={todas} onClick={() => setTodas(!todas)}>
            {todas ? 'Recolher' : `Ver todas (${lista.length})`} <i>{todas ? '▴' : '▾'}</i>
          </button>
        )}
      </div>
    </>
  )
}
