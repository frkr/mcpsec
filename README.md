# mcpsec

Espelho local do [registry oficial de servidores MCP](https://registry.modelcontextprotocol.io)
com workflow de autorização por ferramenta e runner de execução estilo
inspector. Backend **Rust (Loco)**, frontend **React (Vite)**.

## Como funciona

```text
┌──────────────┐  sync (worker agendado)   ┌────────────────────────────┐
│ Registry MCP │ ─────────────────────────► │ mcp_servers  (new/off)     │
│   oficial    │  full-scan paginado       │ mcp_tools                  │
└──────────────┘                           └────────────────────────────┘
                                                        │ ativar
                                                        ▼
                                           ActivationWorker: initialize →
                                           tools/list → heurística de labels
                                           (READ_ONLY / WRITE / ADMIN)
                                                        │
                                                        ▼
                                           awaiting_review ── aprovar ──► active
                                                        │
                                                        ▼
                                           Runner: POST /api/mcp/{id}/tools/
                                           {tool}/call  (proxy + guarda por
                                           categoria + auditoria)
```

- **Serviço em background**: `RegistrySyncWorker` paginas `GET /v0/servers?
  version=latest` até esgotar o cursor. Servidores novos entram como `new` +
  desativados; existentes recebem refresh de metadados sem mudar o lifecycle.
  Single-flight via row `running` em `sync_runs`, com lease anti-travamento.
- **Configurações**: URL da fonte e intervalo ficam em `app_settings`
  (tabela), editáveis na tela Configurações. O scheduler dispara
  `registry_sync_tick` a cada minuto; a task decide se o intervalo configurado
  já venceu — mudar o intervalo não exige restart.
- **Workflow de ativação**: `new → activating → awaiting_review → active`
  (ou `rejected`; `active → disabled`). Na revisão, cada tool tem um rótulo
  READ_ONLY/WRITE/ADMIN sugerido por heurística (`classified_by=heuristic`) e
  ajustável pelo usuário (`classified_by=user`). Re-syncs nunca sobrescrevem
  rótulos revisados.
- **Runner**: só servidores `active` aparecem. Toda execução passa pelo proxy
  do backend (`POST /api/mcp/{id}/tools/{name}/call`), que aplica a guarda:
  READ_ONLY executa livre; WRITE e ADMIN exigem `confirmed: true`. Cada
  chamada gera uma linha de auditoria (`tool_calls`) com argumentos,
  resultado, categoria, confirmação e duração. Remote URLs passam por guarda
  SSRF (https-only, sem hosts privados/loopback).

## Rodando

```sh
# backend + worker + scheduler (dev)
DB_MIN_CONNECTIONS=2 DB_MAX_CONNECTIONS=4 cargo loco start --all

# frontend (dev server com proxy /api)
cd frontend && npm run dev        # http://localhost:5173

# ou build servido pelo próprio Loco
cd frontend && npm run build      # Loco serve frontend/dist
```

Primeiro acesso: registre um usuário em `/register`, faça login, vá em **Configurações** e dispare **Sincronizar
agora**.

Também é possível sincronizar por CLI:

```sh
cargo loco task registry_sync
```

## Testes

```sh
cargo fmt --all
cargo clippy --all-targets -- -D warnings
cargo test
cd frontend && npm run build
```
