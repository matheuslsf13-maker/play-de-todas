import { subirAoConteudo } from './lib/rolagem'
import { vigiarFileirasRolaveis } from './lib/fadeRolavel'
import { IconeDaAba } from './components/IconesDeAba'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ConteudoQueDesliza } from './components/AbasComTraco'
import { LIGA } from './liga'
import { Logo, Modal, Toast, useToast } from './components/ui'
import { useStore } from './lib/store'
import { aplicarTema, temaSalvo, type Tema } from './lib/tema'
import Ranking from './pages/Ranking'
import { ProvedorDePerfil } from './components/NomeClicavel'
import type { Montagem } from './pages/ListaDePresenca'
import { codigoDaUrl } from './lib/useLista'
import { ouvirVoltarDeAba } from './lib/voltar'

// SO A TELA INICIAL VEM NO PACOTE PRINCIPAL (08/11): Play, Stats e a lista de presenca carregam a parte e
// sao baixados em segundo plano logo depois que o app abre (o service worker guarda: abrem sem sinal na
// quadra); Financeiro e Meninas, so para quem esta logada. Se mesmo assim faltar, aparece um aviso no lugar
// da aba em vez de o app inteiro cair.
const carregarPlay = () => import('./pages/Play')
const carregarStats = () => import('./pages/Stats')
const carregarLista = () => import('./pages/ListaDePresenca')
const carregarCheckins = () => import('./pages/Checkins')
const carregarPlayers = () => import('./pages/Players')
const semSinal = (aba: string) => ({
  default: () => <div className="card"><div className="empty">Sem sinal para abrir {aba} agora. Tente de novo com internet.</div></div>,
})
const Play = lazy(() => carregarPlay().catch(() => semSinal('o Play')))
const Stats = lazy(() => carregarStats().catch(() => semSinal('o Desempenho')))
const ListaDePresenca = lazy(() => carregarLista().catch(() => semSinal('a lista')))
const Checkins = lazy(() => carregarCheckins().catch(() => semSinal('o Financeiro')))
const Players = lazy(() => carregarPlayers().catch(() => semSinal('a aba Meninas')))
const carregando = <div className="card"><div className="empty">Carregando…</div></div>

type Tab = 'ranking' | 'play' | 'players' | 'stats' | 'checkins'

/**
 * `soAdmin`: so aparece para quem esta logada. Meninas (cadastro, pagamento)
 * e Check-ins (contas de passe, dinheiro) sao da organizacao -- e as tabelas
 * dos check-ins tambem so se leem logada (script 23), porque esconder a aba
 * nao esconde o dado de quem tem a chave publica do site.
 */
type Aba = { id: Tab; label: string; soAdmin?: boolean }
const TABS: Aba[] = ([
  { id: 'ranking', label: 'Ranking' },
  { id: 'play', label: 'Play' },
  { id: 'stats', label: 'Desempenho' },
  { id: 'players', label: 'Meninas', soAdmin: true },
  { id: 'checkins', label: 'Financeiro', soAdmin: true },
] as Aba[])
  // o misto nao tem check-ins: o dinheiro e de cada campeonato
  .filter((t) => !(LIGA.id === 'misto' && t.id === 'checkins'))

/**
 * A aba aberta fica guardada no aparelho: o app recarrega ao voltar para a
 * tela (e no F5), e cair sempre no Ranking obrigava a navegar de novo.
 */
const CHAVE_DA_ABA = `${LIGA.prefixo}:aba`

function abaSalva(): Tab {
  try {
    const v = localStorage.getItem(CHAVE_DA_ABA)
    if (v && TABS.some((t) => t.id === v)) return v as Tab
  } catch {
    /* sem localStorage: comeca no ranking */
  }
  return 'ranking'
}

