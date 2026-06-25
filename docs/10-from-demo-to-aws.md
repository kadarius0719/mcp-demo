# 10 — From the demo to an AWS solution (code walkthrough)

[← 09 Interop & entity resolution](09-interop-and-entity-resolution.md) · [Index](../README.md) · Runnable demo: [apps/](../apps/README.md)

---

This is a **read-along guide** to the working demo in [`apps/`](../apps). For each piece it answers
three questions: *what is this code?*, *what is it actually doing?*, and *what does it become in AWS?*
You don't need to know Symfony, React, or MCP — each block is explained in plain language. Pair it
with the live demo (`cd apps && docker compose up -d`, then open http://localhost:5173).

## The one idea everything hangs on

Each app's data is exposed **once, read-only**, and **two kinds of consumer** use that exposure:

1. **Another app, directly** — e.g. App B's form pulls App A's phone list to constrain a field.
   Deterministic, no AI.
2. **An agent, in natural language** — it reads the *same* data through **MCP** to answer questions.

The demo runs a **local model** so it needs no API key; in AWS the same loop runs on **Bedrock + Claude**.
Nothing else about the shape changes.

![One exposure, two consumers](../images/interop-modes.png)

## The pieces, and their AWS equivalents

| In the demo (`apps/`) | What it is | In AWS it becomes |
|---|---|---|
| `app-a-symfony` | Phone **catalog** (source of truth) + read-only `GET /api/phones` | Your existing Symfony app on **ECS**, data in **RDS** |
| `app-b-symfony-api` | Captures experiences; **requires a canonical phone** | Another app on **ECS** + **RDS** |
| `app-b-react` | The form + the agent chat UI | Your frontend (same) |
| `mcp-server` | Exposes App A/B as read-only **MCP tools + resources** | **AgentCore Gateway** (an OpenAPI target, or this server on ECS) |
| `agent` | **MCP client** + model **tool-use loop** | **AgentCore Runtime** (or your service) calling **Bedrock** |
| `ollama` (local model) | The LLM | **Amazon Bedrock + Claude** |

The rest of this doc walks each row, with code.

---

## 1. App A — the source of truth

App A owns the canonical phone list. The important part is a **read-only** endpoint that returns it.

`apps/app-a-symfony/src/Controller/PhoneApiController.php`:

```php
#[Route('/api/phones', name: 'api_phones', methods: ['GET'])]
public function list(Request $request, PhoneRepository $phones): JsonResponse
{
    $items = array_map(
        static fn ($p) => $p->toArray(),
        $phones->search($request->query->get('q')),   // optional ?q= filter
    );
    return $this->json(['items' => $items, 'total' => count($items)]);
}
```

**What's happening:** a GET request returns every phone as JSON (or filtered by `?q=`). The
"canonical name" each phone exposes is just `brand + model`, computed once so everyone agrees on it:

```php
public function getName(): string { return trim($this->brand . ' ' . $this->model); }
```

**In AWS:** this is your *existing* app — you don't rebuild it. You expose a read-only endpoint (or a
curated database **view**) and, in production, point reads at an **RDS read replica** via a
**read-only DB user** so the query path can never write. (See [doc 02](02-data-access-options.md),
[doc 05](05-aws-deployment-and-security.md).)

---

## 2. Consumer #1 — deterministic field population (no AI)

**The problem the demo fixes:** App B used to let users type a phone name freely, so "iPhone 15",
"iphone15", and "Apple iPhone 15" became three different values — impossible to join or report on.

**The fix:** App B's phone field pulls App A's list and makes the user *pick*. The React app calls
App A directly:

`apps/app-b-react/src/api.js`:

```js
export async function searchPhones(q) {
  const url = new URL('/api/phones', APP_A) // APP_A = http://localhost:8001
  if (q) url.searchParams.set('q', q)
  const res = await fetch(url)
  return (await res.json()).items
}
```

