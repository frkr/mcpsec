import {useEffect, useState} from 'react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {del, get, post} from '../api/client'
import type {GrantedToolView} from '../bindings/GrantedToolView'
import type {ServerDetail} from '../bindings/ServerDetail'
import type {SessionView} from '../bindings/SessionView'
import {CategoryBadge} from '../components/Badges'

const MCP_URL = `${window.location.origin}/mcp`

export function ProxyPage() {
    const qc = useQueryClient()
    const [error, setError] = useState<string | null>(null)
    const [newToken, setNewToken] = useState<string | null>(null)
    const [toolTtl, setToolTtl] = useState(1200)

    const sessions = useQuery({
        queryKey: ['proxy-sessions'],
        queryFn: () => get<{ sessions: SessionView[] }>('/api/proxy/sessions'),
    })
    const authorized = useQuery({
        queryKey: ['authorized'],
        queryFn: () => get<{ servers: ServerDetail[] }>('/api/servers/authorized'),
    })

    const create = useMutation({
        mutationFn: (payload: { tool_ttl_seconds: number }) =>
            post<SessionView>('/api/proxy/sessions', payload),
        onSuccess: (data) => {
            setNewToken(data.token ?? null)
            void qc.invalidateQueries({queryKey: ['proxy-sessions']})
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao criar sessão'),
    })

    const revoke = useMutation({
        mutationFn: (id: number) => del(`/api/proxy/sessions/${id}`),
        onSuccess: () => void qc.invalidateQueries({queryKey: ['proxy-sessions']}),
    })

    const addTools = useMutation({
        mutationFn: (payload: { id: number; server_id: number; ttl_seconds: number }) =>
            post(`/api/proxy/sessions/${payload.id}/tools`, {
                server_id: payload.server_id,
                ttl_seconds: payload.ttl_seconds,
            }),
        onSuccess: () => {
            setError(null)
            void qc.invalidateQueries({queryKey: ['proxy-sessions']})
            void qc.invalidateQueries({queryKey: ['proxy-session-tools']})
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao adicionar tools'),
    })

    const liveSessions = (sessions.data?.sessions ?? []).filter((s) => !s.revoked)
    const [selectedSession, setSelectedSession] = useState<number | null>(null)
    const current = selectedSession ?? liveSessions[0]?.id ?? null

    const tools = useQuery({
        queryKey: ['proxy-session-tools', current],
        queryFn: () => get<{ tools: GrantedToolView[] }>(`/api/proxy/sessions/${current}/tools`),
        enabled: current !== null,
        refetchInterval: 5000,
    })

    useEffect(() => {
        if (current === null && liveSessions.length > 0) setSelectedSession(liveSessions[0].id)
    }, [liveSessions, current])

    return (
        <main className="page">
            <h1>Proxy MCP</h1>
            <p className="subtitle">
                Um servidor MCP único (<span className="mono">{MCP_URL}</span>) que expõe{' '}
                <span className="mono">tool_search</span> e <span className="mono">tool_add</span> e passa a
                expor as tools que você carregar — cada carga vale um tempo (TTL) e expira sozinha.
            </p>

            {error && <div className="error-box">{error}</div>}

            <div className="grid-2">
                <div className="card">
                    <h3 style={{marginTop: 0}}>Criar sessão</h3>
                    <label htmlFor="ttl">TTL das tools carregadas (segundos)</label>
                    <input
                        id="ttl"
                        type="number"
                        min={30}
                        value={toolTtl}
                        onChange={(e) => setToolTtl(Number(e.target.value))}
                    />
                    <div className="row" style={{marginTop: 12}}>
                        <button
                            type="button"
                            className="primary"
                            disabled={create.isPending}
                            onClick={() => create.mutate({tool_ttl_seconds: toolTtl})}
                        >
                            Criar sessão de proxy
                        </button>
                    </div>

                    {newToken && (
                        <div style={{marginTop: 14}}>
                            <div className="muted">Token (mostrado uma única vez):</div>
                            <div className="result-box">{newToken}</div>
                            <div className="muted mono" style={{marginTop: 8}}>
                                curl -X POST {MCP_URL} \<br/>
                                &nbsp;&nbsp;-H "Authorization: Bearer {newToken}" \<br/>
                                &nbsp;&nbsp;-H 'Content-Type: application/json' \<br/>
                                &nbsp;&nbsp;-d
                                '{"{"}"jsonrpc":"2.0","id":1,"method":"tools/list","params":{'{'}{"}"}{"}"}'
                            </div>
                        </div>
                    )}

                    <h3 style={{marginTop: 24}}>Sessões</h3>
                    <table>
                        <thead>
                        <tr>
                            <th>#</th>
                            <th>TTL tools</th>
                            <th>Expira</th>
                            <th></th>
                        </tr>
                        </thead>
                        <tbody>
                        {(sessions.data?.sessions ?? []).map((s) => (
                            <tr key={s.id}>
                                <td className="mono">{s.id}</td>
                                <td>{s.tool_ttl_seconds}s</td>
                                <td className="muted">
                                    {s.revoked
                                        ? 'revogada'
                                        : s.expires_at
                                            ? new Date(s.expires_at).toLocaleString()
                                            : '—'}
                                </td>
                                <td>
                                    {!s.revoked && (
                                        <button type="button" className="small danger"
                                                onClick={() => revoke.mutate(s.id)}>
                                            Revogar
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {(sessions.data?.sessions ?? []).length === 0 && (
                            <tr>
                                <td colSpan={4} className="muted">Nenhuma sessão ainda.</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>

                <div>
                    <div className="card">
                        <h3 style={{marginTop: 0}}>Tools carregadas na sessão</h3>
                        <div className="toolbar">
                            <select value={current ?? ''} onChange={(e) => setSelectedSession(Number(e.target.value))}>
                                {liveSessions.map((s) => (
                                    <option key={s.id} value={s.id}>sessão #{s.id}</option>
                                ))}
                            </select>
                        </div>
                        {tools.data && tools.data.tools.length === 0 && (
                            <p className="muted">
                                Só <span className="mono">tool_search</span> e <span
                                className="mono">tool_add</span>{' '}
                                visíveis. Carregue um servidor abaixo (ou pela própria tool_add no MCP).
                            </p>
                        )}
                        <table>
                            <thead>
                            <tr>
                                <th>Tool</th>
                                <th>Servidor</th>
                                <th>Categoria</th>
                                <th>Expira</th>
                            </tr>
                            </thead>
                            <tbody>
                            {(tools.data?.tools ?? []).map((t) => (
                                <tr key={t.tool_id}>
                                    <td className="mono">{t.tool_name}</td>
                                    <td className="mono muted">{t.server}</td>
                                    <td><CategoryBadge category={t.category}/></td>
                                    <td className="muted mono">{new Date(t.expires_at).toLocaleTimeString()}</td>
                                </tr>
                            ))}
                            {(tools.data?.tools ?? []).length === 0 && (
                                <tr>
                                    <td colSpan={4} className="muted">Nenhuma tool carregada.</td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>

                    <div className="card" style={{marginTop: 16}}>
                        <h3 style={{marginTop: 0}}>Carregar tools de um servidor autorizado</h3>
                        <div className="toolbar">
                            <select
                                onChange={(e) => {
                                    if (current !== null && e.target.value) {
                                        addTools.mutate({
                                            id: current,
                                            server_id: Number(e.target.value),
                                            ttl_seconds: toolTtl
                                        })
                                        e.target.value = ''
                                    }
                                }}
                                defaultValue=""
                                disabled={current === null}
                            >
                                <option value="">Escolher servidor autorizado…</option>
                                {(authorized.data?.servers ?? []).map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.title} ({s.tools.length} tools)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <p className="muted">
                            Equivale a chamar <span className="mono">tool_add</span>; as tools aparecem no MCP do
                            proxy até {toolTtl}s depois.
                        </p>
                    </div>
                </div>
            </div>
        </main>
    )
}
