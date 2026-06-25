# Cross-app natural-language query & interop — design + runnable demo

**Goal:** let users ask plain-English questions ("how many overdue invoices this month?", "what do people say about this product?") and get answers from data spread across **several of our apps** — each a separate app on ECS with its own database, most of them Symfony. And let apps **share each other's data deterministically** (one app's list constrains another app's form field) without point-to-point spaghetti.

This is a shareable pack: the **thinking**, a **recommendation**, and a **runnable demo**. Diagrams live in [`images/`](images/) as PNG (+ editable SVG). Facts current **2026-06-22**; new / pre-1.0 pieces are flagged under [Status](#status).

---

## What we can do today — the runnable demo

```bash
cd apps && docker compose up -d --wait   # no API key; first run builds + installs (a few min), --wait blocks until ready
# then open http://localhost:5173
```

A small, fully-working local example of the whole idea: **one read-only exposure of each app's data, two consumers.**

- **Deterministic** — App B's "phone" field is constrained to **App A's catalog** (you pick a canonical phone, free text is rejected). A direct app-to-app data link, no AI.
- **Agentic** — a chat agent answers natural-language questions over the *same* data via **MCP** (tools + entity resources). The demo runs a **local model**; in AWS the identical loop runs on **Bedrock + Claude** — you swap one function.

Code walkthrough + the AWS translation: **[doc 10](docs/10-from-demo-to-aws.md)**. Run details: **[apps/README](apps/README.md)**.

![One exposure, two consumers](images/interop-modes.png)

---

## The recommendation (the stack)

| Layer | Recommendation |
|---|---|
| Per-app data exposure | **Gateway OpenAPI target** over the existing REST/search API first (no MCP code); a PHP MCP server only for custom analytical tools / entity resources |
| Transport | MCP **Streamable HTTP**, spec `2025-11-25` (pin it) |
| Fan-in / routing | **AgentCore Gateway** — federation + semantic tool selection + on-behalf-of auth |
| Central agent | **Hybrid** — AgentCore (Gateway + Identity + Policy) + a thin orchestration/audit layer you own ([07](docs/07-orchestration-options.md)) |
| Data access | App repositories / OpenSearch preferred; **guarded read-only SQL** over curated views only where analytics demand it |
| Security | OAuth 2.1 per app + **governed cross-app visibility** + a **read-only invariant** ([08](docs/08-authorization-and-read-only.md)) |
| Many apps | **Thin per app, thick center** — exposure is a shared bundle / Gateway target; the agent, auth, audit, resolution are central ([11](docs/11-centralizing-cross-app-interop.md)) |

![Reference architecture](images/architecture.png)

---

## The thinking, in order

The decisions we worked through — each one line, linking the doc that backs it. This *is* the thought process, end to end.

1. **Reach data through each app's existing API/search, not raw SQL** — reuse its authz and tuned relevance; guarded read-only SQL only for analytics. → [02](docs/02-data-access-options.md)
2. **Expose each app over MCP** — a Gateway OpenAPI target (no code) first; a PHP MCP server where custom tools / entity resources pay off. → [03](docs/03-exposing-apps-as-mcp.md)
3. **Route across apps with a per-feature allowlist**, not single-app binding — a "tool bundle" = home app + permitted others. → [04](docs/04-query-routing-options.md)
4. **Orchestrate with a hybrid** — managed AgentCore (Gateway + Identity + Policy) + a thin orchestration/audit layer you own. → [07](docs/07-orchestration-options.md)
5. **Auth = per-user by default**, with a **governed feature/role policy** for cross-app data a user can't directly access, and a six-layer **read-only invariant**. → [08](docs/08-authorization-and-read-only.md)
6. **It's a read-only interop layer, not just a chatbot** — expose entities & lists once; the agent *and* other apps consume them; bridge ids with entity resolution. → [09](docs/09-interop-and-entity-resolution.md)
7. **Scale to many apps without duplication** — thin per app, thick center. → [11](docs/11-centralizing-cross-app-interop.md)
8. **Deploy** one exposure per app on ECS in-VPC; mind the SigV4-behind-ALB gotcha; audit every read. → [05](docs/05-aws-deployment-and-security.md)

Background and the phased rollout: [01 — overview](docs/01-architecture-overview.md) · [06 — recommendation & plan](docs/06-recommendation-and-plan.md).

---

## Build in this order

1. **Pilot one app, API-first** — Gateway OpenAPI target + a thin agent loop + audit, per-user auth. Prove it end to end.
2. Add the **governed cross-app bundle** + one **direct field-population** link + an **entity-resolution id-map** for the pilot entity.
3. **Onboard app 2** (and the non-Symfony one); standardize behind Gateway.
4. **Scale** routing (semantic tool selection) and centralize ([11](docs/11-centralizing-cross-app-interop.md)).

**One open input before building:** pilot app + its DB engine + whether the apps share SSO.

---

## All docs

New here? Read **[01](docs/01-architecture-overview.md) + [06](docs/06-recommendation-and-plan.md)**, then run the **[demo](apps/README.md)** ([10](docs/10-from-demo-to-aws.md)). The rest are deep-dives.

| Doc | What it covers |
|---|---|
| [01 — Architecture overview](docs/01-architecture-overview.md) | The problem, the two integration surfaces (north/south), the big picture |
| [02 — Data access options](docs/02-data-access-options.md) | App API/search vs. read-only SQL vs. RAG — when to use each |
| [03 — Exposing apps as MCP](docs/03-exposing-apps-as-mcp.md) | No-code Gateway target vs. PHP MCP server; tool & resource design |
| [04 — Query routing options](docs/04-query-routing-options.md) | Five patterns for "which app answers this?" + cross-app bundles |
| [05 — AWS deployment & security](docs/05-aws-deployment-and-security.md) | ECS topology, OAuth, the SigV4/ALB gotcha, read-only data, audit |
| [06 — Recommendation & rollout plan](docs/06-recommendation-and-plan.md) | What works best, phased plan, decisions, risks |
| [07 — Orchestration options](docs/07-orchestration-options.md) | AgentCore vs. custom vs. hybrid — pros/cons |
| [08 — Authorization & read-only](docs/08-authorization-and-read-only.md) | Governed cross-app visibility + the read-only invariant |
| [09 — Interop & entity resolution](docs/09-interop-and-entity-resolution.md) | Entities/lists for the agent *and* app-to-app use; cross-app id mapping |
| [10 — From the demo to AWS](docs/10-from-demo-to-aws.md) | Read-along walkthrough of the [demo](apps/README.md) + how each piece maps to AWS |
| [11 — Centralizing cross-app interop](docs/11-centralizing-cross-app-interop.md) | Scaling to many apps without duplication — thin per app, thick center |

---

## Status

| Component | Status (2026-06-22) | Notes |
|---|---|---|
| MCP spec `2025-11-25` | **Stable** | Streamable HTTP. A `2026-07-28` revision is **RC, not GA** — don't build on it yet. |
| `mcp/sdk` (official PHP SDK) | **Experimental / pre-1.0** (`v0.6.0`) | Symfony + PHP Foundation + Anthropic. Works; no BC promise — pin exact versions. |
| `symfony/mcp-bundle` | **Experimental** (`~v0.10`) | Symfony-native wrapper; HTTP transport at `/_mcp`. |
| Bedrock **AgentCore** | **GA** (2025-10-13) | Gateway, Runtime, Identity. |
| AgentCore **Policy** | **GA** (2026-03-03) | Deterministic per-tool authorization (allowlisting). |

**Primary sources:** [MCP spec](https://modelcontextprotocol.io/specification/2025-11-25) · [PHP SDK](https://github.com/modelcontextprotocol/php-sdk) · [symfony/mcp-bundle](https://packagist.org/packages/symfony/mcp-bundle) · [AWS AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/)
