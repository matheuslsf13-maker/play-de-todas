import { categoriasDoPlay, classificarGrupo, colocacoesDaCategoria, duosDaCategoria } from '../lib/campeonato'
import { duplasDaFase2 } from '../lib/pairing'
import { isPlayed } from '../lib/scoring'
import type { Match, PlaySession } from '../lib/types'

/**
 * A FASE DE GRUPOS NO RANKING DO DIA (grupos+duplas e campeonato).
 *
 * A fase de grupos nao pontua, mas e ela que decide as duplas -- e cada menina
 * quer saber onde esta e com quem cairia do outro grupo. Por categoria, a
 * classificacao de cada grupo (vitorias, pontos, saldo; empatadas dividem a
 * posicao ate o desempate em quadra) e as duplas "se acabasse agora", pela
 * mesma regra que vai forma-las de verdade (1a com 1a).
 */
export default function ClassificacaoDosGrupos({
  session,
  matches,
  nameOf,
}: {
  session: PlaySession
  matches: Match[]
  nameOf: (id: string) => string
}) {
  const cats = categoriasDoPlay(session)
  const varias = cats.length > 1
  // so as categorias que ainda nao formaram as duplas: depois disso vale a chave
  const naFase1 = cats.map((c, ci) => ({ c, ci })).filter(({ ci }) => duosDaCategoria(session, ci).length === 0)
  if (naFase1.length === 0) return null

  return (
    <>
      {naFase1.map(({ c, ci }) => {
        const grupos = c.grupos.map((gi) => {
          const grupo = session.groups?.[gi] ?? []
          const doGrupo = new Set(grupo)
          const ms = matches.filter((m) => (m.fase ?? 1) === 1 && doGrupo.has(m.team_a[0]))
          const desempates = (session.desempates_grupo ?? []).filter((d) => d.grupo === gi)
          return { gi, ms, ...classificarGrupo(grupo, ms, desempates) }
        })
        const jogou = grupos.some((g) => g.ms.some(isPlayed))
        // "se acabasse agora" so faz sentido com todos os grupos andando: um
        // grupo parado e todo mundo empatado em zero, e a dupla prevista seria chute
        const todosAndando = grupos.every((g) => g.ms.some(isPlayed))
        const acabou = grupos.every((g) => g.ms.length > 0 && g.ms.every(isPlayed))
        const { colocacoes } = colocacoesDaCategoria(session, ci, matches)
        const previstas = todosAndando ? duplasDaFase2(colocacoes, session.duplas_mm ?? 8) : []
        return (
          <div key={ci} style={{ marginBottom: 14 }}>
            <div className="section-title" style={{ fontSize: 13 }}>
              {varias ? `🏆 Categoria ${c.nome} · ` : '👥 '}fase de grupos{' '}
              <span className="tiny muted" style={{ fontWeight: 600 }}>· classificação, não pontua</span>
            </div>
            {!jogou ? (
              <p className="tiny muted" style={{ marginTop: 0 }}>A classificação começa com o primeiro placar.</p>
            ) : (
              <>
                {grupos.map((g, k) =>
                  !g.ms.some(isPlayed) ? (
                    <p key={g.gi} className="tiny muted" style={{ margin: '0 0 8px' }}>
                      Grupo {k + 1}: ainda não começou.
                    </p>
                  ) : (
                  <div key={g.gi} className="scroll-x" style={{ marginBottom: 8 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th style={{ textAlign: 'left' }}>Grupo {k + 1}</th>
                          <th title="vitórias">V</th>
                          <th title="pontos">Pts</th>
                          <th title="saldo de games">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.linhas.map((l) => (
                          <tr key={l.id}>
                            <td>{l.posicao}º</td>
                            <td style={{ textAlign: 'left' }}>
                              {nameOf(l.id)}
                              {l.empatadas.length > 0 && <span className="tiny muted"> · empatadas</span>}
                            </td>
                            <td>{l.vitorias}</td>
                            <td>{l.pontos}</td>
                            <td>{l.saldo > 0 ? `+${l.saldo}` : l.saldo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  ),
                )}
                {previstas.length > 0 && (
                  <div className="banner info" style={{ marginTop: 4 }}>
                    <strong>{acabou ? 'Duplas da fase 2' : 'Se acabasse agora'}</strong>
                    {!acabou && <span className="tiny"> (parcial — muda a cada placar)</span>}
                    <div className="stack" style={{ gap: 2, marginTop: 6 }}>
                      {previstas.map((d, i) => (
                        <span key={i} className="tiny">
                          {i + 1}ª dupla: <strong>{nameOf(d[0])} + {nameOf(d[1])}</strong>
                        </span>
                      ))}
                    </div>
                    {acabou && grupos.some((g) => g.pendente.length > 0) && (
                      <span className="tiny" style={{ display: 'block', marginTop: 6 }}>
                        ⚖️ Há empatadas em tudo: a vaga delas depende do desempate em quadra.
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
