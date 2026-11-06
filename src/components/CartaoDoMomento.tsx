import { useEffect, useState, type ReactNode } from 'react'
import { Avatar, initials } from './ui'
import {
  dividir,
  estaAberta,
  inicioEmSaoPaulo,
  ocupacao,
  posicaoDe,
  quandoComData,
  textoDaPosicao,
  type ListaCompleta,
} from '../lib/listaDePresenca'
import { contagem, decorrido, momentoDaInicio, podioDaNoite, type Momento, type PodioDaNoite as PodioDaNoiteT } from '../lib/momentoDaInicio'
import { horaLocal, resumoAoVivo } from '../lib/previsaoDaNoite'
import { isPlayed } from '../lib/scoring'
import { useStore } from '../lib/store'
import { dateLabel, plural, type PlaySession } from '../lib/types'
import { TEM_LISTA, meuNome, useLista } from '../lib/useLista'

/**
 * O CARTAO DO MOMENTO (D42), acima do ranking na tela inicial: lista aberta ->
 * lista fechada com o proximo play -> play ao vivo -> podio da noite. Um cartao
 * por vez; qual vale e `momentoDaInicio` (src/lib/momentoDaInicio.ts).
 */
export default function CartaoDoMomento({
  onAbrirPlay,
  onAbrirLista,
}: {
  onAbrirPlay: (sessionId: string) => void
  onAbrirLista: (codigo: string) => void
}) {
  const { data } = useStore()
  const { lista } = useLista(TEM_LISTA ? 'momento' : null)
  // o relogio entra no render: a contagem e a troca de momento (lista que fecha) andam sozinhas
  const [, setTique] = useState(0)
  const agora = new Date()
  const momento = momentoDaInicio({ sessions: data.sessions, matches: data.matches, lista: TEM_LISTA ? lista : null, agora })
  const comRelogio = momento?.tipo === 'ao-vivo' || momento?.tipo === 'lista-aberta' || momento?.tipo === 'lista-fechada'
  useEffect(() => {
    if (!comRelogio) return
    const t = window.setInterval(() => setTique((x) => x + 1), 30000)
    return () => window.clearInterval(t)
  }, [comRelogio])

  // lista ainda carregando: nada (ate o ao vivo espera, porque a lista aberta de outro play prevalece sobre ele)
  if (!momento || (TEM_LISTA && lista === undefined)) return null
  return <Cartao momento={momento} agora={agora} onAbrirPlay={onAbrirPlay} onAbrirLista={onAbrirLista} />
}

