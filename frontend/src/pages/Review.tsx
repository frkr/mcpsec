import {useEffect, useState} from 'react'
import {Link, useParams} from 'react-router'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {get, post} from '../api/client'
import type {LabelInput} from '../bindings/LabelInput'
import type {ServerDetail} from '../bindings/ServerDetail'
import type {ToolView} from '../bindings/ToolView'
import {CategoryBadge, LifecycleBadge} from '../components/Badges'

const CATEGORIES = ['READ_ONLY', 'WRITE', 'ADMIN'] as const

export function Review() {
    const {id} = useParams()
    const serverId = Number(id)
    const qc = useQueryClient()
    const [labels, setLabels] = useState<Record<number, string>>({})
    const [error, setError] = useState<string | null>(null)

    const detail = useQuery({
        queryKey: ['server', serverId],
        queryFn: () => get<ServerDetail>(`/api/servers/${serverId}`),
        refetchInterval: (q) => (q.state.data?.lifecycle === 'activating' ? 2000 : false),
    })

    useEffect(() => {
        if (detail.data) {
            const initial: Record<number, string> = {}
            for (const t of detail.data.tools) initial[t.id] = t.category
            setLabels(initial)
        }
    }, [detail.data?.id, detail.data?.tools.length])

    const labelMutation = useMutation({
        mutationFn: (input: LabelInput) =>
            post(`/api/servers/${serverId}/tools/${input.tool_id}/label`, {category: input.category}),
        onSuccess: () => void qc.invalidateQueries({queryKey: ['server', serverId]}),
    })

    const approve = useMutation({
        mutationFn: (payload: { labels: LabelInput[] }) =>
            post(`/api/servers/${serverId}/approve`, payload),
        onSuccess: () => {
            setError(null)
            void qc.invalidateQueries({queryKey: ['server', serverId]})
            void qc.invalidateQueries({queryKey: ['servers']})
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao aprovar'),
    })

    const reject = useMutation({
        mutationFn: () => post(`/api/servers/${serverId}/reject`, {}),
        onSuccess: () => {
            void qc.invalidateQueries({queryKey: ['servers']})
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao rejeitar'),
    })

    if (detail.isLoading) return <main className="page"><p className="muted">Carregando…</p></main>
    if (!detail.data) return <main className="page"><p className="muted">Servidor não encontrado.</p></main>

    const s = detail.data
    const changedTools = s.tools.filter((t) => labels[t.id] !== t.category)

    return (
        <main className="page">
            <div className="spread">
                <div>
                    <h1>Revisão de ativação</h1>
                    <p className="subtitle">
                        <span style={{color: 'var(--text)'}}>{s.title}</span>{' '}
                        <span className="mono muted">{s.registry_name}</span> · <LifecycleBadge
                        lifecycle={s.lifecycle}/> ·{' '}
                        <span className="mono muted">{s.remote_url}</span>
                    </p>
                </div>
                <Link to="/registry">← voltar ao registro</Link>
            </div>

            {s.lifecycle === 'activating' && (
                <div className="card">
                    Descoberta em andamento: conectando em <span className="mono">{s.remote_url}</span>, executando
                    initialize → tools/list e classificando as tools. Esta tela atualiza sozinha.
                </div>
            )}

            {s.lifecycle === 'new' && (
                <div className="card">
                    A descoberta ainda não rodou (ou falhou: <span className="mono">{s.last_error}</span>).{' '}
                    <button
                        type="button"
                        className="small"
                        onClick={() => post(`/api/servers/${serverId}/activate`, {}).then(() => qc.invalidateQueries({queryKey: ['server', serverId]}))}
                    >
                        Rodar descoberta
                    </button>
                </div>
            )}

            {error && <div className="error-box">{error}</div>}

            {s.tools.length > 0 && (
                <>
                    <p className="muted">
                        Rótulos sugeridos pela heurística (classificados automaticamente). Ajuste antes de aprovar —
                        WRITE e ADMIN exigirão confirmação explícita a cada execução.
                    </p>
                    <div className="card">
                        <table>
                            <thead>
                            <tr>
                                <th>Tool</th>
                                <th>Descrição</th>
                                <th>Categoria</th>
                                <th>Confiança</th>
                            </tr>
                            </thead>
                            <tbody>
                            {s.tools.map((t: ToolView) => (
                                <tr key={t.id}>
                                    <td className="mono">{t.tool_name}</td>
                                    <td className="muted" style={{maxWidth: 380}}>{t.description ?? '—'}</td>
                                    <td>
                                        <div className="row">
                                            {CATEGORIES.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className="small"
                                                    style={
                                                        labels[t.id] === c
                                                            ? {borderColor: 'var(--accent)', color: 'var(--accent)'}
                                                            : undefined
                                                    }
                                                    onClick={() => {
                                                        setLabels((prev) => ({...prev, [t.id]: c}))
                                                        labelMutation.mutate({tool_id: t.id, category: c})
                                                    }}
                                                >
                                                    {c}
                                                </button>
                                            ))}
                                            <CategoryBadge category={t.category}/>
                                            {t.classified_by === 'user' && <span className="muted">(revisado)</span>}
                                        </div>
                                    </td>
                                    <td className="mono muted">
                                        {t.confidence == null ? '—' : `${Math.round(t.confidence * 100)}%`}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {s.lifecycle === 'awaiting_review' && (
                        <div className="row" style={{marginTop: 16}}>
                            <button
                                type="button"
                                className="primary"
                                disabled={approve.isPending}
                                onClick={() =>
                                    approve.mutate({
                                        labels: changedTools.map((t) => ({tool_id: t.id, category: labels[t.id]})),
                                    })
                                }
                            >
                                Aprovar e ativar{changedTools.length > 0 ? ` (${changedTools.length} ajustes)` : ''}
                            </button>
                            <button
                                type="button"
                                className="danger"
                                disabled={reject.isPending}
                                onClick={() => reject.mutate()}
                            >
                                Rejeitar servidor
                            </button>
                        </div>
                    )}
                </>
            )}
        </main>
    )
}
