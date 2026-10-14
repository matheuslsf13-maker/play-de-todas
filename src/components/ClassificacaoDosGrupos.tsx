import { categoriasDoPlay, classificacaoDasDuplasFixas, classificarGrupo, colocacoesDaCategoria, duosDaCategoria } from '../lib/campeonato'
import { duplasDaFase2, ordemDaFase2 } from '../lib/pairing'
import { isPlayed } from '../lib/scoring'
import type { Match, PlaySession } from '../lib/types'

/**
 * A FASE DE GRUPOS NO RANKING DO DIA (grupos+duplas e campeonato).
 *
 * A fase de grupos nao pontua, mas e ela que decide as duplas -- e cada menina
 * quer saber onde esta e com quem cairia do outro grupo. Por categoria:
 *
 *  - a classificacao de CADA GRUPO (vitorias, pontos, saldo; empatadas dividem
 *    a posicao ate o desempate em quadra);
 *  - a ORDEM NA CATEGORIA: a fila que forma as duplas (todas as 1as, depois as
 *    2as..., cada colocacao por vitorias, pontos e saldo), com a dupla em que
 *    cada uma caiu -- e o que deixa conferir se as duplas sairam certas;
 *  - as duplas: "se acabasse agora" durante a fase 1, e as formadas depois.
 *
 * Antes, isto sumia quando as duplas eram formadas -- exatamente a hora em que
 * a organizadora queria conferir. Agora continua, recolhido.
 */
