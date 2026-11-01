import type {ServerSummary} from '../bindings/ServerSummary'

export const LIFECYCLE_LABEL: Record<string, string> = {
    new: 'NOVO',
    activating: 'DESCOBRINDO',
    awaiting_review: 'EM REVISÃO',
    active: 'ATIVO',
    rejected: 'REJEITADO',
    disabled: 'DESATIVADO',
}

export const CATEGORY_LABEL: Record<string, string> = {
    READ_ONLY: 'READ_ONLY',
    WRITE: 'WRITE',
    ADMIN: 'ADMIN',
}

export function LifecycleBadge({lifecycle}: { lifecycle: string }) {
    return (
        <span className={`badge lifecycle-${lifecycle}`}>
      {LIFECYCLE_LABEL[lifecycle] ?? lifecycle}
    </span>
    )
}

export function CategoryBadge({category}: { category: string }) {
    return <span className={`badge ${category.toLowerCase()}`}>{category}</span>
}

export function ServerTitle({server}: { server: ServerSummary | { title: string; registry_name: string } }) {
    return (
        <div>
            <div>{server.title}</div>
            <div className="mono muted">{server.registry_name}</div>
        </div>
    )
}
