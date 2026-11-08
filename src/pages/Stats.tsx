import { useEffect, useMemo, useState } from 'react'
import DetalheDupla from '../components/DetalheDaDupla'
import PainelDuplas, { duplasDoRecorte } from '../components/PainelDuplas'
import PainelForca from '../components/PainelForca'
import PainelJogadora from '../components/PainelJogadora'
import { FolhaDoPeriodo } from '../components/StatsPecas'
import { ProvedorDePerfil } from '../components/NomeClicavel'
import { Empty } from '../components/ui'
import { aplicarBye, aplicarColocacao, computeStatsComPontos, playedMatches, pontosDeBye } from '../lib/stats'
import { colocacaoNoRecorte } from '../lib/campeonato'
import { rankingDeForca } from '../lib/forca'
import { applyBonuses, computeStreaks } from '../lib/streaks'
import { useStore } from '../lib/store'
import { monthLabel, monthOf } from '../lib/types'

type Modo = 'jogadora' | 'duplas' | 'forca'

const ROTULO_DO_MODO: Record<Modo, string> = { jogadora: 'Jogadora', duplas: 'Duplas', forca: 'Força' }

/**
 * A aba Desempenho (antes Stats), redesenhada em 08/11/2026: topo fixo e translucido com as tres vistas e o periodo
 * num chip que abre uma folha; cada vista e um painel (Jogadora, Duplas, Forca).
 */
export default function Stats({
  abrir,
  onAbriu,
}: { abrir?: Modo | { jogadora: string } | null; onAbriu?: () => void } = {}) {
  const { data, nameOf } = useStore()

  const months = useMemo(() => {
    const set = new Set(data.sessions.map((s) => monthOf(s.date)))
    return [...set].sort().reverse()
  }, [data.sessions])

  const [modo, setModo] = useState<Modo>(typeof abrir === 'string' ? abrir : 'jogadora')
  const [period, setPeriod] = useState<string>('all')
  const [playerId, setPlayerId] = useState<string>(abrir && typeof abrir === 'object' ? abrir.jogadora : '')
  /** As fichas abertas antes desta, para o "voltar". */
  const [anteriores, setAnteriores] = useState<string[]>([])

  // chegou de outra tela pedindo uma aba (a Força) ou a ficha de uma menina (o Ranking)
  useEffect(() => {
    if (!abrir) return
    if (typeof abrir === 'string') setModo(abrir)
    else {
      setModo('jogadora')
      setPlayerId(abrir.jogadora)
      setAnteriores([])
    }
    onAbriu?.()
  }, [abrir, onAbriu])

  const matches = useMemo(
    // o mes acompanha o ranking (so os plays que valem); o historico traz tudo, inclusive os plays avulsos
    () => playedMatches(data, period === 'all' ? {} : { month: period, ranked: true }),
    [data, period],
  )
  const streaks = useMemo(() => computeStreaks(data), [data])
  const stats = useMemo(() => {
    const awards = period === 'all' ? streaks.awards : streaks.awards.filter((a) => a.month === period)
    // partidas, V/D e games de TUDO (quem so jogou a fase de grupos jogou); os pontos so das partidas que pontuam
    const stats = computeStatsComPontos(data.sessions, matches)
    const bye = pontosDeBye(data.sessions, matches).porJogadora
    // no campeonato os pontos saem da colocacao final, nao do placar
    return aplicarColocacao(aplicarBye(applyBonuses(stats, awards), bye), colocacaoNoRecorte(data.sessions, matches))
  }, [data.sessions, matches, streaks, period])

  const comJogo = useMemo(
    () => [...data.players].filter((p) => (stats.get(p.id)?.matches ?? 0) > 0).map((p) => p.id),
    [data.players, stats],
  )
  // sem ninguem escolhida, abre na 1a da forca que nao esta pausada (antes era a primeira em ordem alfabetica)
  const topoDaForca = useMemo(
    () => rankingDeForca(data, nameOf).find((l) => !l.pausada && l.emAvaliacao === undefined && comJogo.includes(l.player_id))?.player_id,
    [data, nameOf, comJogo],
  )
  const selected = playerId || topoDaForca || comJogo[0] || data.players[0]?.id || ''

  if (data.players.length === 0) {
    return (
      <div className="card">
        <Empty icon="📊">Cadastre as jogadoras e registre um play para ver o desempenho.</Empty>
      </div>
    )
  }

  /** Tocar num nome dentro do Desempenho abre a ficha dela, guardando a anterior para o "voltar". */
  const abrirJogadora = (id: string) => {
    if (id === selected && modo === 'jogadora') return
    setAnteriores((a) => [...a, selected])
    setPlayerId(id)
    setModo('jogadora')
    window.scrollTo(0, 0)
  }
  const anterior = anteriores[anteriores.length - 1]
  function voltar() {
    setAnteriores((a) => a.slice(0, -1))
    if (anterior) setPlayerId(anterior)
  }

  const rotuloDoPeriodo = period === 'all' ? '🏅 Histórico' : monthLabel(period)

  return (
    <ProvedorDePerfil value={abrirJogadora}>
      <div className="st-topo">
        <div className="st-topo-linha">
          <h2>Desempenho</h2>
          {modo === 'forca' ? (
            <span className="st-periodo-fixo">Atravessa o ano</span>
          ) : (
            <FolhaDoPeriodo
              periodo={period}
              rotulo={rotuloDoPeriodo}
              meses={months.map((m, i) => ({ id: m, rotulo: i === 0 ? `${monthLabel(m)} (mês atual)` : monthLabel(m) }))}
              onEscolher={setPeriod}
            />
          )}
        </div>
        <div className="st-seg" role="tablist">
          {(Object.keys(ROTULO_DO_MODO) as Modo[]).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={modo === id} className={modo === id ? 'on' : ''} onClick={() => setModo(id)}>
              {ROTULO_DO_MODO[id]}
            </button>
          ))}
        </div>
      </div>

      {modo === 'forca' ? (
        <PainelForca />
      ) : modo === 'jogadora' ? (
        <PainelJogadora
          selected={selected}
          setPlayerId={setPlayerId}
          anterior={anterior}
          onVoltar={voltar}
          matches={matches}
          stats={stats}
          streaks={streaks}
          period={period}
          comJogo={comJogo}
        />
      ) : (
        // nas duplas o nome nao abre a ficha individual (dono, 08/11): tocar na dupla abre so o stats dela
        <ProvedorDePerfil value={null}>
          <PainelDuplas matches={matches} />
        </ProvedorDePerfil>
      )}
    </ProvedorDePerfil>
  )
}

/** O perfil da dupla pelo historico inteiro, para abrir de fora do Desempenho (a forca da tela inicial). */
export function PerfilDaDupla({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const { data } = useStore()
  const matches = useMemo(() => playedMatches(data, {}), [data])
  const duo = useMemo(
    () => duplasDoRecorte(data.sessions, matches).find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a)),
    [data.sessions, matches, a, b],
  )
  if (!duo) return null
  // aberto da tela inicial: os nomes tambem nao levam a ficha individual (dono, 08/11)
  return (
    <ProvedorDePerfil value={null}>
      <DetalheDupla duo={duo} matches={matches} onClose={onClose} />
    </ProvedorDePerfil>
  )
}