The form turns that list into a searchable dropdown; selecting a phone captures its **canonical id +
name**, not free text.

App B's API then **enforces** that a canonical phone was chosen — it rejects free text:

`apps/app-b-symfony-api/src/Controller/ExperienceController.php`:

```php
$phoneId   = (int) ($data['phoneId'] ?? 0);
$phoneName = trim((string) ($data['phoneName'] ?? ''));

if ($phoneId <= 0 || $phoneName === '') {
    return $this->json(
        ['errors' => ['A phone must be chosen from the App A catalog (phoneId + phoneName required).']],
        422,
    );
}
// ...otherwise persist the experience with the canonical id + name
```

**What's happening:** App B never stores a typed-in phone. It stores App A's `phoneId` + `phoneName`,
so the data is deterministic by construction. Try the "Free text (legacy)" toggle in the UI — the API
returns **422** and the chat explains why.

**In AWS:** identical pattern — App B calls App A's API (directly, or through an **AgentCore Gateway
OpenAPI target**). This path has **no LLM**; it's a plain data call. Use the LLM only when a question
needs judgment. (See [doc 09 → "both, by case"](09-interop-and-entity-resolution.md).)

---

## 3. Exposing the data over MCP (tools **and** resources)

So far App B called App A directly. To let an **agent** use the same data, we expose it over **MCP**
(Model Context Protocol) — one standard contract instead of bespoke integrations.

MCP exposes two things:

- **Tools** = actions/queries the model can *call* (`search_phones`, `list_experiences`).
- **Resources** = addressable **entity info** the host can *read* (`phone://{id}`, `phones://catalog`,
  a data dictionary).

### Tools

`apps/mcp-server/server.js`:

```js
const TOOLS = [
  {
    name: 'search_phones',
    description: "Search App A's canonical phone catalog (read-only).",
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } }, // JSON Schema
  },
  { name: 'list_experiences', description: 'List experiences from App B (read-only).', /* ... */ },
]

async function callTool(name, args) {
  if (name === 'search_phones') return await fetchPhones(args?.query)   // calls App A
  if (name === 'list_experiences') { /* calls App B, optional phoneId filter */ }
  throw new Error(`Unknown tool: ${name}`)
}
```

**What's happening:** the MCP server is a thin adapter. Each tool just calls App A or App B's existing
HTTP API. There are **only read tools** — there is literally no tool the model could call to write
anything. That's the read-only guarantee, in one sentence of code.

### Resources (the entity info)

`apps/mcp-server/server.js`:

```js
async function readResource(uri) {
  if (uri === 'phones://catalog')        // the "set list"
    return { uri, mimeType: 'application/json', text: JSON.stringify(await fetchPhones()) }
  if (uri === 'catalog://phones/schema') // a data dictionary describing each field
    return { uri, mimeType: 'text/markdown', text: DATA_DICTIONARY }
  if (uri.startsWith('phone://')) {      // a single phone ENTITY (the "page entity")
    const id = Number(uri.slice('phone://'.length))
    const phone = (await fetchPhones()).find((p) => p.id === id)
    return { uri, mimeType: 'application/json', text: JSON.stringify(phone) }
  }
  throw new Error(`Unknown resource: ${uri}`)
}
```

**What's happening:** `phone://1` is an *addressable entity* — give it an id, get that phone's full
info. This is how the app says "the user is looking at **this** phone" and the agent can read it. The
data dictionary lets the agent explain what fields mean.

**In AWS:** you have two choices, and you can mix them:
- **Option 0 (no code):** point an **AgentCore Gateway OpenAPI target** at App A's existing
  `/api/phones` — Gateway turns it into an MCP tool automatically.
- **Option 1:** run an MCP server like this one (on ECS) when you want carefully-shaped tools or
  entity **resources**.
Gateway then **federates many apps**, adds **semantic tool selection**, OAuth, and credential
brokering. (See [doc 03](03-exposing-apps-as-mcp.md), [doc 07](07-orchestration-options.md).)

