import {useEffect, useState} from 'react'
import {useMutation, useQuery} from '@tanstack/react-query'
import {get, post, put} from '../api/client'
import type {SettingsView} from '../bindings/SettingsView'
import {useInvalidateAll, useSyncStatus} from '../layout/Layout'

export function SettingsPage() {
    const invalidate = useInvalidateAll()
    const settings = useQuery({
        queryKey: ['settings'],
        queryFn: () => get<SettingsView>('/api/settings'),
    })
    const sync = useSyncStatus()

    const [url, setUrl] = useState('')
    const [interval, setInterval] = useState(900)
    const [auto, setAuto] = useState(true)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (settings.data) {
            setUrl(settings.data.registry_url)
            setInterval(settings.data.sync_interval_seconds)
            setAuto(settings.data.auto_sync_enabled)
        }
    }, [settings.data])

    const save = useMutation({
        mutationFn: (payload: { registry_url: string; sync_interval_seconds: number; auto_sync_enabled: boolean }) =>
            put<SettingsView>('/api/settings', payload),
        onSuccess: () => {
            setSaved(true)
            setError(null)
            invalidate()
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao salvar'),
    })

    const runNow = useMutation({
        mutationFn: () => post('/api/sync/run', {}),
        onSuccess: () => invalidate(),
        onError: (err) => setError(err instanceof Error ? err.message : 'falha ao disparar sync'),
    })

    if (settings.isLoading) return <main className="page"><p className="muted">Carregando…</p></main>

    const running = sync.data?.runs.find((r) => r.status === 'running')

    return (
        <main className="page">
            <h1>Configurações</h1>
            <p className="subtitle">
                Fonte de dados do sincronizador e cadência de atualização. O intervalo vale a partir da
                próxima verificação (tick a cada minuto), sem reiniciar o serviço.
            </p>

            <div className="grid-2">
                <div className="card">
                    <h3 style={{marginTop: 0}}>Fonte de dados</h3>
                    <label htmlFor="url">URL do registry</label>
                    <input id="url" value={url} onChange={(e) => setUrl(e.target.value)}/>
                    <label htmlFor="interval">Intervalo de sincronização (segundos, mínimo 60)</label>
                    <input
                        id="interval"
                        type="number"
                        min={60}
                        value={interval}
                        onChange={(e) => setInterval(Number(e.target.value))}
                    />
                    <label style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                        <input type="checkbox" style={{width: 'auto'}} checked={auto}
                               onChange={(e) => setAuto(e.target.checked)}/>
                        Sincronização automática habilitada
                    </label>
                    <div className="row" style={{marginTop: 14}}>
                        <button
                            type="button"
                            className="primary"
                            disabled={save.isPending}
                            onClick={() => save.mutate({
                                registry_url: url,
                                sync_interval_seconds: interval,
                                auto_sync_enabled: auto
                            })}
                        >
                            Salvar configurações
                        </button>
                        <button type="button" disabled={runNow.isPending || Boolean(running)}
                                onClick={() => runNow.mutate()}>
                            {running ? 'Sincronizando…' : 'Sincronizar agora'}
                        </button>
                        {saved && <span className="muted">salvo ✓</span>}
                    </div>
                    {error && <div className="error-box">{error}</div>}
                </div>

                <div className="card">
                    <h3 style={{marginTop: 0}}>Histórico de sincronização</h3>
                    <table>
                        <thead>
                        <tr>
                            <th>Início</th>
                            <th>Tipo</th>
                            <th>Status</th>
                            <th>Vistos</th>
                            <th>Novos</th>
                        </tr>
                        </thead>
                        <tbody>
                        {(sync.data?.runs ?? []).map((r) => (
                            <tr key={r.id}>
                                <td className="mono">{new Date(r.started_at).toLocaleString()}</td>
                                <td>{r.run_type}</td>
                                <td><span className={`badge status-${r.status}`}>{r.status}</span></td>
                                <td>{r.servers_seen}</td>
                                <td>{r.servers_new}</td>
                            </tr>
                        ))}
                        {(sync.data?.runs ?? []).length === 0 && (
                            <tr>
                                <td colSpan={5} className="muted">Nenhuma sincronização ainda.</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    )
}