function Cartao({
  momento,
  agora,
  onAbrirPlay,
  onAbrirLista,
}: {
  momento: Momento
  agora: Date
  onAbrirPlay: (sessionId: string) => void
  onAbrirLista: (codigo: string) => void
}) {
  const { data, nameOf } = useStore()
  switch (momento.tipo) {
    case 'lista-aberta':
    case 'lista-fechada': {
      const { lista, nomes } = momento.lista
      const aberta = estaAberta(lista, agora)
      const { titulares, suplentes } = dividir(lista, nomes)
      const session = momento.tipo === 'lista-fechada' ? momento.session : null
      const falta = Date.parse(aberta ? lista.fecha_em : lista.play_em) - agora.getTime()
      const meu = meuAtivo(momento.lista)
      return (
        <Quadro
          cor={aberta ? 'lista' : 'fechada'}
          selo={aberta ? '📋 Lista aberta' : '🔒 Lista fechada'}
          tempo={aberta ? `fecha em ${contagem(falta)}` : falta > 0 ? `começa em ${contagem(falta)}` : 'hora do play'}
          titulo={aberta ? `${lista.titulo} · ${quandoComData(lista.play_em)}` : `Próximo play · ${quandoComData(lista.play_em)}`}
          info={
            aberta
              ? ocupacao(lista, nomes)
              : `${plural(titulares.length, 'confirmada')}${suplentes.length ? ` · ${plural(suplentes.length, 'suplente')}` : ''}`
          }
          barra={{ valor: titulares.length, max: lista.vagas, rotulo: 'Vagas preenchidas' }}
          acao={aberta && !meu ? 'ver a lista e colocar seu nome' : 'ver a lista'}
          onAbrir={() => onAbrirLista(lista.codigo)}
          extra={session && session.status === 'open' ? { texto: '🎾 ver o play', onClick: () => onAbrirPlay(session.id) } : undefined}
          faixa={momento.tipo === 'lista-aberta' && momento.play ? <PlayDeHoje {...momento.play} onAbrir={onAbrirPlay} /> : undefined}
        >
          <Rostinhos lc={momento.lista} />
          <Recado lc={momento.lista} aberta={aberta} />
        </Quadro>
      )
    }
    case 'ao-vivo': {
      const s = momento.session
      const r = resumoAoVivo(s, data.matches)
      const fim = r.minutos > 0 ? ` · termina por volta das ${horaLocal(new Date(agora.getTime() + r.minutos * 60000).toISOString())}` : ''
      return (
        <Quadro
          cor="vivo"
          selo={<><span className="bolinha-viva" aria-hidden="true" />Ao vivo</>}
          tempo={r.comecouEm ? `começou ${horaLocal(r.comecouEm)} · ${decorrido(agora.getTime() - Date.parse(r.comecouEm))}` : 'começou'}
          titulo="Play em andamento"
          info={`${r.jogadas} de ${plural(r.total, 'partida')}${r.fase ? ` · ${r.fase}` : ''}`}
          barra={{ valor: r.jogadas, max: r.total, rotulo: 'Partidas jogadas', marca: r.marca }}
          linha={`${r.jogando > 0 ? `${plural(r.jogando, 'quadra')} jogando` : 'nenhuma quadra jogando agora'}${fim}`}
          acao="ver as quadras"
          onAbrir={() => onAbrirPlay(s.id)}
        />
      )
    }
    case 'play': {
      const s = momento.session
      return (
        <Quadro
          cor="fechada"
          selo={`🏐 ${momento.parado ? 'Play em andamento' : 'Próximo play'}`}
          tempo={dateLabel(s.date)}
          titulo={s.title?.trim() || 'Play'}
          info={`${s.player_ids.length} jogadoras · ${s.courts} quadras · ${s.rounds} partidas`}
          // play aberto de dias atras: o cartao fica para a organizacao lembrar de finalizar
          linha={momento.parado ? 'ainda aberto: falta finalizar' : undefined}
          acao="ver a fila de partidas"
          onAbrir={() => onAbrirPlay(s.id)}
        />
      )
    }
    case 'podio': {
      const s = momento.session
      // grupos+duplas sem mata-mata jogado nao tem podio: sem cartao vazio
      const podio = podioDaNoite(s, data.matches, nameOf)
      if (!podio) return null
      const jogadas = data.matches.filter((m) => m.session_id === s.id && isPlayed(m)).length
      const dia = quandoComData(inicioEmSaoPaulo(s.date, '12:00')).split(' às ')[0]
      return (
        <Quadro
          cor="podio"
          selo="🏆 Encerrado"
          tempo={`${dia} · ${plural(jogadas, 'partida')}`}
          titulo="Pódio da noite"
          acao="ver o ranking do dia"
          onAbrir={() => onAbrirPlay(s.id)}
        >
          <PodioDaNoite podio={podio} session={s} nameOf={nameOf} />
        </Quadro>
      )
    }
  }
}

/** O mesmo quadro nos quatro momentos: selo, tempo, titulo, barra, corpo e a acao. */
function Quadro(p: {
  cor: 'lista' | 'fechada' | 'vivo' | 'podio'
  selo: ReactNode
  tempo?: string
  titulo: string
  info?: string
  barra?: { valor: number; max: number; rotulo: string; marca?: number | null }
  linha?: string
  acao: string
  onAbrir: () => void
  extra?: { texto: string; onClick: () => void }
  /** O play de hoje, reduzido, quando a lista de outro play prevalece (botao proprio). */
  faixa?: ReactNode
  children?: ReactNode
}) {
  const { barra } = p
  const pct = barra && barra.max > 0 ? Math.min(100, (100 * barra.valor) / barra.max) : 0
  const marca = barra?.marca != null && barra.marca > 0 && barra.marca < 1 ? barra.marca : null
  // a barra nasce vazia e enche ao abrir a tela (com movimento reduzido, a transicao e 0s)
  const [montou, setMontou] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setMontou(true), 50)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div className={`card momento m-${p.cor}`}>
      <div className="momento-topo">
        <span className="momento-selo">{p.selo}</span>
        {p.tempo && <span className="momento-tempo">{p.tempo}</span>}
      </div>
      {/* o cartao inteiro e o alvo do toque (o ::after do botao cobre o quadro) */}
      <button className="momento-alvo" onClick={p.onAbrir} aria-label={`${p.titulo} — ${p.acao}`}>
        {p.titulo}
      </button>
      {p.info && <div className="momento-info">{p.info}</div>}
      {barra && (
        <div
          className={`momento-barra${marca != null ? ' com-marca' : ''}`}
          role="progressbar"
          aria-label={barra.rotulo}
          aria-valuemin={0}
          aria-valuemax={barra.max}
          aria-valuenow={Math.min(barra.valor, barra.max)}
        >
          <span style={{ width: `${montou ? pct : 0}%` }} />
          {marca != null && (
            <>
              <i className="momento-marca" style={{ left: `${marca * 100}%` }} title="começa o mata-mata" />
              {/* o rotulo fica centrado no tracinho, sem passar da borda da barra; small, nao span: o `.momento-barra > span` e o preenchimento da barra */}
              <small className="momento-marca-rotulo" aria-hidden="true" style={{ left: `clamp(28px, ${marca * 100}%, calc(100% - 28px))` }}>
                mata-mata
              </small>
            </>
          )}
        </div>
      )}
      {p.linha && <div className="momento-linha">{p.linha}</div>}
      {p.children}
      <div className="momento-rodape">
        <span className="momento-acao">{p.acao} →</span>
        {p.extra && (
          <button className="momento-extra" onClick={p.extra.onClick}>
            {p.extra.texto} →
          </button>
        )}
      </div>
      {p.faixa}
    </div>
  )
}