---

## 4. Consumer #2 — the agent (the tool-use loop)

The agent is an **MCP client** that runs a loop: *ask the model → if it wants a tool, call MCP → feed
the result back → repeat → return the answer.*

### The demo version (local model via Ollama)

`apps/agent/index.js` — the model call and the loop:

```js
// MCP tool schema -> the model's tool format (the JSON Schema is reused verbatim)
const tools = mcpTools.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.inputSchema },
}))

for (let i = 0; i < 6; i++) {
  const data = await ollamaChat(messages, tools)        // call the LOCAL model
  const msg = data.message
  messages.push(msg)

  if (msg.tool_calls?.length) {                          // model wants data
    for (const tc of msg.tool_calls) {
      const r = await mcp.callTool({ name: tc.function.name, arguments: tc.function.arguments })
      const out = (r.content || []).map((c) => c.text).join('\n')
      messages.push({ role: 'tool', name: tc.function.name, content: out }) // feed result back
    }
    continue
  }
  return { reply: msg.content, toolCalls /* shown as chips in the UI */ }    // model answered
}
```

`ollamaChat` is just an HTTP call to the local model:

```js
async function ollamaChat(messages, tools) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools, stream: false }),
  })
  return res.json()
}
```

### The AWS version (Bedrock + Claude)

**Only the model function changes.** The MCP client, the tools, the resources, and the loop are
identical. Swap `ollamaChat` for a Bedrock `Converse` call:

```js
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION })

// Same MCP tools -> Bedrock toolConfig (the JSON Schema drops straight in)
const toolConfig = {
  tools: mcpTools.map((t) => ({
    toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } },
  })),
}

for (let i = 0; i < 6; i++) {
  const res = await bedrock.send(new ConverseCommand({
    modelId: 'anthropic.claude-opus-4-8',     // your Bedrock model / inference-profile id
    system: [{ text: system }],
    messages,                                  // [{ role, content: [{ text }] }, ...]
    toolConfig,
  }))
  const out = res.output.message
  messages.push(out)

  if (res.stopReason === 'tool_use') {
    const toolResults = []
    for (const block of out.content) {
      if (!block.toolUse) continue
      const { toolUseId, name, input } = block.toolUse
      const r = await mcp.callTool({ name, arguments: input })   // EXACTLY the same MCP call
      const text = (r.content || []).map((c) => c.text).join('\n')
      toolResults.push({ toolResult: { toolUseId, content: [{ text }] } })
    }
    messages.push({ role: 'user', content: toolResults })
    continue
  }
  return out.content.filter((b) => b.text).map((b) => b.text).join('')
}
```

**Read the two side by side:** the loop is the same — *call model, if `tool_use` run the MCP tool,
append the result, repeat.* Bedrock just names things `toolUse`/`toolResult` instead of `tool_calls`/
`tool`. Your MCP servers don't change at all. (The Bedrock `Converse` tool-use shape is the verified
mapping from [doc 03](03-exposing-apps-as-mcp.md).)

> In a fuller AWS build you'd let **AgentCore Gateway** be the MCP client + tool router and just call
> the model — but the mental model above is what's happening underneath.

---

## 5. Entity info in action — page-entity context

When the chat is anchored to a phone (the "Viewing" dropdown), the agent reads that **entity resource**
and grounds its answer on it:

`apps/agent/index.js`:

```js
if (entityContext?.type === 'phone' && entityContext.id) {
  const r = await mcp.readResource({ uri: `phone://${entityContext.id}` })  // read the entity
  const text = (r.contents || []).map((c) => c.text).join('\n')
  system += `\n\nThe user is currently viewing this phone (page entity):\n${text}`
}
```

**What's happening:** the app tells the agent *which entity is on screen*; the agent reads
`phone://{id}` and answers about that phone specifically — no guessing, no extra search.

