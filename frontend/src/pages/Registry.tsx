import {useState} from 'react'
import {Link} from 'react-router'
import {useMutation} from '@tanstack/react-query'
import {post} from '../api/client'
import type {ServerSummary} from '../bindings/ServerSummary'
import {LifecycleBadge, ServerTitle} from '../components/Badges'
import {
    useDebounced,
    useInvalidateAll,
    useServers,
    useSyncStatus,
} from '../layout/Layout'

const PAGE_SIZE = 20

export function Registry() {
    const [query, setQuery] = useState('')
    const [lifecycle, setLifecycle] = useState('all')
    const [page, setPage] = useState(1)
    const debouncedQuery = useDebounced(query, 300)
    const servers = useServers({q: debouncedQuery, lifecycle, page, pageSize: PAGE_SIZE})
    const sync = useSyncStatus()
    const invalidate = useInvalidateAll()
    const [error, setError] = useState<string | null>(null)

    const activate = useMutation({
        mutationFn: (id: number) => post<{ ok: boolean }>(`/api/servers/${id}/activate`, {}),
        onSuccess: () => {
            setError(null)
            invalidate()
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao ativar'),
    })

    const disable = useMutation({
        mutationFn: (id: number) => post<{ ok: boolean }>(`/api/servers/${id}/disable`, {}),
        onSuccess: () => {
            setError(null)
            invalidate()
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao desativar'),
    })

    const items = servers.data?.servers ?? []
    const counts = servers.data?.counts ?? {}
    // The combo's "Todos" counts the text filter only; the table pager counts
    // the fully filtered set. Mixing them is what made a status filter rewrite
    // the "Todos" number and hide the server being searched for.
    const filteredItems = servers.data?.filtered_items ?? 0
    const totalItems = servers.data?.total_items ?? 0
    const totalPages = servers.data?.total_pages ?? 1

    const runningRun = sync.data?.runs.find((r) => r.status === 'running')

    return (
        <main className="page">
            <div className="spread">
                <div>
                    <h1>Registro de MCP servers</h1>
                    <p className="subtitle">
                        Espelho local do registry oficial. Servidores novos chegam marcados como NOVO e
                        desativados; ativar inicia o workflow de descoberta e classificação.
                    </p>
                </div>
            </div>

            {error && <div className="error-box">{error}</div>}

            {runningRun && (
                <div className="card" style={{marginBottom: 16}}>
                    Sincronização em andamento — {runningRun.pages_fetched} páginas baixadas,{' '}
                    {runningRun.servers_upserted} servidores processados. A lista atualiza ao terminar.
                </div>
            )}

            <div className="toolbar">
                <input
                    placeholder="Buscar por nome, título ou descrição…"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setPage(1)
                    }}
                />
                <select
                    value={lifecycle}
                    onChange={(e) => {
                        setLifecycle(e.target.value)
                        setPage(1)
                    }}
                >
                    <option value="all">Todos ({filteredItems})</option>
                    <option value="new">NOVO ({counts.new ?? 0})</option>
                    <option value="activating">DESCOBRINDO ({counts.activating ?? 0})</option>
                    <option value="awaiting_review">EM REVISÃO ({counts.awaiting_review ?? 0})</option>
                    <option value="active">ATIVO ({counts.active ?? 0})</option>
                    <option value="rejected">REJEITADO ({counts.rejected ?? 0})</option>
                    <option value="disabled">DESATIVADO ({counts.disabled ?? 0})</option>
                </select>
                {lifecycle !== 'all' && (
                    <button
                        type="button"
                        className="small"
                        onClick={() => {
                            setLifecycle('all')
                            setPage(1)
                        }}
                    >
                        ✕ limpar filtro de status
                    </button>
                )}
            </div>

            <div className="card">
                <div className="spread" style={{marginBottom: 8}}>
          <span className="muted">
            {lifecycle === 'all' ? (
                <>
                    {filteredItems} servidor(es)
                    {debouncedQuery.trim() !== '' && ' encontrados'}
                </>
            ) : (
                <>
                    {totalItems} em “{lifecycle}”
                    {debouncedQuery.trim() !== '' && ` para “${debouncedQuery}”`}
                    {' '}· {filteredItems} no total (todos os status)
                </>
            )}
          </span>
                </div>
                <table>
                    <thead>
                    <tr>
                        <th>Servidor</th>
                        <th>Versão</th>
                        <th>Endpoint</th>
                        <th>Status</th>
                        <th style={{width: 200}}>Ações</th>
                    </tr>
                    </thead>
                    <tbody>
                    {servers.isFetching && !servers.isPlaceholderData && (
                        <tr>
                            <td colSpan={5} className="muted">
                                Carregando…
                            </td>
                        </tr>
                    )}
                    {!servers.isFetching && items.length === 0 && (
                        <tr>
                            <td colSpan={5} className="muted">
                                Nenhum servidor. A sincronização pode ser disparada em Configurações.
                            </td>
                        </tr>
                    )}
                    {items.map((s: ServerSummary) => (
                        <tr key={s.id}>
                            <td>
                                <ServerTitle server={s}/>
                                {s.description && (
                                    <div className="muted" style={{maxWidth: 420}}>
                                        {s.description.length > 140 ? `${s.description.slice(0, 140)}…` : s.description}
                                    </div>
                                )}
                                {s.last_error &&
                                    <div className="mono" style={{color: 'var(--red)'}}>{s.last_error}</div>}
                            </td>
                            <td className="mono">{s.version}</td>
                            <td className="mono muted"
                                style={{maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                {s.remote_type}: {s.remote_url}
                            </td>
                            <td>
                                <LifecycleBadge lifecycle={s.lifecycle}/>
                                {s.registry_status !== 'active' && (
                                    <div className="muted" style={{fontSize: 11}}>registry: {s.registry_status}</div>
                                )}
                            </td>
                            <td>
                                <div className="row">
                                    {(s.lifecycle === 'new' || s.lifecycle === 'rejected' || s.lifecycle === 'disabled') && (
                                        <button
                                            type="button"
                                            className="primary small"
                                            disabled={activate.isPending}
                                            onClick={() => activate.mutate(s.id)}
                                        >
                                            Ativar
                                        </button>
                                    )}
                                    {s.lifecycle === 'awaiting_review' && (
                                        <Link to={`/review/${s.id}`}>
                                            <button type="button" className="primary small">Revisar tools</button>
                                        </Link>
                                    )}
                                    {s.lifecycle === 'active' && (
                                        <>
                                            <Link to="/runner">
                                                <button type="button" className="small">Abrir runner</button>
                                            </Link>
                                            <button
                                                type="button"
                                                className="small danger"
                                                disabled={disable.isPending}
                                                onClick={() => {
                                                    if (
                                                        window.confirm(
                                                            `Desativar "${s.title}"? Ele sai do runner e do proxy MCP até ser reativado.`,
                                                        )
                                                    ) {
                                                        disable.mutate(s.id)
                                                    }
                                                }}
                                            >
                                                Desativar
                                            </button>
                                        </>
                                    )}
                                    <Link to={`/server/${s.id}`}>
                                        <button type="button" className="small">Detalhes</button>
                                    </Link>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                <Pagination
                    page={servers.data?.page ?? page}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                />
            </div>

            {sync.data && sync.data.runs.length > 0 && (
                <div style={{marginTop: 20}}>
                    <h2 style={{fontSize: 15}}>Últimas sincronizações</h2>
                    <div className="card">
                        <table>
                            <thead>
                            <tr>
                                <th>Início</th>
                                <th>Tipo</th>
                                <th>Status</th>
                                <th>Vistos</th>
                                <th>Novos</th>
                                <th>Páginas</th>
                            </tr>
                            </thead>
                            <tbody>
                            {sync.data.runs.slice(0, 5).map((r) => (
                                <tr key={r.id}>
                                    <td className="mono">{new Date(r.started_at).toLocaleString()}</td>
                                    <td>{r.run_type}</td>
                                    <td>
                                        <span className={`badge status-${r.status}`}>{r.status}</span>
                                        {r.error && <div className="mono" style={{color: 'var(--red)'}}>{r.error}</div>}
                                    </td>
                                    <td>{r.servers_seen}</td>
                                    <td>{r.servers_new}</td>
                                    <td>{r.pages_fetched}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </main>
    )
}

/** Compact pager: first/prev, windowed page numbers, next/last. */
function Pagination({
                        page,
                        totalPages,
                        totalItems,
                        pageSize,
                        onChange,
                    }: {
    page: number
    totalPages: number
    totalItems: number
    pageSize: number
    onChange: (page: number) => void
}) {
    if (totalPages <= 1) {
        return (
            <div className="pager muted">
                {totalItems} servidor(es)
            </div>
        )
    }

    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, totalItems)

    // Show up to 7 numbers around the current page.
    const window: number[] = []
    const start = Math.max(1, Math.min(page - 3, totalPages - 6))
    const end = Math.min(totalPages, start + 6)
    for (let i = start; i <= end; i += 1) window.push(i)

    return (
        <div className="pager">
      <span className="muted">
        {from}–{to} de {totalItems}
      </span>
            <div className="row">
                <button type="button" className="small" disabled={page <= 1} onClick={() => onChange(1)}>
                    «
                </button>
                <button type="button" className="small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
                    Anterior
                </button>
                {start > 1 && <span className="muted">…</span>}
                {window.map((n) => (
                    <button
                        key={n}
                        type="button"
                        className="small"
                        style={n === page ? {borderColor: 'var(--accent)', color: 'var(--accent)'} : undefined}
                        onClick={() => onChange(n)}
                    >
                        {n}
                    </button>
                ))}
                {end < totalPages && <span className="muted">…</span>}
                <button
                    type="button"
                    className="small"
                    disabled={page >= totalPages}
                    onClick={() => onChange(page + 1)}
                >
                    Próxima
                </button>
                <button
                    type="button"
                    className="small"
                    disabled={page >= totalPages}
                    onClick={() => onChange(totalPages)}
                >
                    »
                </button>
            </div>
        </div>
    )
}