/** Ate 5 confirmadas, na ordem da lista (foto pelo cadastro; sem vinculo, iniciais) e "+N". */
function Rostinhos({ lc }: { lc: ListaCompleta }) {
  const { playerById } = useStore()
  const { titulares } = dividir(lc.lista, lc.nomes)
  if (titulares.length === 0) return null
  const mais = titulares.length - 5
  return (
    <div className="momento-rostos" aria-hidden="true">
      {titulares.slice(0, 5).map((n) => {
        const p = n.player_id ? playerById(n.player_id) : undefined
        return p ? (
          <Avatar key={n.id} player={p} size={30} />
        ) : (
          <span key={n.id} className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
            {initials(n.nome)}
          </span>
        )
      })}
      {mais > 0 && <span className="momento-mais">+{mais}</span>}
    </div>
  )
}

/** O nome que ESTE celular colocou, ainda ativo na lista (quem saiu nao conta). */
function meuAtivo(lc: ListaCompleta) {
  const id = meuNome(lc.lista.id)
  return id ? lc.nomes.find((n) => n.id === id && !n.saiu_em) : undefined
}

/** O recado pessoal: so com o nome deste celular ainda ativo na lista. */
function Recado({ lc, aberta }: { lc: ListaCompleta; aberta: boolean }) {
  const meu = meuAtivo(lc)
  if (!meu) return null
  const pos = posicaoDe(lc.nomes, meu.id)
  const confirmada = pos <= lc.lista.vagas
  const texto = aberta || !confirmada ? textoDaPosicao(pos, lc.lista.vagas) : 'Você está confirmada'
  return <div className="momento-recado">{confirmada ? '✅' : '⏳'} {texto}</div>
}

function PodioDaNoite({ podio, session, nameOf }: { podio: PodioDaNoiteT; session: PlaySession; nameOf: (id: string) => string }) {
  const { playerById } = useStore()
  if (podio.tipo === 'um') {
    // 2a, 1a, 3a na tela
    const ordem = [1, 0, 2].map((i) => podio.lugares[i]).filter(Boolean)
    return (
      <div className="momento-podio">
        {ordem.map((l) => (
          <div key={l.id} className={`momento-lugar l${Math.min(3, l.posicao)}`}>
            <Avatar player={playerById(l.id)} size={l.posicao === 1 ? 52 : 42} />
            <span className="momento-pos">{l.posicao}º</span>
            <span className="momento-nome">{nameOf(l.id)}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <ul className="momento-campeas">
      {podio.linhas.map((l) => (
        <li key={l.rotulo}>
          <span className="momento-rotulo">{l.rotulo}</span>{' '}
          {l.ids.map((id, i) => (
            <span key={id} className="nowrap">
              {i > 0 ? (session.format === 'grupos-duplas' ? '+ ' : 'e ') : ''}
              {nameOf(id)}{' '}
            </span>
          ))}
        </li>
      ))}
      {podio.mais > 0 && (
        <li>
          <span className="momento-mais" title={`mais ${podio.mais}`}>+{podio.mais}</span>
        </li>
      )}
    </ul>
  )
}

/** O play de hoje numa faixa pequena embaixo da lista aberta de outro play; tocar abre o play. */
function PlayDeHoje({ session, aoVivo, onAbrir }: { session: PlaySession; aoVivo: boolean; onAbrir: (id: string) => void }) {
  const { data } = useStore()
  const r = aoVivo ? resumoAoVivo(session, data.matches) : null
  return (
    <button className="momento-faixa" onClick={() => onAbrir(session.id)}>
      <span className="momento-faixa-texto">
        {r ? (
          <>
            <span className="bolinha-viva" aria-hidden="true" /> Ao vivo · {r.jogadas} de {plural(r.total, 'partida')}
          </>
        ) : (
          `🏐 Play de hoje · ${plural(session.player_ids.length, 'jogadora')}`
        )}
      </span>
      <span className="momento-faixa-acao">ver o play →</span>
    </button>
  )
}