export default function App() {
  const { loading, error, online, canEdit, userEmail, signIn, signOut, pendingCount } = useStore()
  const [tab, setTab] = useState<Tab>(abaSalva)
  const abas = TABS.filter((t) => !t.soAdmin || canEdit)
  // depois que a tela inicial apareceu (sem disputar a rede com ela), baixa o resto
  useEffect(() => {
    const t = window.setTimeout(() => {
      for (const carregar of [carregarPlay, carregarStats, carregarLista, ...(canEdit ? [carregarCheckins, carregarPlayers] : [])]) {
        void carregar().catch(() => {})
      }
    }, 1200)
    return () => window.clearTimeout(t)
  }, [canEdit])
  // saiu da conta (ou a aba guardada e de administradora): volta para o Ranking
  const abaVisivel: Tab = abas.some((t) => t.id === tab) ? tab : 'ranking'
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_DA_ABA, tab)
    } catch {
      /* sem localStorage: paciencia */
    }
  }, [tab])
  useEffect(() => vigiarFileirasRolaveis(), [])
  /** Aba de Stats pedida por outra tela (o “ver a força” do Ranking). */
  const [abrirStats, setAbrirStats] = useState<'jogadora' | 'duplas' | 'forca' | { jogadora: string } | null>(null)
  /** Tocar no nome de uma menina (no Ranking) abre a ficha dela no Stats. */
  const abrirPerfil = useCallback((id: string) => {
    setAbrirStats({ jogadora: id })
    setTab('stats')
  }, [])
  const [abrirPlay, setAbrirPlay] = useState<string | null>(null)
  /** A lista de presenca aberta (pelo link ?lista= ou por um cartao): aparece no lugar da aba. */
  const [lista, setLista] = useState<string | null>(codigoDaUrl)
  /** A organizadora pediu para montar o play com a lista: o Novo Play abre com as confirmadas. */
  const [montar, setMontar] = useState<Montagem | null>(null)
  /** Sai da lista para uma aba (por padrao a tela inicial) e tira o ?lista= do endereco. */
  const irParaAba = useCallback((t: Tab) => {
    // o ?lista= sai do endereco no passo novo do historico (efeito abaixo); voltar devolve a lista
    setLista(null)
    setTab(t)
    subirAoConteudo()
  }, [])
  const abrirLista = useCallback((codigo: string) => {
    setLista(codigo)
    subirAoConteudo()
  }, [])
  const primeiraRenderizacao = useRef(true)

  // O VOLTAR DO CELULAR (08/11): o voltar devolve a aba anterior (ou a lista) em vez de sair do app. As abas visitadas
  // ficam numa pilha AQUI e o historico do navegador ganha UM passo so (dono, 17/11): um pushState a cada toque numa
  // aba fazia o Safari do iPhone abrir a barra dele e a tela pular. Janelas e o play aberto: src/lib/voltar.ts.
  const veioDoVoltar = useRef(false)
  const primeiroPasso = useRef(true)
  const abasAnteriores = useRef<{ tab: Tab; lista: string | null }[]>([])
  const atual = useRef({ tab, lista })
  const temPasso = useRef(false)
  useEffect(() => {
    const url = window.location.pathname + (lista ? `?lista=${encodeURIComponent(lista)}` : '')
    const mudaUrl = url !== window.location.pathname + window.location.search
    if (primeiroPasso.current) {
      primeiroPasso.current = false
      atual.current = { tab, lista }
      return
    }
    if (veioDoVoltar.current) veioDoVoltar.current = false
    else {
      abasAnteriores.current.push(atual.current)
      if (!temPasso.current) {
        temPasso.current = true
        window.history.pushState({ ...(window.history.state ?? {}), aba: true }, '', url)
        atual.current = { tab, lista }
        return
      }
    }
    atual.current = { tab, lista }
    // so o ?lista= muda o endereco; sem mudanca nao mexe no historico
    if (mudaUrl) window.history.replaceState(window.history.state, '', url)
  }, [tab, lista])
  useEffect(
    () =>
      ouvirVoltarDeAba(() => {
        // o voltar consumiu o nosso passo: volta uma aba e, se ainda houver mais para tras, recria o passo
        temPasso.current = false
        const antes = abasAnteriores.current.pop()
        if (!antes) return
        veioDoVoltar.current = true
        if (abasAnteriores.current.length > 0) {
          temPasso.current = true
          window.history.pushState({ ...(window.history.state ?? {}), aba: true }, '')
        }
        setTab(antes.tab)
        setLista(antes.lista)
      }),
    [],
  )

  // trocar de aba comeca a leitura do comeco do conteudo; sem isso a pagina "pula" quando a aba nova e mais curta
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false
      return
    }
    subirAoConteudo()
  }, [tab])
  const [login, setLogin] = useState(false)

  // topo que encolhe ao rolar, com histerese: encolhe passados 80px e so volta
  // perto do inicio (no limiar ele nao fica piscando)
  const [compacto, setCompacto] = useState(false)
  useEffect(() => {
    let quadro = 0
    const olhar = () => {
      quadro = 0
      const y = window.scrollY
      // o nome pequeno entra quando o titulo grande ja passou por baixo do topo
      setCompacto((c) => (c ? y > 30 : y > 56))
    }
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(olhar)
    }
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => {
      window.removeEventListener('scroll', aoRolar)
      cancelAnimationFrame(quadro)
    }
  }, [])
  // a altura do topo (fixa) medida nele mesmo: as barras grudadas embaixo dele (Desempenho, abas do Play) usam
  // esse numero e ficam coladas, sem vao
  const appRef = useRef<HTMLDivElement>(null)
  const topoRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const topo = topoRef.current
    if (!topo || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => appRef.current?.style.setProperty('--topo-alto', `${topo.offsetHeight}px`))
    ro.observe(topo)
    return () => ro.disconnect()
  }, [])
  const [tema, setTema] = useState<Tema>(() => temaSalvo())
  const { msg, show } = useToast()

  function trocarTema() {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro'
    aplicarTema(novo)
    setTema(novo)
  }

  return (
    <div className={compacto ? 'app topo-compacto' : 'app'} ref={appRef}>
      {/* topo fino de altura fixa (dono, 17/11: recolher travava e abria um vao): logo e botoes; o nome pequeno
          aparece aos poucos quando o titulo grande, que rola com a pagina, passa por baixo */}
      <header className="topbar" ref={topoRef}>
        <div className="row spread">
          <Logo size={34} />
          <div className="grow">
            <span className="topo-titulo" aria-hidden={!compacto}>Play de Todas</span>
          </div>
          <button
            className="bt-tema"
            onClick={trocarTema}
            title={tema === 'escuro' ? 'Mudar para o modo diurno' : 'Mudar para o modo noturno'}
            aria-label={tema === 'escuro' ? 'Mudar para o modo diurno' : 'Mudar para o modo noturno'}
          >
            {tema === 'escuro' ? '☀️' : '🌙'}
          </button>
          {online && userEmail && <button className="btn ghost sm" onClick={() => void signOut()}>Sair</button>}
        </div>
      </header>
      <div className="topo-hero">
        <h1 className="hero-nome">Play de Todas</h1>
        <div className="sub">
          <span>Beach Tennis · V3 Arena · <em>mais que um play, uma experiência!</em></span>
        </div>
      </div>

      {pendingCount > 0 ? (
        <div className="banner warn">
          📶 Sem conexão no momento — <strong>{pendingCount} alteração(ões)</strong> guardada(s) no celular.
          Pode continuar lançando: assim que o sinal voltar eu envio tudo sozinho.
        </div>
      ) : (
        error && <div className="banner err">{error}</div>
      )}
      {!online && (
        <div className="banner warn">
          Modo local: os dados ficam salvos só neste navegador. Configure o Supabase (veja o README) para todo mundo do grupo acessar.
        </div>
      )}

      {loading ? (
        <div className="card"><div className="empty">Carregando…</div></div>
      ) : (
        <main>
          <Suspense fallback={carregando}>
          {lista && (
            // tocar no nome de alguem da lista abre o perfil dela (dono, 06/11)
            <ProvedorDePerfil value={(id) => { setAbrirStats({ jogadora: id }); irParaAba('stats') }}>
            <ListaDePresenca
              codigo={lista}
              onSair={() => irParaAba('ranking')}
              onMontarPlay={(m) => { setMontar(m); irParaAba('play') }}
              onApagou={() => { show('Lista apagada'); irParaAba('play') }}
              onToast={show}
            />
            </ProvedorDePerfil>
          )}
          {/* trocar de aba no menu de baixo traz a tela do lado da aba tocada (dono, 17/11) */}
          <ConteudoQueDesliza indice={abas.findIndex((t) => t.id === abaVisivel)}>
          {!lista && abaVisivel === 'ranking' && (
            <ProvedorDePerfil value={abrirPerfil}>
              <Ranking
                onToast={show}
                onAbrirPlay={(id) => { setAbrirPlay(id); setTab('play') }}
                onVerForca={() => { setAbrirStats('forca'); setTab('stats') }}
                onAbrirLista={abrirLista}
              />
            </ProvedorDePerfil>
          )}
          {!lista && abaVisivel === 'play' && (
            <Play
              onToast={show}
              abrir={abrirPlay}
              onAbriu={() => setAbrirPlay(null)}
              montar={montar}
              onMontou={() => setMontar(null)}
              onAbrirLista={abrirLista}
            />
          )}
          {!lista && abaVisivel === 'stats' && <Stats abrir={abrirStats} onAbriu={() => setAbrirStats(null)} />}
          {!lista && abaVisivel === 'players' && (
            <Players onToast={show} />
          )}
          {!lista && abaVisivel === 'checkins' && (
            <Checkins onToast={show} />
          )}
          </ConteudoQueDesliza>
          </Suspense>
        </main>
      )}

      <p className="versao">
        versão {__VERSAO__}
        {' · '}
        <button
          className="linkish"
          onClick={async () => {
            if ('serviceWorker' in navigator) {
              const rs = await navigator.serviceWorker.getRegistrations()
              await Promise.all(rs.map((r) => r.unregister()))
            }
            if (window.caches) {
              const ks = await caches.keys()
              await Promise.all(ks.map((k) => caches.delete(k)))
            }
            location.reload()
          }}
        >
          forçar atualização
        </button>
        {/* o Entrar saiu do topo: atletas tocavam nele achando que precisavam entrar */}
        {online && !userEmail && (
          <>
            {' · '}
            <button className="linkish" onClick={() => setLogin(true)}>🔒 Área da organização</button>
          </>
        )}
      </p>

      <nav className="tabbar" style={{ ['--i' as string]: abas.findIndex((t) => t.id === abaVisivel), ['--n' as string]: abas.length }}>
        {/* a pilula desliza ate a aba tocada (dono, 17/11); some com a lista de presenca aberta */}
        {!lista && abas.some((t) => t.id === abaVisivel) && <span className="tabbar-pilula" aria-hidden="true" />}
        {abas.map((t) => (
          <button key={t.id} className={!lista && abaVisivel === t.id ? 'active' : ''} onClick={() => irParaAba(t.id)}>
            <span className="ic"><IconeDaAba id={t.id} /></span>
            {t.label}
          </button>
        ))}
      </nav>

      {login && <LoginModal onClose={() => setLogin(false)} onDone={() => { setLogin(false); show('Bem-vinda! 💗') }} signIn={signIn} />}
      <Toast message={msg} />
    </div>
  )
}

function LoginModal({
  onClose,
  onDone,
  signIn,
}: {
  onClose: () => void
  onDone: () => void
  signIn: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      await signIn(email.trim(), password)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui entrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Entrar como organizadora" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>E-mail</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Senha</span>
          <input className="input" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        </label>
        {err && <div className="banner err" style={{ margin: 0 }}>{err}</div>}
        <button className="btn pink block" disabled={busy || !email || !password} onClick={() => void submit()}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="tiny muted" style={{ margin: 0 }}>
          Só quem organiza precisa entrar. As outras meninas abrem o link e já veem o ranking.
        </p>
      </div>
    </Modal>
  )
}
