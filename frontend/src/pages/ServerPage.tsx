import {useState} from 'react'
import {Link, useParams} from 'react-router'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {get, post} from '../api/client'
import type {ServerDetail} from '../bindings/ServerDetail'
import {CategoryBadge, LifecycleBadge} from '../components/Badges'

export function ServerPage() {
    const {id} = useParams()
    const serverId = Number(id)
    const qc = useQueryClient()
    const [error, setError] = useState<string | null>(null)

    const detail = useQuery({
        queryKey: ['server', serverId],
        queryFn: () => get<ServerDetail>(`/api/servers/${serverId}`),
        // Discovery runs in a worker: poll while it is in flight, and keep a slow
        // poll otherwise so a finished retry is reflected without a reload.
        refetchInterval: (q) => (q.state.data?.lifecycle === 'activating' ? 2000 : 15000),
    })

    const retry = useMutation({
        mutationFn: () => post<{ ok: boolean }>(`/api/servers/${serverId}/activate`, {}),
        onSuccess: () => {
            setError(null)
            void qc.invalidateQueries({queryKey: ['server', serverId]})
            void qc.invalidateQueries({queryKey: ['servers']})
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao reenviar a descoberta'),
    })

    if (detail.isLoading)
        return (
            <main className="page">
                <p className="muted">Carregando…</p>
            </main>
        )
    if (!detail.data)
        return (
            <main className="page">
                <p className="muted">Servidor não encontrado.</p>
            </main>
        )

    const s = detail.data
    const byCategory = s.tools.reduce<Record<string, number>>((acc, t) => {
        acc[t.category] = (acc[t.category] ?? 0) + 1
        return acc
    }, {})

    // Discovery is a background worker: if it is wedged (a dead worker, a
    // restart mid-flight, a hung remote) the row stays "activating" forever with
    // no tools. That state needs an escape hatch, so offer a retry.
    const stuckDiscovering = s.lifecycle === 'activating' && s.tools.length === 0
    const neverDiscovered = s.lifecycle === 'new' && s.tools.length === 0
    const showRetry = stuckDiscovering || neverDiscovered

    return (
        <main className="page">
            <div className="spread">
                <div>
                    <h1>{s.title}</h1>
                    <p className="subtitle">
                        <span className="mono">{s.registry_name}</span> · v{s.version} ·{' '}
                        <LifecycleBadge lifecycle={s.lifecycle}/>
                    </p>
                </div>
                <Link to="/registry">← voltar ao registro</Link>
            </div>

            {error && <div className="error-box">{error}</div>}

            {stuckDiscovering && (
                <div className="card" style={{marginBottom: 16, borderColor: 'var(--amber)'}}>
                    <div className="spread">
            <span>
              A descoberta está em andamento há um tempo e ainda não trouxe nenhuma tool. Isso pode
              acontecer se o worker caiu no meio do processo ou o servidor remoto não respondeu.
            </span>
                        <button
                            type="button"
                            className="primary"
                            disabled={retry.isPending}
                            onClick={() => retry.mutate()}
                        >
                            {retry.isPending ? 'Reenviando…' : '↻ Retry descoberta'}
                        </button>
                    </div>
                </div>
            )}

            <div className="grid-2">
                <div className="card">
                    <h3 style={{marginTop: 0}}>Metadados</h3>
                    <p>{s.description ?? '—'}</p>
                    <div className="mono muted">
                        endpoint: {s.remote_type} {s.remote_url}
                    </div>
                    <div className="mono muted">registry: {s.registry_status}</div>
                    {s.activated_at && (
                        <div className="mono muted">ativado em: {new Date(s.activated_at).toLocaleString()}</div>
                    )}
                    {s.last_error && <div className="error-box">{s.last_error}</div>}
                    {showRetry && !s.last_error && (
                        <button
                            type="button"
                            className="small"
                            style={{marginTop: 12}}
                            disabled={retry.isPending}
                            onClick={() => retry.mutate()}
                        >
                            {retry.isPending ? 'Reenviando…' : '↻ Retry descoberta'}
                        </button>
                    )}
                </div>
                <div className="card">
                    <h3 style={{marginTop: 0}}>Tools ({s.tools.length})</h3>
                    {s.tools.length === 0 ? (
                        <p className="muted">
                            {s.lifecycle === 'activating'
                                ? 'Descoberta em andamento — as tools aparecem aqui assim que o servidor remoto responder. Se demorar, use o Retry.'
                                : 'Nenhuma tool descoberta ainda. Ative o servidor no registro para rodar a descoberta.'}
                        </p>
                    ) : (
                        <>
                            <div className="row">
                                {Object.entries(byCategory).map(([cat, n]) => (
                                    <span key={cat} className="row">
                    <CategoryBadge category={cat}/> <span className="muted">×{n}</span>
                  </span>
                                ))}
                            </div>
                            <table style={{marginTop: 12}}>
                                <tbody>
                                {s.tools.map((t) => (
                                    <tr key={t.id}>
                                        <td className="mono">{t.tool_name}</td>
                                        <td>
                                            <CategoryBadge category={t.category}/>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            </div>
        </main>
    )
}
