import { useEffect, useRef, useState } from 'react'
import { BotaoInstalar } from './components/InstalarApp'
import { Logo, Modal, Toast, useToast } from './components/ui'
import { useStore } from './lib/store'
import { aplicarTema, temaSalvo, type Tema } from './lib/tema'
import Checkins from './pages/Checkins'
import Play from './pages/Play'
import Players from './pages/Players'
import Ranking from './pages/Ranking'
import Stats from './pages/Stats'

type Tab = 'ranking' | 'play' | 'players' | 'stats' | 'checkins'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'ranking', label: 'Ranking', icon: '🏆' },
  { id: 'play', label: 'Play', icon: '🎾' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'players', label: 'Meninas', icon: '👯' },
  { id: 'checkins', label: 'Check-ins', icon: '✅' },
]

/**
 * A aba aberta fica guardada no aparelho: o app recarrega ao voltar para a
 * tela (e no F5), e cair sempre no Ranking obrigava a navegar de novo.
 */
const CHAVE_DA_ABA = 'play-de-todas:aba'

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
  const { loading, error, online, canEdit, userEmail, signIn, signOut, sync, pendingCount } = useStore()
  const [tab, setTab] = useState<Tab>(abaSalva)
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_DA_ABA, tab)
    } catch {
      /* sem localStorage: paciencia */
    }
  }, [tab])
  /** Aba de Stats pedida por outra tela (o “ver a força” do Ranking). */
  const [abrirStats, setAbrirStats] = useState<'jogadora' | 'duplas' | 'forca' | null>(null)
  const [abrirPlay, setAbrirPlay] = useState<string | null>(null)
  const primeiraRenderizacao = useRef(true)

  // trocar de aba comeca a leitura do topo; sem isso a pagina "pula" quando a
  // aba nova e mais curta que a anterior
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false
      return
    }
    window.scrollTo(0, 0)
  }, [tab])
  const [login, setLogin] = useState(false)
  const [tema, setTema] = useState<Tema>(() => temaSalvo())
  const { msg, show } = useToast()

  function trocarTema() {
    const novo: Tema = tema === 'escuro' ? 'claro' : 'escuro'
    aplicarTema(novo)
    setTema(novo)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="row spread">
          <Logo size={46} />
          <div className="grow">
            <h1>Play <span>de Todas</span></h1>
            <div className="sub">
              <span>Beach Tennis · V3 Arena</span>
              {online && canEdit ? (
                <span className={`sync ${sync}`}>
                  <span className="dot" />
                  {sync === 'saved' ? 'tudo salvo' : sync === 'saving' ? 'salvando…' : `${pendingCount} para enviar`}
                </span>
              ) : (
                <>
                  <span className={`dot ${online ? 'on' : 'off'}`} />
                  <span>{online ? 'só leitura' : 'modo local'}</span>
                </>
              )}
              <BotaoInstalar />
            </div>
          </div>
          <button
            className="bt-tema"
            onClick={trocarTema}
            title={tema === 'escuro' ? 'Mudar para o modo diurno' : 'Mudar para o modo noturno'}
            aria-label={tema === 'escuro' ? 'Mudar para o modo diurno' : 'Mudar para o modo noturno'}
          >
            {tema === 'escuro' ? '☀️' : '🌙'}
          </button>
          {online && (
            userEmail
              ? <button className="btn ghost sm" onClick={() => void signOut()}>Sair</button>
              : <button className="btn pink sm" onClick={() => setLogin(true)}>Entrar</button>
          )}
        </div>
      </header>

      {pendingCount > 0 ? (
        <div className="banner warn">
          📶 Sem conexão no momento — <strong>{pendingCount} alteração(ões)</strong> guardada(s) no celular.
          Pode continuar lançando: assim que o sinal voltar eu envio tudo sozinho.
        </div>
      ) : (
        error && <div className="banner err">{error}</div>
      )}
      {online && !canEdit && (
        <div className="banner warn row spread" style={{ gap: 12 }}>
          <span className="grow">
            Você está no <strong>modo leitura</strong>: dá para ver tudo, mas não para lançar resultados.
            Quem organiza o play precisa entrar.
          </span>
          <button className="btn pink sm nowrap" onClick={() => setLogin(true)}>🔑 Entrar</button>
        </div>
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
          {tab === 'ranking' && (
            <Ranking
              onToast={show}
              onAbrirPlay={(id) => { setAbrirPlay(id); setTab('play') }}
              onVerForca={() => { setAbrirStats('forca'); setTab('stats') }}
            />
          )}
          {tab === 'play' && (
            <Play onToast={show} abrir={abrirPlay} onAbriu={() => setAbrirPlay(null)} />
          )}
          {tab === 'stats' && <Stats abrir={abrirStats} onAbriu={() => setAbrirStats(null)} />}
          {tab === 'players' && <Players onToast={show} />}
          {tab === 'checkins' && <Checkins onToast={show} />}
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
      </p>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="ic">{t.icon}</span>
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
