# Phone interop demo — App A → App B (runnable)

A working realization of the **deterministic field-population** pattern from
[doc 09](../docs/09-interop-and-entity-resolution.md): one app owns a canonical list,
another app's form field is constrained to that list instead of free text.

- **App A** (`app-a-symfony/`) — the **phone catalog** (source of truth). Has a form to add
  phones (specs) and a **read-only** API `GET /api/phones` that other apps consume.
- **App B API** (`app-b-symfony-api/`) — captures **user experiences**. `POST /api/experiences`
  **requires a canonical phone** (`phoneId` + `phoneName` from App A); free text is rejected.
- **App B React** (`app-b-react/`) — the experience form. Its phone field is a searchable picker
  populated from App A's list, with a toggle to show the old free-text behavior.

Everything runs in Docker — **no global PHP / Composer / Node installs**. Stack: Symfony 7.4
(PHP 8.4), Doctrine + SQLite, Vite + React 18.

> **New here?** Read **[doc 10 — From the demo to AWS](../docs/10-from-demo-to-aws.md)** for a
> guided, code-by-code walkthrough of everything below and how each piece becomes an AWS service.

## Run

```bash
cd apps
docker compose up -d --wait        # blocks until every service is healthy
```

**First run takes a few minutes** — it builds the PHP image and installs Composer/npm deps. `--wait`
holds until every service reports **healthy** (watch with `docker compose ps`); only then do the URLs
respond. Without `--wait` the containers say "running" before the apps are actually serving — open the
page too early and it looks dead but isn't. Tail progress with `docker compose logs -f`.

Then open:

| URL | What |
|---|---|
| http://localhost:5173 | **App B** experience form (React) — try it here |
| http://localhost:8001 | **App A** catalog UI (add phones) |
| http://localhost:8001/api/phones | App A read-only phone list (JSON) |
| http://localhost:8002/api/experiences | App B captured experiences (JSON) |
| http://localhost:8003/healthz | **Agent** health + connected MCP tools |
| http://localhost:3001/healthz | **MCP server** health |

Stop with `docker compose down` (add `-v` to also wipe the SQLite data + installed deps).

**Troubleshooting:**
- *Page doesn't load right after `up`* — it's still installing; wait for `docker compose ps` to show
  every service `healthy` (or use `up -d --wait`).
- *A port is already in use* (8001 / 8002 / 5173 / 3001 / 8003) — stop whatever's using it, or change
  the host port in `docker-compose.yml`.
- *Inspect a service* — `docker compose logs <service>` (e.g. `web`, `app-a`, `agent`).

## The point of the demo

In the React form, toggle between:

- **From App A catalog (new):** the phone field is a constrained picker fed by App A's
  `/api/phones`. You can only choose a canonical phone → deterministic data.
- **Free text (legacy):** type anything ("iPhone 15", "iphone15", "Apple iPhone 15"…). On submit,
  **App B rejects it (HTTP 422)** because there is no canonical `phoneId` — which is exactly the
  non-determinism this pattern removes.

## API contract

```
App A  GET  /api/phones?q=<search>   -> { items: [{ id, brand, model, name, releaseYear, storageOptions, createdAt }], total }
App B  POST /api/experiences          <- { phoneId, phoneName, rating (1-5), comment? }   201 | 422
App B  GET  /api/experiences          -> { items: [{ id, phoneId, phoneName, rating, comment, createdAt }], total }
```

CORS is permissive (`*`) for the local demo; scope the origin in production.

## AI agent over MCP (the agentic path)

The same read-only capabilities are also exposed as **MCP tools + resources**, so an agent can answer
natural-language questions — *one exposure, two consumers* ([doc 09](../docs/09-interop-and-entity-resolution.md)).
The deterministic path (above) needs no LLM; this path adds judgment. The demo runs a **local model**
(no API key); in AWS the same loop runs on **Bedrock + Claude**.

- **`mcp-server/`** — an MCP server (Streamable HTTP) that federates App A + App B as read-only
  **tools** (`search_phones`, `list_experiences`) **and resources** — the entity info:
  `phones://catalog` (the set list), `phone://{id}` (a phone entity), and `catalog://phones/schema`
  (a field data dictionary). Models the AgentCore Gateway role locally.
- **`agent/`** — connects as an MCP client and runs a **local-model** tool-use loop (Ollama,
  your host `llama3.2:1b` by default). It loads the **data dictionary** into its system prompt (so it can
  explain fields), and when the chat is anchored to a phone (the **"Viewing" selector** = page
  entity) it reads that `phone://{id}` resource for context. It can **only** call the read tools.
- The agent uses your **host Ollama** by default (no API key); a self-contained `ollama` container is available via the `bundled-model` profile if you don't have one.
- A **chat panel** at the top of the React page calls the agent, with a "Viewing" dropdown that
  simulates being on a phone's page.

**No API key needed.** The agent uses your **host Ollama** by default (`host.docker.internal:11434`,
model `llama3.2:1b`) — make sure Ollama is running and the model is pulled (`ollama pull llama3.2:1b`).
Override `OLLAMA_MODEL` / `OLLAMA_URL` in `apps/.env` (a 3B/7B model reasons noticeably better; 1B
over-calls tools but does reach the data). No native Ollama? Run the bundled model instead:
`docker compose --profile bundled-model up -d` and set `OLLAMA_URL=http://ollama:11434`.

**Ask things like:** *"Which Apple phones do we have?"*, *"What do people think of the iPhone 15 Pro?"*,
*"Which phone has the best ratings?"* — the agent calls the MCP tools (which read App A/B) and the UI
shows which tools it used. The read-only invariant from [doc 08](../docs/08-authorization-and-read-only.md)
holds: the agent has no write tool to call.

## Layout

```
apps/
  app-a-symfony/         Symfony 7.4 — phone catalog + read-only /api/phones
  app-b-symfony-api/     Symfony 7.4 — experiences API (requires canonical phone)
  app-b-react/           Vite + React — constrained experience form + agent chat
  mcp-server/            Node — MCP server (tools + entity resources), read-only
  agent/                 Node — MCP client + local-model (Ollama) tool-use loop
  docker/                shared PHP 8.4 image + entrypoint
  docker-compose.yml     5 services (+ optional bundled model); data in named volumes
  .env.example           optional OLLAMA_MODEL override
```