export default function ClassificacaoDosGrupos({
  session,
  matches,
  nameOf,
  soCategoria = null,
}: {
  session: PlaySession
  matches: Match[]
  nameOf: (id: string) => string
  /** No campeonato, a categoria escolhida no seletor do ranking (null = todas). */
  soCategoria?: number | null
}) {
  const cats = categoriasDoPlay(session)
  const varias = cats.length > 1
  const alvo = session.duplas_mm ?? 8

  return (
    <>
      {cats.map((c, ci) => {
        if (soCategoria !== null && soCategoria !== ci) return null
        if (session.duplas_definidas?.length) {
          return (
            <DuplasFixasDaCategoria
              key={ci}
              session={session}
              matches={matches}
              ci={ci}
              titulo={varias ? `🏆 Categoria ${c.nome}` : '🤝 Duplas fixas'}
              nameOf={nameOf}
              alvo={alvo}
            />
          )
        }
        const grupos = c.grupos.map((gi) => {
          const grupo = session.groups?.[gi] ?? []
          const doGrupo = new Set(grupo)
          const ms = matches.filter((m) => (m.fase ?? 1) === 1 && doGrupo.has(m.team_a[0]))
          const desempates = (session.desempates_grupo ?? []).filter((d) => d.grupo === gi)
          return { gi, ms, ...classificarGrupo(grupo, ms, desempates) }
        })
        const jogou = grupos.some((g) => g.ms.some(isPlayed))
        const formadas = duosDaCategoria(session, ci)
        // "se acabasse agora" so faz sentido com todos os grupos andando: um
        // grupo parado e todo mundo empatado em zero, e a dupla prevista seria chute
        const todosAndando = grupos.every((g) => g.ms.some(isPlayed))
        const acabou = grupos.every((g) => g.ms.length > 0 && g.ms.every(isPlayed))
        const { colocacoes } = colocacoesDaCategoria(session, ci, matches)
        const pelaRegra = todosAndando ? duplasDaFase2(colocacoes, alvo) : []
        const ordem = ordemDaFase2(colocacoes)
        // em que dupla cada uma esta: as formadas valem; antes delas, a previsao
        const duplas = formadas.length ? formadas : pelaRegra
        const duplaDe = new Map<string, number>()
        duplas.forEach((d, i) => d.forEach((id) => duplaDe.set(id, i + 1)))
        const chave = (ds: readonly (readonly string[])[]) => ds.map((d) => [...d].sort().join('+')).sort().join('|')
        const diferente = formadas.length > 0 && pelaRegra.length > 0 && chave(formadas) !== chave(pelaRegra)

        const titulo = (
          <>
            {varias ? `🏆 Categoria ${c.nome} · ` : '👥 '}fase de grupos{' '}
            <span className="tiny muted" style={{ fontWeight: 600 }}>· classificação, não pontua</span>
          </>
        )

        const corpo = !jogou ? (
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

            {grupos.length > 1 && todosAndando && (
              <>
                <div className="section-title" style={{ fontSize: 12, marginTop: 10 }}>
                  📋 Ordem {varias ? 'na categoria' : 'geral'}{' '}
                  <span className="tiny muted" style={{ fontWeight: 600 }}>· é ela que forma as duplas</span>
                </div>
                <p className="tiny muted" style={{ marginTop: 0 }}>
                  Primeiro as 1ª de cada grupo, depois as 2ª, e assim por diante. Na mesma colocação vale
                  quem tem mais vitórias, depois pontos, depois saldo. Cada uma faz dupla com a vizinha de
                  baixo que seja de outro grupo.
                </p>
                <div className="scroll-x" style={{ marginBottom: 8 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th style={{ textAlign: 'left' }}>Nome</th>
                        <th title="grupo e colocação no grupo">Grupo</th>
                        <th title="vitórias">V</th>
                        <th title="pontos">Pts</th>
                        <th title="saldo de games">Saldo</th>
                        <th title="em que dupla da fase 2">Dupla</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordem.map((o, i) => {
                        const fora = i >= alvo * 2
                        const d = duplaDe.get(o.id)
                        return (
                          <tr key={o.id} style={fora && !d ? { opacity: 0.5 } : undefined}>
                            <td>{i + 1}</td>
                            <td style={{ textAlign: 'left' }}>{nameOf(o.id)}</td>
                            <td>
                              G{o.grupo + 1} · {o.posicao}º
                            </td>
                            <td>{o.vitorias}</td>
                            <td>{o.pontos}</td>
                            <td>{o.saldo > 0 ? `+${o.saldo}` : o.saldo}</td>
                            <td>{d ? `${d}ª` : fora ? 'fora' : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {duplas.length > 0 && (
              <div className="banner info" style={{ marginTop: 4 }}>
                <strong>
                  {formadas.length ? 'Duplas formadas' : acabou ? 'Duplas da fase 2' : 'Se acabasse agora'}
                </strong>
                {!formadas.length && !acabou && <span className="tiny"> (parcial — muda a cada placar)</span>}
                <div className="stack" style={{ gap: 2, marginTop: 6 }}>
                  {duplas.map((d, i) => (
                    <span key={i} className="tiny">
                      {i + 1}ª dupla: <strong>{nameOf(d[0])} + {nameOf(d[1])}</strong>
                    </span>
                  ))}
                </div>
                {!formadas.length && acabou && grupos.some((g) => g.pendente.length > 0) && (
                  <span className="tiny" style={{ display: 'block', marginTop: 6 }}>
                    ⚖️ Há empatadas em tudo: a vaga delas depende do desempate em quadra.
                  </span>
                )}
              </div>
            )}
            {diferente && (
              <div className="banner warn" style={{ marginTop: 6 }}>
                ⚠️ Pela classificação de agora, a regra formaria duplas diferentes — algum placar da fase de
                grupos mudou depois de formar, ou houve troca no meio do play. Valem as duplas formadas.
                <div className="stack" style={{ gap: 2, marginTop: 6 }}>
                  {pelaRegra.map((d, i) => (
                    <span key={i} className="tiny">
                      pela regra, {i + 1}ª dupla: {nameOf(d[0])} + {nameOf(d[1])}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )

        // com as duplas ja formadas a chave e o que importa: a fase de grupos
        // fica recolhida, a um toque, para conferir
        return formadas.length ? (
          <details key={ci} style={{ marginBottom: 14 }}>
            <summary className="section-title" style={{ fontSize: 13, cursor: 'pointer' }}>
              {titulo} <span className="tiny muted">· toque para conferir</span>
            </summary>
            {corpo}
          </details>
        ) : (
          <div key={ci} style={{ marginBottom: 14 }}>
            <div className="section-title" style={{ fontSize: 13 }}>{titulo}</div>
            {corpo}
          </div>
        )
      })}
    </>
  )
}

/**
 * DUPLAS FIXAS: a classificacao das duplas da categoria na fase 1 (todas contra
 * todas) e quem vai para a chave. Depois que a chave existe, fica recolhida.
 */
function DuplasFixasDaCategoria({
  session,
  matches,
  ci,
  titulo,
  nameOf,
  alvo,
}: {
  session: PlaySession
  matches: Match[]
  ci: number
  titulo: string
  nameOf: (id: string) => string
  alvo: number
}) {
  const { linhas, partidas } = classificacaoDasDuplasFixas(session, ci, matches)
  const jogou = partidas.some(isPlayed)
  const chaveMontada = duosDaCategoria(session, ci).length > 0
  const faltam = partidas.filter((m) => !isPlayed(m)).length
  const corpo = !jogou ? (
    <p className="tiny muted" style={{ marginTop: 0 }}>A classificação começa com o primeiro placar.</p>
  ) : (
    <>
      <div className="scroll-x" style={{ marginBottom: 6 }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th style={{ textAlign: 'left' }}>Dupla</th>
              <th title="jogos">J</th>
              <th title="vitórias">V</th>
              <th title="pontos">Pts</th>
              <th title="saldo de games">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.dupla.join('+')} style={i >= alvo ? { opacity: 0.5 } : undefined}>
                <td>{l.posicao}º</td>
                <td style={{ textAlign: 'left' }}>
                  {nameOf(l.dupla[0])} + {nameOf(l.dupla[1])}
                  {l.empatadas.length > 0 && <span className="tiny muted"> · empatadas</span>}
                  {i >= alvo && <span className="tiny muted"> · fora da chave</span>}
                </td>
                <td>{l.jogos}</td>
                <td>{l.vitorias}</td>
                <td>{l.pontos}</td>
                <td>{l.saldo > 0 ? `+${l.saldo}` : l.saldo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        {faltam > 0
          ? `Parcial: faltam ${faltam} partida${faltam === 1 ? '' : 's'}. `
          : ''}
        A ordem é a da chave: vitórias, depois pontos, saldo, confronto direto e, se ainda empatar,
        desempate em quadra. As melhores passam de bye quando a chave não fecha.
      </p>
    </>
  )
  const cabecalho = (
    <>
      {titulo} · fase de classificação{' '}
      <span className="tiny muted" style={{ fontWeight: 600 }}>· não pontua</span>
    </>
  )
  return chaveMontada ? (
    <details style={{ marginBottom: 14 }}>
      <summary className="section-title" style={{ fontSize: 13, cursor: 'pointer' }}>
        {cabecalho} <span className="tiny muted">· toque para conferir</span>
      </summary>
      {corpo}
    </details>
  ) : (
    <div style={{ marginBottom: 14 }}>
      <div className="section-title" style={{ fontSize: 13 }}>{cabecalho}</div>
      {corpo}
    </div>
  )
}
