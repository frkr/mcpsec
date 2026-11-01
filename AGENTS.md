# Agent guide for this Loco app

This is a [Loco](https://loco.rs) app — **Rails for Rust**. When you are unsure
how something should work here, the answer is almost always "the way Rails does
it." Where Loco diverges, it is because Rust forced it.

## Read this first

A complete Loco skill ships with this app at **`.claude/skills/loco`**, matched
to the exact `loco-rs` version in `Cargo.toml`:

| File | What it gives you |
|---|---|
| `.claude/skills/loco/SKILL.md` | start here — the router, `AppContext`, project layout, CLI |
| `.claude/skills/loco/doctrine.md` | what good Loco code looks like; read before writing any |
| `.claude/skills/loco/api-index.md` | every public `loco_rs` symbol, generated from rustdoc — **check here before guessing an API name** |
| `.claude/skills/loco/recipes` | how to add a model, endpoint, worker, task, mailer, middleware, auth, tests |

If your tool supports Agent Skills, it will load `SKILL.md` automatically. If
not, read it directly — it is a normal markdown file.

## The three rules that prevent most mistakes

1. **Generate, then edit.** `cargo loco generate <thing>` writes the file *and*
   the wiring. Rust has no autoloading; hand-wiring is how "the handler exists
   but 404s" happens.
2. **Use the batteries.** This app already has an ORM, queue, scheduler, mailer,
   task runner, storage, cache, and test harness. Adding a crate for something
   Loco already does is the most common mistake.
3. **Fat model, slim controller.** Domain logic on the model; handlers parse,
   call a model method, and render.

## Fast path: this app's map

Antes de procurar, saiba onde as coisas moram. Quase toda mudança toca 3–5
destes arquivos — leia só eles:

| Preciso mexer em… | Arquivo |
|---|---|
| Rotas registradas | `src/app.rs` (`routes`, `connect_workers`, `register_tasks`) |
| Endpoint HTTP | `src/controllers/<área>.rs` — o `routes()` fica no fim do arquivo |
| Domínio | `src/models/<entidade>.rs` (o wrapper; `_entities/` é gerado) |
| Migration | `migration/src/mYYYYMMDD_HHMMSS_<nome>.rs` + `migration/src/lib.rs` |
| Job em background | `src/workers/<nome>.rs` (+ registro em `app.rs`) |
| Comando CLI / cron | `src/tasks/<nome>.rs` (+ `register_tasks` e `config/*.yaml`) |
| JSON de request/response | o próprio controller (`#[derive(TS)]`) ou `src/dtos/` |
| Tela | `frontend/src/pages/<X>.tsx` + rota em `frontend/src/routes.tsx` |
| Chamada de API no SPA | `frontend/src/api/client.ts` |

Áreas existentes: `auth` (usuários/JWT), `servers` (mirror + workflow),
`settings` (tabela `app_settings`), `sync` (status/disparo), `mcp` (runner com
guarda por categoria), `proxy` (endpoint MCP `/mcp`), `proxy_admin` (sessões e
grants). Se a mudança não encaixa em nenhuma, crie o controller e registre em
`App::routes` — **o `add_route` esquecido é a causa nº 1 de 404 silencioso**.

## Receita: nova funcionalidade ponta a ponta

Sempre nesta ordem — cada passo compila sozinho, então você nunca depura duas
camadas ao mesmo tempo:

1. `cargo loco generate model <nome> ...` → migration + entidade + registro no
   `migrator`. **Não** edite `src/models/_entities/` à mão.
2. Escreva o comportamento como método no `src/models/<nome>.rs` (fat model) e
   um teste em `tests/models/<nome>.rs`. `cargo test <nome>` já valida o
   domínio antes de existir HTTP.
3. Se for assíncrono, `cargo loco generate worker <nome>`, registre em
   `App::connect_workers`. Cron? `cargo loco generate task` + `register_tasks`
   + bloco `scheduler.jobs` em `config/*.yaml`.
4. `cargo loco generate controller <área> --api` e adicione o `.add_route` em
   `src/app.rs`.
5. DTOs tipados no controller com `#[derive(TS)]` e
   `#[ts(export, export_to = "../frontend/src/bindings/")]`. Regenerar:

   ```sh
   cargo test --lib export_bindings     # escreve frontend/src/bindings/*.ts
   ```

   Nunca escreva esses `.ts` à mão nem copie a forma do JSON: importe o tipo
   (`import type {ServerDetail} from "../bindings/ServerDetail"`).
6. No SPA: adicione o método em `frontend/src/api/client.ts`, a página em
   `frontend/src/pages/`, a rota em `frontend/src/routes.tsx` (dentro do
   `RequireAuth`; só `login`/`register` ficam fora) e o link em
   `frontend/src/layout/Layout.tsx`.
7. `tests/requests/<área>.rs` para o caminho HTTP feliz + um caso de erro
   (401/409/422). Use `request::<App>` do harness do Loco; é mais barato que
   subir o servidor.

## Dev loop (o comando que importa)

```sh
# backend + workers + scheduler; o SPA fala com /api via proxy do Vite
DB_MIN_CONNECTIONS=2 DB_MAX_CONNECTIONS=4 cargo loco start --all
cd frontend && npm run dev        # http://localhost:5173
```

- `--all` sobe workers **e** scheduler. Sem ele, sync/ativação parecem
  quebrados: nada processa e não há erro.
- Já existe `mcpsec_development.sqlite` na raiz — não recrie o banco nem
  rode migrations destrutivas para "resolver".
- Porta 5150 é a padrão do Loco e colide com outro app: `PORT=5151`.
- Ciclo de feedback curto por camada: `cargo check` → `cargo test --lib` →
  `cargo test --test mod` → `npm run build`. Rode o mais barato que ainda
  pega o seu erro.

## Convenções que evitam retrabalho

- **Nomes no banco**: tabela plural `snake_case` (`mcp_proxy_grants`), colunas
  `snake_case`; no Rust, `PascalCase` para tipos e `snake_case` para campos,
  sem `rename_all` em DTOs (o contrato JSON é snake_case, igual ao banco).
- **Estados**: use o enum do modelo (`Lifecycle`, `ToolCategory`) e seus
  `as_str`/`parse`; nunca compare strings de estado espalhadas pelos
  controllers. Um novo estado exige: variante, `as_str`, `parse` e o match
  exaustivo que o compilador vai cobrar.
- **Guarda de negócio fica no caminho único**: runner e proxy compartilham a
  regra de categoria (`READ_ONLY` livre; `WRITE`/`ADMIN` com
  `confirmed: true`) e a auditoria em `tool_calls`. Ao mudar essa regra,
  mude nos dois e cubra com teste — divergir é o bug clássico daqui.
- **Saída de rede** sempre pela guarda SSRF (`workers::mcp::ssrf_guard`):
  https-only, sem loopback/privado/link-local.
- **Config em runtime** vai em `app_settings` (com `load_or_create`), não em
  `config/*.yaml`. YAML só para o que exige restart (porta, pool, cron).
- **Tarefas periódicas** obedecem o padrão tick: cron estático de 1 min, e a
  task decide se a ação está devida. Assim o intervalo é editável na UI.
- Frontend: `@tanstack/react-query` para dados, sem estado global novo; texto
  de UI em português, identificadores em inglês.
- Erros de handler viram `Error` do Loco com status explícito
  (`Error::Unauthorized`, `Error::Conflict`, …) — não `anyhow` nem panic.

## Migrations: applied is immutable

**Nunca edite uma migration que já rodou.** O `seaql_migrations` guarda só a
versão; se você acrescentar uma coluna ao `up` de uma migration já aplicada, o
banco de dev **não** ganha a coluna, mas a entidade passa a selecioná-la — e
todo `SELECT` daquela tabela explodes (`no such column`) enquanto os testes,
que recriam o banco do zero, continuam verdes. Foi exatamente o 500 que tirou
`/api/servers` do ar.

- Ajuste de schema → **arquivo novo** (`cargo loco generate migration`),
  mesmo que seja uma linha em cima da anterior.
- Descobriu depois de aplicar? Crie a migration corretiva *e* **remove o
  trecho da original**, para o caminho "banco do zero" não rodar duas vezes o
  mesmo `add_column`.
- Bug de schema só aparece contra um banco já migrado. Além do `cargo test`
  (que recria), vale `cargo loco db migrate` no dev e um teste de request que
  exercite o **endpoint real** do fluxo — foi o que fechou este caso
  (`tests/requests/servers_list.rs`).

## TODO hygiene

`TODO.md` cresce a cada série e vira ruído. Quando a seção "Feito" passa de
~40 linhas ou acumula mais de 3 séries:

1. Comprima cada série para **uma linha** (o que mudou, em termos de produto);
   o detalhe vivo fica no `git log` e nos testes.
2. Reavalie a "Dívida conhecida": item resolvido sai; item que ninguém vai
   fazer sai com uma linha dizendo por quê (decisão registrada não é perda).
3. "Aberto" nunca acumula itens concluídos — mova ou descarte no mesmo
   commit que fecha a série.

O painel existe para acelerar o próximo passo, não para ser museu.

## HTTP contract: test the verb the SPA actually sends

Rota 405/404 com endpoint "que existe" já quebrou este app duas vezes
(`PUT /api/servers/{id}/meta` era registrada só como POST; outro endpoint
similar antes disso). O backend não tem tipagem que cruze SPA ↔ rotas — o
contrato é testado:

1. **Todo endpoint novo ganha teste de request no verbo EXATO que o client
   manda.** `POST` no backend + `put(...)` no SPA = 405 que os testes de
   POST não pegam. Escreva o teste olhando o `frontend/src/api/client.ts` e
   a página que chama, não o `routes()` do controller.
2. **Ao criar uma rota, grepe o SPA pelo path** (`grep -rn "api/<área>"
   frontend/src`) e confirme verbo + path antes de comitar.
3. **Accept both verbs** quando um deles é semanticamente duvidoso
   (`.add(path, put(h))` **e** `.add(path, post(h))`) — barato e tolerante a
   clients antigos.
4. Os testes que fazem isso hoje: `tests/requests/server_meta.rs` (PUT/POST
   de meta) e `tests/requests/servers_list.rs` (query exata do Registry).

## Copyright header (required)

Todo arquivo versionado deve conter o cabeçalho de copyright Apache License
2.0 — **incluindo o frontend** (`frontend/src/**`, `frontend/vite.config.ts`,
`frontend/index.html`). O arquivo de referência com o cabeçalho completo é
[`examples/playground.rs`](examples/playground.rs) — copie o bloco de
comentário do início desse arquivo para o topo do arquivo, no formato de
comentário da linguagem:

| Tipo de arquivo | Formato |
|---|---|
| Rust, TypeScript/TSX, CSS, config JS | `/* … */` (igual ao `playground.rs`) |
| HTML | `<!-- … -->` |

Exceções — **não** adicione o cabeçalho a:

- `frontend/src/bindings/**` e `bindings/**`: gerados por `ts-rs` (regenerar
  apagaria o cabeçalho);
- `package.json`, `package-lock.json` e outros metadados JSON;
- arquivos gerados em geral.

Antes de comitar, confira o que ficou de fora:

```sh
git ls-files '*.rs' '*.ts' '*.tsx' '*.css' '*.html' \
  | grep -v bindings | xargs grep -L 'Apache License'
```

Tudo que aparecer e não for exceção precisa do cabeçalho.

## Before you call it done

```sh
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings   # é o do CI
cargo test
cd frontend && npm run build      # tsc -b + vite build; pega erro de tipo
```

E confira o cabeçalho de copyright (seção acima). Só então diga que acabou.

## Docs

`README.md` é a fonte da verdade do comportamento (fluxos em Mermaid). Mudou
fluxo, rota ou tela? Atualize a tabela de funcionalidades e o diagrama no mesmo
commit — documento desatualizado custa mais caro que documento ausente.

## More

- Docs: <https://loco.rs/docs/>
- Framework agent guide: <https://loco.rs/AGENTS.md>
