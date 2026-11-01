import {useEffect, useMemo, useState} from 'react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {get, post} from '../api/client'
import type {CallResponse} from '../bindings/CallResponse'
import type {ServerDetail} from '../bindings/ServerDetail'
import type {ToolView} from '../bindings/ToolView'
import {CategoryBadge} from '../components/Badges'

/** Runner no estilo do inspector: escolhe servidor autorizado, escolhe tool,
 * preenche argumentos a partir do inputSchema, executa via proxy e mostra o
 * resultado. WRITE/ADMIN pedem confirmação explícita antes de enviar. */
export function Runner() {
    const authorized = useQuery({
        queryKey: ['authorized'],
        queryFn: () => get<{ servers: ServerDetail[] }>('/api/servers/authorized'),
    })

    const servers = authorized.data?.servers ?? []
    const [serverId, setServerId] = useState<number | null>(null)
    const [toolName, setToolName] = useState<string | null>(null)

    const server = servers.find((s) => s.id === serverId) ?? null
    const tool = server?.tools.find((t) => t.tool_name === toolName) ?? null

    useEffect(() => {
        if (serverId === null && servers.length > 0) setServerId(servers[0].id)
    }, [servers, serverId])

    useEffect(() => {
        if (server && toolName === null && server.tools.length > 0) setToolName(server.tools[0].tool_name)
    }, [server, toolName])

    if (authorized.isLoading) return <main className="page"><p className="muted">Carregando…</p></main>

    if (servers.length === 0) {
        return (
            <main className="page">
                <h1>MCPs autorizados</h1>
                <p className="subtitle">Nenhum servidor ativo. Ative um servidor no registro primeiro.</p>
            </main>
        )
    }

    return (
        <main className="page">
            <h1>MCPs autorizados</h1>
            <p className="subtitle">
                Somente servidores aprovados no workflow aparecem aqui. Toda execução passa pelo proxy do
                backend e fica registrada na auditoria.
            </p>

            <div className="toolbar">
                <select value={serverId ?? ''} onChange={(e) => {
                    setServerId(Number(e.target.value));
                    setToolName(null)
                }}>
                    {servers.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.title} ({s.tools.length} tools)
                        </option>
                    ))}
                </select>
                <select value={toolName ?? ''} onChange={(e) => setToolName(e.target.value)}>
                    {server?.tools.map((t) => (
                        <option key={t.id} value={t.tool_name}>
                            {t.tool_name}
                        </option>
                    ))}
                </select>
                {tool && <CategoryBadge category={tool.category}/>}
            </div>

            {server && tool && <ToolRunner key={`${server.id}:${tool.tool_name}`} server={server} tool={tool}/>}
        </main>
    )
}

function defaultArgs(schema: ToolView['input_schema']): string {
    const obj = schema as { properties?: Record<string, unknown>; required?: string[] } | null
    if (!obj?.properties) return '{}'
    const draft: Record<string, unknown> = {}
    for (const [key, prop] of Object.entries(obj.properties)) {
        const p = prop as { type?: string; default?: unknown }
        if (p.default !== undefined) draft[key] = p.default
        else if (p.type === 'number' || p.type === 'integer') draft[key] = 0
        else if (p.type === 'boolean') draft[key] = false
        else if (p.type === 'array') draft[key] = []
        else if (p.type === 'object') draft[key] = {}
        else draft[key] = ''
    }
    return JSON.stringify(draft, null, 2)
}

function ToolRunner({server, tool}: { server: ServerDetail; tool: ToolView }) {
    const qc = useQueryClient()
    const needsConfirm = tool.category !== 'READ_ONLY'
    const [args, setArgs] = useState(() => defaultArgs(tool.input_schema))
    const [confirmed, setConfirmed] = useState(false)
    const [result, setResult] = useState<CallResponse | null>(null)

    useEffect(() => {
        setArgs(defaultArgs(tool.input_schema))
        setConfirmed(false)
        setResult(null)
    }, [tool.id])

    const history = useQuery({
        queryKey: ['history', server.id],
        queryFn: () => get<{
            calls: Array<{
                id: number;
                tool_name: string;
                category: string;
                status: string;
                duration_ms: number;
                created_at: string;
                error: string | null
            }>
        }>(`/api/mcp/${server.id}/history`),
    })

    const call = useMutation({
        mutationFn: (payload: { arguments: unknown; confirmed: boolean }) =>
            post<CallResponse>(`/api/mcp/${server.id}/tools/${encodeURIComponent(tool.tool_name)}/call`, payload),
        onSuccess: (data) => {
            setResult(data)
            void qc.invalidateQueries({queryKey: ['history', server.id]})
        },
    })

    const argsError = useMemo(() => {
        try {
            JSON.parse(args)
            return null
        } catch (e) {
            return 'JSON inválido'
        }
    }, [args])

    const parsedArgs = useMemo(() => {
        try {
            return JSON.parse(args) as unknown
        } catch {
            return null
        }
    }, [args])

    return (
        <div className="grid-2">
            <div className="card">
                <h3 style={{marginTop: 0}}>
                    {tool.tool_name} {needsConfirm &&
                    <span className="badge" style={{color: 'var(--amber)'}}>requer confirmação</span>}
                </h3>
                <p className="muted">{tool.description ?? 'Sem descrição.'}</p>

                <label htmlFor="args">Argumentos (JSON)</label>
                <textarea id="args" value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false}/>
                {argsError && <div className="error-box">{argsError}</div>}

                {needsConfirm && (
                    <label style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 12}}>
                        <input
                            type="checkbox"
                            style={{width: 'auto'}}
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        Confirmo a execução desta tool {tool.category}
                    </label>
                )}

                <div className="row" style={{marginTop: 12}}>
                    <button
                        type="button"
                        className="primary"
                        disabled={call.isPending || argsError !== null || (needsConfirm && !confirmed)}
                        onClick={() => call.mutate({arguments: parsedArgs, confirmed})}
                    >
                        {call.isPending ? 'Executando…' : 'Executar tool'}
                    </button>
                </div>
                {call.error && <div className="error-box">{call.error.message}</div>}
            </div>

            <div>
                <div className="card">
                    <h3 style={{marginTop: 0}}>Resultado</h3>
                    {result ? (
                        <>
                            <div className="row" style={{marginBottom: 8}}>
                                <span className={`badge status-${result.status}`}>{result.status}</span>
                                <span className="muted">{result.duration_ms} ms · call #{result.call_id}</span>
                            </div>
                            <div className="result-box">{JSON.stringify(result.result ?? result.error, null, 2)}</div>
                        </>
                    ) : (
                        <p className="muted">Nenhuma execução nesta sessão.</p>
                    )}
                </div>

                <div className="card" style={{marginTop: 16}}>
                    <h3 style={{marginTop: 0}}>Histórico (auditoria)</h3>
                    <table>
                        <tbody>
                        {(history.data?.calls ?? []).slice(0, 10).map((c) => (
                            <tr key={c.id}>
                                <td className="mono">{c.tool_name}</td>
                                <td><span className={`badge status-${c.status}`}>{c.status}</span></td>
                                <td className="muted mono">{c.duration_ms} ms</td>
                                <td className="muted">{new Date(c.created_at).toLocaleTimeString()}</td>
                            </tr>
                        ))}
                        {(history.data?.calls ?? []).length === 0 && (
                            <tr>
                                <td className="muted">Sem chamadas registradas.</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
