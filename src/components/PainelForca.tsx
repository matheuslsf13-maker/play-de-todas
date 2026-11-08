import { useMemo, useState, type ReactNode } from 'react'
import CampoDeBusca from './CampoDeBusca'
import { LIGA } from '../liga'
import { Avatar, Empty } from './ui'
import { NomeClicavel, useAbrirPerfil } from './NomeClicavel'
import { ListaExpansivel, PosicaoComSeta, SetaPequena } from './StatsPecas'
import { NIVEIS_DE_FORCA, PLAYS_EM_AVALIACAO, avaliacaoCurta, rankingDeForca, textoDaQueda, type LinhaDeForca } from '../lib/forca'
import { movimentoDaForca } from '../lib/movimentoDoStats'
import { mediaDaForca } from '../lib/stats'
import { normalizar } from '../lib/roster'
import { useStore } from '../lib/store'

/** Linhas de cara na lista por nivel, antes do "Ver todas". */
const LINHAS_DE_CARA = 5
const MEDALHAS = ['🥇', '🥈', '🥉']

/** "+31" / "−41" / "0": a distancia ate a media do grupo. */
function textoDaDistancia(dif: number): string {
  return dif > 0 ? `+${dif}` : dif < 0 ? `−${-dif}` : '0'
}

/**
 * O ranking de forca do grupo (Stats novo, 08/11/2026): cartao da media com quantas ha em cada nivel, podio com setas,
 * e a lista por nivel (o nivel e o titulo do bloco), com busca e "Ver todas".
 *
 * De proposito sem periodo: forca nao e desempenho do mes, e o que o app aprendeu sobre a jogadora desde sempre.
 */