**In AWS:** same MCP resources. The new piece for a *real* multi-app system is **entity resolution** —
when "the same customer" has different ids in App A and App B, you add an id-map so the agent (and
apps) can line them up. (See [doc 09 → entity resolution](09-interop-and-entity-resolution.md).)

---

## The two request flows

**Deterministic field population (no AI):**

```
User opens App B form
  → React: GET App A /api/phones        (the read-only list)
  → constrained dropdown; user picks a phone
  → POST App B /api/experiences { phoneId, phoneName, rating, comment }
  → App B stores the canonical id + name   (422 if free text)
```

**Agentic question (AI):**

```
User asks "what do people think of the iPhone 15 Pro?"
  → agent → model: here are the tools, here's the question
  → model: call search_phones("iPhone 15 Pro")     (stop_reason: tool_use)
  → agent → MCP server → App A /api/phones          → returns phone #1
  → model: call list_experiences(phoneId: 1)
  → agent → MCP server → App B /api/experiences      → returns reviews
  → model: writes the answer
  → UI shows the answer + 🔧 chips for the tools it used
```

---

## From demo to AWS — what changes, what doesn't

| Concern | In the demo | In AWS |
|---|---|---|
| **Model** | Local (Ollama) | **Bedrock + Claude** — swap one function (§4) |
| **MCP transport** | Streamable HTTP | Same (AgentCore Gateway speaks it) |
| **Federation / routing** | One MCP server | **AgentCore Gateway** — many apps, semantic tool selection, Policy allowlist ([07](07-orchestration-options.md)) |
| **AuthN/Z** | Permissive CORS, no auth | **OAuth 2.1** resource server + **OBO**; per-user vs governed visibility ([08](08-authorization-and-read-only.md)) |
| **Data access** | SQLite, direct queries | **RDS read replica** + **read-only DB user** over curated views ([02](02-data-access-options.md), [05](05-aws-deployment-and-security.md)) |
| **Read-only guarantee** | No write tools exist | + SELECT-only grants, IAM, SQL validator — the **six-layer invariant** ([08](08-authorization-and-read-only.md)) |
| **Cross-app identity** | One shared id (the phone) | **Entity resolution** id-map where ids differ ([09](09-interop-and-entity-resolution.md)) |
| **Deploy** | `docker compose` | **ECS Fargate** per app, Gateway, one VPC ([05](05-aws-deployment-and-security.md)) |

The shape — *expose once read-only → tools + resources → an agent loop* — is the same in both.

## Make it real — the short checklist

1. **Swap the model:** replace `ollamaChat` with Bedrock `Converse` (§4). The MCP servers don't change.
2. **Federate:** put the MCP server (or an OpenAPI target) behind **AgentCore Gateway**.
3. **Point at safe data:** RDS **read replicas** + a **read-only DB user** over **curated views**.
4. **Add auth:** OAuth 2.1 resource server + OBO; decide per-user vs **governed** cross-app visibility ([08](08-authorization-and-read-only.md)).
5. **Lock read-only:** keep the no-write-tools rule, plus SELECT-only grants, IAM, and a SQL validator.
6. **Resolve entities:** add an id-map where the same thing has different ids across apps ([09](09-interop-and-entity-resolution.md)).

## Where to look in the code

| File | Read it for |
|---|---|
| `apps/app-a-symfony/src/Controller/PhoneApiController.php` | The read-only source-of-truth API |
| `apps/app-b-symfony-api/src/Controller/ExperienceController.php` | The "must be a canonical phone" enforcement (422) |
| `apps/app-b-react/src/api.js` + `App.jsx` | Deterministic field population (the constrained dropdown) |
| `apps/mcp-server/server.js` | MCP tools + entity resources; the read-only adapter |
| `apps/agent/index.js` | The MCP client + tool-use loop (swap point for Bedrock) |
| `apps/docker-compose.yml` | How the five services wire together |

---

[← Back to index](../README.md) · [Run the demo](../apps/README.md)
