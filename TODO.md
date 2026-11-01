# TODO — mcpsec

> Painel de trabalho para as séries de mudanças. Itens novos entram em
> "Aberto"; concluídos vão para "Feito" com data. O histórico é comprimido
> periodicamente (ver diretriz em `AGENTS.md` → "TODO hygiene").

## Feito (arquivo comprimido em 2026-11-01)

Séries anteriores (resumo de uma linha cada; detalhes no `git log`):

- 2026-11-01 — Painel TODO.md criado; README reescrito (funcionalidades
  completas + 3 diagramas Mermaid validados); AGENTS.md com diretrizes de
  velocidade; DownloadWorker scaffold removido.
- 2026-11-01 — Série 2: Registry em cards; tool `make_auth` no proxy MCP
  (ponte pública sem sessão); `/docs` pública com JSON de configuração MCP;
  arquitetura de papéis (`users.role`, todo registro = admin); sync já era
  não-bloqueante (verificado).
- 2026-11-01 — Série 3: SQLite→Postgres pela tela Configurações (cópia
  atômica, marcador, resolução no boot, modo degradado read-only com gate de
  escrita 503); combo do Runner só título.
- 2026-11-01 — Série 4 (UI): `/docs` dentro do Layout; tema Light/Dark com
  toggle no menu e badges via `color-mix()`.
- 2026-11-01 — Série 5: ADMIN = execução (heurística reescrita, task
  `relabel_tools` reclassificou 23 linhas no dev, 8 testes do `classify`);
  CRUD de MCPs customizados (aba `/custom-servers`, `sync_source=custom`,
  ownership registry↔custom, grants revogados na deleção, erros do envelope
  Loco chegando à UI); auditoria do proxy verificada; status do banco e
  `/api/settings/database` verificados (dev server antigo era a causa dos
  relatos).
- 2026-11-01 — Série 6: página de detalhe completa (ações + título/descrição
  editáveis com originais preservados); polling de `/api/sync` restrito às
  telas que exibem andamento; botão "Marcar N como triados"
  (`acknowledged_at`); hotfix do `/api/servers` 500 (migration editada após
  aplicada — corrigida com `m20261101_050000`, testes de request novos,
  diretriz no AGENTS.md).

- 2026-11-01 — Série 7 (contrato HTTP e robustez da revisão): `/meta` aceita
  PUT+POST (SPA mandava PUT, rota só POST → 405; 5 testes novos em
  `server_meta.rs`); `approve` valida ownership das labels — tool de outro
  servidor é 400 com mensagem, nunca 500 (`set_category_for_server`), e
  servidor sem tools pode ser aprovado (Review.tsx mostra botão no caso
  "0 tools"); auditoria completa SPA↔rotas: nenhum outro descompasso;
  diretriz nova em AGENTS.md ("HTTP contract: test the verb the SPA sends").
  Triagem em lote desativa (`acknowledge_all_new` → disabled); MCP custom
  nasce desativado e pré-acknowledged; `run_now`/tick fazem `reap_stale`
  antes do lock (sync travado se recupera sozinho); TODO hygiene diretriz.

## Aberto

### Próxima série de mudanças

- [ ] _(descreva aqui a próxima mudança grande e quebre em passos abaixo)_

### Dívida conhecida (achada durante estas séries)

- [ ] `tests/workers/mod.rs` não tem teste algum — a cobertura de worker vive
      em `tests/models`, `tests/tasks` e `tests/requests`. Adicionar teste do
      `ActivationWorker` (cenário `activating` travado que é reprocessado) ou
      documentar a ausência.
- [ ] `src/controllers/proxy.rs` e `src/controllers/mcp.rs` duplicam a guarda
      de categoria (`confirmed: true`) e a escrita de auditoria. Extrair para
      um helper único em `models` e cobrir com teste, senão as regras divergem.
- [ ] `README.md` cita "e-mail" (verificação/magic link) mas o ambiente de dev
      usa o mailer de teste — documentar como ver o e-mail de verificação
      localmente.
- [ ] `frontend/src/bindings/` importa `../../../bindings/serde_json/JsonValue`
      (fora do SPA). Verificar se esse caminho sobrevive a um clone limpo e,
      se não, ajustar o `export_to`/adicionar o diretório ao versionamento.
- [ ] Papéis: hoje `UserRole::parse` mapeia tudo para `Admin` e não há gating
      por rota. Quando o papel de usuário comum chegar, adicionar os variantes
      no enum, os checks no model e o middleware/guard nas rotas de escrita
      (activate/approve/relabel/settings/proxy admin).
- [ ] `make_auth` devolve link com host de `APP_BASE_URL`/`PORT`; em produção
      atrás de proxy reverso, garantir que `APP_BASE_URL` esteja setado (senão
      o link aponta para `localhost:5150`).
- [ ] Escritas entre a cópia do SQLite→Postgres e o restart ficam no SQLite e
      são perdidas na ativação (trade-off documentado). Mitigação futura:
      middleware de quiesce de escrita durante a janela de migração.
- [ ] Migração SQLite→Postgres não tem teste de integração (precisa de
      Postgres real no CI); testar manualmente com `docker run postgres`.
- [ ] Modo degradado: `/mcp/` está isento do bloqueio de escrita — as tools
      concedidas ainda executam no servidor remoto. Reavaliar se o agente deve
      continuar com acesso em modo degradado.
- [ ] Auditoria de proxy: `tool_add` (concessão de grants) não gera linha em
      `tool_calls`; só as execuções auditam. Avaliar se concessão merece
      registro próprio.
- [ ] Escrever no README o flowchart do ciclo de `classify` (rascunho
      preservado no git history antes da compressão deste painel):

      ```mermaid
      flowchart TD
          A[activate] --> B[ActivationWorker]
          B --> C[initialize + tools/list no MCP remoto]
          C --> D[mcp_tools::ActiveModel::replace_for_server]
          D --> E{tool já existe no banco?}
          E -->|sim| F[mantém categoria e classified_by<br/>só atualiza schema/description/last_seen_at]
          E -->|não| G[classify tool → categoria + confidence<br/>classified_by = heuristic]
          D --> H[tools que sumiram do remoto são apagadas]
          G --> I[awaiting_review: humano ajusta<br/>set_category → classified_by = user, confidence = null]
      ```

> ⚠ **Operação**: os fixes das séries 6–7 (approve 400, meta PUT, acknowledge,
> sync reap) exigem **reiniciar o servidor de dev** — o processo em execução
> carrega o binário antigo e vai continuar reportando os erros antigos.