export default function PainelForca() {
  const { data, nameOf, playerById, canEdit } = useStore()
  const abrirPerfil = useAbrirPerfil()
  const [buscando, setBuscando] = useState(false)
  const [busca, setBusca] = useState('')

  // quem esta pausada (na mao ou por faltas) fica fora do ranking da forca; quem esta em avaliacao
  // so aparece com o numero para a admin
  const todasAsLinhas = useMemo(() => rankingDeForca(data, nameOf), [data, nameOf])
  const linhas = useMemo(
    () => todasAsLinhas.filter((l) => !l.pausada && (canEdit || l.emAvaliacao === undefined)),
    [todasAsLinhas, canEdit],
  )
  const emAvaliacaoOcultas = useMemo(
    () => (canEdit ? [] : todasAsLinhas.filter((l) => !l.pausada && l.emAvaliacao !== undefined)),
    [todasAsLinhas, canEdit],
  )
  const foraDoRanking = useMemo(() => todasAsLinhas.filter((l) => l.pausada), [todasAsLinhas])
  const mov = useMemo(() => movimentoDaForca(data, nameOf, canEdit), [data, nameOf, canEdit])

  if (linhas.length === 0) {
    return (
      <div className="st-card">
        <Empty icon="💪">Registre um play para o app começar a medir a força de cada uma.</Empty>
      </div>
    )
  }

  const media = mediaDaForca(data)
  const pos = new Map(linhas.map((l, i) => [l.player_id, i + 1]))
  const porNivel = NIVEIS_DE_FORCA.map((n) => ({ n, quantas: linhas.filter((l) => l.nivel.titulo === n.titulo).length }))
  const podio = linhas.slice(0, 3)
  const ordemDoPodio = [1, 0, 2] // 2º, 1º, 3º na tela

  const linhaDe = (l: LinhaDeForca): ReactNode => {
    const dif = l.nota - media
    const jogos =
      l.jogosDeCasa === undefined
        ? `${l.jogos} ${l.jogos === 1 ? 'partida' : 'partidas'}`
        : `${l.jogos} no misto · ${l.jogosDeCasa} no campeonato`
    return (
      <button key={l.player_id} type="button" className="st-linha" onClick={() => abrirPerfil?.(l.player_id)}>
        <PosicaoComSeta pos={pos.get(l.player_id) as number} v={mov.porId.get(l.player_id)} temAnterior={mov.temAnterior} />
        <span className="st-faixa" style={{ background: l.nivel.cor }} />
        <Avatar player={playerById(l.player_id)} size={40} />
        <span className="st-nome">
          <b>{nameOf(l.player_id)}</b>
          <span>
            {l.emAvaliacao !== undefined && `${avaliacaoCurta(l.emAvaliacao)} · `}
            {jogos}
            {l.provisoria && ' · provisória'}
            {l.queda && ` · ${textoDaQueda(l.queda)}`}
          </span>
        </span>
        <span className="st-valor">
          <b>{l.nota}</b>
          <span className={`st-dist ${dif >= 10 ? 'pos' : dif <= -10 ? 'neg' : 'zero'}`}>{textoDaDistancia(dif)}</span>
        </span>
      </button>
    )
  }

  // a lista: do 4º em diante (o podio ja mostra os tres primeiros), em blocos por nivel
  const itens: ReactNode[] = []
  let linhasNaLista = 0
  let visiveis = 0
  for (const n of NIVEIS_DE_FORCA) {
    const grupo = linhas.slice(3).filter((l) => l.nivel.titulo === n.titulo)
    if (grupo.length === 0) continue
    const faixa =
      n.de === -Infinity ? `abaixo de ${Math.round(media - 75)}` : n.de >= 75 ? `de ${Math.round(media + n.de)} para cima` : `a partir de ${Math.round(media + n.de)}`
    itens.push(
      <div key={`n-${n.titulo}`} className="st-secao">
        <b style={{ color: n.cor }}>{n.emoji} {n.titulo}</b>
        <span>{faixa}</span>
      </div>,
    )
    for (const l of grupo) {
      itens.push(linhaDe(l))
      linhasNaLista++
      if (linhasNaLista === LINHAS_DE_CARA) visiveis = itens.length
    }
  }
  if (linhasNaLista <= LINHAS_DE_CARA) visiveis = itens.length

  const termo = normalizar(busca.trim())
  const achadas = termo ? linhas.filter((l) => normalizar(nameOf(l.player_id)).includes(termo)) : []

  return (
    <>
      <div className="st-card">
        <div className="row spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="st-rotulo" style={{ margin: 0 }}>Média das atletas</div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{media}</div>
          </div>
          <div className="tiny muted" style={{ textAlign: 'right' }}>{linhas.length} jogadoras<br />com nota</div>
        </div>
        <div className="st-distrib" aria-hidden="true">
          {porNivel.filter((x) => x.quantas > 0).map(({ n, quantas }) => (
            <i key={n.titulo} style={{ flex: quantas, background: n.cor }} />
          ))}
        </div>
        <div className="st-legenda-d">
          {porNivel.map(({ n, quantas }) => (
            <span key={n.titulo} title={n.titulo}>{n.emoji} <b>{quantas}</b></span>
          ))}
        </div>
        {LIGA.id === 'misto' && (
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            👫 No misto, cada um começou com a força que tinha no <strong>seu campeonato</strong>; daí em diante só os jogos do misto mexem,
            com as mesmas regras (faltas, pausa) dos outros plays.
          </p>
        )}
      </div>

      <div className="st-podio">
        {ordemDoPodio.map((idx) => {
          const l = podio[idx]
          if (!l) return <div key={idx} />
          const lugar = idx + 1
          return (
            <button key={l.player_id} type="button" className={`st-lugar l${lugar}`} onClick={() => abrirPerfil?.(l.player_id)}>
              <span className="med" aria-hidden="true">{MEDALHAS[idx]}</span>
              <Avatar player={playerById(l.player_id)} size={lugar === 1 ? 64 : 52} />
              <b className="nome">{nameOf(l.player_id)}</b>
              <span className="n">{l.nota}<SetaPequena v={mov.porId.get(l.player_id)} /></span>
            </button>
          )
        })}
      </div>

      <div className="row spread" style={{ margin: '0 2px 10px' }}>
        <div className="st-rotulo" style={{ margin: 0 }}>Todas as jogadoras · {linhas.length}</div>
        <button type="button" className="st-lupa-redonda" aria-label="Buscar jogadora" aria-pressed={buscando} onClick={() => setBuscando(!buscando)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
          </svg>
        </button>
      </div>
      {buscando && (
        <div className="st-busca-linha">
          <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Buscar jogadora" />
        </div>
      )}

      <div className="st-card">
        {termo ? (
          achadas.length === 0 ? (
            <Empty icon="🔎">Nenhuma jogadora com esse nome.</Empty>
          ) : (
            <div className="st-lista">{achadas.map(linhaDe)}</div>
          )
        ) : itens.length === 0 ? (
          <p className="tiny muted" style={{ margin: 0 }}>Só o pódio por enquanto.</p>
        ) : (
          <ListaExpansivel itens={itens} visiveis={visiveis} rotulo="as jogadoras" total={linhas.length - 3} />
        )}
      </div>

      <div className="st-legenda">
        <div><span className="st-sobe">▲</span><span className="st-desce">▼</span> posição em relação ao último play</div>
        <div>
          <span className="st-dist pos">+31</span><span className="st-dist neg">−41</span> acima ou abaixo da média das atletas ({media})
        </div>
        <div>a cor da faixa é o nível; menos de 12 partidas = provisória</div>
      </div>

      {emAvaliacaoOcultas.length > 0 && (
        <p className="tiny muted">
          🔍 <strong>Em avaliação:</strong>{' '}
          {emAvaliacaoOcultas.map((l, i) => (
            <span key={l.player_id}>
              {i > 0 && ', '}
              <NomeClicavel id={l.player_id}>{nameOf(l.player_id)}</NomeClicavel> ({l.emAvaliacao} de {PLAYS_EM_AVALIACAO})
            </span>
          ))}
          . A força aparece depois do {PLAYS_EM_AVALIACAO}º play; até lá o app já usa para montar grupos e duplas.
        </p>
      )}
      {foraDoRanking.length > 0 && (
        <p className="tiny muted">
          ⏸️ <strong>Fora do ranking agora:</strong>{' '}
          {foraDoRanking.map((l, i) => (
            <span key={l.player_id}>
              {i > 0 && ', '}
              <NomeClicavel id={l.player_id}>{nameOf(l.player_id)}</NomeClicavel>
              {l.pausada === 'manual' ? ' (pausada)' : ' (2+ faltas seguidas)'}
            </span>
          ))}
          . O perfil continua aberto; volta quando jogar de novo ou ao despausar.
        </p>
      )}
    </>
  )
}
