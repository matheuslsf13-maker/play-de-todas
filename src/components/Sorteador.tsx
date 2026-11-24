import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar, Modal } from './ui'
import { plural, uid, type Player, type Sorteado } from '../lib/types'
import { useStore } from '../lib/store'
import { chances, concorrentes, entre, fitaDaRoleta, FREADAS, posicaoNaFreada, sai, sortear, type Participante } from '../lib/sorteio'

/*
 * 🎲 SORTEIO (dono, 24/11): aberto no ⋯ do ranking do dia e do ranking do mês. Escolhe quem concorre (todas, um
 * grupo/categoria, tocando em cada uma, ou nomes de fora digitados na hora), se quem ganhou pode sair
 * de novo e se o podio do dia ganha mais chance. A roleta passa as fotos e para na sorteada, com som,
 * vibracao e confete. Nada e gravado: o sorteio vive so nesta janela.
 */

const PASSO = 104 // largura do cartao (96) + vao (8)
const ALVO = 54
const BONUS = [25, 50, 100]

const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function Sorteador({ chave, participantes, recortes, colocacao, onClose, podio = 'Pódio do dia', porGrupo = false }: {
  /** Onde o historico fica guardado neste aparelho: `play:<id>` ou `mes:<AAAA-MM>`. */
  chave: string
  participantes: Participante[]
  /** Grupos ou categorias do play, para escolher de uma vez. */
  recortes: { nome: string; ids: string[] }[]
  /** Colocacao no podio do dia (1, 2, 3; no grupo dela quando ha grupos). */
  colocacao: Map<string, number>
  onClose: () => void
  /** O nome do podio que da o bonus: "Pódio do dia" (play) ou "Pódio do mês" (ranking). */
  podio?: string
  /** O podio e um por grupo (play em grupos). */
  porGrupo?: boolean
}) {
  const [extras, setExtras] = useState<Participante[]>([])
  const todos = useMemo(() => [...participantes, ...extras], [participantes, extras])
  const porId = useMemo(() => new Map(todos.map((p) => [p.id, p])), [todos])
  const [escolhidas, setEscolhidas] = useState<Set<string>>(() => new Set(participantes.map((p) => p.id)))
  const [nomeExtra, setNomeExtra] = useState('')
  const [repetir, setRepetir] = useState(false)
  const [bonus, setBonus] = useState(0)
  const [som, setSom] = useState(true)
  // o historico fica no banco (script 43), por play ou por mes; ganhadoras = quem saiu nele.
  // Sem o 43 (ou o que a versao de antes guardou neste aparelho) fica em `soAqui`, no localStorage,
  // e sobe para o banco assim que der.
  const { data, saveSorteado, deleteSorteados } = useStore()
  const guardado = `play-de-todas:sorteios:${chave}`
  const [soAqui, setSoAqui] = useState<Sorteado[]>(() => {
    try {
      const lidos = JSON.parse(localStorage.getItem(guardado) ?? '[]') as (Sorteado | { id: string; nome: string; em: string })[]
      return lidos.map((x) => ('chave' in x ? x : { id: uid(), chave, player_id: x.id, nome: x.nome, em: x.em }))
    } catch { return [] }
  })
  useEffect(() => {
    if (soAqui.length === 0) return
    try {
      for (const x of soAqui) saveSorteado(x)
      setSoAqui([])
    } catch { /* sem o script 43: continua neste aparelho */ }
    // so na abertura: depois, o que falhar ja cai em soAqui
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (soAqui.length) localStorage.setItem(guardado, JSON.stringify(soAqui))
    else localStorage.removeItem(guardado)
  }, [guardado, soAqui])
  const historico = useMemo(
    () => [...data.sorteios.filter((x) => x.chave === chave), ...soAqui].sort((a, b) => a.em.localeCompare(b.em)),
    [data.sorteios, soAqui, chave],
  )
  const ganhadoras = historico.map((h) => h.player_id ?? '')
  const [rodada, setRodada] = useState<{ id: string; fita: string[]; vencedora: string; chance: number; n: number } | null>(null)
  const [fase, setFase] = useState<'regras' | 'girando' | 'fim'>('regras')

  const ordem = todos.map((p) => p.id).filter((id) => escolhidas.has(id))
  const naDisputa = concorrentes(ordem, ganhadoras, repetir)
  const chance = chances(naDisputa, colocacao, bonus)
  const audio = useRef<AudioContext | null>(null)

  function alternar(id: string) {
    setEscolhidas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function adicionarExtra() {
    const nome = nomeExtra.replace(/\p{Cf}/gu, '').trim()
    if (!nome) return
    const p = { id: `extra:${uid()}`, nome }
    setExtras((e) => [...e, p])
    setEscolhidas((s) => new Set(s).add(p.id))
    setNomeExtra('')
  }

  function girar() {
    const vencedora = sortear(naDisputa, colocacao, bonus)
    if (!vencedora) return
    // o audio so nasce num toque (regra dos navegadores)
    if (som && !audio.current) {
      try { audio.current = new AudioContext() } catch { /* sem som */ }
    }
    void audio.current?.resume()
    setRodada({ id: uid(), fita: fitaDaRoleta(naDisputa, vencedora, ALVO + 10, ALVO), vencedora, chance: chance.get(vencedora) ?? 0, n: naDisputa.length })
    setFase('girando')
  }

  function terminou() {
    if (!rodada) return
    const novo: Sorteado = { id: uid(), chave, player_id: rodada.vencedora, nome: porId.get(rodada.vencedora)?.nome ?? '?', em: new Date().toISOString() }
    try { saveSorteado(novo) } catch { setSoAqui((h) => [...h, novo]) }
    setFase('fim')
    navigator.vibrate?.([40, 60, 90])
    if (som && audio.current) fanfarra(audio.current)
  }

  const fotoDe = (id: string) => {
    const p = porId.get(id)
    return { id, name: p?.nome ?? '?', photo_url: p?.foto ?? null } as Player
  }

  return (
    <Modal title="🎲 Sorteio" onClose={onClose} alta>
      {fase === 'regras' ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <span>Quem participa</span>
            <div className="chips-scroll" style={{ marginBottom: 8 }}>
              <button className="chip off" style={{ flex: 'none' }} onClick={() => setEscolhidas(new Set(todos.map((p) => p.id)))}>Todas</button>
              {recortes.map((r) => (
                <button key={r.nome} className="chip off" style={{ flex: 'none' }} onClick={() => setEscolhidas(new Set([...r.ids, ...extras.map((e) => e.id)]))}>{r.nome}</button>
              ))}
              <button className="chip off" style={{ flex: 'none' }} onClick={() => setEscolhidas(new Set())}>Nenhuma</button>
            </div>
            <div className="sorteio-grade">
              {todos.map((p) => {
                const on = escolhidas.has(p.id)
                const saiu = on && !naDisputa.includes(p.id)
                const c = chance.get(p.id)
                const col = colocacao.get(p.id)
                return (
                  <button key={p.id} className={`sorteio-pessoa${on ? ' on' : ''}${saiu ? ' saiu' : ''}`} aria-pressed={on} onClick={() => alternar(p.id)}>
                    <Avatar player={fotoDe(p.id)} size={40} />
                    <span className="sorteio-nome">{p.nome}</span>
                    <small>
                      {saiu ? '🏆 já ganhou' : on && c !== undefined ? `${(c * 100).toFixed(c < 0.1 ? 1 : 0)}%` : 'fora'}
                      {bonus > 0 && col && col <= 3 && !saiu ? ` ${['🥇', '🥈', '🥉'][col - 1]}` : ''}
                    </small>
                  </button>
                )
              })}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <input
                className="input grow"
                placeholder="Adicionar alguém de fora"
                value={nomeExtra}
                onChange={(e) => setNomeExtra(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') adicionarExtra() }}
              />
              <button className="btn ghost" onClick={adicionarExtra} disabled={!nomeExtra.trim()}>➕</button>
            </div>
          </div>

          <label className="row toggle-card" style={{ gap: 10 }}>
            <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
            <span className="grow">
              <strong>🔁 Quem ganhou pode ganhar de novo</strong>
              <br />
              <small className="muted">{repetir ? 'Continua no sorteio depois de ganhar.' : 'Quem ganha sai dos próximos sorteios.'}</small>
            </span>
          </label>

          <div className="toggle-card">
            <label className="row" style={{ gap: 10 }}>
              <input type="checkbox" checked={bonus > 0} onChange={(e) => setBonus(e.target.checked ? 50 : 0)} />
              <span className="grow">
                <strong>🏅 {podio} com mais chance</strong>
                <br />
                <small className="muted">
                  {bonus > 0
                    ? `🥇 +${bonus}%, 🥈 +${Math.round((bonus * 2) / 3)}%, 🥉 +${Math.round(bonus / 3)}%${porGrupo ? ' (o pódio de cada grupo)' : ''}.`
                    : 'Todas com a mesma chance.'}
                </small>
              </span>
            </label>
            {bonus > 0 && (
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {BONUS.map((b) => (
                  <button key={b} className={`chip ${bonus === b ? 'on' : 'off'}`} onClick={() => setBonus(b)}>+{b}%</button>
                ))}
              </div>
            )}
          </div>

          {historico.length > 0 && <Historico itens={historico} onLimpar={() => { if (!confirm('Apagar o histórico do sorteio? Quem já ganhou volta a concorrer.')) return; try { deleteSorteados(chave) } catch { /* sem o 43 */ } setSoAqui([]) }} />}

          <button className="btn pink block sorteio-girar" disabled={naDisputa.length < 2} onClick={girar}>
            🎰 Sortear entre {plural(naDisputa.length, 'participante', 'participantes')}
          </button>
          {naDisputa.length < 2 && <p className="tiny muted" style={{ margin: '-8px 0 0', textAlign: 'center' }}>Escolha pelo menos duas pessoas.</p>}
        </div>
      ) : (
        rodada && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="row spread">
              <span className="tiny muted">Sorteio {ganhadoras.length + (fase === 'girando' ? 1 : 0)} · {plural(rodada.n, 'participante', 'participantes')}</span>
              <button className="btn ghost sm" aria-label={som ? 'Tirar o som' : 'Ligar o som'} onClick={() => setSom((s) => !s)}>{som ? '🔊' : '🔇'}</button>
            </div>
            <Roleta key={rodada.id} fita={rodada.fita} foto={fotoDe} nome={(id) => porId.get(id)?.nome ?? '?'} som={som ? audio.current : null} venceu={fase === 'fim'} onFim={terminou} />
            {fase === 'fim' ? (
              <>
                <div className="sorteio-vencedora">
                  <div className="sorteio-vencedora-foto"><Avatar player={fotoDe(rodada.vencedora)} size={104} /></div>
                  <div className="sorteio-parabens">🎉 Parabéns!</div>
                  <div className="sorteio-vencedora-nome">{porId.get(rodada.vencedora)?.nome}</div>
                  <small className="muted">tinha {(rodada.chance * 100).toFixed(rodada.chance < 0.1 ? 1 : 0)}% de chance</small>
                </div>
                <button className="btn pink block sorteio-girar" disabled={naDisputa.length < 2} onClick={girar}>
                  🎰 Sortear de novo{naDisputa.length >= 2 ? ` (${naDisputa.length})` : ''}
                </button>
                {naDisputa.length < 2 && <p className="tiny muted" style={{ margin: '-8px 0 0', textAlign: 'center' }}>Não sobrou ninguém para sortear: mude as regras.</p>}
                <button className="btn ghost block" onClick={() => setFase('regras')}>⚙️ Mudar as regras</button>
                {historico.length > 1 && <Historico itens={historico} />}
                <Confete />
              </>
            ) : (
              <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Girando…</p>
            )}
          </div>
        )
      )}
    </Modal>
  )
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(':', 'h')

/** 📜 Sorteio 1 · 20h41 · Isabela; o mais recente em cima. */
function Historico({ itens, onLimpar }: { itens: Sorteado[]; onLimpar?: () => void }) {
  return (
    <div className="sorteio-lista">
      <div className="row spread">
        <strong className="small">📜 Histórico do sorteio</strong>
        {onLimpar && <button className="btn ghost sm" onClick={onLimpar}>Apagar</button>}
      </div>
      <div className="stack" style={{ gap: 4, marginTop: 6 }}>
        {itens.map((h, i) => ({ h, n: i + 1 })).reverse().map(({ h, n }) => (
          <div key={n} className="row sorteio-hist">
            <span className="sorteio-hist-n">Sorteio {n}</span>
            <span className="tiny muted">{hora(h.em)}</span>
            <strong className="grow ellipsis" style={{ textAlign: 'right' }}>🏆 {h.nome}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A fita de fotos que corre e desacelera ate a sorteada parar no ponteiro do meio. */
function Roleta({ fita, foto, nome, som, venceu, onFim }: {
  fita: string[]
  foto: (id: string) => Player
  nome: (id: string) => string
  som: AudioContext | null
  venceu: boolean
  onFim: () => void
}) {
  const janela = useRef<HTMLDivElement>(null)
  const trilho = useRef<HTMLDivElement>(null)
  const fim = useRef(onFim)
  fim.current = onFim
  const somRef = useRef(som)
  somRef.current = som

  useEffect(() => {
    const j = janela.current, t = trilho.current
    if (!j || !t) return
    const meio = j.clientWidth / 2
    // x em que o centro da sorteada fica no ponteiro; `c` = onde o ponteiro esta dentro dela
    const centro = meio - ALVO * PASSO - 48
    const c0 = -(ALVO - 2) * PASSO // comeca com o 3o cartao no ponteiro
    const trechos = semMovimento()
      ? [{ ate: entre(-20, 20), ms: 700, curva: sai(2) }]
      : FREADAS[Math.floor(Math.random() * FREADAS.length)].trechos()
    t.style.transition = 'none'

    let ultimo = NaN, raf = 0, acabou = 0
    const por = (c: number) => {
      const x = centro - c
      t.style.transform = `translate3d(${x}px,0,0)`
      // o "tic" a cada cartao que passa pelo ponteiro
      const i = Math.floor((meio - x) / PASSO)
      if (i !== ultimo) {
        if (!Number.isNaN(ultimo) && somRef.current) tic(somRef.current)
        ultimo = i
      }
    }
    por(c0)
    const ini = performance.now()
    const quadro = (agora: number) => {
      const r = posicaoNaFreada(c0, trechos, agora - ini)
      por(r.c)
      if (r.acabou) acabou = window.setTimeout(() => fim.current(), 160)
      else raf = requestAnimationFrame(quadro)
    }
    raf = requestAnimationFrame(quadro)
    return () => { cancelAnimationFrame(raf); clearTimeout(acabou) }
  }, [fita])

  return (
    <div className={`roleta${venceu ? ' venceu' : ''}`} ref={janela}>
      <div className="roleta-trilho" ref={trilho}>
        {fita.map((id, i) => (
          <div key={i} className={`roleta-cartao${venceu && i === ALVO ? ' sorteada' : ''}`}>
            <Avatar player={foto(id)} size={64} />
            <span>{nome(id)}</span>
          </div>
        ))}
      </div>
      <div className="roleta-ponteiro" aria-hidden />
    </div>
  )
}

function tic(ctx: AudioContext) {
  const t = ctx.currentTime
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = 'triangle'
  o.frequency.setValueAtTime(1500, t)
  o.frequency.exponentialRampToValueAtTime(700, t + 0.03)
  g.gain.setValueAtTime(0.12, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + 0.05)
}

function fanfarra(ctx: AudioContext) {
  const t = ctx.currentTime
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = f
    const ini = t + i * 0.11
    const dur = i === 3 ? 0.6 : 0.14
    g.gain.setValueAtTime(0.0001, ini)
    g.gain.exponentialRampToValueAtTime(0.09, ini + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, ini + dur)
    o.connect(g).connect(ctx.destination)
    o.start(ini)
    o.stop(ini + dur + 0.02)
  })
}

/** Confete de dois canhoes, desenhado num canvas por cima de tudo; some sozinho. */
function Confete() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || semMovimento()) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = window.innerWidth, H = window.innerHeight
    c.width = W * dpr
    c.height = H * dpr
    ctx.scale(dpr, dpr)
    const css = getComputedStyle(document.documentElement)
    const cores = ['--pink', '--purple', '--orange', '--yellow', '--teal'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean)
    if (cores.length === 0) cores.push('#ff4f9a', '#8b5cf6', '#ff8a3d', '#ffc940')
    const pecas = Array.from({ length: 170 }, (_, i) => {
      const esq = i % 2 === 0
      // cada canhao num canto de baixo, atirando para cima e para dentro
      const ang = -Math.PI / 2 + 0.45 + (Math.random() - 0.5) * 0.7
      const vel = (9 + Math.random() * 9) * Math.min(1.4, H / 700)
      return {
        x: esq ? 0 : W, y: H * 0.85,
        vx: Math.cos(ang) * vel * (esq ? 1 : -1), vy: Math.sin(ang) * vel,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        cor: cores[i % cores.length], fita: Math.random() < 0.3,
      }
    })
    let raf = 0
    const ini = performance.now()
    const quadro = (agora: number) => {
      const passou = agora - ini
      ctx.clearRect(0, 0, W, H)
      ctx.globalAlpha = Math.max(0, Math.min(1, (4200 - passou) / 800))
      for (const p of pecas) {
        p.vy += 0.28
        p.vx *= 0.985
        p.vy *= 0.985
        p.x += p.vx
        p.y += p.vy
        p.r += p.vr
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.fillStyle = p.cor
        // o "flip" do papel: a largura oscila como se girasse no ar
        const larg = p.w * Math.abs(Math.cos(p.r * 3))
        if (p.fita) ctx.fillRect(-larg / 2, -p.h, larg, p.h * 2)
        else ctx.fillRect(-larg / 2, -p.h / 2, larg, p.h)
        ctx.restore()
      }
      if (passou < 4200) raf = requestAnimationFrame(quadro)
      else ctx.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(quadro)
    return () => cancelAnimationFrame(raf)
  }, [])
  return createPortal(<canvas ref={ref} className="confete" aria-hidden />, document.body)
}
