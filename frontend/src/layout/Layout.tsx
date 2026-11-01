import {QueryClient, useQuery, useQueryClient} from '@tanstack/react-query'
import {useEffect, useState} from 'react'
import {NavLink, Outlet, useNavigate} from 'react-router'
import {clearToken, getToken} from '../auth/token'
import {get} from '../api/client'

const queryClient = new QueryClient()
export {queryClient}

export function Layout() {
    const navigate = useNavigate()
    const isAuthenticated = getToken() !== null

    function handleLogout() {
        clearToken()
        queryClient.clear()
        navigate('/login')
    }

    return (
        <div>
            <header className="topbar">
                <span className="brand">🔐 mcpsec</span>
                {isAuthenticated && (
                    <nav>
                        <NavLink to="/registry">Registro</NavLink>
                        <NavLink to="/runner">MCPs Autorizados</NavLink>
                        <NavLink to="/proxy">Proxy MCP</NavLink>
                        <NavLink to="/proxy/docs">Como usar</NavLink>
                        <NavLink to="/settings">Configurações</NavLink>
                    </nav>
                )}
                <div>
                    {isAuthenticated ? (
                        <button type="button" className="small" onClick={handleLogout}>
                            Sair
                        </button>
                    ) : (
                        <NavLink to="/login">Entrar</NavLink>
                    )}
                </div>
            </header>
            <Outlet/>
        </div>
    )
}

/** The registry listing envelope: one page plus totals and tab counts. */
export interface ServerPageResponse {
    servers: import('../bindings/ServerSummary').ServerSummary[]
    page: number
    page_size: number
    /** Rows matching text + lifecycle: what the table pager shows. */
    total_items: number
    /** Rows matching the text filter only: the combo's "Todos" option. */
    filtered_items: number
    total_pages: number
    counts: Record<string, number>
}

/** Paginated registry list. `q` and `lifecycle` are filtered in SQL. */
export function useServers(params: { q: string; lifecycle: string; page: number; pageSize: number }) {
    return useQuery({
        queryKey: ['servers', params],
        queryFn: () => {
            const search = new URLSearchParams({
                page: String(params.page),
                page_size: String(params.pageSize),
            })
            if (params.q.trim() !== '') search.set('q', params.q.trim())
            if (params.lifecycle !== 'all') search.set('lifecycle', params.lifecycle)
            return get<ServerPageResponse>(`/api/servers?${search.toString()}`)
        },
        placeholderData: (previous) => previous,
    })
}

/** Debounce a rapidly changing value (search inputs). */
export function useDebounced<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value)
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delayMs)
        return () => clearTimeout(id)
    }, [value, delayMs])
    return debounced
}

export function useSyncStatus() {
    return useQuery({
        queryKey: ['sync'],
        queryFn: () => get<import('../bindings/SyncStatus').SyncStatus>('/api/sync'),
        refetchInterval: 4000,
    })
}

export function useInvalidateAll() {
    const qc = useQueryClient()
    return () => {
        void qc.invalidateQueries({queryKey: ['servers']})
        void qc.invalidateQueries({queryKey: ['server']})
        void qc.invalidateQueries({queryKey: ['sync']})
    }
}
