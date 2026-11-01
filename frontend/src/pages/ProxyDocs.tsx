import {useQuery} from '@tanstack/react-query'
import {get} from '../api/client'
import type {SettingsView} from '../bindings/SettingsView'

/** Aba de documentação do Proxy MCP: como conectar um agente/cliente MCP,
 * como funciona tool_search/tool_add, TTLs, guardas de categoria e
 * auditoria. Os exemplos embutem a URL real do proxy e um token de exemplo
 * gerado na aba Proxy MCP. */
export function ProxyDocs() {
    const settings = useQuery({
        queryKey: ['settings'],
        queryFn: () => get<SettingsView>('/api/settings'),
    })

    const mcpUrl = `${window.location.origin}/mcp`

    return (
        <main className="page">
            <h1>Como usar o Proxy MCP</h1>
            <p className="subtitle">
                O proxy é um servidor MCP único que centraliza todos os seus MCPs autorizados — um endpoint,
                um token, e descoberta de tools sob demanda.
            </p>

            <div className="card" style={{marginBottom: 16}}>
                <h2 style={{marginTop: 0, fontSize: 16}}>A ideia em 30 segundos</h2>
                <p>
                    Em vez de conectar seu agente em dezenas de MCPs diferentes, ele conecta em{' '}
                    <span className="mono">{mcpUrl}</span>. No início, o servidor só expõe duas tools:{' '}
                    <span className="mono">tool_search</span> (descoberta) e{' '}
                    <span className="mono">tool_add</span> (carregamento temporário). Quando o agente precisa
                    das tools de, digamos, um MCP do ClickUp, ele chama{' '}
                    <span className="mono">tool_add</span> — o proxy passa a expor as tools do ClickUp por um
                    tempo configurável (padrão: 20 minutos) e, quando esse tempo expira, a superfície volta a
                    ter apenas <span className="mono">tool_search</span> e{' '}
                    <span className="mono">tool_add</span>.
                </p>
                <p className="muted">
                    Só entram no catálogo servidores que passaram pelo workflow de ativação do mcpsec (com
                    labels READ_ONLY / WRITE / ADMIN revisados). Toda execução é auditada.
                </p>
            </div>

            <div className="grid-2">
                <div className="card">
                    <h3 style={{marginTop: 0}}>1. Crie uma sessão de proxy</h3>
                    <p>
                        Na aba <strong>Proxy MCP</strong>, clique em “Criar sessão”. O token (mostrado uma
                        única vez) é a credencial do seu agente — use como bearer token.
                    </p>
                    <div className="result-box">{`# configure seu cliente MCP apontando para o proxy
# URL:      ${mcpUrl}
# Headers:  Authorization: Bearer <token-da-sessão>`}</div>
                    <p className="muted" style={{marginTop: 8}}>
                        O TTL configurado na sessão define por quanto tempo cada{' '}
                        <span className="mono">tool_add</span> mantém as tools visíveis (pode ser sobrescrito
                        por chamada com <span className="mono">ttl_seconds</span>, mínimo 30s, máximo 24h).
                    </p>
                </div>

                <div className="card">
                    <h3 style={{marginTop: 0}}>2. Conecte seu cliente/agente</h3>
                    <p>Qualquer cliente MCP “Streamable HTTP” funciona. Exemplos:</p>
                    <div className="result-box">{`# Claude Code
claude mcp add --transport http mcpsec ${mcpUrl} \\
  --header "Authorization: Bearer <token>"

# Inspect with the MCP inspector
npx @modelcontextprotocol/inspector \\
  --transport http --url ${mcpUrl} \\
  --header "Authorization: Bearer <token>"`}</div>
                    <p className="muted" style={{marginTop: 8}}>
                        No <span className="mono">initialize</span> o proxy devolve{' '}
                        <span className="mono">Mcp-Session-Id</span> (o próprio token da sessão), então
                        clientes que fazem o dance de sessão do protocolo funcionam sem configuração extra.
                    </p>
                </div>
            </div>

            <div className="card" style={{marginTop: 16}}>
                <h3 style={{marginTop: 0}}>3. O fluxo do agente</h3>
                <div className="grid-2">
                    <div>
                        <p>
                            <strong>tool_search</strong> — lista o que está chamável agora e o catálogo do que
                            pode ser carregado:
                        </p>
                        <div className="result-box">{`{
  "name": "tool_search",
  "arguments": { "query": "clickup" }
}

// resposta (resumida):
{
  "callable_tools": [],
  "catalog": [
    {
      "server": "com.clickup/mcp",
      "summary": "ClickUp — task management (14 tools)",
      "how_to_load": "call tool_add with server=\\"com.clickup/mcp\\""
    }
  ]
}`}</div>
                    </div>
                    <div>
                        <p>
                            <strong>tool_add</strong> — carrega as tools de um servidor por um tempo:
                        </p>
                        <div className="result-box">{`{
  "name": "tool_add",
  "arguments": {
    "server": "com.clickup/mcp",
    "query": "task",        // opcional: filtra por nome/descrição
    "ttl_seconds": 1800     // opcional: 30..86400
  }
}

// resposta: lista do que ficou chamável + quando expira.
// A partir daqui o agente chama as tools direto via tools/call.`}</div>
                    </div>
                </div>
            </div>

            <div className="grid-2" style={{marginTop: 16}}>
                <div className="card">
                    <h3 style={{marginTop: 0}}>Guardas de segurança</h3>
                    <ul style={{lineHeight: 1.8, paddingLeft: 18}}>
                        <li>
                            <span className="badge read_only">READ_ONLY</span> executa livremente.
                        </li>
                        <li>
                            <span className="badge write">WRITE</span> e{' '}
                            <span className="badge admin">ADMIN</span> exigem{' '}
                            <span className="mono">{`{"confirmed": true}`}</span> nos argumentos — o agente precisa
                            “declarar” a ação antes de executar.
                        </li>
                        <li>Tools fora da sessão (não carregadas via tool_add) são recusadas.</li>
                        <li>Somente servidores <strong>ativos</strong> no workflow aparecem no catálogo.</li>
                        <li>
                            Cada chamada vira uma linha de auditoria (tool, categoria, argumentos, resultado,
                            duração) visível na tela do runner.
                        </li>
                    </ul>
                </div>

                <div className="card">
                    <h3 style={{marginTop: 0}}>Ciclo de vida & housekeeping</h3>
                    <ul style={{lineHeight: 1.8, paddingLeft: 18}}>
                        <li>
                            Grants expirados desaparecem da superfície imediatamente (o{' '}
                            <span className="mono">tools/list</span> consulta sempre o estado vivo) e são
                            removidos do banco pelo housekeeping a cada minuto.
                        </li>
                        <li>
                            <span className="mono">DELETE {mcpUrl}</span> com o bearer token revoga a sessão na
                            hora — todas as tools somem.
                        </li>
                        <li>Máximo de 10 sessões vivas por usuário; a mais antiga é revogada.</li>
                        <li>
                            Fonte de dados dos MCPs autorizados:{' '}
                            <span className="mono">{settings.data?.registry_url ?? '…'}</span> (configurável na
                            aba Configurações).
                        </li>
                    </ul>
                </div>
            </div>

            <div className="card" style={{marginTop: 16}}>
                <h3 style={{marginTop: 0}}>Teste rápido com curl</h3>
                <div className="result-box">{`# 1) o que o proxy expõe agora
curl -s ${mcpUrl} \\
  -H "Authorization: Bearer <token>" \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# 2) catálogo
curl -s ${mcpUrl} \\
  -H "Authorization: Bearer <token>" \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tool_search","arguments":{}}}'

# 3) carregar um servidor e chamar uma tool dele
curl -s ${mcpUrl} \\
  -H "Authorization: Bearer <token>" \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tool_add","arguments":{"server":"<nome-do-servidor>"}}}'`}</div>
            </div>
        </main>
    )
}
